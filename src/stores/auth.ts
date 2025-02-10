export enum AuthState {
  Onboarding = 'ONBOARDING_NEEDED',
  Locked = 'LOCKED',
  Unlocked = 'UNLOCKED',
  ConnectionPending = 'CONNECTION_PENDING',
}

export type AuthEvent =
  | { type: 'WALLETS_LOADED'; walletExists: boolean }
  | { type: 'WALLET_UNLOCKED' }
  | { type: 'WALLET_LOCKED' }
  | { type: 'CONNECTION_REQUESTED' }
  | { type: 'CONNECTION_APPROVED' }
  | { type: 'ONBOARDING_COMPLETED' };

export function authStateReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'WALLETS_LOADED':
      return event.walletExists ? AuthState.Locked : AuthState.Onboarding;
    case 'WALLET_UNLOCKED':
      return AuthState.Unlocked;
    case 'WALLET_LOCKED':
      return AuthState.Locked;
    case 'CONNECTION_REQUESTED':
      return AuthState.ConnectionPending;
    case 'CONNECTION_APPROVED':
      return AuthState.Unlocked;
    case 'ONBOARDING_COMPLETED':
      return AuthState.Locked;
    default:
      return state;
  }
}
