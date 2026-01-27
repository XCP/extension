import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Layout } from './layout';

// Mock webext-bridge before any imports that might use it
vi.mock('webext-bridge/popup', () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(),
}));

// Mock React Router
vi.mock('react-router-dom', () => ({
  Outlet: () => <div data-testid="outlet">Page Content</div>
}));

// Mock Header component
vi.mock('@/components/layout/header', () => ({
  Header: (props: any) => {
    // Convert boolean props to string attributes for testing
    const attributes = Object.entries(props).reduce((acc, [key, value]) => {
      if (typeof value === 'boolean') {
        acc[key] = value.toString();
      } else {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    return <header data-testid="header" {...attributes}>Header</header>;
  }
}));

// Mock Footer component
vi.mock('@/components/layout/footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>
}));

// Mock contexts
const mockHeaderProps = {
  title: 'Test Title',
  showBack: true
};

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({
    headerProps: mockHeaderProps
  })
}));

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render header with props from context', () => {
    render(<Layout />);
    
    const header = screen.getByTestId('header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute('title', 'Test Title');
    expect(header).toHaveAttribute('showBack', 'true');
  });

  it('should always render outlet', () => {
    render(<Layout />);

    expect(screen.getByTestId('outlet')).toBeInTheDocument();
    expect(screen.getByText('Page Content')).toBeInTheDocument();
  });

  it('should not render footer by default', () => {
    render(<Layout />);
    
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });

  it('should render footer when showFooter is true', () => {
    render(<Layout showFooter={true} />);
    
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('should apply correct container styles', () => {
    const { container } = render(<Layout />);
    
    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv).toHaveClass('flex');
    expect(layoutDiv).toHaveClass('flex-col');
    expect(layoutDiv).toHaveClass('h-dvh');
    expect(layoutDiv).toHaveClass('bg-gray-100');
  });

  it('should apply correct main section styles', () => {
    render(<Layout />);
    
    const main = screen.getByRole('main');
    expect(main).toHaveClass('flex-1');
    expect(main).toHaveClass('overflow-y-auto');
    expect(main).toHaveClass('no-scrollbar');
    expect(main).toHaveClass('relative');
  });

  it('should maintain layout structure with footer', () => {
    const { container } = render(<Layout showFooter={true} />);
    
    const layoutDiv = container.firstChild as HTMLElement;
    const children = Array.from(layoutDiv.children);
    
    // Should have header, main, footer in that order
    expect(children).toHaveLength(3);
    expect(children[0]).toHaveAttribute('data-testid', 'header');
    expect(children[1].tagName.toLowerCase()).toBe('main');
    expect(children[2]).toHaveAttribute('data-testid', 'footer');
  });

  it('should maintain layout structure without footer', () => {
    const { container } = render(<Layout showFooter={false} />);
    
    const layoutDiv = container.firstChild as HTMLElement;
    const children = Array.from(layoutDiv.children);
    
    // Should have header and main only
    expect(children).toHaveLength(2);
    expect(children[0]).toHaveAttribute('data-testid', 'header');
    expect(children[1].tagName.toLowerCase()).toBe('main');
  });


  it('should handle footer prop changes', () => {
    const { rerender } = render(<Layout showFooter={false} />);
    
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
    
    rerender(<Layout showFooter={true} />);
    
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    
    rerender(<Layout showFooter={false} />);
    
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });

  it('should always render header', () => {
    render(<Layout />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
  });

  it('should use semantic HTML elements', () => {
    render(<Layout />);
    
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should create scrollable main content area', () => {
    render(<Layout />);
    
    const main = screen.getByRole('main');
    // overflow-y-auto allows vertical scrolling
    expect(main).toHaveClass('overflow-y-auto');
    // flex-1 makes it take remaining space
    expect(main).toHaveClass('flex-1');
  });

  it('should position spinner relative to main', () => {
    render(<Layout />);
    
    const main = screen.getByRole('main');
    // relative positioning for absolute children
    expect(main).toHaveClass('relative');
  });

  it('should handle undefined showFooter prop', () => {
    render(<Layout showFooter={undefined} />);
    
    // Default is false, so no footer
    expect(screen.queryByTestId('footer')).not.toBeInTheDocument();
  });

  it('should take full screen height', () => {
    const { container } = render(<Layout />);
    
    const layoutDiv = container.firstChild as HTMLElement;
    expect(layoutDiv).toHaveClass('h-dvh');
  });
});