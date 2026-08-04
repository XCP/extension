import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TextField } from './text-field';

describe('TextField', () => {
  it('renders the label and marks required with an asterisk', () => {
    render(<TextField label="Amount" name="amount" required />);
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeRequired();
  });

  it('shows help text only when showHelpText is set', () => {
    const { rerender } = render(
      <TextField label="Amount" name="amount" description="How much" />
    );
    expect(screen.queryByText('How much')).not.toBeInTheDocument();

    rerender(<TextField label="Amount" name="amount" description="How much" showHelpText />);
    expect(screen.getByText('How much')).toBeInTheDocument();
  });

  it('renders an error, wires aria, and hides help when errored', () => {
    render(
      <TextField label="Amount" name="amount" description="How much" showHelpText error="Too big" />
    );
    const err = screen.getByRole('alert');
    expect(err).toHaveTextContent('Too big');
    expect(err).toHaveAttribute('id', 'amount-error');
    // Headless UI wires the input's aria-describedby to the error Description.
    expect(screen.getByRole('textbox').getAttribute('aria-describedby')).toContain('amount-error');
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('How much')).not.toBeInTheDocument();
  });

  it('works uncontrolled via defaultValue + name', () => {
    render(<TextField name="commission" defaultValue="0.05" />);
    expect(screen.getByRole('textbox')).toHaveValue('0.05');
  });

  it('forwards value/onChange when controlled', () => {
    const onChange = vi.fn();
    render(<TextField name="q" value="1" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } });
    expect(onChange).toHaveBeenCalled();
  });
});
