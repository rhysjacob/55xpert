import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  signOut as amplifySignOut,
  confirmSignUp as amplifyConfirmSignUp,
  getCurrentUser,
  fetchUserAttributes,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  type SignInInput,
  type SignUpInput,
  type ConfirmSignUpInput,
  type ResetPasswordInput,
  type ConfirmResetPasswordInput,
} from 'aws-amplify/auth';

interface AuthUser {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (input: SignInInput) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  confirmSignUp: (input: ConfirmSignUpInput) => Promise<void>;
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
  confirmResetPassword: (input: ConfirmResetPasswordInput) => Promise<void>;
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
      const attrs = await fetchUserAttributes();
      setUser({
        userId: currentUser.userId,
        email: attrs.email ?? '',
        firstName: attrs.given_name,
        lastName: attrs.family_name,
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
      await amplifySignIn(input);
      await checkAuth();
    },
    signUp: async (input) => {
      await amplifySignUp(input);
    },
    signOut: async () => {
      await amplifySignOut();
      setUser(null);
    },
    confirmSignUp: async (input) => {
      await amplifyConfirmSignUp(input);
    },
    resetPassword: async (input) => {
      await amplifyResetPassword(input);
    },
    confirmResetPassword: async (input) => {
      await amplifyConfirmResetPassword(input);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
