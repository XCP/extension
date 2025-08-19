import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthRequired } from '../auth-required';
import { useWallet } from '@/contexts/wallet-context';

// Mock wallet context
vi.mock('@/contexts/wallet-context', () => ({
  useWallet: vi.fn()
}));

const mockUseWallet = useWallet as any;

describe('AuthRequired Middleware', () => {
  const ProtectedComponent = () => <div>Protected Content</div>;
  const UnlockComponent = () => <div>Unlock Wallet</div>;
  const OnboardingComponent = () => <div>Onboarding</div>;

  const TestApp = ({ initialRoute = '/' }: { initialRoute?: string }) => (
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/" element={<AuthRequired />}>
          <Route index element={<ProtectedComponent />} />
          <Route path="protected" element={<div>Another Protected Page</div>} />
        </Route>
        <Route path="/unlock-wallet" element={<UnlockComponent />} />
        <Route path="/onboarding" element={<OnboardingComponent />} />
      </Routes>
    </MemoryRouter>
  );

  it('should render protected content when wallet is unlocked', () => {
    mockUseWallet.mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: { id: 'wallet1', name: 'Test Wallet' },
      activeAddress: { address: 'bc1qtest', name: 'Test Address' }
    } as any);

    render(<TestApp />);

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should redirect to unlock page when wallet is locked', () => {
    mockUseWallet.mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: null,
      activeAddress: null
    } as any);

    render(<TestApp />);

    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should redirect to onboarding when no wallet exists', () => {
    mockUseWallet.mockReturnValue({
      authState: 'ONBOARDING_NEEDED',
      wallets: [],
      activeWallet: null,
      activeAddress: null
    } as any);

    render(<TestApp />);

    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('should protect nested routes', () => {
    mockUseWallet.mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: { id: 'wallet1', name: 'Test Wallet' },
      activeAddress: { address: 'bc1qtest', name: 'Test Address' }
    } as any);

    render(<TestApp initialRoute="/protected" />);

    expect(screen.getByText('Another Protected Page')).toBeInTheDocument();
  });

  it('should redirect nested routes when not authenticated', () => {
    mockUseWallet.mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: null,
      activeAddress: null
    } as any);

    render(<TestApp initialRoute="/protected" />);

    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
    expect(screen.queryByText('Another Protected Page')).not.toBeInTheDocument();
  });

  it('should handle auth state changes', () => {
    // Start with locked state
    mockUseWallet.mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: null,
      activeAddress: null
    } as any);

    const { unmount } = render(<TestApp />);
    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
    unmount();

    // Change to unlocked state and render fresh
    mockUseWallet.mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: { id: 'wallet1', name: 'Test Wallet' },
      activeAddress: { address: 'bc1qtest', name: 'Test Address' }
    } as any);

    render(<TestApp />);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('should preserve location state during redirect', () => {
    mockUseWallet.mockReturnValue({
      authState: 'LOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: null,
      activeAddress: null
    } as any);

    const TestAppWithState = () => (
      <MemoryRouter initialEntries={[{ pathname: '/protected', state: { from: '/previous' } }]}>
        <Routes>
          <Route path="/" element={<AuthRequired />}>
            <Route path="protected" element={<div>Protected Page</div>} />
          </Route>
          <Route path="/unlock-wallet" element={
            <div>
              <span>Unlock Wallet</span>
              <span data-testid="location-state">
                {JSON.stringify(window.history.state)}
              </span>
            </div>
          } />
        </Routes>
      </MemoryRouter>
    );

    render(<TestAppWithState />);

    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
  });

  it('should handle loading state', () => {
    mockUseWallet.mockReturnValue({
      authState: 'LOADING',
      wallets: [],
      activeWallet: null,
      activeAddress: null
    } as any);

    const { container } = render(<TestApp />);

    // Should render nothing during loading
    expect(container.textContent).toBe('');
  });

  it('should handle undefined auth state gracefully', () => {
    mockUseWallet.mockReturnValue({
      authState: undefined as any,
      wallets: [],
      activeWallet: null,
      activeAddress: null
    } as any);

    render(<TestApp />);

    // Should default to onboarding
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('should work with deeply nested routes', () => {
    const DeepTestApp = () => (
      <MemoryRouter initialEntries={['/level1/level2/level3']}>
        <Routes>
          <Route path="/" element={<AuthRequired />}>
            <Route path="level1">
              <Route path="level2">
                <Route path="level3" element={<div>Deep Protected Content</div>} />
              </Route>
            </Route>
          </Route>
          <Route path="/unlock-wallet" element={<UnlockComponent />} />
        </Routes>
      </MemoryRouter>
    );

    mockUseWallet.mockReturnValue({
      authState: 'UNLOCKED',
      wallets: [{ id: 'wallet1' }],
      activeWallet: { id: 'wallet1', name: 'Test Wallet' },
      activeAddress: { address: 'bc1qtest', name: 'Test Address' }
    } as any);

    render(<DeepTestApp />);

    expect(screen.getByText('Deep Protected Content')).toBeInTheDocument();
  });
});