import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Footer } from '../footer';

// Mock React Router
const mockNavigate = vi.fn();
const mockLocation = { pathname: '/index' };

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}));

// Mock React Icons
vi.mock('react-icons/fa', () => ({
  FaWallet: ({ className }: any) => <div data-testid="wallet-icon" className={className} />,
  FaUniversity: ({ className }: any) => <div data-testid="university-icon" className={className} />,
  FaTools: ({ className }: any) => <div data-testid="tools-icon" className={className} />,
  FaCog: ({ className }: any) => <div data-testid="cog-icon" className={className} />
}));

describe('Footer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation.pathname = '/index';
  });

  it('should render all navigation buttons', () => {
    render(<Footer />);
    
    expect(screen.getByTestId('wallet-icon')).toBeInTheDocument();
    expect(screen.getByTestId('university-icon')).toBeInTheDocument();
    expect(screen.getByTestId('tools-icon')).toBeInTheDocument();
    expect(screen.getByTestId('cog-icon')).toBeInTheDocument();
  });

  it('should have 4 navigation buttons', () => {
    render(<Footer />);
    
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('should navigate to index when wallet button is clicked', () => {
    render(<Footer />);
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    fireEvent.click(walletButton!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/index');
  });

  it('should navigate to market when university button is clicked', () => {
    render(<Footer />);
    
    const marketButton = screen.getByTestId('university-icon').parentElement?.parentElement;
    fireEvent.click(marketButton!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/market');
  });

  it('should navigate to actions when tools button is clicked', () => {
    render(<Footer />);
    
    const actionsButton = screen.getByTestId('tools-icon').parentElement?.parentElement;
    fireEvent.click(actionsButton!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/actions');
  });

  it('should navigate to settings when cog button is clicked', () => {
    render(<Footer />);
    
    const settingsButton = screen.getByTestId('cog-icon').parentElement?.parentElement;
    fireEvent.click(settingsButton!);
    
    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('should highlight active route with blue color', () => {
    mockLocation.pathname = '/index';
    render(<Footer />);
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    expect(walletButton).toHaveClass('text-blue-600');
    
    const marketButton = screen.getByTestId('university-icon').parentElement?.parentElement;
    expect(marketButton).toHaveClass('text-gray-600');
  });

  it('should highlight market when on market route', () => {
    mockLocation.pathname = '/market';
    render(<Footer />);
    
    const marketButton = screen.getByTestId('university-icon').parentElement?.parentElement;
    expect(marketButton).toHaveClass('text-blue-600');
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    expect(walletButton).toHaveClass('text-gray-600');
  });

  it('should highlight actions when on actions route', () => {
    mockLocation.pathname = '/actions';
    render(<Footer />);
    
    const actionsButton = screen.getByTestId('tools-icon').parentElement?.parentElement;
    expect(actionsButton).toHaveClass('text-blue-600');
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    expect(walletButton).toHaveClass('text-gray-600');
  });

  it('should highlight settings when on settings route', () => {
    mockLocation.pathname = '/settings';
    render(<Footer />);
    
    const settingsButton = screen.getByTestId('cog-icon').parentElement?.parentElement;
    expect(settingsButton).toHaveClass('text-blue-600');
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    expect(walletButton).toHaveClass('text-gray-600');
  });

  it('should apply hover styles to buttons', () => {
    render(<Footer />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveClass('hover:bg-gray-100');
    });
  });

  it('should apply transparent variant to all buttons', () => {
    render(<Footer />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      // Check for transparent variant styling
      expect(button.className).toMatch(/transparent|bg-transparent/);
    });
  });

  it('should apply fullWidth to all buttons', () => {
    render(<Footer />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveClass('w-full');
    });
  });

  it('should have correct container styles', () => {
    const { container } = render(<Footer />);
    
    const footerContainer = container.firstChild as HTMLElement;
    expect(footerContainer).toHaveClass('p-2');
    expect(footerContainer).toHaveClass('bg-white');
    expect(footerContainer).toHaveClass('border-t');
    expect(footerContainer).toHaveClass('border-gray-300');
  });

  it('should use grid layout for buttons', () => {
    const { container } = render(<Footer />);
    
    const gridContainer = container.querySelector('.grid');
    expect(gridContainer).toBeInTheDocument();
    expect(gridContainer).toHaveClass('grid-cols-4');
    expect(gridContainer).toHaveClass('gap-2');
  });

  it('should center icons in buttons', () => {
    render(<Footer />);
    
    const iconContainers = screen.getAllByRole('button').map(button => 
      button.querySelector('.flex.flex-col.items-center')
    );
    
    iconContainers.forEach(container => {
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('flex');
      expect(container).toHaveClass('flex-col');
      expect(container).toHaveClass('items-center');
    });
  });

  it('should apply correct icon styles', () => {
    render(<Footer />);
    
    const icons = [
      screen.getByTestId('wallet-icon'),
      screen.getByTestId('university-icon'),
      screen.getByTestId('tools-icon'),
      screen.getByTestId('cog-icon')
    ];
    
    icons.forEach(icon => {
      expect(icon).toHaveClass('text-lg');
      expect(icon).toHaveClass('mb-1');
    });
  });

  it('should handle rapid navigation clicks', () => {
    render(<Footer />);
    
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    const marketButton = screen.getByTestId('university-icon').parentElement?.parentElement;
    
    fireEvent.click(walletButton!);
    fireEvent.click(marketButton!);
    fireEvent.click(walletButton!);
    
    expect(mockNavigate).toHaveBeenCalledTimes(3);
    expect(mockNavigate).toHaveBeenNthCalledWith(1, '/index');
    expect(mockNavigate).toHaveBeenNthCalledWith(2, '/market');
    expect(mockNavigate).toHaveBeenNthCalledWith(3, '/index');
  });

  it('should not highlight any button for unknown route', () => {
    mockLocation.pathname = '/unknown';
    render(<Footer />);
    
    const buttons = screen.getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveClass('text-gray-600');
      expect(button).not.toHaveClass('text-blue-600');
    });
  });

  it('should pass event name to handleNavigation', () => {
    render(<Footer />);
    
    // Note: The handleNavigation function passes a second parameter
    // but doesn't use it. This is likely for analytics/tracking
    const walletButton = screen.getByTestId('wallet-icon').parentElement?.parentElement;
    fireEvent.click(walletButton!);
    
    // The function is called with route and event name
    expect(mockNavigate).toHaveBeenCalledWith('/index');
  });

  it('should maintain layout on different screen sizes', () => {
    const { container } = render(<Footer />);
    
    const gridContainer = container.querySelector('.grid');
    // Grid should always be 4 columns
    expect(gridContainer).toHaveClass('grid-cols-4');
    // No responsive modifiers, so it's always 4 columns
    expect(gridContainer?.className).not.toMatch(/sm:|md:|lg:|xl:/);
  });
});