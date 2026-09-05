import { getPublicKey } from '@noble/secp256k1';
import { p2wpkh, Transaction } from '@scure/btc-signer';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertPsbtAlkanesSigningSafe, decodePsbtForApproval, resolvePsbtSigningInputIndices } from '@/core/bitcoin/psbtApprovalDecoder';
import { packComposeMessage } from '@/core/counterparty/pack/messages';
import { arc4, bytesToHex, hexToBytes } from '@/core/counterparty/unpack/binary';
import { useSignPsbtRequest } from '@/hooks/useSignPsbtRequest';

const mocks = vi.hoisted(() => ({ alkanes: vi.fn(), protection: true }));
const PAYMENT = p2wpkh(getPublicKey(hexToBytes('22'.repeat(32)), true));
const SIGNER = PAYMENT.address;
const message = packComposeMessage('send', { asset: 'XCP', quantity: '1', destination: SIGNER })!;
const data = arc4(hexToBytes('ab'.repeat(32)), message.bytes);
const tx = new Transaction({ allowUnknownOutputs: true });
tx.addInput({ txid: hexToBytes('ab'.repeat(32)), index: 0, witnessUtxo: { script: PAYMENT.script, amount: 10_500n } });
tx.addOutput({ script: PAYMENT.script, amount: 10_000n });
tx.addOutput({ script: new Uint8Array([0x6a, data.length, ...data]), amount: 0n });
const PSBT = bytesToHex(tx.toPSBT());
vi.mock('react-router', () => ({
  useSearchParams: () => [new URLSearchParams('requestId=legacy-psbt')],
}));
vi.mock('@/platform/provider/signFlow', () => ({
  getSignFlow: async () => ({ kind: 'sign-psbt', psbtHex: PSBT }),
  recordSignOutcome: vi.fn(),
}));
vi.mock('@/platform/provider/emitToBackground', () => ({ emitToBackground: vi.fn() }));
vi.mock('@/core/alkanes/inputAssets', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/alkanes/inputAssets')>(),
  fetchInputsAlkanes: mocks.alkanes,
}));
vi.mock('@/core/counterparty/inputAssets', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/core/counterparty/inputAssets')>(),
  fetchInputsAttachedAssets: async () => [],
}));
vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: async () => null,
  decodeRawTransaction: async () => ({ vout: [] }),
  resolveMpmaRecipients: async () => [],
  describeMpmaSend: () => '',
}));
vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: async () => ({ context: {}, warnings: [] }),
}));
vi.mock('@/core/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/settings')>();
  return { ...actual, getActiveSettings: () => ({ ...actual.DEFAULT_SETTINGS, protectAlkanesUtxos: mocks.protection }) };
});

beforeEach(() => {
  mocks.protection = true;
  mocks.alkanes.mockReset().mockResolvedValue([]);
});

describe('optional signInputs uses the actual best-effort signing scope', () => {
  it.each(['tokens', 'lookup failure'])('blocks the active-wallet input with %s when signInputs is omitted', async (condition) => {
    mocks.alkanes.mockResolvedValue([{
      inputIndex: 0,
      utxo: `${'ab'.repeat(32)}:0`,
      balances: condition === 'tokens' ? [{ id: '2:0', value: '123' }] : [],
      ...(condition === 'lookup failure' ? { lookupFailed: true } : {}),
    }]);

    const explicit = await decodePsbtForApproval(PSBT, [SIGNER], [0]);
    expect(explicit.verification.passed).toBe(true);
    expect(explicit.safety.blocked).toBe(true);
    // Exercise the full hook with a legacy request, real PSBT and real Counterparty message.
    const { result } = renderHook(() => useSignPsbtRequest(SIGNER));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    const implicit = result.current.decodedInfo!;
    expect(implicit.verification.passed).toBe(true);
    expect(implicit.alkaneBalances).toHaveLength(1);
    expect(implicit.safety.blocked).toBe(true);
  });

  it('excludes foreign and unattributable inputs just as best-effort signing does', () => {
    const inputs = [
      { index: 0, address: SIGNER },
      { index: 1, address: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' },
      { index: 2 },
    ];
    expect(resolvePsbtSigningInputIndices(inputs, [SIGNER])).toEqual([0]);
    expect(resolvePsbtSigningInputIndices(inputs, [SIGNER], [1, 2])).toEqual([1, 2]);
    expect(resolvePsbtSigningInputIndices(inputs, [SIGNER], [])).toEqual([]);
  });
});

describe('Alkanes execution check uses current protection settings', () => {
  it.each(['tokens', 'lookup failure'])('rejects %s after protection is enabled on an already decoded approval', async (condition) => {
    mocks.protection = false;
    const preview = await decodePsbtForApproval(PSBT, [SIGNER]);
    expect(preview.safety.blocked).toBe(false);
    expect(mocks.alkanes).not.toHaveBeenCalled();
    mocks.protection = true;
    mocks.alkanes.mockResolvedValue([{
      inputIndex: 0,
      utxo: `${'ab'.repeat(32)}:0`,
      balances: condition === 'tokens' ? [{ id: '2:0', value: '123' }] : [],
      ...(condition === 'lookup failure' ? { lookupFailed: true } : {}),
    }]);
    await expect(assertPsbtAlkanesSigningSafe(PSBT, SIGNER)).rejects.toThrow(
      condition === 'tokens' ? 'protected Alkanes input' : 'Alkanes status could not be verified',
    );
    expect(mocks.alkanes).toHaveBeenCalledWith(expect.any(Array), [0]);
  });

  it('checks explicit input scope and permits inputs proved clean', async () => {
    await expect(assertPsbtAlkanesSigningSafe(PSBT, SIGNER, { [SIGNER]: [0] })).resolves.toBeUndefined();
    expect(mocks.alkanes).toHaveBeenCalledWith(expect.any(Array), [0]);
  });
});
