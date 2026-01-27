import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CheckboxInput } from './checkbox-input';

describe('CheckboxInput', () => {
  it('should render checkbox with label', () => {
    render(<CheckboxInput name="terms" label="Accept terms and conditions" />);
    
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('Accept terms and conditions')).toBeInTheDocument();
  });

  it('should be unchecked by default', () => {
    render(<CheckboxInput name="test" label="Test checkbox" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('should be checked when defaultChecked is true', () => {
    render(<CheckboxInput name="test" label="Test checkbox" defaultChecked={true} />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('should toggle when clicked', () => {
    render(<CheckboxInput name="test" label="Test checkbox" />);
    
    const checkbox = screen.getByRole('checkbox');
    
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('should call onChange when toggled', () => {
    const handleChange = vi.fn();
    render(<CheckboxInput name="test" label="Test checkbox" onChange={handleChange} />);
    
    const checkbox = screen.getByRole('checkbox');
    
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(true);
    
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<CheckboxInput name="test" label="Test checkbox" disabled />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
  });

  it('should not toggle when disabled', () => {
    const handleChange = vi.fn();
    render(<CheckboxInput name="test" label="Test checkbox" disabled onChange={handleChange} />);
    
    const checkbox = screen.getByRole('checkbox');
    
    fireEvent.click(checkbox);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should work as controlled component', () => {
    const { rerender } = render(
      <CheckboxInput name="test" label="Test checkbox" checked={false} />
    );
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    
    // Update checked prop
    rerender(<CheckboxInput name="test" label="Test checkbox" checked={true} />);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    
    // Should stay controlled even when clicked
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'true'); // Still true because controlled
  });

  it('should call onChange in controlled mode', () => {
    const handleChange = vi.fn();
    render(
      <CheckboxInput name="test" label="Test checkbox" checked={false} onChange={handleChange} />
    );
    
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('should have correct name attribute', () => {
    render(<CheckboxInput name="newsletter" label="Subscribe" />);
    
    // Headless UI Checkbox may not have a direct name attribute
    // Check for the hidden input that carries the name
    const hiddenInput = document.querySelector('input[name="newsletter"]');
    expect(hiddenInput).toBeInTheDocument();
  });

  it('should have value attribute of "yes"', () => {
    render(<CheckboxInput name="test" label="Test" />);
    
    // Headless UI Checkbox stores value differently
    // Check for the hidden input that carries the value
    const hiddenInput = document.querySelector('input[name="test"]');
    expect(hiddenInput).toHaveAttribute('value', 'yes');
  });

  it('should generate unique id when not provided', () => {
    render(<CheckboxInput name="myCheckbox" label="Test" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'checkbox-myCheckbox');
  });

  it('should use provided id', () => {
    render(<CheckboxInput name="test" label="Test" id="custom-id" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveAttribute('id', 'custom-id');
  });

  it('should associate label with checkbox', () => {
    render(<CheckboxInput name="test" label="Click me" id="my-checkbox" />);
    
    const label = screen.getByText('Click me');
    expect(label).toHaveAttribute('for', 'my-checkbox');
  });

  it('should apply correct styles when unchecked', () => {
    render(<CheckboxInput name="test" label="Test" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('border-gray-300');
    expect(checkbox).toHaveClass('bg-white');
  });

  it('should apply correct styles when disabled', () => {
    render(<CheckboxInput name="test" label="Test" disabled />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('border-gray-200');
    expect(checkbox).toHaveClass('bg-gray-50');
    expect(checkbox).toHaveClass('cursor-not-allowed');
    
    const label = screen.getByText('Test');
    expect(label).toHaveClass('text-gray-500');
  });

  it('should apply hover styles when not disabled', () => {
    render(<CheckboxInput name="test" label="Test" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('hover:border-gray-400');
    expect(checkbox).toHaveClass('cursor-pointer');
  });

  it('should have focus styles', () => {
    render(<CheckboxInput name="test" label="Test" />);
    
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toHaveClass('focus-visible:outline-none');
    expect(checkbox).toHaveClass('focus-visible:ring-2');
    expect(checkbox).toHaveClass('focus-visible:ring-blue-500');
    expect(checkbox).toHaveClass('focus-visible:ring-offset-2');
  });

  it('should render checkmark SVG', () => {
    const { container } = render(<CheckboxInput name="test" label="Test" />);
    
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass('size-3.5');
    expect(svg).toHaveClass('stroke-white');
  });

  it('should have correct layout classes', () => {
    const { container } = render(<CheckboxInput name="test" label="Test" />);
    
    const wrapper = container.querySelector('.flex');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('gap-3');
  });

  it('should toggle from uncontrolled to controlled', () => {
    const { rerender } = render(<CheckboxInput name="test" label="Test" />);
    
    const checkbox = screen.getByRole('checkbox');
    
    // Start uncontrolled
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute('aria-checked', 'true');
    
    // Switch to controlled
    rerender(<CheckboxInput name="test" label="Test" checked={false} />);
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('should handle label click', () => {
    const handleChange = vi.fn();
    render(<CheckboxInput name="test" label="Click this label" onChange={handleChange} />);
    
    const label = screen.getByText('Click this label');
    fireEvent.click(label);
    
    expect(handleChange).toHaveBeenCalledWith(true);
  });
});