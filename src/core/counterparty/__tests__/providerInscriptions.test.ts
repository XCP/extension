/**
 * The hostile-site suite for provider-path inscriptions.
 *
 * Every test models a site request: the honest launchpad shape, and then each way a hostile site
 * could bend it — its own keys in the envelope, a drain output riding along, a commit address
 * that doesn't match the declared envelope. The rule under test: a commit is signed only when the
 * wallet can prove the committed coins stay under the signer's own key and the envelope decodes
 * to a genuine Counterparty message.
 */

import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, p2tr, TAPROOT_UNSPENDABLE_KEY } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import {
  resolveRevealMessage,
  verifyInscriptionCommit,
} from '@/core/counterparty/providerInscriptions';
import { analyzeTransactionSafety } from '@/core/counterparty/transactionSafety';

// A fixed internal key for the "user": secp generator point x-coordinate is a valid x-only key.
const USER_INTERNAL_KEY = hexToBytes(
  '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
);
const SIGNER_ADDRESS = p2tr(USER_INTERNAL_KEY, undefined, undefined, true).address!;
// The key an envelope must name: the address's *output* key, not the internal key.
const SIGNER_OUTPUT_KEY = Address().decode(SIGNER_ADDRESS) as { type: 'tr'; pubkey: Uint8Array };

// A valid x-only point the signer does not control (2·G's x-coordinate).
const ATTACKER_KEY = hexToBytes(
  'c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
);

function push(ops: number[], data: Uint8Array): void {
  if (data.length < 76) ops.push(data.length);
  else if (data.length < 256) ops.push(0x4c, data.length);
  else ops.push(0x4d, data.length & 0xff, (data.length >> 8) & 0xff);
  ops.push(...data);
}

const FAIRMINTER_XCP_ARRAY = encodeCbor([
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  900000n, 0n, 10000000000n, 900420n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
]);

function buildEnvelope(pubkey: Uint8Array, metadataCbor: Uint8Array = FAIRMINTER_XCP_ARRAY): Uint8Array {
  const encoder = new TextEncoder();
  const ops: number[] = [0x00, 0x63];
  push(ops, encoder.encode('ord'));
  push(ops, new Uint8Array([0x07]));
  push(ops, encoder.encode('xcp'));
  push(ops, new Uint8Array([0x01]));
  push(ops, encoder.encode('image/png'));
  push(ops, new Uint8Array([0x05]));
  push(ops, metadataCbor);
  ops.push(0x00);
  push(ops, new Uint8Array(64).fill(9));
  ops.push(0x68);
  push(ops, pubkey);
  ops.push(0xac);
  return new Uint8Array(ops);
}

const HONEST_LEAF = buildEnvelope(SIGNER_OUTPUT_KEY.pubkey);
const HONEST_COMMIT_ADDRESS = p2tr(
  TAPROOT_UNSPENDABLE_KEY,
  { script: HONEST_LEAF, leafVersion: 0xc0 },
  undefined,
  true
).address!;

const honestContext = () => ({
  revealScript: bytesToHex(HONEST_LEAF),
  tapInternalKey: bytesToHex(TAPROOT_UNSPENDABLE_KEY),
});

const honestOutputs = () => [
  { index: 0, value: 60908, address: HONEST_COMMIT_ADDRESS },
  { index: 1, value: 50000, address: SIGNER_ADDRESS },
];

