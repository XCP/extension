import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { Collapsible } from './collapsible';

vi.mock('@/components/icons', () => ({
  FiChevronDown: (p: any) => <div data-testid="chevron" {...p} />,
}));

describe('Collapsible', () => {
  it('renders the title and hides children until expanded', () => {
    render(<Collapsible title="Advanced Options"><p>secret field</p></Collapsible>);
    expect(screen.getByRole('button', { name: /advanced options/i })).toBeInTheDocument();
    expect(screen.queryByText('secret field')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /advanced options/i }));
    expect(screen.getByText('secret field')).toBeInTheDocument();
  });

  it('starts open when defaultOpen is set', () => {
    render(<Collapsible title="Details" defaultOpen><p>shown now</p></Collapsible>);
    expect(screen.getByText('shown now')).toBeInTheDocument();
  });

  it('supports the card variant (white surface + title header)', () => {
    const { container } = render(
      <Collapsible variant="card" title="Transaction Details"><p>rows</p></Collapsible>
    );
    expect(container.firstChild).toHaveClass('bg-white');
    expect(screen.getByRole('button', { name: /transaction details/i })).toBeInTheDocument();
  });

  it('forwards a custom className to the wrapper', () => {
    const { container } = render(<Collapsible title="t" className="mt-8"><p>x</p></Collapsible>);
    expect(container.firstChild).toHaveClass('mt-8');
  });
});
