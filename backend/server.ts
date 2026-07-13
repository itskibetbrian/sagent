import express from 'express';
import { google } from 'googleapis';
import * as admin from 'firebase-admin';

/**
 * ==========================================
 * SETUP INSTRUCTIONS: GOOGLE SERVICE ACCOUNT
 * ==========================================
 * 1. Go to Google Cloud Console (https://console.cloud.google.com/)
 * 2. Create a new project (or select your existing Android app project)
 * 3. Go to "IAM & Admin" > "Service Accounts" and create a new Service Account.
 * 4. Create and download a new JSON Key for this service account.
 * 5. Save the JSON file locally (e.g. `google-service-account.json`) in this folder.
 * 6. Go to Google Play Console (https://play.google.com/console)
 * 7. Go to "Setup" > "API access" and link your Google Cloud project.
 * 8. Grant the newly created Service Account "View financial data" and "Manage orders and subscriptions" permissions.
 * 
 * ==========================================
 * SETUP INSTRUCTIONS: FIREBASE ADMIN SDK
 * ==========================================
 * 1. Go to Firebase Console > Project Settings > Service Accounts.
 * 2. Click "Generate new private key" and download the JSON.
 * 3. Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to the path of this JSON file before running the server.
 *    (e.g., `export GOOGLE_APPLICATION_CREDENTIALS="/path/to/firebase-adminsdk.json"`)
 */

const PLAY_CONSOLE_KEY_FILE = './google-service-account.json';
const PACKAGE_NAME = 'com.sagent.app'; // Must match your app package name exactly

// Initialize Firebase Admin SDK (uses GOOGLE_APPLICATION_CREDENTIALS env var automatically)
admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(express.json());

// Set up Google Play Android Developer API client
const auth = new google.auth.GoogleAuth({
  keyFile: PLAY_CONSOLE_KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const playDeveloperApi = google.androidpublisher({
  version: 'v3',
  auth: auth,
});

/**
 * Middleware: Verify Firebase Auth Token
 */
const verifyFirebaseToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // Attach uid to request
    (req as any).uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return res.status(403).json({ error: 'Unauthorized: Token verification failed' });
  }
};

/**
 * Endpoint: POST /api/verify-purchase
 * 
 * Body:
 * {
 *    "uid": "user_123",
 *    "purchaseToken": "token_from_android_device",
 *    "productId": "com.sagent.app.premium.monthly" // Or yearly
 * }
 */
app.post('/api/verify-purchase', verifyFirebaseToken, async (req, res) => {
  try {
    const { uid, purchaseToken, productId } = req.body;
    const authenticatedUid = (req as any).uid;

    if (!purchaseToken || !productId || !uid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prevent spoofing: Ensure the token uid matches the body uid
    if (uid !== authenticatedUid) {
      return res.status(403).json({ error: 'UID mismatch' });
    }

    // Call Google Play Developer API to verify the subscription
    const response = await playDeveloperApi.purchases.subscriptionsv2.get({
      packageName: PACKAGE_NAME,
      token: purchaseToken,
    });

    const subscription = response.data;
    const lineItem = subscription.lineItems?.[0];
    
    if (!lineItem) {
      return res.status(400).json({ active: false, error: 'No subscription details found' });
    }

    const isActive = subscription.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE' 
                  || subscription.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';

    const expiryDate = lineItem.expiryTime; // ISO 8601 string
    const basePlanId = lineItem.productId;

    const entitlementRef = db.collection('users').doc(uid).collection('entitlement').doc('pro');

    if (isActive) {
      // Write active subscription status to Firestore
      await entitlementRef.set({
        isPro: true,
        basePlanId: basePlanId,
        expiryDate: expiryDate,
        purchaseToken: purchaseToken, // Saved so RTDN can reverse-lookup the user by token later
        lastVerified: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.json({
        active: true,
        expiryDate: expiryDate,
        basePlanId: basePlanId,
      });
    } else {
      // Subscription is expired, canceled, or revoked
      await entitlementRef.set({
        isPro: false,
        reason: subscription.subscriptionState,
        lastVerified: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.json({
        active: false,
        reason: subscription.subscriptionState,
      });
    }

  } catch (error: any) {
    console.error('Google Play Verification Error:', error.message);
    return res.status(500).json({ error: 'Failed to verify subscription with Google Play' });
  }
});

/**
 * Endpoint: POST /api/rtdn-webhook
 * 
 * Google Real-time Developer Notifications (RTDN) Webhook.
 * 
 * Setup:
 * 1. Create a Google Cloud Pub/Sub topic.
 * 2. Grant Google Play publishing service account permission to publish to it.
 * 3. Link topic in Play Console (Monetization setup).
 * 4. Create a Push Subscription to this endpoint (e.g. https://your-server.com/api/rtdn-webhook).
 */
app.post('/api/rtdn-webhook', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.data) {
      return res.status(400).send('Bad Request: Missing message data');
    }

    const decodedData = Buffer.from(message.data, 'base64').toString('utf-8');
    const notification = JSON.parse(decodedData);

    const purchaseToken = notification?.subscriptionNotification?.purchaseToken;

    if (!purchaseToken) {
      console.log('Received RTDN without purchaseToken:', notification);
      return res.status(200).send('OK');
    }

    // Look up the user who owns this purchase token by searching Firestore
    const usersSnapshot = await db.collectionGroup('entitlement')
      .where('purchaseToken', '==', purchaseToken)
      .get();

    if (usersSnapshot.empty) {
      console.warn(`RTDN: No entitlement document found for purchaseToken=${purchaseToken}`);
      return res.status(200).send('OK');
    }

    // Verify the subscription with Google Play
    const playResponse = await playDeveloperApi.purchases.subscriptionsv2.get({
      packageName: PACKAGE_NAME,
      token: purchaseToken,
    });

    const subscription = playResponse.data;
    const lineItem = subscription.lineItems?.[0];
    const isActive = subscription.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE'
                  || subscription.subscriptionState === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
    const expiryDate = lineItem?.expiryTime;

    // Update each entitlement document that matches this purchase token
    const batch = db.batch();
    usersSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        isPro: isActive,
        expiryDate: expiryDate ?? null,
        lastVerified: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    console.log(`RTDN: Updated ${usersSnapshot.size} user(s) — active=${isActive}`);

    return res.status(200).send('OK');
  } catch (error) {
    console.error('RTDN processing error:', error);
    return res.status(200).send('OK');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
