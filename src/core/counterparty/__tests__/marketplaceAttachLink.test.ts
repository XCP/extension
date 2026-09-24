import { describe, expect, it, vi } from 'vitest';
import {
  deriveProvedAttachOutput,
  type LinkedAttachChainSource,
  listingSpendsProvedAttach,
  type ProvedAttachOutput,
  proveAttachInputsSettled,
  withLinkedInputAssets,
} from '@/core/counterparty/marketplaceAttachLink';

const OWNER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const OTHER = 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq';
const TXID = 'ab'.repeat(32);

const outputs = [
  { index: 0, type: 'witness_v0_keyhash', address: OWNER, value: 330 },
  { index: 1, type: 'op_return', value: 0 },
  { index: 2, type: 'witness_v0_keyhash', address: OTHER, value: 9_000 },
];

const attach = (data: Record<string, unknown>, overrides: Partial<Parameters<typeof deriveProvedAttachOutput>[0]> = {}) =>
  deriveProvedAttachOutput({
    transactionId: TXID,
    outputs,
    localMessage: { messageType: 'attach', data },
    ...overrides,
  });

const PROVED: ProvedAttachOutput = {
  txid: TXID, vout: 0, asset: 'RAREPEPE', quantityRaw: '1', owner: OWNER, valueSats: 330,
};

describe('deriveProvedAttachOutput', () => {
  it('reads the created asset UTXO from the attach bytes alone', () => {
    expect(attach({ asset: 'RAREPEPE', quantity: 1n, destinationVout: 0 })).toEqual({ output: PROVED });
    expect(attach({ asset: 'RAREPEPE', quantity: 1n })).toEqual({ output: PROVED });
  });

  it('skips a leading OP_RETURN when applying the first-output rule', () => {
    const result = deriveProvedAttachOutput({
      transactionId: TXID,
      outputs: [outputs[1]!, { ...outputs[0]!, index: 1 }],
      localMessage: { messageType: 'attach', data: { asset: 'RAREPEPE', quantity: 1n } },
    });
    expect(result).toEqual({ output: { ...PROVED, vout: 1 } });
  });

  it.each([
    ['explicit destination away from the first output', { asset: 'RAREPEPE', quantity: 1n, destinationVout: 2 }, /first non-OP_RETURN/],
    ['missing asset', { quantity: 1n }, /no asset/],
    ['non-bigint quantity', { asset: 'RAREPEPE', quantity: '1' }, /raw quantity/],
    ['zero quantity', { asset: 'RAREPEPE', quantity: 0n }, /raw quantity/],
  ])('refuses an attach with a %s', (_label, data, message) => {
    const result = attach(data);
    expect('problem' in result && result.problem).toMatch(message);
  });

  it.each([
    ['a non-attach message', { localMessage: { messageType: 'detach', data: { destination: OWNER } } }],
    ['no local decode', { localMessage: undefined }],
    ['no transaction id', { transactionId: undefined }],
    ['only a data output', { outputs: [outputs[1]!] }],
    ['an unattributable asset output', { outputs: [{ ...outputs[0]!, address: undefined }, outputs[1]!] }],
  ])('refuses %s', (_label, overrides) => {
    expect('problem' in attach({ asset: 'RAREPEPE', quantity: 1n }, overrides)).toBe(true);
  });
});

describe('listingSpendsProvedAttach', () => {
  const input = { txid: TXID, vout: 0, address: OWNER, value: 330 };

  it('admits exactly the proved output', () => {
    expect(listingSpendsProvedAttach(input, PROVED)).toBeNull();
    expect(listingSpendsProvedAttach({ ...input, txid: TXID.toUpperCase() }, PROVED)).toBeNull();
  });

  it.each([
    ['txid', { txid: 'cd'.repeat(32) }],
    ['vout', { vout: 2 }],
    ['owner', { address: OTHER }],
    ['unknown owner', { address: undefined }],
    ['value', { value: 331 }],
    ['unknown value', { value: undefined }],
  ])('refuses a different %s', (_label, change) => {
    expect(listingSpendsProvedAttach({ ...input, ...change }, PROVED)).toMatch(/listing input 1/);
  });

  it('refuses a listing with no asset input', () => {
    expect(listingSpendsProvedAttach(undefined, PROVED)).toMatch(/no asset input/);
  });
});

