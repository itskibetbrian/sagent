import React, { createContext, useContext, useEffect, useState } from 'react';
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signInWithGoogleAndLink: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogleAndLink: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Configure Google Sign-In
    // NOTE: You MUST configure the webClientId with your Firebase project's Web Client ID from the Google Cloud Console.
    GoogleSignin.configure({
      webClientId: '364900923954-v0cgcc11v8f9bjg5fcvpqfdt9jpo3cmg.apps.googleusercontent.com',
    });

    const subscriber = auth().onAuthStateChanged(async (currentUser) => {
      if (!currentUser) {
        try {
          // Sign in anonymously on app launch if no user exists
          await auth().signInAnonymously();
        } catch (error) {
          console.error("Anonymous auth failed:", error);
          setLoading(false);
        }
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });

    return subscriber;
  }, []);

  const signInWithGoogleAndLink = async () => {
    try {
      // Check if your device supports Google Play
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Get the users ID token
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (!idToken) {
        throw new Error("No ID Token found from Google Sign In");
      }

      // Create a Google credential with the token
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);

      // Link the credential to the current anonymous user
      if (auth().currentUser) {
        await auth().currentUser!.linkWithCredential(googleCredential);
        // The user is now linked! uid remains the same.
      } else {
        // Fallback: just sign in if no current user
        await auth().signInWithCredential(googleCredential);
      }
    } catch (error) {
      console.error("Google Sign-In Linking failed:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogleAndLink }}>
      {children}
    </AuthContext.Provider>
  );
};
