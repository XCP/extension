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

describe('an input spending an unbroadcast parent of the same bundle', () => {
  const PARENT = 'a'.repeat(64);
  /** A self-send funding: MOVED:0 in, two outputs of this wallet out, all signed SIGHASH_ALL. */
  const parent = (outputs: ZeldSignRequestInput['outputs'] = [pays(0, SIGNER), pays(1, SIGNER)]) => new Map([[PARENT, {
    inputs: [{ txid: MOVED, vout: 0, address: SIGNER }],
    signedInputs: [{ index: 0, sighashType: 1 }],
    outputs,
  }]]);
  const spendsParent = (vout: number) => request({
    inputs: [{ txid: PARENT, vout, address: SIGNER }],
    outputs: [opReturn(0), pays(1, STRANGER)],
  });

  it('carries what the parent inputs hold onto the parent first output', async () => {
    const options = { ...indexer([{ txid: MOVED, vout: 0, balance: ZELD }]), packageParents: parent() };
    expect(await analyzeSignRequestZeld(spendsParent(0), options))
      .toEqual([{ kind: 'leaves', destination: STRANGER, amount: ZELD.toString() }]);
    expect(options.fetchUtxos).toHaveBeenCalledTimes(1);
  });

  it('leaves the parent other outputs clean', async () => {
    const options = { ...indexer([{ txid: MOVED, vout: 0, balance: ZELD }]), packageParents: parent() };
    expect(await analyzeSignRequestZeld(spendsParent(1), options)).toEqual([]);
  });

  it('follows a split in the parent', async () => {
    const options = {
      ...indexer([{ txid: MOVED, vout: 0, balance: ZELD }]),
      packageParents: parent([pays(0, SIGNER), pays(1, SIGNER), split(2, [0n, 100n])]),
    };
    expect(await analyzeSignRequestZeld(spendsParent(1), options))
      .toEqual([{ kind: 'leaves', destination: STRANGER, amount: '100' }]);
    expect(await analyzeSignRequestZeld(spendsParent(0), options))
      .toEqual([{ kind: 'leaves', destination: STRANGER, amount: (ZELD - 100n).toString() }]);
  });

  it('says nothing when the parent inputs hold no ZELD', async () => {
    expect(await analyzeSignRequestZeld(spendsParent(0), { ...indexer([]), packageParents: parent() })).toEqual([]);
  });

  it('keeps an outage to the unchecked rule', async () => {
    expect(await analyzeSignRequestZeld(spendsParent(0), { ...indexerDown(), packageParents: parent() })).toEqual([]);
    const known = async () => [{ outpoint: `${FOREIGN}:0`, balance: '1' }];
    expect(await analyzeSignRequestZeld(spendsParent(0), { ...indexerDown(known), packageParents: parent() }))
      .toEqual([{ kind: 'unchecked' }]);
  });
});

// Found untested by mutation testing: each case below failed to notice a flipped comparison or a
// dropped branch in the movement rule.
describe('the movement rule at its edges', () => {
  const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

  it("counts Taproot's default sighash (0) as SIGHASH_ALL", async () => {
    const options = indexer([{ txid: HUNTED, vout: 1, balance: ZELD }]);
    expect(await analyzeSignRequestZeld(request({ signedInputs: [{ index: 0, sighashType: 0 }] }), options)).toEqual([]);
    // And a split signed that way takes effect.
    expect(await analyzeSignRequestZeld(request({
      signedInputs: [{ index: 0, sighashType: 0 }],
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, 100n])],
    }), withZeld)).toEqual([{ kind: 'leaves', destination: STRANGER, amount: '100' }]);
  });

  it('still asks the indexer when one signature among several leaves the outputs open', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }, { txid: HUNTED, vout: 1, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 0x83 }],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', amount: ZELD.toString() }]);
  });

  it('ignores a split when any one of several signatures is not plain SIGHASH_ALL', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: FOREIGN, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 0x81 }],
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, 100n])],
    }), withZeld);
    expect(notices).toEqual([]);
  });

  it('sends everything to the first output, even someone else\'s, when a split asks for too much', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, STRANGER), pays(1, SIGNER), split(2, [0n, ZELD + 1n])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: ZELD.toString() }]);
  });

  it('gives the first output nothing when a split asks for exactly what the inputs carry', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, STRANGER), pays(1, OTHER), split(2, [0n, ZELD])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: OTHER, amount: ZELD.toString() }]);
  });

  it('adds the leftover to the first output\'s own share', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, STRANGER), pays(1, OTHER), split(2, [50n, 100n])],
    }), withZeld);
    expect(notices).toEqual([
      { kind: 'leaves', destination: STRANGER, amount: (ZELD - 100n).toString() },
      { kind: 'leaves', destination: OTHER, amount: '100' },
    ]);
  });

  it('names no output a split gives nothing', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, SIGNER), pays(1, STRANGER), pays(2, OTHER), split(3, [0n, 0n, 100n])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: OTHER, amount: '100' }]);
  });

  it('bounds each possible destination by what the inputs carry when another party decides the split', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: FOREIGN, vout: 0, address: STRANGER }],
      outputs: [pays(0, STRANGER), pays(1, OTHER), split(2, [0n, ZELD * 2n])],
    }), withZeld);
    expect(notices).toEqual([
      { kind: 'leaves', destination: STRANGER, amount: ZELD.toString() },
      { kind: 'leaves', destination: OTHER, amount: ZELD.toString() },
    ]);
    // A split within what this wallet carries may still be void on the other party's input: the
    // first output may receive all of it.
    const within = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: FOREIGN, vout: 0, address: STRANGER }],
      outputs: [pays(0, STRANGER), pays(1, OTHER), split(2, [0n, 100n])],
    }), withZeld);
    expect(within).toEqual([
      { kind: 'leaves', destination: STRANGER, amount: ZELD.toString() },
      { kind: 'leaves', destination: OTHER, amount: '100' },
    ]);
  });

  it('follows a split to its listed outputs, past an entry beyond them', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, SIGNER), pays(1, STRANGER), split(2, [0n, 100n, 200n])],
    }), withZeld);
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: '100' }]);
  });

  it('states no amount when any input\'s amount is unknown, rather than a partial sum', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: HUNTED, vout: 1, address: SIGNER }, { txid: MOVED, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }, { index: 1, sighashType: 1 }],
      outputs: [pays(0, STRANGER)],
    }), indexer([{ txid: MOVED, vout: 0, balance: 5n }]));
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER }]);
  });
});

