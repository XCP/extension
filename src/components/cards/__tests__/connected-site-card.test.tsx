import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FiShield } from '@/components/icons';
import { ConnectedSiteCard } from '../connected-site-card';

describe('ConnectedSiteCard', () => {
  const mockOnDisconnect = vi.fn();
  
  const defaultProps = {
    hostname: 'app.xcp.io',
    origin: 'https://app.xcp.io',
    onDisconnect: mockOnDisconnect
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders site information correctly', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    expect(screen.getByText('app.xcp.io')).toBeInTheDocument();
    expect(screen.getByText('https://app.xcp.io')).toBeInTheDocument();
  });

  it('displays default globe icon', () => {
    const { container } = render(<ConnectedSiteCard {...defaultProps} />);
    
    const globeIcon = container.querySelector('svg');
    expect(globeIcon).toBeInTheDocument();
  });

  it('displays custom icon when provided', () => {
    render(
      <ConnectedSiteCard 
        {...defaultProps} 
        icon={<FiShield data-testid="custom-icon" />}
      />
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('calls onDisconnect when disconnect button is clicked', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    fireEvent.click(disconnectButton);

    expect(mockOnDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onDisconnect when Enter key is pressed on disconnect button', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    fireEvent.keyDown(disconnectButton, { key: 'Enter' });

    expect(mockOnDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onDisconnect when Space key is pressed on disconnect button', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    fireEvent.keyDown(disconnectButton, { key: ' ' });

    expect(mockOnDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not call onDisconnect for other keys', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    fireEvent.keyDown(disconnectButton, { key: 'Tab' });

    expect(mockOnDisconnect).not.toHaveBeenCalled();
  });

  it('stops event propagation when disconnect is clicked', () => {
    const mockParentClick = vi.fn();
    
    render(
      <div onClick={mockParentClick}>
        <ConnectedSiteCard {...defaultProps} />
      </div>
    );

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    fireEvent.click(disconnectButton);

    expect(mockOnDisconnect).toHaveBeenCalledTimes(1);
    expect(mockParentClick).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <ConnectedSiteCard {...defaultProps} className="custom-class" />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('custom-class');
  });

  it('uses custom aria-label when provided', () => {
    render(
      <ConnectedSiteCard 
        {...defaultProps} 
        ariaLabel="Custom connected site label"
      />
    );

    expect(screen.getByLabelText('Custom connected site label')).toBeInTheDocument();
  });

  it('uses default aria-label when not provided', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    expect(screen.getByLabelText('Connected site: app.xcp.io')).toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const card = screen.getByRole('article');
    expect(card).toBeInTheDocument();

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    expect(disconnectButton).toHaveAttribute('title', 'Disconnect site');
  });

  it('truncates long hostnames and origins', () => {
    const longProps = {
      hostname: 'this-is-a-very-long-hostname-that-should-be-truncated.example.com',
      origin: 'https://this-is-a-very-long-hostname-that-should-be-truncated.example.com',
      onDisconnect: mockOnDisconnect
    };

    render(<ConnectedSiteCard {...longProps} />);

    const hostname = screen.getByText(longProps.hostname);
    expect(hostname).toHaveClass('truncate');

    const origin = screen.getByText(longProps.origin);
    expect(origin).toHaveClass('truncate');
    expect(origin).toHaveAttribute('title', longProps.origin);
  });

  it('has hover effects on disconnect button', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    expect(disconnectButton).toHaveClass('hover:bg-red-50');
    expect(disconnectButton).toHaveClass('transition-colors');
  });

  it('has focus styles on disconnect button', () => {
    render(<ConnectedSiteCard {...defaultProps} />);

    const disconnectButton = screen.getByRole('button', { name: /disconnect app.xcp.io/i });
    expect(disconnectButton).toHaveClass('focus:outline-none');
    expect(disconnectButton).toHaveClass('focus:ring-2');
    expect(disconnectButton).toHaveClass('focus:ring-red-500');
  });
});