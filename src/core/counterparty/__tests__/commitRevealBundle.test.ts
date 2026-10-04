/**
 * The `commit-and-reveal` bundle's proof, on PSBTs built from composes captured from Core 11.5 on
 * regtest. A clean pair proves with its fees; any change to the envelope, control block, leaf key,
 * commit output, reveal outpoint, signer or sighash blocks it before anything is signed.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { p2pkh, p2wpkh, TaprootControlBlock, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import {
  commitRevealItems,
  commitRevealPsbts,
  SITE_BURN_ADDRESS,
  siteLaunch,
  siteLaunchItems,
} from '@/core/counterparty/__tests__/helpers/commitRevealPsbts';
import {
  BROADCAST_P2TR_INTERNAL,
  BROADCAST_P2TR_OUTPUT_KEY,
  BROADCAST_P2WPKH,
  envelopeClosedBy,
  type Fixture115,
  KEY_TR,
  KEY_WPKH,
  MPMA_P2WPKH,
  ORD_BROADCAST_P2WPKH,
  recompose115,
} from '@/core/counterparty/__tests__/taproot115Fixtures';
import {
  commitRevealReview,
  isRevealIntentClaim,
  parseCommitRevealIntents,
  proveCommitAndReveal,
} from '@/core/counterparty/commitRevealBundle';

const FIXTURES: Array<[string, Fixture115]> = [
  ['an MPMA data envelope from P2WPKH', MPMA_P2WPKH],
  ['a two-chunk broadcast from P2WPKH', BROADCAST_P2WPKH],
  ['a broadcast closed by a P2TR internal key', BROADCAST_P2TR_INTERNAL],
  ['a broadcast closed by a P2TR output key', BROADCAST_P2TR_OUTPUT_KEY],
  ['an ord inscription from P2WPKH', ORD_BROADCAST_P2WPKH],
];

function prove(fixture: Fixture115, psbts = commitRevealPsbts(fixture), source = fixture.key.address) {
  const items = commitRevealItems(fixture, psbts);
  return proveCommitAndReveal(items.commit, items.reveal, source);
}

const OTHER_XONLY = secp256k1.getPublicKey(new Uint8Array(32).fill(9), true).slice(1);

describe('proveCommitAndReveal', () => {
  it.each(FIXTURES)('proves %s, with both fees', (_name, fixture) => {
    const proof = prove(fixture);
    expect(proof.blockers).toEqual([]);
    expect(proof.evidence).toMatchObject({
      sourceAddress: fixture.key.address,
      commitFee: fixture.result.btc_fee,
      commitValue: fixture.result.reveal_inputs_values[0],
      envelopeHex: fixture.result.envelope_script,
      controlBlockHex: fixture.result.reveal_control_block,
    });
    // A data reveal spends the whole commit output on its fee; an ord reveal returns 546 to the user.
    const returned = fixture === ORD_BROADCAST_P2WPKH ? 546 : 0;
    expect(proof.evidence!.revealFee).toBe(fixture.result.reveal_inputs_values[0]! - returned);
  });

  it('builds the placeholder reveal the commit review reads the message from', () => {
    const proof = prove(BROADCAST_P2WPKH);
    const reveal = Transaction.fromRaw(hexToBytes(proof.evidence!.placeholderRevealHex), { allowUnknownOutputs: true });
    const witness = reveal.getInput(0).finalScriptWitness!;
    expect(witness.map(bytesToHex)).toEqual(['00'.repeat(64), BROADCAST_P2WPKH.result.envelope_script, BROADCAST_P2WPKH.result.reveal_control_block]);
    expect(bytesToHex(reveal.getInput(0).txid!)).toBe(commitRevealPsbts(BROADCAST_P2WPKH).commitTxid);
  });

  it('blocks an envelope changed in the reveal PSBT only', () => {
    const result = BROADCAST_P2WPKH.result;
    const tampered = result.envelope_script.replace('54686520717569636b', '54686520717569636c');
    expect(tampered).not.toBe(result.envelope_script);
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, { ...result, envelope_script: tampered });
    // The PSBT parser already refuses a leaf its control block does not commit to the prevout.
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/could not be read|envelope|commit/);
  });

  it('blocks a control block that is not the leaf\'s', () => {
    const result = BROADCAST_P2WPKH.result;
    const flipped = (parseInt(result.reveal_control_block.slice(0, 2), 16) ^ 1).toString(16).padStart(2, '0');
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, { ...result, reveal_control_block: flipped + result.reveal_control_block.slice(2) });
    expect(prove(BROADCAST_P2WPKH, psbts).blockers).not.toEqual([]);
  });

  it('blocks a commit output that hides a second leaf', () => {
    const result = recompose115(BROADCAST_P2WPKH, { extraLeaf: '51' });
    const proof = prove(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH, result));
    expect(proof.blockers.join('; ')).toMatch(/only leaf/);
  });

  it('blocks an envelope closed by a key that is not the source\'s', () => {
    const result = recompose115(BROADCAST_P2WPKH, { envelope: envelopeClosedBy(BROADCAST_P2WPKH, OTHER_XONLY) });
    const proof = prove(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH, result));
    expect(proof.evidence).toBeUndefined();
    expect(proof.blockers.join('; ')).toMatch(/not closed by your address/);
  });

  it('blocks a commit output 0 that pays anything but the envelope\'s address', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editCommit: commit => commit.updateOutput(0, { script: p2wpkh(hexToBytes(KEY_WPKH.publicKeyHex)).script }),
    });
    const proof = prove(BROADCAST_P2WPKH, psbts);
    expect(proof.evidence).toBeUndefined();
    expect(proof.blockers.join('; ')).toMatch(/Taproot output|witnessUtxo|commit/);
  });

  it.each([
    ['another vout of the commit', (input: Record<string, unknown>) => ({ ...input, index: 1 })],
    ['another transaction', (input: Record<string, unknown>) => ({ ...input, txid: new Uint8Array(32).fill(5) })],
    ['a witnessUtxo of another value', (input: Record<string, unknown>) => ({
      ...input, witnessUtxo: { ...(input.witnessUtxo as object), amount: 999_999n },
    })],
  ])('blocks a reveal that spends %s', (_name, edit) => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editRevealInput: input => edit(input as Record<string, unknown>) as typeof input,
    });
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/does not spend|witnessUtxo/);
  });

  it('blocks a reveal carrying a second leaf', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editRevealInput: input => ({
        ...input,
        tapLeafScript: [...(input as { tapLeafScript: [unknown, Uint8Array][] }).tapLeafScript,
          [TaprootControlBlock.decode(hexToBytes(`c0${BROADCAST_P2WPKH.result.reveal_control_block.slice(2)}`)), new Uint8Array([0x51, 0xc0])]],
      }) as typeof input,
    });
    // The PSBT parser refuses a leaf that the prevout does not commit to before the proof does.
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/could not be read|exactly one tapleaf/);
  });

  it('blocks a reveal carrying no leaf', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editRevealInput: ({ tapLeafScript: _leaves, ...input }) => input as never,
    });
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/exactly one tapleaf/);
  });

  it('admits a reveal output the site added, and states who it pays', () => {
    const other = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true));
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editReveal: reveal => reveal.addOutput({ script: other.script, amount: 300n }),
    });
    const proof = prove(BROADCAST_P2WPKH, psbts);
    expect(proof.blockers).toEqual([]);
    expect(proof.evidence!.revealOutputs).toEqual([
      { index: 0, value: 0, marker: true, owned: false, burn: false },
      { index: 1, value: 300, address: other.address, marker: false, owned: false, burn: false },
    ]);
    expect(proof.evidence!.revealFee).toBe(BROADCAST_P2WPKH.result.reveal_inputs_values[0]! - 300);
  });

  it('blocks a reveal without the bare CNTRPRTY marker', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editReveal: reveal => reveal.updateOutput(0, { script: hexToBytes('6a04deadbeef') }),
    });
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/CNTRPRTY marker/);
  });

  it('blocks a reveal fee far above any sane rate', () => {
    const result = recompose115(BROADCAST_P2WPKH, { commitValue: 5_000_000 });
    expect(prove(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH, result)).blockers.join('; '))
      .toMatch(/far above any sane rate/);
  });

  it('blocks BTC hidden on an additional CNTRPRTY marker output', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editReveal: reveal => reveal.addOutput({ script: reveal.getOutput(0).script!, amount: 100n }),
    });
    expect(prove(BROADCAST_P2WPKH, psbts).blockers.join('; ')).toMatch(/marker.*zero/);
  });

  it('blocks a request signed by another address, or any other signer on the reveal', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH);
    const items = commitRevealItems(BROADCAST_P2WPKH, psbts);
    const other = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true)).address!;
    expect(proveCommitAndReveal(items.commit, items.reveal, other).blockers).not.toEqual([]);
    expect(proveCommitAndReveal(items.commit, { ...items.reveal, signInputs: { [other]: [0] } }, KEY_WPKH.address).blockers
      .join('; ')).toMatch(/input 0 only/);
  });

  it('blocks a commit input that is not the signer\'s, or not P2WPKH/P2TR', () => {
    const legacy = p2pkh(hexToBytes(KEY_WPKH.publicKeyHex));
    const psbts = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editCommit: commit => commit.addInput({
        txid: new Uint8Array(32).fill(4), index: 0, witnessUtxo: { script: legacy.script, amount: 10_000n },
      }),
    });
    const items = commitRevealItems(BROADCAST_P2WPKH, psbts);
    const blockers = proveCommitAndReveal(items.commit, items.reveal, KEY_WPKH.address).blockers.join('; ');
    expect(blockers).toMatch(/commit input 1 is not P2WPKH or P2TR/);

    const foreign = commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, {
      editCommit: commit => commit.addInput({
        txid: new Uint8Array(32).fill(4), index: 0,
        witnessUtxo: { script: p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true)).script, amount: 10_000n },
      }),
    });
    const foreignItems = commitRevealItems(BROADCAST_P2WPKH, foreign);
    expect(proveCommitAndReveal(foreignItems.commit, foreignItems.reveal, KEY_WPKH.address).blockers.join('; '))
      .toMatch(/commit input 1 is not the signing address's/);
  });

  it('blocks a commit input left unsigned or signed with another sighash', () => {
    const items = commitRevealItems(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH));
    expect(proveCommitAndReveal({ ...items.commit, sighashTypes: [0x81] }, items.reveal, KEY_WPKH.address).blockers
      .join('; ')).toMatch(/SIGHASH_ALL/);
    expect(proveCommitAndReveal(items.commit, { ...items.reveal, sighashTypes: [0x81] }, KEY_WPKH.address).blockers
      .join('; ')).toMatch(/SIGHASH_DEFAULT or SIGHASH_ALL/);
    expect(proveCommitAndReveal(items.commit, { ...items.reveal, sighashTypes: [0x01] }, KEY_WPKH.address).blockers)
      .toEqual([]);
  });

  it('blocks a reveal that arrives signed', () => {
    const psbts = commitRevealPsbts(BROADCAST_P2TR_INTERNAL, BROADCAST_P2TR_INTERNAL.result, {
      editRevealInput: input => ({ ...input, finalScriptWitness: [new Uint8Array(64)] }) as typeof input,
    });
    expect(prove(BROADCAST_P2TR_INTERNAL, psbts).blockers.join('; ')).toMatch(/already signed/);
  });

  it('refuses a legacy source outright', () => {
    const items = commitRevealItems(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH));
    const legacy = p2pkh(hexToBytes(KEY_WPKH.publicKeyHex)).address!;
    expect(proveCommitAndReveal(items.commit, items.reveal, legacy).blockers)
      .toEqual(['only a Native SegWit or Taproot address signs a Taproot reveal']);
  });

  it('proves the P2TR pair for the Taproot key', () => {
    expect(KEY_TR.format).toBe('P2TR');
    expect(prove(BROADCAST_P2TR_INTERNAL).blockers).toEqual([]);
  });
});

describe('proveCommitAndReveal, a reveal that confirms with its commit', () => {
  const withSequence = (sequence: number) => (input: Parameters<Transaction['addInput']>[0]) => ({ ...input, sequence });
  const blockers = (options: Parameters<typeof commitRevealPsbts>[2]) =>
    prove(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, options)).blockers.join('; ');

  it.each([
    ['final, locktime 0', {}],
    ['replaceable, locktime 0', { editRevealInput: withSequence(0xfffffffd) }],
    ['zero relative delay', { editRevealInput: withSequence(0) }],
    ['a relative delay version 1 does not enforce', { editRevealInput: withSequence(6), revealHeader: { version: 1 } }],
    ['a locktime its final sequence leaves unenforced', { revealHeader: { lockTime: 0x5eed } }],
  ])('proves a reveal with %s', (_name, options) => {
    expect(blockers(options)).toBe('');
  });

  it('blocks a locktime its input sequence enforces', () => {
    expect(blockers({ revealHeader: { lockTime: 2_000_000 }, editRevealInput: withSequence(0xfffffffe) }))
      .toMatch(/locktime its input sequence enforces/);
  });

  it.each([['blocks', 6], ['seconds', 0x0040_0001], ['the longest', 0xffff]])(
    'blocks a relative timelock (%s)', (_name, sequence) => {
      expect(blockers({ editRevealInput: withSequence(sequence) })).toMatch(/delays it past the commit/);
    });

  it('blocks a transaction version nodes do not relay', () => {
    expect(blockers({ revealHeader: { version: 0 } })).toMatch(/version 0 is not relayed/);
  });

  it('blocks an output below its script’s dust threshold, and admits one at it', () => {
    const other = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true));
    const paying = (amount: bigint) => ({ editReveal: (reveal: Transaction) => reveal.addOutput({ script: other.script, amount }) });
    expect(blockers(paying(293n))).toMatch(/reveal output 1 is below the dust threshold/);
    expect(blockers(paying(294n))).toBe('');
    expect(blockers(paying(0n))).toMatch(/reveal output 1 is below the dust threshold/);
  });

  it('blocks a fee below the minimum relay rate, and admits one at it', () => {
    const other = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(8), true));
    const paying = (amount: bigint) => ({ editReveal: (reveal: Transaction) => reveal.addOutput({ script: other.script, amount }) });
    const commitValue = BROADCAST_P2WPKH.result.reveal_inputs_values[0]!;
    // The reveal's size once signed DEFAULT (a 64-byte signature), and the 0.1 sat/vB it must pay.
    const sized = prove(BROADCAST_P2WPKH, commitRevealPsbts(BROADCAST_P2WPKH, BROADCAST_P2WPKH.result, paying(300n)));
    const vsize = Transaction.fromRaw(hexToBytes(sized.evidence!.placeholderRevealHex), { allowUnknownOutputs: true }).vsize;
    const floor = Math.ceil(vsize / 10);
    expect(blockers(paying(BigInt(commitValue - floor)))).toBe('');
    expect(blockers(paying(BigInt(commitValue - floor + 1)))).toMatch(/less than the minimum relay fee/);
    expect(blockers(paying(BigInt(commitValue)))).toMatch(/less than the minimum relay fee/);
  });
});

describe('proveCommitAndReveal, on a site-built launch', () => {
  it.each([1200, 5000])('proves a fairminter inscription with a %s-byte image, its burn output named', (size) => {
    const launch = siteLaunch(size, 0x31);
    const items = siteLaunchItems(launch);
    const proof = proveCommitAndReveal(items.commit, items.reveal, launch.address);
    expect(proof.blockers).toEqual([]);
    expect(proof.evidence).toMatchObject({ envelope: 'ord', revealSighash: 0x01, envelopeHex: launch.leafHex });
    expect(proof.evidence!.revealOutputs).toEqual([
      { index: 0, value: 546, address: SITE_BURN_ADDRESS, marker: false, owned: false, burn: true },
      { index: 1, value: 0, marker: true, owned: false, burn: false },
    ]);
    // The whole commit output but the dust is the fee, at the site's 2 sat/vB.
    expect(proof.evidence!.revealFee).toBe(proof.evidence!.commitValue - 546);
  });

  it('blocks a commit output whose internal key someone else holds', () => {
    const launch = siteLaunch(1200, 0x33, { internalKey: OTHER_XONLY });
    const items = siteLaunchItems(launch);
    expect(proveCommitAndReveal(items.commit, items.reveal, launch.address).blockers.join('; '))
      .toMatch(/neither yours nor unspendable/);
  });

  it('blocks the launch for any address but the one whose key closes the envelope', () => {
    const launch = siteLaunch(1200, 0x34);
    const items = siteLaunchItems(launch);
    // The same private key's SegWit address controls the internal key, not the output key the leaf names.
    const segwit = p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(0xa1), true)).address!;
    const moved = {
      commit: { ...items.commit, signInputs: { [segwit]: [0] } },
      reveal: { ...items.reveal, signInputs: { [segwit]: [0] } },
    };
    expect(proveCommitAndReveal(moved.commit, moved.reveal, segwit).evidence).toBeUndefined();
  });
});

describe('commit-and-reveal intents', () => {
  const reveal = { standard: 'counterparty-reveal', version: 1, action: 'sign_reveal' };

  it('recognizes the reveal claim and parses the pair', () => {
    expect(isRevealIntentClaim(reveal)).toBe(true);
    expect(isRevealIntentClaim({ ...reveal, action: 'fund_commit' })).toBe(false);
    expect(parseCommitRevealIntents(undefined, reveal)).toEqual({
      commit: { standard: 'counterparty-reveal', version: 1, action: 'fund_commit' },
      reveal,
    });
    expect(parseCommitRevealIntents({ standard: 'counterparty-reveal', version: 1, action: 'fund_commit' }, reveal).commit.action)
      .toBe('fund_commit');
  });

  it('refuses a claim with anything extra, or a marketplace action that cannot fund a commit', () => {
    expect(() => parseCommitRevealIntents(undefined, { ...reveal, commitTxid: 'ab' })).toThrow(/must be exactly/);
    expect(() => parseCommitRevealIntents(undefined, { ...reveal, version: 2 })).toThrow(/must be exactly/);
    expect(() => parseCommitRevealIntents({ standard: 'counterparty-marketplace', version: 1, action: 'nope' }, reveal))
      .toThrow(/not supported/);
  });
});

describe('commitRevealReview', () => {
  it('states the message, the source and both fees when the pair proved', () => {
    const proof = prove(BROADCAST_P2WPKH);
    const review = commitRevealReview({ proof, blockers: [], retry: [], messageShown: true, messageDescription: 'Broadcast' });
    expect(review.status).toBe('proved');
    expect(review.family).toBe('commit_and_reveal');
    expect(review.facts.map(fact => fact.value)).toEqual(expect.arrayContaining([
      'Broadcast', KEY_WPKH.address, `${BROADCAST_P2WPKH.result.btc_fee.toLocaleString('en-US')} sats`,
    ]));
  });

  it('blocks when the message was not shown, the API is too old, or the pair did not prove', () => {
    const proof = prove(BROADCAST_P2WPKH);
    expect(commitRevealReview({ proof, blockers: [], retry: [], messageShown: false }).status).toBe('blocked');
    expect(commitRevealReview({ proof, blockers: ['old API'], retry: [], messageShown: true }).status).toBe('blocked');
    expect(commitRevealReview({ proof, blockers: [], retry: ['lookup'], messageShown: true }).status).toBe('retry');
    expect(commitRevealReview({ proof: { blockers: ['x'] }, blockers: [], retry: [], messageShown: true }).status).toBe('blocked');
  });
});
