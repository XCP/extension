import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  ApprovalExpired, ApprovalFooter,ApprovalSiteBar, ApprovalUnavailable,
} from './approval-chrome';

vi.mock('@/components/icons', () => ({
  FiClock: (p: any) => <div {...p} />,
  FiGlobe: (p: any) => <div data-testid="globe" {...p} />,
}));

describe('ApprovalExpired', () => {
  it('shows the given message, else a default', () => {
    const { rerender } = render(<ApprovalExpired message="Nope" />);
    expect(screen.getByText('Nope')).toBeInTheDocument();
    rerender(<ApprovalExpired />);
    expect(screen.getByText('This signing request is no longer available.')).toBeInTheDocument();
  });
});

describe('ApprovalUnavailable', () => {
  it('offers a read retry without presenting an approval or claiming expiration', () => {
    const retry = vi.fn();
    const { rerender } = render(<ApprovalUnavailable message="Previous output lookup failed" onRetry={retry} retrying={false} />);
    expect(screen.getByText('Previous output lookup failed')).toBeInTheDocument();
    expect(screen.queryByText('Request Expired')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry verification' }));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<ApprovalUnavailable onRetry={retry} retrying />);
    expect(screen.getByRole('button', { name: 'Verifying…' })).toBeDisabled();
  });
});

describe('ApprovalSiteBar', () => {
  it('shows the origin hostname and the full origin', () => {
    render(<ApprovalSiteBar origin="https://app.example.com/path" />);
    expect(screen.getByText('app.example.com')).toHaveClass('break-all');
    expect(screen.getByText('https://app.example.com/path')).toHaveClass('break-all');
  });

  it('does not hide the registrable domain of a long subdomain', () => {
    const origin = `https://${'trusted-looking.'.repeat(12)}attacker.example`;
    render(<ApprovalSiteBar origin={origin} />);

    const hostname = new URL(origin).hostname;
    expect(screen.getByText(hostname)).not.toHaveClass('truncate');
    expect(screen.getByText(hostname)).toHaveAttribute('title', hostname);
    expect(screen.getByText(origin)).toHaveAttribute('title', origin);
  });

  it('falls back to a globe icon when the favicon fails to load', () => {
    render(<ApprovalSiteBar origin="https://x.example.com" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('globe')).toBeInTheDocument();
  });
});

describe('ApprovalFooter', () => {
  const base = { onCancel: () => {}, onSign: () => {}, busy: false, blocked: false, isHardware: false };

  it('labels the sign button by state', () => {
    const { rerender } = render(<ApprovalFooter {...base} />);
    expect(screen.getByRole('button', { name: 'Sign' })).toBeInTheDocument();

    rerender(<ApprovalFooter {...base} blocked />);
    expect(screen.getByRole('button', { name: 'Blocked' })).toBeDisabled();

    rerender(<ApprovalFooter {...base} blocked blockedLabel="Awaiting verification" />);
    expect(screen.getByRole('button', { name: 'Awaiting verification' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();

    rerender(<ApprovalFooter {...base} busy />);
    expect(screen.getByRole('button', { name: 'Signing…' })).toBeInTheDocument();

    rerender(<ApprovalFooter {...base} busy isHardware />);
    expect(screen.getByRole('button', { name: 'Confirm on device…' })).toBeInTheDocument();

    rerender(<ApprovalFooter {...base} signLabel="Review" />);
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('wires cancel and sign handlers', () => {
    const onCancel = vi.fn();
    const onSign = vi.fn();
    render(<ApprovalFooter {...base} onCancel={onCancel} onSign={onSign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSign).toHaveBeenCalledOnce();
  });
});
