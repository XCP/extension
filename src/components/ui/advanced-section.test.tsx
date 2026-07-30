import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AdvancedSection } from './advanced-section';

vi.mock('@/components/icons', () => ({
  FiChevronDown: (p: any) => <div data-testid="chevron" {...p} />,
}));

describe('AdvancedSection', () => {
  it('renders the default "Advanced Options" toggle', () => {
    render(<AdvancedSection><p>secret</p></AdvancedSection>);
    expect(screen.getByRole('button', { name: /advanced options/i })).toBeInTheDocument();
  });

  it('accepts a custom title', () => {
    render(<AdvancedSection title="More settings"><p>secret</p></AdvancedSection>);
    expect(screen.getByRole('button', { name: /more settings/i })).toBeInTheDocument();
  });

  it('hides its children until expanded', () => {
    render(<AdvancedSection><p>secret field</p></AdvancedSection>);
    expect(screen.queryByText('secret field')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /advanced options/i }));
    expect(screen.getByText('secret field')).toBeInTheDocument();
  });

  it('starts open when defaultOpen is set', () => {
    render(<AdvancedSection defaultOpen><p>shown now</p></AdvancedSection>);
    expect(screen.getByText('shown now')).toBeInTheDocument();
  });
});
