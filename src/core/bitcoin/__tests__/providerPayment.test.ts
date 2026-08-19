import { describe, expect, it } from 'vitest';
import {
  parseBitcoinPaymentIntent,
  proveBitcoinPaymentIntent,
} from '../providerPayment';

const SIGNER = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
const LEGACY_SIGNER = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
const VAULT = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';

const intent = () => parseBitcoinPaymentIntent({
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{ address: VAULT, amountSats: 21_600 }],
  description: 'Fund Emblem Vault',
  reference: 'vault-63',
});

describe('plain Bitcoin provider intent', () => {
  it('parses a bounded, versioned claim without treating its label as proof', () => {
    expect(intent()).toEqual({
      standard: 'xcp-wallet/bitcoin-payment',
      version: 1,
      action: 'pay',
      outputs: [{ address: VAULT, amountSats: 21_600 }],
      description: 'Fund Emblem Vault',
      reference: 'vault-63',
    });
  });

  it.each([
    null,
    {},
    { standard: 'other', version: 1, action: 'pay', outputs: [] },
    { standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay', outputs: [] },
    {
      standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay',
      outputs: [{ address: VAULT, amountSats: Number.MAX_SAFE_INTEGER + 1 }],
    },
  ])('rejects malformed wire claims (%j)', (candidate) => {
    expect(() => parseBitcoinPaymentIntent(candidate)).toThrow();
  });

  it('proves the exact external output while excluding wallet change', () => {
    expect(proveBitcoinPaymentIntent(intent(), [
      { index: 0, value: 21_600, type: 'witness_v0_keyhash', address: VAULT },
      { index: 1, value: 28_982, type: 'witness_v0_keyhash', address: SIGNER.toUpperCase() },
    ], [SIGNER])).toEqual({
      proved: true,
      errors: [],
      outputs: [{ index: 0, address: VAULT, amountSats: 21_600 }],
      totalSats: 21_600,
    });
  });

  it('excludes change to both permissioned Legacy and SegWit signer addresses', () => {
    expect(proveBitcoinPaymentIntent(intent(), [
      { index: 0, value: 21_600, type: 'witness_v0_keyhash', address: VAULT },
      { index: 1, value: 10_000, type: 'pubkeyhash', address: LEGACY_SIGNER },
      { index: 2, value: 18_982, type: 'witness_v0_keyhash', address: SIGNER },
    ], [LEGACY_SIGNER, SIGNER])).toEqual({
      proved: true,
      errors: [],
      outputs: [{ index: 0, address: VAULT, amountSats: 21_600 }],
      totalSats: 21_600,
    });
  });

  it.each([
    {
      name: 'amount substitution',
      outputs: [{ index: 0, value: 21_601, type: 'witness_v0_keyhash', address: VAULT }],
    },
    {
      name: 'address substitution',
      outputs: [{ index: 0, value: 21_600, type: 'witness_v0_keyhash', address: SIGNER }],
    },
    {
      name: 'hidden second payment',
      outputs: [
        { index: 0, value: 21_600, type: 'witness_v0_keyhash', address: VAULT },
        { index: 1, value: 1_000, type: 'witness_v0_keyhash', address: '1AttackerAddressxxxxxxxxxxxxxx' },
      ],
    },
    {
      name: 'unreviewable script',
      outputs: [{ index: 0, value: 21_600, type: 'unknown' }],
    },
    {
      name: 'data output',
      outputs: [
        { index: 0, value: 21_600, type: 'witness_v0_keyhash', address: VAULT },
        { index: 1, value: 0, type: 'op_return' },
      ],
    },
  ])('blocks $name', ({ outputs }) => {
    expect(proveBitcoinPaymentIntent(intent(), outputs, [SIGNER]).proved).toBe(false);
  });
});
