import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack/providerVerify';
import { VerificationDetails } from './verification-details';

function verification(
  overrides: Partial<ProviderVerificationResult>,
): ProviderVerificationResult {
  return {
    passed: false,
    comparedAgainstApi: true,
    repackProved: false,
    mismatches: [],
    ...overrides,
  };
}

describe('VerificationDetails', () => {
  it('is silent when the decoders found no differences', () => {
    const { container } = render(<VerificationDetails verification={verification({})} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('quietly explains differences that an exact payload rebuild resolved', () => {
    render(
      <VerificationDetails
        verification={verification({
          repackProved: true,
          mismatches: ['Quantity: local=1, API=100000000'],
        })}
      />,
    );

    expect(screen.getByText('Decoder differences')).toBeInTheDocument();
    expect(screen.getByText(/do not block signing/i)).toBeInTheDocument();
    expect(screen.getByText(/Quantity: local=1/)).toBeInTheDocument();
  });

  it('does not reassure when the local decode could not be rebuilt', () => {
    render(
      <VerificationDetails
        verification={verification({ mismatches: ['Destination differs'] })}
      />,
    );

    expect(screen.getByText(/could not rebuild/i)).toBeInTheDocument();
    expect(screen.queryByText(/do not block signing/i)).not.toBeInTheDocument();
  });
});
