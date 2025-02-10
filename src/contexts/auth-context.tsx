import React, { createContext, useReducer, useContext, type ReactNode } from 'react';
import { AuthState, AuthEvent, authStateReducer } from '@/stores/auth';

interface AuthContextValue {
  state: AuthState;
  dispatch: React.Dispatch<AuthEvent>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize in the Onboarding state. The WalletProvider will dispatch events to update this.
  const [state, dispatch] = useReducer(authStateReducer, AuthState.Onboarding);
  return (
    <AuthContext.Provider value={{ state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
