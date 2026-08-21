import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  ApprovalExpired, ApprovalFooter,ApprovalSiteBar, 
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

describe('ApprovalSiteBar', () => {
  it('shows the origin hostname and the full origin', () => {
    render(<ApprovalSiteBar origin="https://app.example.com/path" />);
    expect(screen.getByText('app.example.com')).toBeInTheDocument();
    expect(screen.getByText('https://app.example.com/path')).toBeInTheDocument();
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
