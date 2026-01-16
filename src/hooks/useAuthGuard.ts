import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useWallet } from '@/contexts/wallet-context';

/**
 * SECURITY-CRITICAL: Real-time wallet lock transition detector for browser extensions.
 * 
 * This hook provides immediate navigation response to wallet lock events triggered by
 * the background service, preventing security gaps where sensitive data might remain
 * visible after a wallet locks.
 * 
 * ## Why This Hook Exists
 * 
 * Browser extensions have a unique architecture where the background service can lock
 * wallets independently of the UI state (e.g., via auto-lock timer, manual lock from
 * another tab, or security events). Without this hook, there would be a dangerous gap
 * between when the wallet locks and when the UI responds.
 * 
 * ## How It Works
 * 
 * 1. Monitors real-time auth state transitions (specifically UNLOCKED → LOCKED)
 * 2. Triggers immediate navigation to the unlock screen when a lock event occurs
 * 3. Preserves the user's location for post-unlock return navigation
 * 
 * ## Relationship with AuthRequired Component
 * 
 * This hook is complementary to, NOT redundant with, the AuthRequired component:
 * - **AuthRequired**: Handles initial route protection and state-based navigation
 * - **useAuthGuard**: Handles real-time lock transitions during active sessions
 * 
 * Together they provide comprehensive authentication protection.
 * 
 * ## Security Implications
 * 
 * DO NOT REMOVE THIS HOOK. It prevents:
 * - Sensitive data exposure after auto-lock events
 * - Continued access to protected routes after wallet locks
 * - Race conditions between background lock events and UI updates
 * 
 * @example
 * // Used inside AuthRequired component to monitor lock events
 * export function AuthRequired() {
 *   useAuthGuard(); // Monitors for real-time lock transitions
 *   // ... rest of component logic
 * }
 */
export function useAuthGuard() {
  const { authState, keychainExists } = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const previousAuthState = useRef(authState);

  useEffect(() => {
    // Detect transition from UNLOCKED to LOCKED
    if (previousAuthState.current === 'UNLOCKED' && authState === 'LOCKED' && keychainExists) {
      console.log('[Auth Guard] Wallet locked, navigating to unlock screen');
      navigate('/unlock-wallet', {
        replace: true,
        state: { from: location.pathname }
      });
    }

    previousAuthState.current = authState;
  }, [authState, keychainExists, navigate, location.pathname]);

  return { isProtected: authState === 'UNLOCKED' };
}