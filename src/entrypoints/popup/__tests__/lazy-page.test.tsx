import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentType, Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { lazyPage, retryFailedPages } from '../lazy-page';

afterEach(() => { vi.restoreAllMocks(); });

describe('lazyPage', () => {
  const failure = () => Promise.reject(new Error('Failed to fetch dynamically imported module'));
  const tree = (Page: ComponentType) => (
    <ErrorBoundary onReset={retryFailedPages}>
      <Suspense fallback={<p>Loading</p>}>
        <Page />
      </Suspense>
    </ErrorBoundary>
  );

  it('lets "Try again" recover a page whose chunk failed to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn<() => Promise<{ default: ComponentType }>>()
      .mockImplementationOnce(failure)
      .mockResolvedValue({ default: () => <p>Loaded page</p> });
    render(tree(lazyPage(load)));

    fireEvent.click(await screen.findByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Loaded page')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows a failure once rather than reloading on its own while offline', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn<() => Promise<{ default: ComponentType }>>().mockImplementation(failure);
    render(tree(lazyPage(load)));

    const retry = await screen.findByRole('button', { name: 'Try Again' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(load).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('renders a page already loaded without suspending', async () => {
    const Page = lazyPage(async () => ({ default: () => <p>Ready</p> }));
    const first = render(<Suspense fallback={<p>Loading</p>}><Page /></Suspense>);
    expect(await screen.findByText('Ready')).toBeInTheDocument();
    first.unmount();

    render(<Suspense fallback={<p>Loading</p>}><Page /></Suspense>);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
