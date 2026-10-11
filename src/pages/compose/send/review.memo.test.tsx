import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ReviewSend } from './review';

/**
 * The send review shows the memo the transaction's own bytes carry, classified the way the dapp
 * approval screen classifies it: text as text, anything else as the exact bytes in hex.
 */

let decodedMessage: unknown = null;

vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ state: { decodedMessage } }),
}));
vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { fiat: 'usd' } }),
}));
vi.mock('@/hooks/useMarketPrices', () => ({ useMarketPrices: () => ({ btc: null }) }));
vi.mock('@/components/screens/review-screen', () => ({
  ReviewScreen: ({ customFields }: { customFields: Array<{ label: string; value: ReactNode; rightElement?: ReactNode }> }) => (
    <dl>
      {customFields.map((field) => (
        <div key={field.label}><dt>{field.label}</dt><dd>{field.value}{field.rightElement}</dd></div>
      ))}
    </dl>
  ),
}));

const apiResponse = {
  result: { btc_fee: 1000, name: 'send', params: { asset: 'XCP', quantity: 100000000, memo: 'echo' } },
};

function renderWithMemo(memoBytes: Uint8Array, memo: string) {
  decodedMessage = {
    messageType: 'enhanced_send',
    data: { asset: 'XCP', quantity: 100000000n, destination: 'bc1qdest', memo, memoBytes },
  };
  render(<ReviewSend apiResponse={apiResponse} onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false} />);
}

describe('ReviewSend memo', () => {
  it('shows binary memo bytes as hex rather than as decoded characters', () => {
    // 0x123456 is valid UTF-8 ("\x124V"), so decoding it as text printed "4V".
    renderWithMemo(new Uint8Array([0x12, 0x34, 0x56]), '\x124V');
    expect(screen.getByText('Memo (hex)')).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
  });

  it('shows a text memo as text', () => {
    renderWithMemo(new TextEncoder().encode('123456'), '123456');
    expect(screen.getByText('Memo')).toBeInTheDocument();
    expect(screen.getByText('123456')).toBeInTheDocument();
  });
});


describe('ReviewSend MPMA fallback', () => {
  it('shows recipients and quantities from base-unit tuples with verified divisibility', () => {
    decodedMessage = null;
    render(<ReviewSend
      apiResponse={{ result: {
        btc_fee: 1000,
        name: 'mpma',
        params: {
          asset_dest_quant_list: [['TOKEN', 'bc1qrecipient', '250000000']],
          verified_asset_info: { TOKEN: { divisible: true } },
        },
      } }}
      onSign={vi.fn()} onBack={vi.fn()} error={null} isSigning={false}
    />);
    expect(screen.getByText('→ bc1qrecipient')).toBeInTheDocument();
    expect(screen.getByText('2.50000000 TOKEN')).toBeInTheDocument();
    expect(screen.getByText('2.5 TOKEN')).toBeInTheDocument();
    expect(screen.queryByText(/250000000/)).not.toBeInTheDocument();
  });
});
