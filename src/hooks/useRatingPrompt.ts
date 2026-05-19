import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { db } from '../services/database';

export const useRatingPrompt = () => {
  const triggerPrompt = useCallback(async (force: boolean = false) => {
    try {
      const status = await db.getPreference('rating_status');
      if (status === 'rated' || status === 'declined') {
        return;
      }

      if (!force) {
        const usageCount = (await db.getPreference('total_usage_count', '0')) ?? '0';
        if (parseInt(usageCount, 10) < 20) {
          return;
        }
      }

      const lastPrompt = await db.getPreference('last_rating_prompt_date');
      const now = Date.now();
      
      if (lastPrompt) {
        const lastTime = parseInt(lastPrompt, 10);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (now - lastTime < sevenDays) {
          return;
        }
      }

      Alert.alert(
        'Enjoying Sagent?',
        'If you find Sagent helpful, please take a moment to rate us. It really helps us out!',
        [
          {
            text: 'No Thanks',
            style: 'cancel',
            onPress: async () => {
              await db.setPreference('rating_status', 'declined');
            },
          },
          {
            text: 'Remind Me Later',
            onPress: async () => {
              await db.setPreference('last_rating_prompt_date', now.toString());
            },
          },
          {
            text: 'Rate Now',
            style: 'default',
            onPress: async () => {
              await db.setPreference('rating_status', 'rated');
              const url = Platform.OS === 'android' 
                ? 'https://play.google.com/store/apps/details?id=com.sagent.app'
                : 'https://apps.apple.com';
              Linking.openURL(url).catch(() => {
                Alert.alert('Error', 'Could not open the store page.');
              });
            },
          },
        ]
      );
    } catch (e) {
      // Ignore errors silently
    }
  }, []);

  const incrementUsage = useCallback(async () => {
    const current = (await db.getPreference('total_usage_count', '0')) ?? '0';
    const next = parseInt(current, 10) + 1;
    await db.setPreference('total_usage_count', next.toString());
    
    if (next === 20) {
      await triggerPrompt(true);
    }
  }, [triggerPrompt]);

  return { triggerPrompt, incrementUsage };
};
