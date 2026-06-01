// src/services/database.ts
//
// Database Service — SQLite via expo-sqlite
// Handles all persistence: messages, categories, user prefs.
// All methods return typed results; errors bubble to callers.

import * as SQLite from 'expo-sqlite';
import { Snippet, SnippetInsert, SnippetUpdate, Category } from '../types';
import { DEFAULT_CATEGORIES } from '../constants';

const DB_NAME = 'clipmanager.db';
class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  // ─── Initialisation ──────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync(DB_NAME);
    await this.runMigrations();
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialised. Call init() first.');
    return this.db;
  }

  private async runMigrations(): Promise<void> {
    const db = this.getDb();

    await db.execAsync(`PRAGMA journal_mode = WAL;`);

    // Categories table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id          TEXT PRIMARY KEY NOT NULL,
        name        TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#6366F1',
        icon        TEXT NOT NULL DEFAULT 'tag',
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    // Messages table. Kept as `snippets` for existing SQLite compatibility.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS snippets (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        use_count   INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    await this.ensureColumn('snippets', 'last_used_at', 'INTEGER');

    // User preferences (key-value store)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS preferences (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);

    await this.seedDefaultCategories();
    await this.seedExampleMessages();
  }

  private async seedDefaultCategories(): Promise<void> {
    const db = this.getDb();
    for (const cat of DEFAULT_CATEGORIES) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)`,
        [cat.id, cat.name, cat.color, cat.icon]
      );
    }
  }

  private async seedExampleMessages(): Promise<void> {
    const db = this.getDb();
    const [row, seededPreference, hasOnboarded] = await Promise.all([
      db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM snippets`),
      this.getPreference('example_snippets_seeded', 'false'),
      this.getPreference('hasOnboarded', 'false'),
    ]);

    // AsyncStorage is not installed in this app and the task forbids new libraries,
    // so first-launch seeding uses Sagent's existing preference store.
    if ((row?.count ?? 0) > 0 || seededPreference === 'true' || hasOnboarded === 'true') {
      return;
    }

    const now = Date.now();
    const examples: Array<SnippetInsert & { id: string; categoryId: string }> = [
      {
        id: `${now.toString(36)}-example-price-list`,
        title: 'Price List',
        content: "Hi! Here's our current price list. Let me know which option works best for you and I'll get you sorted right away.",
        categoryId: 'sales',
      },
      {
        id: `${(now + 1).toString(36)}-example-payment-link`,
        title: 'Payment Link',
        content: 'Please use the link below to complete your payment. Reach out if you run into any issues — happy to help!',
        categoryId: 'sales',
      },
      {
        id: `${(now + 2).toString(36)}-example-thank-you`,
        title: 'Thank You',
        content: 'Thank you so much for your order! We really appreciate your support and will keep you updated every step of the way.',
        categoryId: 'sales',
      },
      {
        id: `${(now + 3).toString(36)}-example-follow-up`,
        title: 'Follow-up',
        content: "Hi! Just checking in to see if you had any questions about what we discussed. I'm here whenever you're ready.",
        categoryId: 'sales',
      },
      {
        id: `${(now + 4).toString(36)}-example-faq`,
        title: 'FAQ',
        content: 'Great question! Here are the answers to the questions we get most often. Let me know if anything needs more detail.',
        categoryId: 'sales',
      },
      {
        id: `${(now + 5).toString(36)}-example-issue-received`,
        title: 'Issue Received',
        content: "Thanks for reaching out! I've logged your issue and our team is already looking into it. We'll update you within 24 hours.",
        categoryId: 'support',
      },
      {
        id: `${(now + 6).toString(36)}-example-troubleshooting-steps`,
        title: 'Troubleshooting Steps',
        content: "Let's get this sorted. Please try these steps: 1) Restart the app, 2) Check your connection, 3) Clear your cache. Still stuck? Reply here and I'll escalate immediately.",
        categoryId: 'support',
      },
      {
        id: `${(now + 7).toString(36)}-example-resolved`,
        title: 'Resolved',
        content: 'Great news — your issue has been resolved! Please let us know if anything else comes up. Always happy to help.',
        categoryId: 'support',
      },
    ];

    for (const [index, snippet] of examples.entries()) {
      const createdAt = now + index;
      await db.runAsync(
        `INSERT OR IGNORE INTO snippets (id, title, content, category_id, is_favorite, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        [snippet.id, snippet.title, snippet.content, snippet.categoryId, createdAt, createdAt]
      );
    }

    await this.setPreference('example_snippets_seeded', 'true');
  }

  // ─── Message CRUD ─────────────────────────────────────────────────────────

  async getAllSnippets(): Promise<Snippet[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(`
      SELECT
        s.id, s.title, s.content, s.category_id as categoryId,
        s.is_favorite as isFavorite, s.use_count as useCount, s.last_used_at as lastUsedAt,
        s.created_at as createdAt, s.updated_at as updatedAt,
        c.name as categoryName, c.color as categoryColor
      FROM snippets s
      LEFT JOIN categories c ON s.category_id = c.id
      ORDER BY COALESCE(s.last_used_at, s.updated_at) DESC
    `);
    return rows.map(row => this.mapSnippet(row));
  }

  async getSnippetById(id: string): Promise<Snippet | null> {
    const db = this.getDb();
    const row = await db.getFirstAsync<any>(`
      SELECT
        s.id, s.title, s.content, s.category_id as categoryId,
        s.is_favorite as isFavorite, s.use_count as useCount, s.last_used_at as lastUsedAt,
        s.created_at as createdAt, s.updated_at as updatedAt,
        c.name as categoryName, c.color as categoryColor
      FROM snippets s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.id = ?
    `, [id]);
    return row ? this.mapSnippet(row) : null;
  }

  async getSnippetsByCategory(categoryId: string): Promise<Snippet[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(`
      SELECT
        s.id, s.title, s.content, s.category_id as categoryId,
        s.is_favorite as isFavorite, s.use_count as useCount, s.last_used_at as lastUsedAt,
        s.created_at as createdAt, s.updated_at as updatedAt,
        c.name as categoryName, c.color as categoryColor
      FROM snippets s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.category_id = ?
      ORDER BY COALESCE(s.last_used_at, s.updated_at) DESC
    `, [categoryId]);
    return rows.map(this.mapSnippet);
  }

  async getFavoriteSnippets(): Promise<Snippet[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(`
      SELECT
        s.id, s.title, s.content, s.category_id as categoryId,
        s.is_favorite as isFavorite, s.use_count as useCount, s.last_used_at as lastUsedAt,
        s.created_at as createdAt, s.updated_at as updatedAt,
        c.name as categoryName, c.color as categoryColor
      FROM snippets s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.is_favorite = 1
      ORDER BY s.use_count DESC
    `);
    return rows.map(this.mapSnippet);
  }

  async searchSnippets(query: string): Promise<Snippet[]> {
    const db = this.getDb();
    const pattern = `%${query}%`;
    const rows = await db.getAllAsync<any>(`
      SELECT
        s.id, s.title, s.content, s.category_id as categoryId,
        s.is_favorite as isFavorite, s.use_count as useCount, s.last_used_at as lastUsedAt,
        s.created_at as createdAt, s.updated_at as updatedAt,
        c.name as categoryName, c.color as categoryColor
      FROM snippets s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.title LIKE ? OR s.content LIKE ? OR c.name LIKE ?
      ORDER BY s.use_count DESC, COALESCE(s.last_used_at, s.updated_at) DESC
    `, [pattern, pattern, pattern]);
    return rows.map(this.mapSnippet);
  }

  async createSnippet(data: SnippetInsert): Promise<Snippet> {
    const db = this.getDb();
    const id = this.generateId();
    const now = Date.now();

    await db.runAsync(
      `INSERT INTO snippets (id, title, content, category_id, is_favorite, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.title, data.content, data.categoryId ?? null, data.isFavorite ? 1 : 0, now, now]
    );

    const row = await db.getFirstAsync<any>(
      `SELECT s.*, c.name as categoryName, c.color as categoryColor
       FROM snippets s LEFT JOIN categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [id]
    );
    return this.mapSnippet(row);
  }

  async updateSnippet(data: SnippetUpdate): Promise<Snippet> {
    const db = this.getDb();
    const now = Date.now();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.title !== undefined)      { fields.push('title = ?');       values.push(data.title); }
    if (data.content !== undefined)    { fields.push('content = ?');     values.push(data.content); }
    if (data.categoryId !== undefined) { fields.push('category_id = ?'); values.push(data.categoryId); }
    if (data.isFavorite !== undefined) { fields.push('is_favorite = ?'); values.push(data.isFavorite ? 1 : 0); }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(data.id);

    await db.runAsync(
      `UPDATE snippets SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    const row = await db.getFirstAsync<any>(
      `SELECT s.*, c.name as categoryName, c.color as categoryColor
       FROM snippets s LEFT JOIN categories c ON s.category_id = c.id
       WHERE s.id = ?`,
      [data.id]
    );
    return this.mapSnippet(row);
  }

  async deleteSnippet(id: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync(`DELETE FROM snippets WHERE id = ?`, [id]);
  }

  async deleteAllSnippets(): Promise<void> {
    const db = this.getDb();
    await db.runAsync(`DELETE FROM snippets`);
  }

  async incrementUseCount(id: string): Promise<void> {
    const db = this.getDb();
    const now = Date.now();
    await db.runAsync(
      `UPDATE snippets SET use_count = use_count + 1, last_used_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id]
    );
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ is_favorite: number }>(
      `SELECT is_favorite FROM snippets WHERE id = ?`, [id]
    );
    const newVal = row?.is_favorite === 1 ? 0 : 1;
    await db.runAsync(
      `UPDATE snippets SET is_favorite = ?, updated_at = ? WHERE id = ?`,
      [newVal, Date.now(), id]
    );
    return newVal === 1;
  }

  async getSnippetCount(): Promise<number> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM snippets`);
    return row?.count ?? 0;
  }

  async getPreference(key: string, fallback?: string): Promise<string | undefined> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM preferences WHERE key = ?`,
      [key]
    );
    return row?.value ?? fallback;
  }

  async setPreference(key: string, value: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      `INSERT INTO preferences (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value]
    );
  }

  async clearAllData(): Promise<void> {
    const db = this.getDb();

    // Sagent uses SQLite preferences/tables instead of AsyncStorage, so this
    // clears the equivalent app-owned keys, saved messages, favorites, and categories.
    await db.execAsync(`
      DELETE FROM snippets;
      DELETE FROM categories;
      DELETE FROM preferences;
    `);

    await this.seedDefaultCategories();
    await this.seedExampleMessages();
  }

  // ─── Category CRUD ────────────────────────────────────────────────────────

  async getAllCategories(): Promise<Category[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(`
      SELECT id, name, color, icon, created_at as createdAt
      FROM categories
      ORDER BY created_at ASC
    `);
    return rows.map(row => this.mapCategory(row));
  }

  async createCategory(name: string, color: string, icon: string): Promise<Category> {
    const db = this.getDb();
    const id = this.generateId();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO categories (id, name, color, icon, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, name, color, icon, now]
    );
    return { id, name, color, icon, createdAt: now };
  }

  async updateCategory(id: string, name: string, color: string, icon: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      `UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?`,
      [name, color, icon, id]
    );
  }

  async deleteCategory(id: string): Promise<void> {
    const db = this.getDb();
    if (id === 'other') {
      return;
    }
    await db.runAsync(
      `UPDATE snippets SET category_id = 'other' WHERE category_id = ?`,
      [id]
    );
    await db.runAsync(`DELETE FROM categories WHERE id = ?`, [id]);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private mapSnippet(row: any): Snippet {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      categoryId: row.categoryId ?? row.category_id ?? null,
      categoryName: row.categoryName ?? undefined,
      categoryColor: row.categoryColor ?? undefined,
      isFavorite: row.isFavorite === 1 || row.is_favorite === 1,
      useCount: row.useCount ?? row.use_count ?? 0,
      lastUsedAt: row.lastUsedAt ?? row.last_used_at ?? undefined,
      createdAt: row.createdAt ?? row.created_at ?? 0,
      updatedAt: row.updatedAt ?? row.updated_at ?? 0,
    };
  }

  private mapCategory(row: any): Category {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      icon: row.icon,
      createdAt: row.createdAt ?? row.created_at ?? 0,
    };
  }

  private generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private async ensureColumn(tableName: string, columnName: string, definition: string): Promise<void> {
    const db = this.getDb();
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
    if (columns.some(column => column.name === columnName)) {
      return;
    }

    await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

// Singleton export
export const db = new DatabaseService();
export default db;
