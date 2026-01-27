import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QRCode } from './qr-code';

// Mock the QR generator to avoid complex canvas operations in tests
vi.mock('@/utils/qr-code', () => ({
  generateQRMatrix: vi.fn(() => {
    // Return a simple 25x25 matrix for testing
    const size = 25;
    return Array(size).fill(null).map(() => Array(size).fill(false));
  })
}));

// Mock image import
vi.mock('@/assets/qr-code.png', () => ({
  default: 'default-logo.png'
}));

describe('QRCode', () => {
  it('should render QR code with text', () => {
    render(<QRCode text="bitcoin:bc1qtest123" />);

    // Canvas has role="img" and aria-label="QR code for {text}"
    const canvas = screen.getByRole('img', { name: /QR code for bitcoin:bc1qtest123/i });
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('data-text', 'bitcoin:bc1qtest123');
  });

  it('should apply default width of 286', () => {
    render(<QRCode text="test-address" />);

    const canvas = screen.getByRole('img', { name: /QR code for test-address/i });
    expect(canvas).toHaveAttribute('data-width', '286');
  });

  it('should apply custom width', () => {
    render(<QRCode text="test-address" width={400} />);

    const canvas = screen.getByRole('img', { name: /QR code for test-address/i });
    expect(canvas).toHaveAttribute('data-width', '400');
  });

  it('should use default logo when not provided', () => {
    render(<QRCode text="test-address" />);

    const canvas = screen.getByRole('img', { name: /QR code for test-address/i });
    expect(canvas).toHaveAttribute('data-logo-src', 'default-logo.png');
    expect(canvas).toHaveAttribute('data-logo-width', '50');
  });

  it('should use custom logo when provided', () => {
    const customLogo = {
      src: 'custom-logo.png',
      width: 80
    };

    render(<QRCode text="test-address" logo={customLogo} />);

    const canvas = screen.getByRole('img', { name: /QR code for test-address/i });
    expect(canvas).toHaveAttribute('data-logo-src', 'custom-logo.png');
    expect(canvas).toHaveAttribute('data-logo-width', '80');
  });

  it('should apply custom className', () => {
    const { container } = render(<QRCode text="test-address" className="custom-class" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-class');
    expect(wrapper).toHaveClass('bg-white');
    expect(wrapper).toHaveClass('p-4');
    expect(wrapper).toHaveClass('rounded-lg');
    expect(wrapper).toHaveClass('shadow-md');
  });

  it('should apply aria-label when provided', () => {
    const { container } = render(<QRCode text="test-address" ariaLabel="QR code for bitcoin address" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveAttribute('aria-label', 'QR code for bitcoin address');
  });

  it('should not have aria-label when not provided', () => {
    const { container } = render(<QRCode text="test-address" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toHaveAttribute('aria-label');
  });

  it('should memoize component', () => {
    const { rerender } = render(<QRCode text="test-address" />);
    const canvas1 = screen.getByRole('img', { name: /QR code for test-address/i });

    // Re-render with same props
    rerender(<QRCode text="test-address" />);
    const canvas2 = screen.getByRole('img', { name: /QR code for test-address/i });

    // Should be the same element (memoized)
    expect(canvas1).toBe(canvas2);
  });

  it('should re-render when text changes', () => {
    const { rerender } = render(<QRCode text="address1" />);

    const canvas1 = screen.getByRole('img', { name: /QR code for address1/i });
    expect(canvas1).toHaveAttribute('data-text', 'address1');

    rerender(<QRCode text="address2" />);

    const canvas2 = screen.getByRole('img', { name: /QR code for address2/i });
    expect(canvas2).toHaveAttribute('data-text', 'address2');
  });

  it('should handle empty text', () => {
    render(<QRCode text="" />);

    // Empty text still creates aria-label "QR code for "
    const canvas = screen.getByRole('img', { name: /QR code for/i });
    expect(canvas).toBeInTheDocument();
    expect(canvas).toHaveAttribute('data-text', '');
  });

  it('should handle long text', () => {
    const longText = 'bitcoin:bc1qveryverylongaddressthatcontainsalotofcharactersfortestingpurposes123456789';
    render(<QRCode text={longText} />);

    const canvas = screen.getByRole('img', { name: new RegExp(`QR code for ${longText}`, 'i') });
    expect(canvas).toHaveAttribute('data-text', longText);
  });

  it('should use custom logo without width', () => {
    const customLogo = {
      src: 'custom-logo.png'
    };

    render(<QRCode text="test-address" logo={customLogo} />);

    const canvas = screen.getByRole('img', { name: /QR code for test-address/i });
    expect(canvas).toHaveAttribute('data-logo-src', 'custom-logo.png');
    expect(canvas).not.toHaveAttribute('data-logo-width');
  });

  it('should have displayName for debugging', () => {
    expect(QRCode.displayName).toBe('QRCode');
  });
});
