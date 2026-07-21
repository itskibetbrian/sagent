import { useState, useEffect, useRef } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../providers/AuthProvider';
import { db } from '../services/database';

export interface EntitlementData {
  isPro: boolean;
  basePlanId?: string;
  expiryDate?: string;
}

export function useEntitlement() {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementData>({ isPro: false });
  const [loading, setLoading] = useState(true);
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setEntitlement({ isPro: false });
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;

    const subscribe = () => {
      try {
        unsubscribe = firestore()
          .collection('users')
          .doc(user.uid)
          .collection('entitlement')
          .doc('pro')
          .onSnapshot(
            (documentSnapshot) => {
              let isPro = false;
              let data: EntitlementData = { isPro: false };

              if (documentSnapshot.exists) {
                const raw = documentSnapshot.data();
                if (raw) {
                  data = raw as EntitlementData;
                  isPro = data.isPro ?? false;
                }
              }

              setEntitlement({
                isPro,
                basePlanId: data.basePlanId,
                expiryDate: data.expiryDate,
              });

              // Only write to SQLite when the value actually changes
              const value = isPro ? 'true' : 'false';
              if (lastSyncedRef.current !== value) {
                lastSyncedRef.current = value;
                db.setPreference('premium_enabled', value).catch(
                  (err) => console.error('[Entitlement] Failed to persist premium flag:', err)
                );
              }

              setLoading(false);
            },
            (error) => {
              console.error('[Entitlement] Firestore snapshot error:', error);
              // Fall back to the locally cached SQLite value so the app stays usable
              db.getPreference('premium_enabled', 'false').then(val => {
                setEntitlement({ isPro: val === 'true' });
              }).catch(() => { }).finally(() => setLoading(false));
            }
          );
      } catch (err) {
        // Firebase not yet initialised — fall back to local cache
        console.error('[Entitlement] Failed to attach Firestore listener:', err);
        db.getPreference('premium_enabled', 'false').then(val => {
          setEntitlement({ isPro: val === 'true' });
        }).catch(() => { }).finally(() => setLoading(false));
      }
    };

    subscribe();

    return () => unsubscribe?.();
  }, [user]);

  return { ...entitlement, loading };
}
