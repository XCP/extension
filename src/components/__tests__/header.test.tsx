import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Header } from '../header';

// Mock the logo import
vi.mock('@/assets/logo.png', () => ({
  default: 'logo.png'
}));

describe('Header', () => {
  it('should render header element', () => {
    render(<Header />);
    
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();
  });

  it('should render string title when provided', () => {
    render(<Header title="Test Title" />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Title');
  });

  it('should render custom title component', () => {
    const CustomTitle = <div data-testid="custom-title">Custom Component</div>;
    render(<Header title={CustomTitle} />);
    
    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
    expect(screen.getByText('Custom Component')).toBeInTheDocument();
  });

  it('should render logo when useLogoTitle is true', () => {
    render(<Header useLogoTitle={true} />);
    
    const logo = screen.getByAltText('Logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', 'logo.png');
    expect(logo).toHaveClass('h-8');
  });

  it('should prioritize logo over title when both provided', () => {
    render(<Header useLogoTitle={true} title="Test Title" />);
    
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
    expect(screen.queryByText('Test Title')).not.toBeInTheDocument();
  });

  it('should render back button when onBack is provided', () => {
    const onBack = vi.fn();
    render(<Header onBack={onBack} />);
    
    const backButton = screen.getByLabelText('Go Back');
    expect(backButton).toBeInTheDocument();
    expect(backButton).toHaveTextContent('Back');
  });

  it('should call onBack when back button is clicked', () => {
    const onBack = vi.fn();
    render(<Header onBack={onBack} />);
    
    const backButton = screen.getByLabelText('Go Back');
    fireEvent.click(backButton);
    
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('should render custom left button when provided without onBack', () => {
    const leftButton = {
      label: 'Custom',
      onClick: vi.fn(),
      ariaLabel: 'Custom Button'
    };
    
    render(<Header leftButton={leftButton} />);
    
    const button = screen.getByLabelText('Custom Button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Custom');
  });

  it('should call leftButton onClick when clicked', () => {
    const onClick = vi.fn();
    const leftButton = {
      label: 'Custom',
      onClick,
      ariaLabel: 'Custom Button'
    };
    
    render(<Header leftButton={leftButton} />);
    
    const button = screen.getByLabelText('Custom Button');
    fireEvent.click(button);
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should render left button with icon and label', () => {
    const leftButton = {
      label: 'Settings',
      icon: <span data-testid="settings-icon">⚙</span>,
      onClick: vi.fn(),
      ariaLabel: 'Settings Button'
    };
    
    render(<Header leftButton={leftButton} />);
    
    const button = screen.getByLabelText('Settings Button');
    expect(button).toHaveTextContent('Settings');
    expect(screen.getByTestId('settings-icon')).toBeInTheDocument();
  });

  it('should render left button with icon only', () => {
    const leftButton = {
      icon: <span data-testid="menu-icon">☰</span>,
      onClick: vi.fn(),
      ariaLabel: 'Menu Button'
    };
    
    render(<Header leftButton={leftButton} />);

    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
    // Icon should not have margin when no label
    const icon = screen.getByTestId('menu-icon').parentElement;
    expect(icon).not.toHaveClass('mr-1');
  });

  it('should disable left button when disabled prop is true', () => {
    const leftButton = {
      label: 'Disabled',
      onClick: vi.fn(),
      ariaLabel: 'Disabled Button',
      disabled: true
    };
    
    render(<Header leftButton={leftButton} />);
    
    const button = screen.getByLabelText('Disabled Button');
    expect(button).toBeDisabled();
  });

  it('should render right button when provided', () => {
    const rightButton = {
      label: 'Action',
      onClick: vi.fn(),
      ariaLabel: 'Action Button'
    };
    
    render(<Header rightButton={rightButton} />);
    
    const button = screen.getByLabelText('Action Button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Action');
  });

  it('should call rightButton onClick when clicked', () => {
    const onClick = vi.fn();
    const rightButton = {
      label: 'Action',
      onClick,
      ariaLabel: 'Action Button'
    };
    
    render(<Header rightButton={rightButton} />);
    
    const button = screen.getByLabelText('Action Button');
    fireEvent.click(button);
    
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should prioritize onBack over leftButton', () => {
    const onBack = vi.fn();
    const leftButton = {
      label: 'Custom',
      onClick: vi.fn(),
      ariaLabel: 'Custom Button'
    };
    
    render(<Header onBack={onBack} leftButton={leftButton} />);
    
    // Should show back button, not custom left button
    expect(screen.getByLabelText('Go Back')).toBeInTheDocument();
    expect(screen.queryByLabelText('Custom Button')).not.toBeInTheDocument();
  });

  it('should use leftButton disabled state for back button', () => {
    const onBack = vi.fn();
    const leftButton = {
      label: 'Custom',
      onClick: vi.fn(),
      disabled: true,
      ariaLabel: 'Custom button'
    };
    
    render(<Header onBack={onBack} leftButton={leftButton} />);
    
    const backButton = screen.getByLabelText('Go Back');
    expect(backButton).toBeDisabled();
  });

  it('should apply correct container styles', () => {
    render(<Header />);
    
    const header = screen.getByRole('banner');
    expect(header).toHaveClass('grid');
    expect(header).toHaveClass('grid-cols-4');
    expect(header).toHaveClass('items-center');
    expect(header).toHaveClass('p-4');
    expect(header).toHaveClass('h-16');
    expect(header).toHaveClass('bg-white');
    expect(header).toHaveClass('shadow-md');
  });

  it('should apply correct section styles', () => {
    const { container } = render(<Header title="Test" />);
    
    const sections = container.querySelectorAll('.col-span-1, .col-span-2');
    expect(sections).toHaveLength(3);
    
    // Left section
    expect(sections[0]).toHaveClass('col-span-1');
    expect(sections[0]).toHaveClass('flex');
    expect(sections[0]).toHaveClass('justify-start');
    
    // Center section
    expect(sections[1]).toHaveClass('col-span-2');
    expect(sections[1]).toHaveClass('flex');
    expect(sections[1]).toHaveClass('justify-center');
    expect(sections[1]).toHaveClass('items-center');
    
    // Right section
    expect(sections[2]).toHaveClass('col-span-1');
    expect(sections[2]).toHaveClass('flex');
    expect(sections[2]).toHaveClass('justify-end');
  });

  it('should render nothing in sections when no props provided', () => {
    const { container } = render(<Header />);
    
    const sections = container.querySelectorAll('.col-span-1, .col-span-2');
    
    // Left section should be empty
    expect(sections[0].children).toHaveLength(0);
    
    // Center section should be empty
    expect(sections[1].children).toHaveLength(0);
    
    // Right section should be empty
    expect(sections[2].children).toHaveLength(0);
  });

  it('should apply header variant to buttons', () => {
    const leftButton = {
      label: 'Left',
      onClick: vi.fn(),
      ariaLabel: 'Left Button'
    };
    
    const rightButton = {
      label: 'Right',
      onClick: vi.fn(),
      ariaLabel: 'Right Button'
    };
    
    render(<Header leftButton={leftButton} rightButton={rightButton} />);
    
    // Buttons should have header variant styling
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button.className).toMatch(/header|h-\[32px\]/);
    });
  });

  it('should handle icon spacing with label', () => {
    const leftButton = {
      label: 'Settings',
      icon: <span data-testid="icon">⚙</span>,
      onClick: vi.fn(),
      ariaLabel: 'Settings'
    };
    
    render(<Header leftButton={leftButton} />);
    
    const iconWrapper = screen.getByTestId('icon').parentElement;
    expect(iconWrapper).toHaveClass('mr-1');
  });

  it('should mark icons as decorative with aria-hidden', () => {
    const leftButton = {
      label: 'Settings',
      icon: <span data-testid="icon">⚙</span>,
      onClick: vi.fn(),
      ariaLabel: 'Settings'
    };
    
    render(<Header leftButton={leftButton} />);
    
    const iconWrapper = screen.getByTestId('icon').parentElement;
    expect(iconWrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('should render back arrow as decorative', () => {
    render(<Header onBack={vi.fn()} />);
    
    const backButton = screen.getByLabelText('Go Back');
    const arrow = backButton.querySelector('span[aria-hidden="true"]');
    expect(arrow).toBeInTheDocument();
    expect(arrow).toHaveTextContent('←');
  });
});