describe('an input the indexer could not classify', () => {
  const knownHolder = async () => [{ outpoint: `${MOVED}:0`, balance: '1' }];

  it('is worth a word when its signature leaves the outputs open, even onto plain change', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 0x83 }],
    }), indexerDown(knownHolder));
    expect(notices).toEqual([{ kind: 'unchecked' }]);
  });

  it('is worth a word when the transaction has no output for ZELD to land on', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }],
      outputs: [opReturn(0)],
    }), indexerDown(knownHolder));
    expect(notices).toEqual([{ kind: 'unchecked' }]);
  });
});

describe('reading the ZELD split', () => {
  const payload = (amounts: bigint[]) => bytesToHex(zeldDistributionScript(amounts)).slice(4);

  it('reads a split pushed with OP_PUSHDATA1 or OP_PUSHDATA2, as the indexer does', () => {
    const data = payload([1n, 2n]);
    const length = data.length / 2;
    const hex = (value: number, bytes: number) => value.toString(16).padStart(bytes * 2, '0');
    expect(zeldDistribution([opReturn(0, `6a4c${hex(length, 1)}${data}`)])).toEqual([1n, 2n]);
    expect(zeldDistribution([opReturn(0, `6a4d${hex(length, 1)}00${data}`)])).toEqual([1n, 2n]);
  });

  it('ignores a truncated push, a bare OP_RETURN and other opcodes', () => {
    const data = payload([1n, 2n]);
    expect(zeldDistribution([opReturn(0, `6a${(data.length / 2 + 1).toString(16).padStart(2, '0')}${data}`)])).toBeNull();
    expect(zeldDistribution([opReturn(0, '6a')])).toBeNull();
    expect(zeldDistribution([opReturn(0, `6a00${data}`)])).toBeNull();
    expect(zeldDistribution([opReturn(0, `6a4f${data}`)])).toBeNull();
  });

  it('reads the largest direct push, 75 bytes', () => {
    // "ZELD", a two-byte array header, 34 two-byte values and one one-byte value.
    const values = [...Array.from({ length: 34 }, () => 24n), 1n];
    const script = bytesToHex(zeldDistributionScript(values));
    expect(script.slice(0, 4)).toBe('6a4b');
    expect(zeldDistribution([opReturn(0, script)])).toEqual(values);
  });

  it('ignores an OP_RETURN that is not a ZELD message, even when it decodes as CBOR', () => {
    // "deadbeef" in place of "ZELD", then a valid CBOR array: [7].
    expect(zeldDistribution([opReturn(0, '6a06deadbeef8107')])).toBeNull();
    expect(zeldDistribution([opReturn(0, '6a065a454c448107')])).toEqual([7n]);
  });
});

