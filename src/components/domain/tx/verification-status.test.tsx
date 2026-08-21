/**
 * The component's whole job is restraint. Earlier versions announced what the checks had done —
 * what was compared, what was rebuilt — which is machinery a person cannot act on and most people
 * cannot read, and a reassurance shown on every screen is what teaches someone to approve without
 * looking. It now speaks only when something is actually wrong.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerificationStatus } from './verification-status';

describe('VerificationStatus', () => {
  it('stays silent when nothing is wrong', () => {
    const { container } = render(<VerificationStatus passed />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when verification was not attempted', () => {
    const { container } = render(<VerificationStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blocks loudly on failure in strict mode', () => {
    render(<VerificationStatus passed={false} isStrict warning="Quantity differs" />);

    expect(screen.getByText(/signing blocked/i)).toBeInTheDocument();
    expect(screen.getByText('Quantity differs')).toBeInTheDocument();
    expect(screen.getByText(/ask the site to rebuild/i)).toBeInTheDocument();
    expect(screen.queryByText(/disable|settings.*advanced/i)).not.toBeInTheDocument();
  });

  it('warns rather than blocks when strict mode is off', () => {
    render(<VerificationStatus passed={false} isStrict={false} warning="Quantity differs" />);

    expect(screen.getByText(/verification warning/i)).toBeInTheDocument();
    expect(screen.queryByText(/signing blocked/i)).not.toBeInTheDocument();
  });

  it('never claims verification, in any state', () => {
    // The old copy promised "no tampering detected", which none of these checks can establish.
    for (const props of [{ passed: true }, { passed: undefined }]) {
      const { container } = render(<VerificationStatus {...props} />);
      expect(container.textContent ?? '').not.toMatch(/tampering|verified/i);
    }
  });
});
