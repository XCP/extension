import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FiSettings } from '@/components/icons';
import { ActionCard } from './action-card';

describe('ActionCard', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with title only', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Test Action')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    render(
      <ActionCard
        title="Test Action"
        description="This is a test description"
        onClick={mockOnClick}
      />
    );

    expect(screen.getByText('Test Action')).toBeInTheDocument();
    expect(screen.getByText('This is a test description')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
        icon={<FiSettings data-testid="settings-icon" />}
      />
    );

    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
  });

  it('shows chevron by default', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const chevron = screen.getByRole('button').querySelector('svg');
    expect(chevron).toBeInTheDocument();
  });

  it('hides chevron when showChevron is false', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
        showChevron={false}
      />
    );

    // Check that there's no chevron SVG
    const button = screen.getByRole('button');
    const chevronSvg = button.querySelector('svg');
    expect(chevronSvg).toBeNull();
  });

  it('calls onClick when clicked', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  // Keyboard activation is the platform's job now: a real <button> turns Enter
  // and Space into a click, and ignores every other key. jsdom does not
  // synthesise that, so asserting the element type is what pins it down.
  it('is a real button, so the browser handles keyboard activation', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies custom className', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
        className="custom-class"
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('uses custom aria-label', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
        ariaLabel="Custom aria label"
      />
    );

    expect(screen.getByLabelText('Custom aria label')).toBeInTheDocument();
  });

  it('uses title as aria-label by default', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    expect(screen.getByLabelText('Test Action')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Test Action');
  });

  it('has hover and focus styles', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('hover:bg-gray-50');
    expect(button).toHaveClass('focus-visible:outline-none');
    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-blue-500');
  });
});