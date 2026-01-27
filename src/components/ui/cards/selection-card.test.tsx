import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup } from '@headlessui/react';
import { FiSettings } from '@/components/icons';
import { SelectionCard, SelectionCardGroup } from './selection-card';
import { useState } from 'react';

// Test wrapper component with RadioGroup
function TestWrapper({ 
  children,
  value = "option1",
  onChange = vi.fn()
}: { 
  children: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [selected, setSelected] = useState(value);
  
  const handleChange = (newValue: string) => {
    setSelected(newValue);
    onChange(newValue);
  };
  
  return (
    <RadioGroup value={selected} onChange={handleChange}>
      {children}
    </RadioGroup>
  );
}

describe('SelectionCard', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with title only', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          description="This is a description"
        />
      </TestWrapper>
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('shows checkmark when selected', () => {
    const { container } = render(
      <TestWrapper value="option1">
        <SelectionCard
          value="option1"
          title="Option 1"
        />
      </TestWrapper>
    );

    const checkmark = container.querySelector('svg');
    expect(checkmark).toBeInTheDocument();
  });

  it('does not show checkmark when not selected', () => {
    render(
      <TestWrapper value="option2">
        <SelectionCard
          value="option1"
          title="Option 1"
        />
      </TestWrapper>
    );

    const checkmark = document.querySelector('.fa-check');
    expect(checkmark).not.toBeInTheDocument();
  });

  it('does not show checkmark when showCheckmark is false', () => {
    render(
      <TestWrapper value="option1">
        <SelectionCard
          value="option1"
          title="Option 1"
          showCheckmark={false}
        />
      </TestWrapper>
    );

    const checkmark = document.querySelector('.fa-check');
    expect(checkmark).not.toBeInTheDocument();
  });

  it('renders with icon', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          icon={<FiSettings data-testid="settings-icon" />}
        />
      </TestWrapper>
    );

    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
  });

  it('handles disabled state', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          disabled={true}
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 1').closest('[role="radio"]');
    expect(option).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows disabled reason when provided', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          disabled={true}
          disabledReason="This option is not available"
        />
      </TestWrapper>
    );

    expect(screen.getByText('This option is not available')).toBeInTheDocument();
  });

  it('does not show checkmark when disabled and selected', () => {
    render(
      <TestWrapper value="option1">
        <SelectionCard
          value="option1"
          title="Option 1"
          disabled={true}
        />
      </TestWrapper>
    );

    const checkmark = document.querySelector('.fa-check');
    expect(checkmark).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          className="custom-class"
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 1').closest('[role="radio"]');
    expect(option?.className).toContain('custom-class');
  });

  it('renders custom children content', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
        >
          <div data-testid="custom-content">Custom content</div>
        </SelectionCard>
      </TestWrapper>
    );

    expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('triggers onChange when clicked', () => {
    render(
      <TestWrapper value="option1" onChange={mockOnChange}>
        <SelectionCard
          value="option2"
          title="Option 2"
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 2').closest('[role="radio"]');
    fireEvent.click(option!);

    expect(mockOnChange).toHaveBeenCalledWith('option2');
  });

  it('has proper styling for selected state', () => {
    render(
      <TestWrapper value="option1">
        <SelectionCard
          value="option1"
          title="Option 1"
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 1').closest('[role="radio"]');
    expect(option?.className).toContain('border-blue-500');
    expect(option?.className).toContain('shadow-md');
  });

  it('has proper styling for unselected state', () => {
    render(
      <TestWrapper value="option2">
        <SelectionCard
          value="option1"
          title="Option 1"
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 1').closest('[role="radio"]');
    expect(option?.className).toContain('hover:bg-gray-50');
    expect(option?.className).toContain('border-transparent');
  });

  it('has proper styling for disabled state', () => {
    render(
      <TestWrapper>
        <SelectionCard
          value="option1"
          title="Option 1"
          disabled={true}
        />
      </TestWrapper>
    );

    const option = screen.getByText('Option 1').closest('[role="radio"]');
    expect(option?.className).toContain('cursor-not-allowed');
    expect(option?.className).toContain('bg-gray-100');
    expect(option?.className).toContain('opacity-60');
  });
});

describe('SelectionCardGroup', () => {
  it('renders children with default spacing', () => {
    const { container } = render(
      <SelectionCardGroup>
        <div>Child 1</div>
        <div>Child 2</div>
      </SelectionCardGroup>
    );

    const group = container.firstChild as HTMLElement;
    expect(group).toHaveClass('space-y-2');
    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <SelectionCardGroup className="custom-spacing">
        <div>Child</div>
      </SelectionCardGroup>
    );

    const group = container.firstChild as HTMLElement;
    expect(group).toHaveClass('custom-spacing');
  });
});