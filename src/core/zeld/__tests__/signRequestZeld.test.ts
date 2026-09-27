import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it, vi } from 'vitest';
import { zeldDistributionScript } from '@/core/zeld/cbor';
import {
  analyzeSignRequestZeld,
  type ZeldLookupOptions,
  type ZeldSignRequestInput,
  zeldDistribution,
} from '@/core/zeld/signRequestZeld';

/**
 * One test per branch of the protocol's movement rule (protocol.ts, zeldhash-protocol
 * `protocol.rs` process_block), and per lookup source.
 */

const SIGNER = '19QWXpMXeLkoEKEJv2xo9rn8wkPCyxACSX';
const SIBLING = 'bc1qtsenny4t24882u7l854yzt0h2znq686mwhf2mt';
const STRANGER = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const HUNTED = '0000004cda9f' + 'c'.repeat(52);
const MOVED = 'c2d433dd87a178397903db6d1b89b16fb64bb782f5222b718b291bbf74628e43';
const FOREIGN = 'f'.repeat(64);
const ZELD = 4_096n * 10n ** 8n;

const opReturn = (index: number, script = '6a0474657374') => ({ index, type: 'op_return', script });
const pays = (index: number, address: string) => ({ index, type: 'witness_v0_keyhash', address });
const split = (index: number, amounts: bigint[]) => ({ index, type: 'op_return', script: bytesToHex(zeldDistributionScript(amounts)) });

const indexer = (balances: Array<{ txid: string; vout: number; balance: bigint }>): ZeldLookupOptions => ({
  fetchUtxos: vi.fn(async () => balances),
  fetchParent: async () => null,
});
const indexerDown = (known: ZeldLookupOptions['knownOutpoints'] = async () => []): ZeldLookupOptions => ({
  fetchUtxos: vi.fn(async () => { throw new Error('indexer down'); }),
  fetchParent: async () => null,
  knownOutpoints: known,
});

function request(overrides: Partial<ZeldSignRequestInput> = {}): ZeldSignRequestInput {
  return {
    inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }],
    signedInputs: [{ index: 0, sighashType: 1 }],
    outputs: [pays(0, SIGNER)],
    ownedAddresses: [SIGNER, SIBLING],
    ...overrides,
  };
}

const withZeld = indexer([{ txid: HUNTED, vout: 1, balance: ZELD }]);

describe('where a signed input\'s ZELD lands', () => {
  it('says nothing when all of it lands on a plain output of this wallet', async () => {
    expect(await analyzeSignRequestZeld(request(), withZeld)).toEqual([]);
  });

  it('skips OP_RETURN outputs: the first non-OP_RETURN output receives it', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [opReturn(0), pays(1, STRANGER), pays(2, SIGNER)],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: ZELD.toString() }]);
  });

  it('names the asset when the first output is this wallet\'s attach destination', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, SIBLING), opReturn(1), pays(2, SIGNER)],
      assetOutputs: new Map([[0, 'RARESHADILAY']]),
    }), withZeld);
    expect(notices).toEqual([{ kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: ZELD.toString() }]);
  });

  it('reports the ZELD destroyed when every output is an OP_RETURN', async () => {
    expect(await analyzeSignRequestZeld(request({ outputs: [opReturn(0)] }), withZeld))
      .toEqual([{ kind: 'destroyed', amount: ZELD.toString() }]);
  });

  it('pools every input: the first output receives the total, not a share per input', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: MOVED, vout: 0, address: SIBLING }],
      signedInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 1 }],
      outputs: [pays(0, STRANGER), pays(1, SIGNER)],
    }), {
      fetchUtxos: vi.fn(async (address: string) => address === SIGNER
        ? [{ txid: HUNTED, vout: 1, balance: ZELD }]
        : [{ txid: MOVED, vout: 0, balance: 5n }]),
      fetchParent: async () => null,
    });
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: (ZELD + 5n).toString() }]);
  });

  it('follows a ZELD split when every input is signed SIGHASH_ALL, the rest going to the first output', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, 100n])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: '100' }]);
  });

  it('ignores a split once any signature is not SIGHASH_ALL', async () => {
    const notices = await analyzeSignRequestZeld(request({
      signedInputs: [{ index: 0, sighashType: 0x81 }],
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, 100n])],
    }), withZeld);
    expect(notices).toEqual([]);
  });

  it('ignores a split that asks for more than the inputs carry: everything goes to the first output', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, ZELD + 1n])],
    }), withZeld);
    expect(notices).toEqual([]);
  });

  it('names both possible destinations when another party\'s input decides whether a split applies', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: FOREIGN, vout: 0, address: STRANGER }],
      outputs: [pays(0, STRANGER), pays(1, SIGNER), split(2, [0n, ZELD * 2n])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: ZELD.toString() }]);
  });

  it('reads only the last valid ZELD OP_RETURN', () => {
    expect(zeldDistribution([split(0, [1n]), opReturn(1, '6a045a454c44'), split(2, [2n, 3n])])).toEqual([2n, 3n]);
    expect(zeldDistribution([opReturn(0)])).toBeNull();
  });

  it('leaves the destination to whoever completes a SINGLE or NONE signature', async () => {
    const open = await analyzeSignRequestZeld(request({ signedInputs: [{ index: 0, sighashType: 0x83 }] }), withZeld);
    expect(open).toEqual([{ kind: 'leaves', amount: ZELD.toString() }]);
    const listed = await analyzeSignRequestZeld(request({
      signedInputs: [{ index: 0, sighashType: 0x83 }],
      listedInputs: new Map([[0, 'RAREPEPE']]),
    }), withZeld);
    expect(listed).toEqual([{ kind: 'listed', asset: 'RAREPEPE', amount: ZELD.toString() }]);
  });

  it('ignores ZELD on inputs this wallet does not sign', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: STRANGER }, { txid: FOREIGN, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 1, sighashType: 1 }],
      outputs: [pays(0, STRANGER)],
    }), withZeld);
    expect(notices).toEqual([]);
  });
});

