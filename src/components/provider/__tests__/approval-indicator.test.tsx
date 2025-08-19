import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApprovalIndicator, ApprovalIndicatorCompact } from '../approval-indicator';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

vi.mock('react-icons/fi', () => ({
  FiAlertCircle: ({ className }: any) => <div data-testid="alert-icon" className={className} />
}));

// Mock approval queue
const mockGetAll = vi.fn();
const mockSubscribe = vi.fn();

vi.mock('@/utils/provider/approvalQueue', () => ({
  approvalQueue: {
    getAll: () => mockGetAll(),
    subscribe: (callback: any) => {
      mockSubscribe(callback);
      return () => {}; // unsubscribe function
    }
  }
}));

// Mock browser API - must be before imports
(global as any).browser = {
  windows: {
    create: vi.fn()
  },
  runtime: {
    getURL: vi.fn((path: string) => `extension://mock/${path}`)
  }
};

describe('ApprovalIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockReturnValue([]);
    // Ensure browser mock is set up
    (global as any).browser = {
      windows: {
        create: vi.fn()
      },
      runtime: {
        getURL: vi.fn((path: string) => `extension://mock/${path}`)
      }
    };
  });

  it('should not render when no pending requests', () => {
    mockGetAll.mockReturnValue([]);
    
    const { container } = render(<ApprovalIndicator />);
    
    expect(container.firstChild).toBeNull();
  });

  it('should render when there are pending requests', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('1 Pending Approval')).toBeInTheDocument();
  });

  it('should show plural form for multiple requests', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site2.com', method: 'eth_sign' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByText('2 Pending Approvals')).toBeInTheDocument();
  });

  it('should show unique origins count', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site1.com', method: 'eth_sign' },
      { id: '3', origin: 'https://site2.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByText('From 2 sites')).toBeInTheDocument();
  });

  it('should show singular form for single site', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site1.com', method: 'eth_sign' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByText('From 1 site')).toBeInTheDocument();
  });

  it('should show badge for multiple pending requests', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site2.com', method: 'eth_sign' }
    ]);
    
    render(<ApprovalIndicator />);
    
    const badge = screen.getByText('2', { selector: 'span.bg-red-500' });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('absolute');
    expect(badge).toHaveClass('-top-1');
    expect(badge).toHaveClass('-right-1');
  });

  it('should not show badge for single request', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.queryByText('1', { selector: 'span.bg-red-500' })).not.toBeInTheDocument();
  });

  it('should show 99+ for more than 99 requests', () => {
    const manyRequests = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      origin: 'https://site.com',
      method: 'eth_sendTransaction'
    }));
    
    mockGetAll.mockReturnValue(manyRequests);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByText('99+')).toBeInTheDocument();
  });



  it('should subscribe to queue changes', () => {
    mockGetAll.mockReturnValue([]);
    
    render(<ApprovalIndicator />);
    
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('should update when queue changes', async () => {
    mockGetAll.mockReturnValue([]);
    let subscribeCallback: any;
    mockSubscribe.mockImplementation((cb) => {
      subscribeCallback = cb;
      return () => {};
    });
    
    const { rerender } = render(<ApprovalIndicator />);
    
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    
    // Simulate queue update
    subscribeCallback([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    rerender(<ApprovalIndicator />);
    
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  it('should handle invalid URLs gracefully', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'invalid-url', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    expect(screen.getByText('From 1 site')).toBeInTheDocument();
  });

  it('should extract hostname from valid URLs', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://app.example.com/path', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    // Should show hostname, not full URL
    expect(screen.getByText('From 1 site')).toBeInTheDocument();
  });

  it('should have correct styles', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('relative');
    expect(button).toHaveClass('flex');
    expect(button).toHaveClass('items-center');
    expect(button).toHaveClass('gap-2');
    expect(button).toHaveClass('bg-orange-50');
    expect(button).toHaveClass('border-orange-200');
    expect(button).toHaveClass('hover:bg-orange-100');
  });

  it('should render alert icon', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicator />);
    
    const icon = screen.getByTestId('alert-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('w-4');
    expect(icon).toHaveClass('h-4');
    expect(icon).toHaveClass('text-orange-600');
  });
});

describe('ApprovalIndicatorCompact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockReturnValue([]);
    // Ensure browser mock is set up
    (global as any).browser = {
      windows: {
        create: vi.fn()
      },
      runtime: {
        getURL: vi.fn((path: string) => `extension://mock/${path}`)
      }
    };
  });

  it('should not render when no pending requests', () => {
    mockGetAll.mockReturnValue([]);
    
    const { container } = render(<ApprovalIndicatorCompact />);
    
    expect(container.firstChild).toBeNull();
  });

  it('should render compact version with pending requests', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicatorCompact />);
    
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', '1 pending approval');
  });

  it('should show plural in title for multiple requests', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site2.com', method: 'eth_sign' }
    ]);
    
    render(<ApprovalIndicatorCompact />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('title', '2 pending approvals');
  });

  it('should show compact badge', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' },
      { id: '2', origin: 'https://site2.com', method: 'eth_sign' }
    ]);
    
    render(<ApprovalIndicatorCompact />);
    
    const badge = screen.getByText('2');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('absolute');
    expect(badge).toHaveClass('-top-1');
    expect(badge).toHaveClass('-right-1');
  });

  it('should show 9+ for more than 9 requests in compact mode', () => {
    const manyRequests = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      origin: 'https://site.com',
      method: 'eth_sendTransaction'
    }));
    
    mockGetAll.mockReturnValue(manyRequests);
    
    render(<ApprovalIndicatorCompact />);
    
    expect(screen.getByText('9+')).toBeInTheDocument();
  });


  it('should have compact styles', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicatorCompact />);
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('relative');
    expect(button).toHaveClass('p-2');
    expect(button).toHaveClass('hover:bg-gray-100');
    expect(button).toHaveClass('rounded-lg');
  });

  it('should render larger icon in compact mode', () => {
    mockGetAll.mockReturnValue([
      { id: '1', origin: 'https://site1.com', method: 'eth_sendTransaction' }
    ]);
    
    render(<ApprovalIndicatorCompact />);
    
    const icon = screen.getByTestId('alert-icon');
    expect(icon).toHaveClass('w-5');
    expect(icon).toHaveClass('h-5');
  });
});