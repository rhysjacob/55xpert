import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  getCurrentUser,
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  type SignInInput,
  type SignUpInput,
} from 'aws-amplify/auth';

interface AuthUser {
  userId: string;
  email: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      setUser({
        userId: currentUser.userId,
        email: currentUser.signInDetails?.loginId ?? '',
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  const value: AuthContextType = {
    user,
    loading,
    signIn: async (input) => {
      try {
        await signIn(input);
      } catch (err) {
        // Clear a lingering session ("There is already a signed in user") and retry.
        if (err instanceof Error && err.name === 'UserAlreadyAuthenticatedException') {
          await signOut();
          await signIn(input);
        } else {
          throw err;
        }
      }
      await checkAuth();
    },
    signUp: async (input) => {
      await signUp(input);
    },
    signOut: async () => {
      await signOut();
      setUser(null);
    },
    confirmSignUp: async (email, code) => {
      await confirmSignUp({ username: email, confirmationCode: code });
    },
    resetPassword: async (email) => {
      await resetPassword({ username: email });
    },
    confirmResetPassword: async (email, code, newPassword) => {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
