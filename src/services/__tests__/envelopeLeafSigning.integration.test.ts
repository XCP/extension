/**
 * A site's PSBT that spends a Counterparty envelope leaf naming the user's key, end to end:
 * real PSBT decoding, the background review, prevout verification and the real WalletSigner with
 * a software Taproot key. Only wallet/session state and remote lookups are simulated. No broadcast.
 *
 * The wallet signs such a leaf only when the review decoded and showed its message; otherwise the
 * review blocks and no signature is ever produced, whatever the request's purpose.
 */

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { Address, p2tr, Transaction, taprootNumsKey } from '@scure/btc-signer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AddressFormat } from '@/core/bitcoin/addressFormat';
import { parsePSBT } from '@/core/bitcoin/psbt';
import { encodeCbor } from '@/core/counterparty/pack/cbor';
import { beginSignFlow, getSignFlow } from '@/platform/provider/signFlow';
import { WalletSigner } from '@/platform/walletSigner';
import { createProviderSigningService } from '@/services/providerSigningService';
import type { Wallet } from '@/types/wallet';

const state = vi.hoisted(() => ({
  userAddress: '',
  parents: new Map<string, { hex: string; confirmations: number }>(),
  wallet: {
    isKeychainUnlocked: vi.fn(async () => true), getActiveWallet: vi.fn(),
    getActiveAddress: vi.fn(), getSettings: vi.fn(async () => ({ strictTransactionVerification: true })),
    signPsbt: vi.fn(), getPairedAddresses: vi.fn(),
  },
}));
vi.mock('@/services/walletService', () => ({ getWalletService: () => state.wallet }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => 0, assertSessionGeneration: () => {},
  getUnlockedSecret: async () => 'unlocked', unlockedHdNodeCache: () => undefined,
}));
vi.mock('@/services/connectionService', () => ({ getConnectionService: () => ({
  hasPermission: async () => true, hasPairedAddressPermission: async () => false,
}) }));
vi.mock('@/services/eventEmitterService', () => ({ eventEmitterService: { emit: vi.fn() } }));
vi.mock('@/platform/walletManager', () => ({ walletManager: {
  getSettings: () => ({ connectedWebsites: ['https://audit.invalid'] }),
  // Delivery re-reads the active identity here: the only address is the user's Taproot one.
  getActiveWallet: () => ({ id: 'audit', addresses: [{ address: state.userAddress }] }),
} }));
vi.mock('@/core/settings', () => ({ getActiveSettings: () => ({ zeldHuntSeconds: 0 }) }));
vi.mock('@/core/counterparty/api', () => ({
  fetchUtxoBalances: async () => ({ result: [] }),
  fetchBackendTransaction: async (txid: string) => {
    const parent = state.parents.get(txid);
    if (!parent) throw new Error('No such transaction');
    return parent;
  },
  fetchLedgerHeights: async () => ({ backendHeight: 900_000, counterpartyHeight: 900_000 }),
}));
vi.mock('@/core/bitcoin/utxo', async importOriginal => ({
  ...(await importOriginal<typeof import('@/core/bitcoin/utxo')>()),
  fetchPreviousRawTransaction: async (txid: string) => state.parents.get(txid)?.hex ?? null,
  fetchTransactionChainStatus: async () => null,
}));
vi.mock('@/core/counterparty/transaction', () => ({ decodeCounterpartyMessage: async () => undefined }));
vi.mock('@/core/counterparty/sourcePubkey', () => ({ getSourcePubkey: () => undefined }));
vi.mock('@/core/bitcoin/feeRate', () => ({ getFeeRates: async () => ({ fastestFee: 2 }) }));
vi.mock('@/core/zeld/protection', () => ({ classifyZeldOutpoints: async (inputs: unknown[]) => ({
  bearing: [], unknown: [], clean: inputs,
}) }));

const USER_KEY = '0b'.repeat(32);
const userPubkey = secp256k1.getPublicKey(hexToBytes(USER_KEY), true);
const user = p2tr(userPubkey.slice(1, 33), undefined, undefined, true);
const userOutputKey = (Address().decode(user.address!) as { type: 'tr'; pubkey: Uint8Array }).pubkey;
const MARKER = hexToBytes('6a08434e545250525459');
state.userAddress = user.address!;

const wallet: Wallet = {
  id: 'audit', name: 'Audit', type: 'privateKey', addressFormat: AddressFormat.P2TR, addressCount: 1,
  addresses: [{ name: 'Address 1', path: "m/86'/0'/0'/0/0", address: user.address!, pubKey: bytesToHex(userPubkey) }],
};
const signer = new WalletSigner({
    getCoinLocks: () => [],
  activeWalletId: () => wallet.id,
  getWalletById: id => (id === wallet.id ? wallet : undefined),
  getActiveWallet: () => wallet,
  lastActiveAddress: () => user.address!,
  getPrivateKey: async () => ({ hex: USER_KEY, wif: 'unused', compressed: true }),
  getPairedAddresses: async () => { throw new Error('no pair'); },
});

function push(ops: number[], data: Uint8Array): void {
  if (data.length < 76) ops.push(data.length);
  else ops.push(0x4c, data.length);
  ops.push(...data);
}

