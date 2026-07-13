// src/hooks/useCategories.tsx
//
// Shared state for categories. Ensures all screens see updates instantly.

import React, { createContext, useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { db } from '../services/database';
import { Category } from '../types';

interface CategoriesContextValue {
  categories: Category[];
  isLoading: boolean;
  createCategory: (name: string, color: string, icon: string) => Promise<Category>;
  updateCategory: (id: string, name: string, color: string, icon: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const CategoriesContext = createContext<CategoriesContextValue | null>(null);

export const CategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      let data = await db.getAllCategories();
      if (data.length === 0) {
        const other = await db.createCategory('Other', '#8B5CF6', 'tag');
        data = [other];
      }
      setCategories(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createCategory = useCallback(async (name: string, color: string, icon: string) => {
    const cat = await db.createCategory(name, color, icon);
    setCategories(prev => [...prev, cat]);
    return cat;
  }, []);

  const updateCategory = useCallback(async (id: string, name: string, color: string, icon: string) => {
    await db.updateCategory(id, name, color, icon);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name, color, icon } : c));
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    if (id === 'other') return; // Other is the fallback — never delete it
    await db.deleteCategory(id);
    // Update state directly instead of re-fetching so there's no flash/reappear
    setCategories(prev => prev.filter(c => c.id !== id));
  }, []);

  const value = useMemo(() => ({
    categories,
    isLoading,
    createCategory,
    updateCategory,
    deleteCategory,
    refresh,
  }), [categories, isLoading, createCategory, updateCategory, deleteCategory, refresh]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategories = (): CategoriesContextValue => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
};