describe('a same-bundle parent the wallet derives ZELD for', () => {
  const PARENT = '000000' + 'd'.repeat(58);

  it('puts a six-zero parent\'s hunt reward on its first spendable output, amount unknown', async () => {
    const packageParents = new Map([[PARENT, {
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }],
      outputs: [opReturn(0), pays(1, SIGNER), pays(2, SIGNER)],
    }]]);
    const spend = (vout: number) => request({ inputs: [{ txid: PARENT, vout, address: SIGNER }], outputs: [pays(0, STRANGER)] });
    const options = { ...indexer([]), packageParents };
    expect(await analyzeSignRequestZeld(spend(1), options)).toEqual([{ kind: 'leaves', destination: STRANGER }]);
    expect(await analyzeSignRequestZeld(spend(2), options)).toEqual([]);
  });

  it('marks a parent split\'s receivers unchecked during an outage', async () => {
    const PLAIN_PARENT = 'e'.repeat(64);
    const packageParents = new Map([[PLAIN_PARENT, {
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }],
      outputs: [pays(0, SIGNER), pays(1, SIGNER), pays(2, SIGNER), split(3, [0n, 5n, 0n])],
    }]]);
    const known = async () => [{ outpoint: `${MOVED}:0`, balance: '1' }];
    const spend = (vout: number) => request({ inputs: [{ txid: PLAIN_PARENT, vout, address: SIGNER }], outputs: [pays(0, STRANGER)] });
    const options = { ...indexerDown(known), packageParents };
    expect(await analyzeSignRequestZeld(spend(1), options)).toEqual([{ kind: 'unchecked' }]);
    expect(await analyzeSignRequestZeld(spend(2), options)).toEqual([]);
  });
});

describe('the movement rule with incomplete information', () => {
  const OTHER = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

  it('names every possible receiver of a split when the amount carried is unknown', async () => {
    const notices = await analyzeSignRequestZeld(request({
      outputs: [pays(0, STRANGER), pays(1, OTHER), split(2, [0n, 100n])],
    }), indexerDown());
    expect(notices).toEqual([
      { kind: 'leaves', destination: STRANGER },
      { kind: 'leaves', destination: OTHER, amount: '100' },
    ]);
  });

  it('says nothing of an unclassified input whose ZELD could only reach plain change', async () => {
    // The split keeps the lookup-free shortcut from answering; the split itself asks for more
    // than the (unknown, so zero) known ZELD and is void.
    const known = async () => [{ outpoint: `${MOVED}:0`, balance: '1' }];
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: FOREIGN, vout: 0, address: SIGNER }],
      outputs: [pays(0, SIGNER), split(1, [5n])],
    }), indexerDown(known));
    expect(notices).toEqual([]);
  });

  it('skips a signed index the transaction does not have', async () => {
    const notices = await analyzeSignRequestZeld(request({
      signedInputs: [{ index: 3, sighashType: 1 }],
      outputs: [pays(0, STRANGER)],
    }), withZeld);
    expect(notices).toEqual([]);
  });

  it('looks up an input with no known address under the default address, and skips it without one', async () => {
    const options = indexer([{ txid: HUNTED, vout: 1, balance: ZELD }]);
    const unattributed = { inputs: [{ txid: HUNTED, vout: 1 }], outputs: [pays(0, STRANGER)] };
    expect(await analyzeSignRequestZeld(request(unattributed), options)).toEqual([]);
    expect(options.fetchUtxos).not.toHaveBeenCalled();
    expect(await analyzeSignRequestZeld(request({ ...unattributed, defaultAddress: SIGNER }), options))
      .toEqual([{ kind: 'leaves', destination: STRANGER, amount: ZELD.toString() }]);
  });

  it('states open signatures in input order, whatever order they were requested in', async () => {
    const notices = await analyzeSignRequestZeld(request({
      inputs: [{ txid: MOVED, vout: 0, address: SIBLING }, { txid: HUNTED, vout: 1, address: SIGNER }],
      signedInputs: [{ index: 1, sighashType: 0x83 }, { index: 0, sighashType: 0x83 }],
    }), {
      fetchUtxos: vi.fn(async (address: string) => address === SIGNER
        ? [{ txid: HUNTED, vout: 1, balance: ZELD }]
        : [{ txid: MOVED, vout: 0, balance: 5n }]),
      fetchParent: async () => null,
    });
    expect(notices).toEqual([{ kind: 'leaves', amount: '5' }, { kind: 'leaves', amount: ZELD.toString() }]);
  });

  it('follows a parent split to its listed outputs, past an entry beyond them', async () => {
    const PARENT = 'a'.repeat(64);
    const packageParents = new Map([[PARENT, {
      inputs: [{ txid: MOVED, vout: 0, address: SIGNER }],
      signedInputs: [{ index: 0, sighashType: 1 }],
      outputs: [pays(0, SIGNER), pays(1, SIGNER), split(2, [0n, 5n, 7n])],
    }]]);
    const notices = await analyzeSignRequestZeld(
      request({ inputs: [{ txid: PARENT, vout: 1, address: SIGNER }], outputs: [pays(0, STRANGER)] }),
      { ...indexer([{ txid: MOVED, vout: 0, balance: ZELD }]), packageParents },
    );
    expect(notices).toEqual([{ kind: 'leaves', destination: STRANGER, amount: '5' }]);
  });
});
