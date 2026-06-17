import { useState, useEffect } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../providers/AuthProvider';

export interface EntitlementData {
  isPro: boolean;
  basePlanId?: string;
  expiryDate?: string;
}

export function useEntitlement() {
  const { user } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementData>({ isPro: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEntitlement({ isPro: false });
      setLoading(false);
      return;
    }

    const subscriber = firestore()
      .collection('users')
      .doc(user.uid)
      .collection('entitlement')
      .doc('pro')
      .onSnapshot(
        (documentSnapshot) => {
          if (documentSnapshot.exists) {
            const data = documentSnapshot.data() as EntitlementData;
            setEntitlement({
              isPro: data.isPro ?? false,
              basePlanId: data.basePlanId,
              expiryDate: data.expiryDate,
            });
          } else {
            setEntitlement({ isPro: false });
          }
          setLoading(false);
        },
        (error) => {
          console.error("Entitlement fetch error:", error);
          setLoading(false);
        }
      );

    return () => subscriber();
  }, [user]);

  return { ...entitlement, loading };
}