describe('verifyInscriptionCommit', () => {
  it('accepts the honest launchpad shape and reports address and value', () => {
    const result = verifyInscriptionCommit(honestContext(), honestOutputs(), SIGNER_ADDRESS);

    expect(result.ok).toBe(true);
    expect(result.commitAddress).toBe(HONEST_COMMIT_ADDRESS);
    expect(result.commitValue).toBe(60908);
    expect(result.envelope!.messageHex.startsWith('434e5452505254595a')).toBe(true);
  });

  // A real internal key — anyone's — allows a key-path sweep that never reveals anything.
  it('refuses a commit whose internal key is not the unspendable point', () => {
    const leaf = buildEnvelope(SIGNER_OUTPUT_KEY.pubkey);
    const commitAddress = p2tr(ATTACKER_KEY, { script: leaf, leafVersion: 0xc0 }, undefined, true)
      .address!;
    const result = verifyInscriptionCommit(
      { revealScript: bytesToHex(leaf), tapInternalKey: bytesToHex(ATTACKER_KEY) },
      [{ index: 0, value: 60908, address: commitAddress }],
      SIGNER_ADDRESS
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unspendable internal key/);
  });

  // A genuine envelope over the site's key: the message is real, the coins are not the user's.
  it("refuses an envelope whose checksig key is not the signer's", () => {
    const leaf = buildEnvelope(ATTACKER_KEY);
    const commitAddress = p2tr(
      TAPROOT_UNSPENDABLE_KEY,
      { script: leaf, leafVersion: 0xc0 },
      undefined,
      true
    ).address!;
    const result = verifyInscriptionCommit(
      { revealScript: bytesToHex(leaf), tapInternalKey: bytesToHex(TAPROOT_UNSPENDABLE_KEY) },
      [{ index: 0, value: 60908, address: commitAddress }],
      SIGNER_ADDRESS
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not spendable by your key/);
  });

  it('refuses a drain output riding alongside the commit', () => {
    const outputs = [
      ...honestOutputs(),
      { index: 2, value: 200000, address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr' },
    ];

    const result = verifyInscriptionCommit(honestContext(), outputs, SIGNER_ADDRESS);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/neither the inscription commit nor your change/);
  });

  it('refuses when no output pays the derived commit address', () => {
    const result = verifyInscriptionCommit(
      honestContext(),
      [{ index: 0, value: 50000, address: SIGNER_ADDRESS }],
      SIGNER_ADDRESS
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not pay the commit address/);
  });

  it('refuses a duplicated commit output', () => {
    const outputs = [
      { index: 0, value: 60908, address: HONEST_COMMIT_ADDRESS },
      { index: 1, value: 60908, address: HONEST_COMMIT_ADDRESS },
    ];

    const result = verifyInscriptionCommit(honestContext(), outputs, SIGNER_ADDRESS);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/more than once/);
  });

  it('refuses an unreadable envelope and an undecodable message', () => {
    const garbage = verifyInscriptionCommit(
      { revealScript: 'deadbeef', tapInternalKey: bytesToHex(TAPROOT_UNSPENDABLE_KEY) },
      honestOutputs(),
      SIGNER_ADDRESS
    );
    expect(garbage.ok).toBe(false);
    expect(garbage.error).toMatch(/not a readable inscription envelope/);

    // A structurally fine envelope whose message array names a real type but cannot unpack —
    // a fairminter with one field where seventeen are the minimum.
    const nonMessage = buildEnvelope(SIGNER_OUTPUT_KEY.pubkey, encodeCbor([90n, 1n]));
    const result = verifyInscriptionCommit(
      { revealScript: bytesToHex(nonMessage), tapInternalKey: bytesToHex(TAPROOT_UNSPENDABLE_KEY) },
      honestOutputs(),
      SIGNER_ADDRESS
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/does not decode to a Counterparty message/);
  });

  it('refuses a non-taproot signer', () => {
    const result = verifyInscriptionCommit(
      honestContext(),
      honestOutputs(),
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/taproot address/);
  });
});

describe('resolveRevealMessage', () => {
  const MARKER_SCRIPT = '6a08434e545250525459';
  const revealInputs = (leaves: string[] | undefined, index = 0) => [
    { index, ...(leaves ? { tapLeafScripts: leaves } : {}) },
  ];
  const markerOutputs = [
    { type: 'op_return', script: MARKER_SCRIPT },
    { type: 'p2pkh', script: '76a914000000000000000000000000000000000000000088ac' },
  ];

  it('reads the message from a marker-bearing reveal with one leaf on input 0', () => {
    const envelope = resolveRevealMessage(
      revealInputs([bytesToHex(HONEST_LEAF)]),
      markerOutputs
    );

    expect(envelope).not.toBeNull();
    expect(envelope!.mimeType).toBe('image/png');
  });

  // Core never looks at the witness without the marker output; neither may we.
  it('returns null without the plaintext CNTRPRTY marker', () => {
    const envelope = resolveRevealMessage(
      revealInputs([bytesToHex(HONEST_LEAF)]),
      [{ type: 'p2pkh', script: '76a914000000000000000000000000000000000000000088ac' }]
    );

    expect(envelope).toBeNull();
  });

  // Core reads input 0's witness alone; an envelope anywhere else never executes.
  it('returns null when the envelope sits on a later input', () => {
    const envelope = resolveRevealMessage(
      revealInputs([bytesToHex(HONEST_LEAF)], 1),
      markerOutputs
    );

    expect(envelope).toBeNull();
  });

  // Two leaves means the revealed script is unknowable before signing.
  it('returns null for multiple leaves, no leaves, or a non-envelope leaf', () => {
    expect(
      resolveRevealMessage(
        revealInputs([bytesToHex(HONEST_LEAF), bytesToHex(HONEST_LEAF)]),
        markerOutputs
      )
    ).toBeNull();
    expect(resolveRevealMessage(revealInputs(undefined), markerOutputs)).toBeNull();
    expect(resolveRevealMessage(revealInputs(['51']), markerOutputs)).toBeNull();
  });
});

describe('reveal safety with the burn output', () => {
  // The launchpad burns the inscription output on purpose: 546 sats to the Counterparty burn
  // address. That sits exactly at the dust threshold the analyzer already treats as normal
  // Counterparty behavior, so a recognized reveal raises no warnings for it.
  it('raises nothing for marker plus burn dust once the message is recognized', () => {
    const analysis = analyzeTransactionSafety(
      'fairminter',
      [
        { value: 0, type: 'op_return', script: '6a08434e545250525459' },
        { value: 546, type: 'p2pkh', address: '1CounterpartyXXXXXXXXXXXXXXXUWLpVr' },
      ],
      SIGNER_ADDRESS
    );

    expect(analysis.blocked).toBe(false);
    expect(analysis.warnings.filter((w) => w.severity !== 'info')).toEqual([]);
  });
});
