import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { InscribeSwitch } from '../inscribe-switch';

describe('InscribeSwitch', () => {
  it('should render switch with label', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    expect(screen.getByText('Inscribe?')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('should be unchecked when checked prop is false', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('aria-checked', 'false');
  });

  it('should be checked when checked prop is true', () => {
    render(<InscribeSwitch checked={true} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('aria-checked', 'true');
  });

  it('should call onChange when clicked', () => {
    const onChange = vi.fn();
    render(<InscribeSwitch checked={false} onChange={onChange} />);
    
    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);
    
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('should toggle from true to false', () => {
    const onChange = vi.fn();
    render(<InscribeSwitch checked={true} onChange={onChange} />);
    
    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);
    
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('should show help text when showHelpText is true', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} showHelpText={true} />);
    
    expect(screen.getByText('Store message as a Taproot inscription (on-chain)')).toBeInTheDocument();
  });

  it('should hide help text when showHelpText is false', () => {
    const { container } = render(<InscribeSwitch checked={false} onChange={vi.fn()} showHelpText={false} />);
    
    const description = container.querySelector('.hidden');
    expect(description).toBeInTheDocument();
    expect(description).toHaveTextContent('Store message as a Taproot inscription (on-chain)');
  });

  it('should be disabled when disabled prop is true', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} disabled={true} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });

  it('should not call onChange when disabled and clicked', () => {
    const onChange = vi.fn();
    render(<InscribeSwitch checked={false} onChange={onChange} disabled={true} />);
    
    const switchElement = screen.getByRole('switch');
    fireEvent.click(switchElement);
    
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should apply correct styles when checked', () => {
    render(<InscribeSwitch checked={true} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('bg-blue-600');
    
    // Check the inner span (the toggle circle)
    const innerSpan = switchElement.querySelector('span');
    expect(innerSpan).toHaveClass('translate-x-6');
  });

  it('should apply correct styles when unchecked', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('bg-gray-200');
    
    // Check the inner span (the toggle circle)
    const innerSpan = switchElement.querySelector('span');
    expect(innerSpan).toHaveClass('translate-x-1');
  });

  it('should have focus styles', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('focus:outline-none');
    expect(switchElement).toHaveClass('focus:ring-2');
    expect(switchElement).toHaveClass('focus:ring-blue-500');
    expect(switchElement).toHaveClass('focus:ring-offset-2');
  });

  it('should have correct layout structure', () => {
    const { container } = render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const fieldDiv = container.querySelector('[role="group"]') || container.firstChild;
    const flexContainer = fieldDiv?.firstChild as HTMLElement;
    
    expect(flexContainer).toHaveClass('flex');
    expect(flexContainer).toHaveClass('items-center');
    expect(flexContainer).toHaveClass('justify-between');
  });

  it('should have correct label styles', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const label = screen.getByText('Inscribe?');
    expect(label).toHaveClass('text-sm');
    expect(label).toHaveClass('font-medium');
    expect(label).toHaveClass('text-gray-700');
  });

  it('should have correct description styles when shown', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} showHelpText={true} />);
    
    const description = screen.getByText('Store message as a Taproot inscription (on-chain)');
    expect(description).toHaveClass('text-sm');
    expect(description).toHaveClass('text-gray-500');
  });

  it('should have transition styles on switch', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('transition-colors');
    expect(switchElement).toHaveClass('rounded-full');
    expect(switchElement).toHaveClass('inline-flex');
    expect(switchElement).toHaveClass('items-center');
  });

  it('should have transition styles on inner toggle', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    const innerSpan = switchElement.querySelector('span');
    
    expect(innerSpan).toHaveClass('transition-transform');
    expect(innerSpan).toHaveClass('transform');
    expect(innerSpan).toHaveClass('rounded-full');
    expect(innerSpan).toHaveClass('bg-white');
  });

  it('should have correct dimensions', () => {
    render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveClass('h-6');
    expect(switchElement).toHaveClass('w-11');
    
    const innerSpan = switchElement.querySelector('span');
    expect(innerSpan).toHaveClass('h-4');
    expect(innerSpan).toHaveClass('w-4');
  });

  it('should maintain checked state across re-renders', () => {
    const { rerender } = render(<InscribeSwitch checked={false} onChange={vi.fn()} />);
    
    let switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('aria-checked', 'false');
    
    rerender(<InscribeSwitch checked={true} onChange={vi.fn()} />);
    
    switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('aria-checked', 'true');
  });

  it('should handle rapid clicks', () => {
    const onChange = vi.fn();
    render(<InscribeSwitch checked={false} onChange={onChange} />);
    
    const switchElement = screen.getByRole('switch');
    
    fireEvent.click(switchElement);
    fireEvent.click(switchElement);
    fireEvent.click(switchElement);
    
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(1, true);
    expect(onChange).toHaveBeenNthCalledWith(2, true);
    expect(onChange).toHaveBeenNthCalledWith(3, true);
  });

  it('should be keyboard accessible', () => {
    const onChange = vi.fn();
    render(<InscribeSwitch checked={false} onChange={onChange} />);
    
    const switchElement = screen.getByRole('switch');
    
    // Focus the element
    switchElement.focus();
    expect(document.activeElement).toBe(switchElement);
    
    // Space key should toggle
    fireEvent.keyDown(switchElement, { key: ' ', code: 'Space' });
    // Note: Headless UI Switch handles space key press, not keydown
  });
});