/** `OP_FALSE OP_IF "ord" 07 "xcp" 01 <mime> 05 <metadata> OP_0 <body> OP_ENDIF <user output key> OP_CHECKSIG` */
function envelope(metadata: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  const ops: number[] = [0x00, 0x63];
  push(ops, encoder.encode('ord'));
  push(ops, new Uint8Array([0x07]));
  push(ops, encoder.encode('xcp'));
  push(ops, new Uint8Array([0x01]));
  push(ops, encoder.encode('text/plain'));
  push(ops, new Uint8Array([0x05]));
  push(ops, metadata);
  ops.push(0x00);
  push(ops, new TextEncoder().encode('hello'));
  ops.push(0x68);
  push(ops, userOutputKey);
  ops.push(0xac);
  return new Uint8Array(ops);
}
const DECODABLE = envelope(encodeCbor([
  90n, 95428956661682177n, 0n, 100000000n, 1000000000n, 1000000000n, 0n, 100000000000n, 0n,
  900000n, 0n, 10000000000n, 900420n, 0n, false, true, true, true, 5000000000n, 95428956661682178n,
]));
const UNREADABLE = envelope(new Uint8Array([0xff, 0xff]));

let seed = 1;
/** The site's reveal: spends a confirmed commit to `leaf`, pays 546 back to the user. */
function reveal(leaf: Uint8Array, marker = true) {
  const commit = p2tr(taprootNumsKey(), { script: leaf, leafVersion: 0xc0 }, undefined, true);
  const parent = new Transaction();
  parent.addInput({ txid: new Uint8Array(32).fill(seed++), index: 0 });
  parent.addOutput({ script: commit.script, amount: 2_000n });
  state.parents.set(parent.id, { hex: bytesToHex(parent.toBytes(true, false)), confirmations: 6 });
  const tx = new Transaction({ allowUnknownOutputs: true, allowUnknownInputs: true });
  tx.addInput({ txid: parent.id, index: 0, witnessUtxo: { script: commit.script, amount: 2_000n },
    tapLeafScript: commit.tapLeafScript });
  if (marker) tx.addOutput({ script: MARKER, amount: 0n });
  tx.addOutputAddress(user.address!, 546n);
  return bytesToHex(tx.toPSBT());
}

async function review(psbtHex: string, extra: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  await beginSignFlow({ id, walletId: wallet.id, address: user.address!, origin: 'https://audit.invalid',
    timestamp: Date.now(), requestKey: id, kind: 'sign-psbt', psbtHex, signInputs: { [user.address!]: [0] },
    ...extra } as Parameters<typeof beginSignFlow>[0]);
  const result = await createProviderSigningService().getReview(id);
  if (result.kind !== 'sign-psbt') throw new Error('wrong kind');
  return result;
}

const approve = (result: Awaited<ReturnType<typeof review>>) => createProviderSigningService()
  .approveAndSign(result.request.id, { reviewKey: result.reviewKey, risksAcknowledged: true });

beforeEach(() => {
  fakeBrowser.reset(); vi.stubGlobal('chrome', fakeBrowser);
  state.parents.clear();
  state.wallet.getActiveWallet.mockResolvedValue(wallet);
  state.wallet.getActiveAddress.mockResolvedValue({ address: user.address });
  state.wallet.signPsbt.mockReset();
  state.wallet.signPsbt.mockImplementation((...args: Parameters<WalletSigner['signPsbt']>) => signer.signPsbt(...args));
});
afterEach(() => vi.unstubAllGlobals());

it('signs the reveal whose decoded message the review shows', async () => {
  const result = await review(reveal(DECODABLE));
  expect(result.decodedInfo.verification.localUnpack?.messageType).toBe('fairminter');
  expect(result.decodedInfo.safety.warnings.map(warning => warning.code)).not.toContain('unshown_envelope_signature');
  expect(result.policy.blocked).toBe(false);
  await approve(result);
  const completed = await getSignFlow(result.request.id);
  if (completed?.status !== 'completed') throw new Error('Signing did not complete');
  const signed = parsePSBT((completed.result as { signedPsbtHex: string }).signedPsbtHex);
  expect(bytesToHex(signed.getInput(0).tapScriptSig![0]![0].pubKey)).toBe(bytesToHex(userOutputKey));
});

it.each([
  ['an envelope the wallet cannot read', () => reveal(UNREADABLE), {}],
  ['a decodable envelope without the CNTRPRTY marker', () => reveal(DECODABLE, false), {}],
  ['a plain Bitcoin payment spending an unreadable envelope', () => reveal(UNREADABLE, false), {
    signingPurpose: 'bitcoin-payment',
    bitcoinPaymentIntent: { standard: 'xcp-wallet/bitcoin-payment', version: 1, action: 'pay', outputs: [] },
  }],
])('blocks %s and never signs it', async (_name, psbt, extra) => {
  const result = await review(psbt(), extra);
  expect(result.policy.blocked).toBe(true);
  expect(result.decodedInfo.safety.warnings[0]).toMatchObject({
    code: 'unshown_envelope_signature', severity: 'block', data: { inputs: [0] },
  });
  await expect(approve(result)).rejects.toThrow(/did not pass/);
  expect(state.wallet.signPsbt).not.toHaveBeenCalled();
});

it('refuses in the signer too, if a request reaches it unreviewed', async () => {
  const psbtHex = reveal(UNREADABLE);
  await expect(signer.signPsbt(psbtHex, { [user.address!]: [0] }, undefined,
    { walletId: wallet.id, address: user.address! })).rejects.toThrow(/approval did not show/);
});
