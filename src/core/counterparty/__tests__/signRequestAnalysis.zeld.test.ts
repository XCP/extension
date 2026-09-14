import { describe, expect, it, vi } from 'vitest';
import type { ProtocolContext } from '../protocolContext';
import { type AnalyzedOutput, analyzeSignRequest } from '../signRequestAnalysis';

vi.mock('@/core/counterparty/transaction', () => ({
  decodeCounterpartyMessage: vi.fn(async () => null),
  resolveMpmaRecipients: vi.fn(async () => []),
  describeMpmaSend: vi.fn(() => 'described locally'),
}));
vi.mock('@/core/counterparty/protocolContext', () => ({
  resolveProtocolContext: vi.fn(async () => ({ context: {} as ProtocolContext, warnings: [] })),
}));
vi.mock('@/core/counterparty/unpack', () => ({
  verifyProviderTransaction: vi.fn(() => ({ localUnpack: undefined })),
}));
const zeld = vi.hoisted(() => ({ utxos: [] as Array<{ txid: string; vout: number; balance: bigint }> }));
vi.mock('@/core/zeld/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/zeld/api')>()),
  fetchZeldUtxos: vi.fn(async () => zeld.utxos),
}));
vi.mock('@/core/bitcoin/utxo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: vi.fn(async () => null),
}));

const SIGNER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const STRANGER = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const ZELD_INPUT = { txid: '000000' + 'a'.repeat(58), vout: 1 };
const CLEAN_INPUT = { txid: 'b'.repeat(64), vout: 0 };

function analyze(outputs: AnalyzedOutput[], inputs = [ZELD_INPUT, CLEAN_INPUT]) {
  return analyzeSignRequest({
    counterpartyDataHex: undefined,
    inputs,
    outputs,
    signerAddresses: [SIGNER],
    signedInputIndices: inputs.map((_, index) => index),
    signedInputs: inputs.map((_, index) => ({ index, sighashType: 0x01 })),
    transactionId: undefined,
    attachedAssets: Promise.resolve([]),
  });
}

const zeldWarning = (warnings: { title: string; severity?: string; message?: string }[]) => warnings.find((w) => w.title === 'ZELD Would Leave With This Transaction');

describe('sign requests that would carry ZELD away', () => {
  it('warns when a signed six-zero output is spent and a stranger is paid first', async () => {
    const analysis = await analyze([
      { index: 0, value: 10_000, type: 'witness_v0_keyhash', address: STRANGER },
      { index: 1, value: 90_000, type: 'witness_v0_keyhash', address: SIGNER },
    ]);
    const warning = zeldWarning(analysis.safety.warnings);
    expect(warning?.severity).toBe('warning');
    expect(warning?.message).toContain('1 of the outputs this wallet is asked to spend holds ZELD');
  });

  it('also warns on the indexer\'s word for an ordinary-looking outpoint', async () => {
    zeld.utxos = [{ txid: CLEAN_INPUT.txid, vout: 0, balance: 5n }];
    try {
      const analysis = await analyze([
        { index: 0, value: 10_000, type: 'witness_v0_keyhash', address: STRANGER },
      ], [CLEAN_INPUT]);
      expect(zeldWarning(analysis.safety.warnings)).toBeDefined();
    } finally {
      zeld.utxos = [];
    }
  });

  it('says nothing when the signer\'s own output comes first', async () => {
    const analysis = await analyze([
      { index: 0, value: 90_000, type: 'witness_v0_keyhash', address: SIGNER },
      { index: 1, value: 10_000, type: 'witness_v0_keyhash', address: STRANGER },
    ]);
    expect(zeldWarning(analysis.safety.warnings)).toBeUndefined();
  });

  it('says nothing when no signed input carries ZELD', async () => {
    const analysis = await analyze([
      { index: 0, value: 10_000, type: 'witness_v0_keyhash', address: STRANGER },
    ], [CLEAN_INPUT]);
    expect(zeldWarning(analysis.safety.warnings)).toBeUndefined();
  });
});