describe('which inputs carry ZELD', () => {
  const attachFirst = { outputs: [pays(0, SIBLING), opReturn(1), pays(2, SIGNER)], assetOutputs: new Map([[0, 'RARESHADILAY']]) };

  it('takes the indexer\'s word for an ordinary-looking outpoint', async () => {
    const notices = await analyzeSignRequestZeld(request({ ...attachFirst, inputs: [{ txid: MOVED, vout: 0, address: SIGNER }] }),
      indexer([{ txid: MOVED, vout: 0, balance: 7n }]));
    expect(notices).toEqual([{ kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: '7' }]);
  });

  it('still finds a hunted reward output when the indexer is down, without an amount', async () => {
    const notices = await analyzeSignRequestZeld(request(attachFirst), indexerDown());
    expect(notices).toEqual([{ kind: 'asset_output', asset: 'RARESHADILAY', vout: 0 }]);
  });

  it('falls back on the wallet\'s record for ZELD that has already moved', async () => {
    const known = vi.fn(async () => [{ outpoint: `${MOVED}:0`, balance: ZELD.toString() }]);
    const notices = await analyzeSignRequestZeld(request({ ...attachFirst, inputs: [{ txid: MOVED, vout: 0, address: SIGNER }] }),
      indexerDown(known));
    expect(known).toHaveBeenCalledWith(SIGNER);
    expect(notices).toEqual([{ kind: 'asset_output', asset: 'RARESHADILAY', vout: 0, amount: ZELD.toString() }]);
  });

  it('says nothing for an address with no known ZELD while the indexer is down', async () => {
    const notices = await analyzeSignRequestZeld(request({ ...attachFirst, inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }] }),
      indexerDown());
    expect(notices).toEqual([]);
  });

  it('cautions once when a known holder\'s input cannot be checked and the first output is not plain change', async () => {
    const known = async () => [{ outpoint: `${MOVED}:0`, balance: '1' }];
    const notices = await analyzeSignRequestZeld(request({ ...attachFirst, inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }] }),
      indexerDown(known));
    expect(notices).toEqual([{ kind: 'unchecked' }]);
    const happy = await analyzeSignRequestZeld(request({ inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }] }),
      indexerDown(known));
    expect(happy).toEqual([]);
  });

  it('reads the indexer once per signing address', async () => {
    const options = indexer([{ txid: HUNTED, vout: 1, balance: ZELD }]);
    await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: FOREIGN, vout: 2, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 1 }],
      outputs: [pays(0, STRANGER)],
    }), options);
    expect(options.fetchUtxos).toHaveBeenCalledTimes(1);
  });

  it("asks nothing when the first output is plain change of this wallet's", async () => {
    const options = indexer([{ txid: HUNTED, vout: 1, balance: ZELD }]);
    expect(await analyzeSignRequestZeld(request({ outputs: [opReturn(0), pays(1, SIBLING), pays(2, STRANGER)] }), options))
      .toEqual([]);
    expect(options.fetchUtxos).not.toHaveBeenCalled();
  });
});
