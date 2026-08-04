/**
 * The distinction under test is the point of the component: passing a comparison and having no
 * comparison to pass are different facts, and only the first justifies telling the user that no
 * tampering was detected.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerificationStatus } from './verification-status';

describe('VerificationStatus', () => {
  it('claims no tampering only when a comparison actually happened', () => {
    render(<VerificationStatus passed comparedAgainstApi />);
    expect(screen.getByText(/no tampering detected/i)).toBeInTheDocument();
  });

  it('does not claim verification when there was nothing to compare against', () => {
    render(<VerificationStatus passed comparedAgainstApi={false} />);

    expect(screen.queryByText(/no tampering detected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no second source/i)).toBeInTheDocument();
  });

  it('renders nothing when verification was not attempted', () => {
    const { container } = render(<VerificationStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('blocks loudly on failure in strict mode', () => {
    render(<VerificationStatus passed={false} isStrict warning="Quantity differs" />);

    expect(screen.getByText(/signing blocked/i)).toBeInTheDocument();
    expect(screen.getByText('Quantity differs')).toBeInTheDocument();
  });

  it('warns rather than blocks when strict mode is off', () => {
    render(<VerificationStatus passed={false} isStrict={false} warning="Quantity differs" />);

    expect(screen.getByText(/verification warning/i)).toBeInTheDocument();
    expect(screen.queryByText(/signing blocked/i)).not.toBeInTheDocument();
  });
});
