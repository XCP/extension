/**
 * The distinction under test is the point of the component: what was actually established about
 * the bytes decides what the user is told. Only a rebuild that reproduced the payload earns an
 * affirmative line; everything else says plainly that nothing was established, because a
 * reassuring badge on every screen is what teaches people to click through the one that matters.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerificationStatus } from './verification-status';

describe('VerificationStatus', () => {
  it('affirms only when the decode was rebuilt into the signed bytes', () => {
    render(<VerificationStatus passed repackProved />);
    expect(screen.getByText(/every byte accounted for/i)).toBeInTheDocument();
  });

  it('makes no affirmative claim when the type cannot be rebuilt', () => {
    // Agreement between two decoders of the same bytes is not evidence the payload is honest, so
    // it must not produce the same message as a rebuild.
    render(<VerificationStatus passed comparedAgainstApi repackProved={false} />);

    expect(screen.queryByText(/every byte accounted for/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cannot be rebuilt to confirm/i)).toBeInTheDocument();
  });

  it('says so when there was nothing to compare and nothing to rebuild', () => {
    render(<VerificationStatus passed comparedAgainstApi={false} repackProved={false} />);
    expect(screen.getByText(/nothing to compare/i)).toBeInTheDocument();
  });

  it('never claims tampering merely because no proof was available', () => {
    render(<VerificationStatus passed comparedAgainstApi={false} repackProved={false} />);

    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tampering/i)).not.toBeInTheDocument();
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