describe('withLinkedInputAssets', () => {
  const linked = {
    inputIndex: 1, utxo: `${TXID}:0`,
    assets: [{ asset: 'RAREPEPE', quantity: '1', quantity_normalized: '1', asset_longname: null }],
  };
  const unbroadcast = vi.fn(async () => true);
  const broadcastOrUnknown = vi.fn(async () => false);
  const failed = { inputIndex: 1, utxo: linked.utxo, assets: [], lookupFailed: true };

  it('fills an input the ledger reported empty without asking the network', async () => {
    await expect(withLinkedInputAssets([], linked, TXID, broadcastOrUnknown)).resolves.toEqual([linked]);
    expect(broadcastOrUnknown).not.toHaveBeenCalled();
  });

  it('fills a failed lookup only when the network affirmatively does not know the attach', async () => {
    await expect(withLinkedInputAssets([failed], linked, TXID, unbroadcast)).resolves.toEqual([linked]);
    await expect(withLinkedInputAssets([failed], linked, TXID, broadcastOrUnknown)).resolves.toEqual([failed]);
    const throwing = async () => { throw new Error('explorer down'); };
    await expect(withLinkedInputAssets([failed], linked, TXID, throwing)).resolves.toEqual([failed]);
  });

  it('fills a lookup held back because the attach itself is still pending', async () => {
    const pending = { ...failed, pendingParentTxid: TXID.toUpperCase() };
    await expect(withLinkedInputAssets([pending], linked, TXID, broadcastOrUnknown)).resolves.toEqual([linked]);
    const otherParent = { ...failed, pendingParentTxid: 'cd'.repeat(32) };
    await expect(withLinkedInputAssets([otherParent], linked, TXID, broadcastOrUnknown))
      .resolves.toEqual([otherParent]);
  });

  it('keeps a ledger that does report assets, so a disagreement still blocks', async () => {
    const ledger = [{ inputIndex: 1, utxo: linked.utxo, assets: [{ asset: 'OTHER', quantity_normalized: '1' }] }];
    await expect(withLinkedInputAssets(ledger, linked, TXID, unbroadcast)).resolves.toBe(ledger);
  });

  it('leaves every other input untouched', async () => {
    const other = { inputIndex: 0, utxo: 'x:0', assets: [], lookupFailed: true };
    await expect(withLinkedInputAssets([other], linked, TXID, broadcastOrUnknown)).resolves.toEqual([other, linked]);
  });
});

describe('proveAttachInputsSettled', () => {
  const inputs = [
    { index: 0, txid: '11'.repeat(32), vout: 0 },
    { index: 1, txid: '22'.repeat(32), vout: 3 },
  ];
  const source = (overrides: Partial<LinkedAttachChainSource> = {}): LinkedAttachChainSource => ({
    txStatus: async () => ({ confirmed: true, blockHeight: 900_000 }),
    ledgerHeight: async () => 900_000,
    freshBalanceCount: async () => 0,
    ...overrides,
  });

  it('settles inputs whose parents are confirmed, indexed, and still empty', async () => {
    const reads: string[] = [];
    await expect(proveAttachInputsSettled(inputs, source({
      freshBalanceCount: async utxo => { reads.push(utxo); return 0; },
    }))).resolves.toEqual({ status: 'settled' });
    expect(reads).toEqual([`${'11'.repeat(32)}:0`, `${'22'.repeat(32)}:3`]);
  });

  it.each([
    ['an unconfirmed parent', { txStatus: async () => ({ confirmed: false }) }, /unconfirmed/],
    ['a parent above the parsed height', { ledgerHeight: async () => 899_999 }, /not yet indexed/],
    ['an explorer outage', { txStatus: async () => null }, /could not confirm/],
    ['a parent the explorer does not know', { txStatus: async () => 'missing' as const }, /could not confirm/],
    ['a confirmed parent with no height', { txStatus: async () => ({ confirmed: true }) }, /place/],
    ['a ledger height outage', { ledgerHeight: async () => { throw new Error('down'); } }, /indexed/],
    ['a failed re-read', { freshBalanceCount: async () => { throw new Error('down'); } }, /lookup/],
  ])('asks for a retry on %s', async (_label, overrides, message) => {
    const result = await proveAttachInputsSettled(inputs, source(overrides));
    expect(result.status).toBe('retry');
    expect('problem' in result && result.problem).toMatch(message);
  });

  it('blocks when a re-read input now carries assets', async () => {
    const result = await proveAttachInputsSettled(inputs, source({
      freshBalanceCount: async utxo => (utxo.endsWith(':3') ? 1 : 0),
    }));
    expect(result).toEqual({ status: 'blocked', problem: 'attach input 1 already carries attached assets' });
  });
});
