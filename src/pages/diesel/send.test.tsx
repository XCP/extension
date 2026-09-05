import { getPublicKey } from '@noble/secp256k1';
import { p2pkh, p2sh, p2tr, p2wpkh, p2wsh, Transaction } from '@scure/btc-signer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import DieselSendPage from './send';

const state = vi.hoisted(() => ({
  initialData: {} as Record<string, unknown>,
  review: null as Record<string, unknown> | null,
  submit: vi.fn(),
}));
vi.mock('@/components/composer/composer', () => ({
  Composer: ({ FormComponent, ReviewComponent }: { FormComponent: ComponentType<any>; ReviewComponent: ComponentType<any> }) => state.review
    ? <ReviewComponent apiResponse={state.review} />
    : <FormComponent initialFormData={state.initialData} formAction={state.submit} />,
}));
vi.mock('@/components/composer/composer-form', () => ({
  ComposerForm: ({ children, submitDisabled, submitText, formAction }: { children: ReactNode; submitDisabled: boolean; submitText: string; formAction: (data: FormData) => void }) => (
    <form onSubmit={(event) => { event.preventDefault(); formAction(new FormData(event.currentTarget)); }}>
      {children}<button type="submit" disabled={submitDisabled}>{submitText}</button>
    </form>
  ),
}));
vi.mock('@/contexts/composer-context-object', () => ({
  useComposer: () => ({ activeAddress: { address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }, showHelpText: true }),
}));
vi.mock('@/hooks/useAssetOwnerLookup', () => ({ useAssetOwnerLookup: () => ({ isLookingUp: false, performLookup: () => {} }) }));
vi.mock('@/components/domain/asset/asset-icon', () => ({ AssetIcon: () => null }));
vi.mock('@/components/screens/review-screen', () => ({
  ReviewScreen: ({ customFields }: { customFields: Array<{ label: string; value: ReactNode }> }) => (
    <dl>{customFields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
  ),
}));
vi.mock('@/core/counterparty/compose', () => ({ composeDieselSend: vi.fn() }));
vi.mock('@/core/alkanes/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/alkanes/api')>(),
  fetchDieselBalance: async () => ({ baseUnits: '1000000000', utxos: [] }),
}));

const key = getPublicKey(hexToBytes('33'.repeat(32)), true);
beforeEach(() => {
  state.initialData = {
    destination: p2wpkh(key).address, amountBaseUnits: '125000000', diesel_display_amount: '1.25',
    asset: 'BTC', quantity: '0.00000330', sat_per_vbyte: 1,
  };
  state.review = null;
  state.submit.mockClear();
});

describe('DIESEL send form recovery and Bitcoin output', () => {
  it('restores amount and permits immediate resubmission after returning from review', async () => {
    render(<DieselSendPage />);
    await screen.findByText('10.00000000 DIESEL');
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveValue('1.25');
    expect(screen.getByRole('button', { name: 'Review DIESEL send' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review DIESEL send' }));
    expect(state.submit.mock.calls[0]![0].get('amountBaseUnits')).toBe('125000000');
  });

  it('restores the display amount from base units when the display field is absent', async () => {
    delete state.initialData.diesel_display_amount;
    render(<DieselSendPage />);
    await screen.findByText('10.00000000 DIESEL');
    expect(screen.getByRole('textbox', { name: /Amount/ })).toHaveValue('1.25');
    fireEvent.change(screen.getByRole('textbox', { name: /Amount/ }), { target: { value: '2' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review DIESEL send' })).toBeEnabled());
  });

  it.each([
    [p2wpkh(key).address, '0.00000330'], [p2tr(key.slice(1)).address, '0.00000330'],
    [p2sh(p2wpkh(key)).address, '0.00000540'], [p2pkh(key).address, '0.00000546'],
  ])('aligns outer BTC verification with the recipient minimum for %s', async (destination, quantity) => {
    state.initialData.destination = destination;
    render(<DieselSendPage />);
    await screen.findByText('10.00000000 DIESEL');
    fireEvent.click(screen.getByRole('button', { name: 'Review DIESEL send' }));
    const formData = state.submit.mock.calls[0]![0] as FormData;
    expect(formData.get('destination')).toBe(destination);
    expect(formData.get('quantity')).toBe(quantity);
    expect(formData.get('no_dispense')).toBe('true');
  });

  it('keeps unsupported witness-script recipients disabled', async () => {
    state.initialData.destination = p2wsh(p2pkh(key)).address;
    render(<DieselSendPage />);
    await screen.findByText('10.00000000 DIESEL');
    expect(screen.getByRole('button', { name: 'Review DIESEL send' })).toBeDisabled();
    expect(state.submit).not.toHaveBeenCalled();
  });

  it('shows the actual recipient Bitcoin output rather than an echoed quantity', () => {
    const tx = new Transaction({ allowUnknownOutputs: true });
    tx.addInput({ txid: hexToBytes('ab'.repeat(32)), index: 0 });
    tx.addOutput({ script: p2wpkh(key).script, amount: 330n });
    state.review = { result: {
      rawtransaction: bytesToHex(tx.unsignedTx), params: { quantity: 546 },
      diesel_transfer: { recipient_vout: 0, amount_base_units: '125000000' },
    } };
    render(<DieselSendPage />);
    expect(screen.getByText('330 sats (0.00000330 BTC)')).toBeInTheDocument();
    expect(screen.getByText('Unsent DIESEL and remaining Bitcoin return to this wallet')).toBeInTheDocument();
  });
});
