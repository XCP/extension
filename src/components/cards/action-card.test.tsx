import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiSettings } from 'react-icons/fi';
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

  it('calls onClick when Enter key is pressed', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when Space key is pressed', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: ' ' });
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick for other keys', () => {
    render(
      <ActionCard
        title="Test Action"
        onClick={mockOnClick}
      />
    );

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Tab' });
    expect(mockOnClick).not.toHaveBeenCalled();
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
    expect(button).toHaveAttribute('tabIndex', '0');
    expect(button).toHaveAttribute('role', 'button');
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
    expect(button).toHaveClass('focus:outline-none');
    expect(button).toHaveClass('focus:ring-2');
    expect(button).toHaveClass('focus:ring-blue-500');
  });
});