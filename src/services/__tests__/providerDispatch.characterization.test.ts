import { hex } from '@scure/base';
import { p2tr, Transaction } from '@scure/btc-signer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A characterization of the provider dispatch: every method, over a corpus of parameters, in every
 * combination of site grant and wallet state, recorded as a snapshot of what a site sees (the
 * classified error or the result) and what the wallet did on the way (sign flows begun, popups
 * opened, permission lookups, rate-limiter charges, analytics events, timers left running).
 *
 * This is a record of current behaviour, not a specification. A snapshot change is not a failure
 * of the change that caused it; it is the change made visible, to be read and accepted (`-u`) on
 * purpose. Anything in the snapshot that looks wrong is a finding, not something to fix here.
 *
 * Every flow is stopped deterministically, so nothing waits on an approval:
 * - a signing flow is cancelled by the user as soon as it starts waiting (its `-cancel-` listener
 *   is answered in a microtask), so its outcome is the 4001 cancel after the popup opened;
 * - a locked connect has its unlock window closed as soon as it is watched;
 * - a connection approval is answered yes by the mocked connection service.
 * Timers are fake and the clock fixed; the number still pending after a request settles is part of
 * the record, and anything left is cleared before the next case.
 */

const session = vi.hoisted(() => ({ generation: 0 }));
vi.mock('@/platform/auth/sessionManager', () => ({
  getSessionGeneration: () => session.generation,
  assertSessionGeneration: (generation: number) => {
    if (generation !== session.generation) throw new Error('Wallet session changed');
  },
}));
vi.mock('@/core/hardware/trezorAdapter', () => ({
  getTrezorAdapter: vi.fn(),
  resetTrezorAdapter: vi.fn(),
  TrezorAdapter: vi.fn(),
}));
vi.mock('../walletService', () => ({ getWalletService: vi.fn() }));
vi.mock('../connectionService', () => ({ getConnectionService: vi.fn() }));
vi.mock('../approvalService', () => ({ getApprovalService: vi.fn() }));
vi.mock('@/services/updateService', () => ({
  getUpdateService: () => ({ registerCriticalOperation: vi.fn(), unregisterCriticalOperation: vi.fn() }),
}));
vi.mock('@/platform/walletManager', () => ({
  walletManager: { getSettings: vi.fn(), getActiveWallet: vi.fn(), updateSettings: vi.fn() },
}));
vi.mock('@/platform/fathom', () => ({
  sanitizePath: (path: string) => path,
  fathom: vi.fn(),
  analytics: { track: vi.fn().mockResolvedValue(undefined), page: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/platform/provider/rateLimiter', () => {
  const limiter = () => ({ isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 30_000), reset: vi.fn() });
  return {
    apiRateLimiter: limiter(),
    connectionRateLimiter: limiter(),
    signPopupRateLimiter: limiter(),
    transactionRateLimiter: limiter(),
  };
});
vi.mock('@/platform/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/popup')>()),
  openExtensionPopup: vi.fn(),
  reusePopupWindow: vi.fn(),
}));
// Partial: request keys, rejoin lookups and storage stay real; beginSignFlow is observed, not replaced.
vi.mock('@/platform/provider/signFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/provider/signFlow')>();
  return { ...actual, beginSignFlow: vi.fn(actual.beginSignFlow) };
});
vi.mock('@/core/replayPrevention', () => ({
  checkReplayAttempt: vi.fn(),
  recordTransaction: vi.fn(),
  markTransactionBroadcasted: vi.fn(),
  markTransactionFailed: vi.fn(),
}));
vi.mock('@/platform/provider/recentBroadcasts', () => ({ rememberSuccessfulBroadcast: vi.fn() }));
vi.mock('@/platform/storage/walletStorage', () => ({ keychainExists: vi.fn() }));
vi.mock('@/core/bitcoin/balance', () => ({ fetchBTCBalance: vi.fn() }));
vi.mock('@/core/counterparty/api', () => ({ fetchTokenBalance: vi.fn() }));

import { fetchBTCBalance } from '@/core/bitcoin/balance';
import { POLICY_OFFER_VECTORS } from '@/core/counterparty/__tests__/policyOfferVectors';
import { fetchTokenBalance } from '@/core/counterparty/api';
import { pairedGrantCovers } from '@/core/pairedGrant';
import { checkReplayAttempt } from '@/core/replayPrevention';
import { classifyProviderError } from '@/core/rpcErrors';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { analytics } from '@/platform/fathom';
import { openExtensionPopup, reusePopupWindow } from '@/platform/popup';
import {
  apiRateLimiter, connectionRateLimiter, signPopupRateLimiter, transactionRateLimiter,
} from '@/platform/provider/rateLimiter';
import { rememberSuccessfulBroadcast } from '@/platform/provider/recentBroadcasts';
import * as signFlow from '@/platform/provider/signFlow';
import { keychainExists } from '@/platform/storage/walletStorage';
import { walletManager } from '@/platform/walletManager';
import { getConnectionService } from '../connectionService';
import { eventEmitterService } from '../eventEmitterService';
import { createProviderService } from '../providerService';
import { getWalletService } from '../walletService';

// ==================== Fixtures ====================

const ORIGIN = 'https://dapp.example';
const NOW = Date.UTC(2026, 0, 1);
const SEGWIT = 'bc1qvux25709r4uw6rzc8wyl7wwecjdhrx085hm5ty';
const LEGACY = '1FvyAqqELFiQyaEWdhFbWF8MZapKPZS8J7';
const STRANGER = '1BoatSLRHtKNngkdXEeobR76b6hrLPUnoP';
const TAPROOT_KEY = hex.decode('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
const TAPROOT = p2tr(TAPROOT_KEY);
const SEGWIT_SCRIPT = hex.decode('0014670caa79e51d78ed0c583b89ff39d9c49b7199e7');

/** From providerService.test.ts: input 0 is owned by LEGACY (non-witness UTXO), input 1 by SEGWIT. */
const VALID_PSBT_HEX = '70736274ff01009a0200000002dcdd8cd287d40de3d260ccfc5fa3008f14ff8f13fc840164715cbb2b925874190000000000ffffffff98f9e476f918cc143cf8a6bd09042d1f2ee7c46bfd29c906166613b2d9c516c90000000000ffffffff022202000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e75c12000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e70000000000010055020000000101010101010101010101010101010101010101010101010101010101010101010000000000ffffffff0122020000000000001976a914a3c6b1ee4a49d9f2af3b3802974744fba924164a88ac000000000001011f8813000000000000160014670caa79e51d78ed0c583b89ff39d9c49b7199e7000000';
const V3_PSBT_HEX = VALID_PSBT_HEX.replace('ff01009a02000000', 'ff01009a03000000');
const BAD_MAGIC_PSBT_HEX = VALID_PSBT_HEX.replace(/^70736274ff/, '70736274fe');
/** From providerSurface.test.ts: the magic followed by nothing a parser can read. */
const JUNK_PSBT_HEX = '70736274ff' + '00'.repeat(20);

const buildPsbt = (inputs: Array<{ script: Uint8Array; amount?: bigint; sighashType?: number; taproot?: boolean }>, outputs = 1) => {
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true, disableScriptCheck: true });
  for (const [index, input] of inputs.entries()) {
    tx.addInput({
      txid: (index + 1).toString(16).padStart(2, '0').repeat(32),
      index: 0,
      ...(input.amount === undefined ? {} : { witnessUtxo: { script: input.script, amount: input.amount } }),
      ...(input.sighashType === undefined ? {} : { sighashType: input.sighashType }),
      ...(input.taproot ? { tapInternalKey: TAPROOT_KEY } : {}),
    });
  }
  for (let index = 0; index < outputs; index++) tx.addOutput({ script: SEGWIT_SCRIPT, amount: 1_000n });
  return hex.encode(tx.toPSBT());
};
const SEGWIT_PSBT_HEX = buildPsbt([{ script: SEGWIT_SCRIPT, amount: 100_000n }]);
const TAPROOT_PSBT_HEX = buildPsbt([{ script: TAPROOT.script, amount: 100_000n, taproot: true }]);
const TAPROOT_NONE_PSBT_HEX = buildPsbt([{ script: TAPROOT.script, amount: 100_000n, sighashType: 0x02, taproot: true }]);
const UNFUNDED_PSBT_HEX = buildPsbt([{ script: SEGWIT_SCRIPT }]);
const TWO_SEGWIT_ONE_OUTPUT_PSBT_HEX = buildPsbt(
  [{ script: SEGWIT_SCRIPT, amount: 50_000n }, { script: SEGWIT_SCRIPT, amount: 50_000n }], 1);

const BITCOIN_PAYMENT_INTENT = {
  standard: 'xcp-wallet/bitcoin-payment',
  version: 1,
  action: 'pay',
  outputs: [{ address: 'bc1qglv8hh3l23y0qu5uw4zu7e8q4td0gcjsa8f3tq', amountSats: 21_600 }],
  description: 'Fund Emblem Vault',
  reference: 'vault-63',
};
const EXACT_INTENT = {
  standard: 'counterparty-marketplace', version: 1, action: 'authorize_exact_offer',
  operationId: 'authorization-1', protocolVersion: 'exact_offer_v1',
  assets: [{ asset: 'RAREPEPE', quantityRaw: '1', sourceOutpoint: { txid: 'ab'.repeat(32), vout: 4 } }],
  authorizationId: 'authorization-1', bidder: LEGACY, seller: SEGWIT,
  priceSats: 250_000, utxoValueSats: 546, sellerProceedsSats: 250_046,
  networkFeeSats: 500, platformFeeSats: 6_250, expectedTxid: 'cd'.repeat(32),
  delivery: { mode: 'detached', address: LEGACY },
  marketplaceExpiresAt: 2_000_003_600, bitcoinExpiresAt: null,
  bitcoinInvalidation: { type: 'spend_funding_outpoint', outpoint: { txid: 'ef'.repeat(32), vout: 1 } },
};
const ACCEPT_INTENT = { ...EXACT_INTENT, action: 'accept_exact_offer', seller: LEGACY };
const CPFP_INTENT = {
  standard: 'counterparty-marketplace', version: 1, action: 'bump_acceptance_fee',
  operationId: 'authorization-1', protocolVersion: 'exact_offer_v1',
  assets: EXACT_INTENT.assets, authorizationId: 'authorization-1', seller: LEGACY,
  parentExpectedTxid: EXACT_INTENT.expectedTxid, childExpectedTxid: 'ee'.repeat(32),
  parentSellerProceedsVout: 1, parentSellerProceedsSats: 250_046,
  parentNetworkFeeSats: 500, childNetworkFeeSats: 1_000, packageFeeSats: 1_500, packageFeeRate: 5,
  finalSellerProceedsSats: 249_046,
};
const FANOUT_INTENT = {
  standard: 'counterparty-marketplace', version: 1, action: 'prepare_bulk_fanout',
  operationId: 'bulk-1', protocolVersion: 'counterparty_bulk_attach_v1', assets: [],
  batchIndex: 0, seller: LEGACY, fundingOutpoint: { txid: '11'.repeat(32), vout: 0 },
  fundingValueSats: 5_000, slotCount: 1, slotValueSats: 546, networkFeeSats: 100,
  changeSats: 4_354, expectedTxid: '22'.repeat(32), operationExpiresAt: 2_000_000_000,
};
const POLICY_CLAIM = POLICY_OFFER_VECTORS.fund.wpkh.claim;
const policyRequests = (count: number) => Array.from({ length: count }, (_, index) => ({
  hex: POLICY_OFFER_VECTORS.fund.wpkh.requests[0]!.hex,
  signInputs: { [POLICY_CLAIM.bidder]: [0] },
  sighashTypes: [0x01, 0x00],
  intent: {
    ...POLICY_CLAIM,
    alternatives: [{ ...POLICY_CLAIM.alternatives[0]!, expectedParentTxid: index.toString(16).padStart(64, '0') }],
  },
}));
const cpfpBundle = (parentHex: string) => [{
  requests: [
    { hex: parentHex, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: ACCEPT_INTENT },
    { hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: CPFP_INTENT },
  ],
}];

/** Objects the snapshot names instead of spelling out, so a stored intent reads as what it is. */
const NAMED_VALUES: Array<[string, unknown]> = [
  ['BITCOIN_PAYMENT_INTENT', BITCOIN_PAYMENT_INTENT],
  ['EXACT_INTENT', EXACT_INTENT],
  ['ACCEPT_INTENT', ACCEPT_INTENT],
  ['CPFP_INTENT', CPFP_INTENT],
  ['FANOUT_INTENT', FANOUT_INTENT],
];
const NAMED_HEX: Array<[string, string]> = [
  ['VALID_PSBT_HEX', VALID_PSBT_HEX],
  ['V3_PSBT_HEX', V3_PSBT_HEX],
  ['SEGWIT_PSBT_HEX', SEGWIT_PSBT_HEX],
  ['TAPROOT_PSBT_HEX', TAPROOT_PSBT_HEX],
  ['TAPROOT_NONE_PSBT_HEX', TAPROOT_NONE_PSBT_HEX],
  ['UNFUNDED_PSBT_HEX', UNFUNDED_PSBT_HEX],
  ['TWO_SEGWIT_ONE_OUTPUT_PSBT_HEX', TWO_SEGWIT_ONE_OUTPUT_PSBT_HEX],
];

// ==================== Parameter corpus ====================

type Case = [name: string, params: unknown];
const circular: Record<string, unknown> = {};
circular.self = circular;

/** Sent to every method. `undefined` params means the argument is omitted entirely. */
const SHARED_CASES: Case[] = [
  ['params omitted', undefined],
  ['empty params', []],
  // The junk params from providerSurface.test.ts.
  ['junk [null]', [null]],
  ['junk [{}]', [{}]],
  ['junk [[]]', [[]]],
  ['junk 10k-char string', ['x'.repeat(10_000)]],
  ['junk [1,2,3,4,5]', [1, 2, 3, 4, 5]],
  ['wrong type: number', [42]],
  ['wrong type: boolean', [true]],
  ['wrong type: { hex: number }', [{ hex: 42 }]],
  ['wrong type: object instead of params array', { hex: VALID_PSBT_HEX }],
  ['oversize: 1MB+1 string', ['x'.repeat(1024 * 1024 + 1)]],
  ['oversize: 1.2MB PSBT hex', [{ hex: '70736274ff' + 'ab'.repeat(600_000) }]],
  ['unserializable: circular params', [circular]],
];

const psbtCases: Case[] = [
  ['valid: SegWit PSBT, selection omitted', [{ hex: SEGWIT_PSBT_HEX }]],
  ['valid: SegWit PSBT, explicit active input + ALL', [{ hex: SEGWIT_PSBT_HEX, signInputs: { [SEGWIT]: [0] }, sighashTypes: [0x01] }]],
  ['valid: Taproot PSBT, selection omitted', [{ hex: TAPROOT_PSBT_HEX }]],
  ['valid: Taproot PSBT, explicit + DEFAULT', [{ hex: TAPROOT_PSBT_HEX, signInputs: { [TAPROOT.address!]: [0] }, sighashTypes: [0x00] }]],
  ['paired: legacy sibling signs input 0', [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01] }]],
  ['paired: legacy [0] + segwit [1]', [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0], [SEGWIT]: [1] }, sighashTypes: [0x01, 0x01] }]],
  ['bitcoin payment: segwit input 1 with intent', [{ hex: VALID_PSBT_HEX, signInputs: { [SEGWIT]: [1] }, sighashTypes: [0x01, 0x01], intent: BITCOIN_PAYMENT_INTENT }]],
  ['bitcoin payment: legacy sibling with intent', [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: BITCOIN_PAYMENT_INTENT }]],
  ['hex missing', [{ signInputs: { [SEGWIT]: [0] } }]],
  ['hex empty string', [{ hex: '' }]],
  ['hex not hex', [{ hex: 'zz-not-hex' }]],
  ['bad header: PSBT magic altered', [{ hex: BAD_MAGIC_PSBT_HEX }]],
  ['bad header: magic then zeros (surface fixture)', [{ hex: JUNK_PSBT_HEX }]],
  ['unowned input: active signs input 0 (owned by legacy)', [{ hex: VALID_PSBT_HEX, signInputs: { [SEGWIT]: [0] } }]],
  ['stranger address in signInputs', [{ hex: VALID_PSBT_HEX, signInputs: { [STRANGER]: [1] } }]],
  ['input index out of range', [{ hex: SEGWIT_PSBT_HEX, signInputs: { [SEGWIT]: [5] } }]],
  ['duplicate input index', [{ hex: TWO_SEGWIT_ONE_OUTPUT_PSBT_HEX, signInputs: { [SEGWIT]: [0, 0] } }]],
  ['signInputs is an array', [{ hex: VALID_PSBT_HEX, signInputs: [0] }]],
  ['signInputs null', [{ hex: VALID_PSBT_HEX, signInputs: null }]],
  ['missing sighash entry for a selected input', [{ hex: VALID_PSBT_HEX, signInputs: { [SEGWIT]: [1] }, sighashTypes: [0x01] }]],
  ['unsupported sighash NONE requested', [{ hex: SEGWIT_PSBT_HEX, sighashTypes: [0x02] }]],
  ['sighashTypes not an array', [{ hex: SEGWIT_PSBT_HEX, sighashTypes: 1 }]],
  ['more sighash entries than inputs', [{ hex: SEGWIT_PSBT_HEX, signInputs: { [SEGWIT]: [0] }, sighashTypes: [0x01, 0x01] }]],
  ['SINGLE without a paired output', [{ hex: TWO_SEGWIT_ONE_OUTPUT_PSBT_HEX, signInputs: { [SEGWIT]: [0, 1] }, sighashTypes: [0x01, 0x83] }]],
  ['embedded NONE sighash on the Taproot input', [{ hex: TAPROOT_NONE_PSBT_HEX, signInputs: { [TAPROOT.address!]: [0] } }]],
  ['unfunded input (no prevout)', [{ hex: UNFUNDED_PSBT_HEX, signInputs: { [SEGWIT]: [0] }, sighashTypes: [0x01] }]],
  ['multi-fault: v3 header + exact intent + missing sighash + unowned input', [{
    hex: V3_PSBT_HEX, signInputs: { [SEGWIT]: [0] }, sighashTypes: [], intent: EXACT_INTENT,
  }]],
  ['multi-fault: bad magic + unsupported sighash + array signInputs', [{
    hex: BAD_MAGIC_PSBT_HEX, signInputs: [1], sighashTypes: [0x02],
  }]],
  ['multi-fault: unfunded + stranger signer + missing sighash', [{
    hex: UNFUNDED_PSBT_HEX, signInputs: { [STRANGER]: [0] }, sighashTypes: [],
  }]],
  ['marketplace: exact-offer on a v3 header', [{ hex: V3_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: EXACT_INTENT }]],
  ['marketplace: malformed intent', [{ hex: VALID_PSBT_HEX, intent: { standard: 'counterparty-marketplace' } }]],
  ['marketplace: lone fund_policy_offer', [{ hex: VALID_PSBT_HEX, intent: POLICY_CLAIM }]],
  ['inscription: malformed', [{ hex: SEGWIT_PSBT_HEX, inscription: { revealScript: 'zz', tapInternalKey: '00' } }]],
  ['reveal: odd-length hex', [{ hex: SEGWIT_PSBT_HEX, reveal: 'abc' }]],
  ['reveal + inscription together', [{ hex: SEGWIT_PSBT_HEX, reveal: 'abcd', inscription: { revealScript: 'ab', tapInternalKey: '00'.repeat(32) } }]],
];

const METHOD_CASES: Record<string, Case[]> = {
  xcp_requestAccounts: [
    ['paired capability requested', [{ capabilities: { pairedAddresses: true } }]],
    ['paired capability truthy but not true', [{ capabilities: { pairedAddresses: 'yes' } }]],
  ],
  xcp_signMessage: [
    ['valid: message only', ['Hello Bitcoin']],
    ['valid: message + active SegWit address', ['Hello Bitcoin', SEGWIT]],
    ['valid: message + active Taproot address', ['Hello Bitcoin', TAPROOT.address]],
    ['paired: message + legacy sibling', ['Hello Bitcoin', LEGACY]],
    ['paired: legacy sibling in lower case', ['Hello Bitcoin', LEGACY.toLowerCase()]],
    ['stranger signer address', ['Hello Bitcoin', STRANGER]],
    ['empty message', ['']],
    ['address not a string', ['Hello Bitcoin', 42]],
    ['reserved connection-proof namespace', ['xcp-wallet\norigin:https://target.example\nnonce:forged\nissued:1']],
  ],
  xcp_signTransaction: [
    ['valid: raw hex string', ['0200000001' + '00'.repeat(40)]],
    ['valid: { hex }', [{ hex: '0200000001' + '00'.repeat(40) }]],
    ['{ hex: "" }', [{ hex: '' }]],
    ['not hex', ['not-a-transaction']],
  ],
  xcp_signPsbt: psbtCases,
  xcp_signBitcoinPsbt: psbtCases,
  xcp_signPsbts: [
    ['valid: exact acceptance + CPFP (legacy seller)', cpfpBundle(VALID_PSBT_HEX)],
    ['valid: bulk fan-out (legacy seller)', [{ requests: [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: FANOUT_INTENT }] }]],
    ['policy offer: 9 alternatives, bidder not in wallet', [{ requests: policyRequests(9) }]],
    ['policy offer: 101 alternatives', [{ requests: policyRequests(101) }]],
    ['fan-out: 9 requests', [{ requests: Array.from({ length: 9 }, () => ({ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: FANOUT_INTENT })) }]],
    ['requests empty', [{ requests: [] }]],
    ['requests not an array', [{ requests: {} }]],
    ['params an array', [[{ hex: VALID_PSBT_HEX }]]],
    ['request not an object', [{ requests: ['x'] }]],
    ['request without signInputs', [{ requests: [{ hex: VALID_PSBT_HEX }] }]],
    ['request with sighash NONE', [{ requests: [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x02] }] }]],
    ['request without intent', [{ requests: [{ hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01] }] }]],
    ['bad header: junk PSBT bytes (surface fixture)', [{ requests: [ACCEPT_INTENT, CPFP_INTENT].map(intent => ({ hex: JUNK_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent })) }]],
    ['bad header: v3 parent', cpfpBundle(V3_PSBT_HEX)],
    ['unfunded parent', cpfpBundle(UNFUNDED_PSBT_HEX)],
    ['multi-fault: v3 parent + stranger signer + missing sighash', [{
      requests: [
        { hex: V3_PSBT_HEX, signInputs: { [STRANGER]: [0, 1] }, sighashTypes: [0x01], intent: ACCEPT_INTENT },
        { hex: VALID_PSBT_HEX, signInputs: { [LEGACY]: [0] }, sighashTypes: [0x01], intent: CPFP_INTENT },
      ],
    }]],
    ['active segwit signs the legacy-owned input', [{ requests: [{ hex: VALID_PSBT_HEX, signInputs: { [SEGWIT]: [0] }, sighashTypes: [0x01], intent: { ...FANOUT_INTENT, seller: SEGWIT } }] }]],
  ],
  xcp_broadcastTransaction: [
    ['valid: raw hex', ['0200000001' + '00'.repeat(40)]],
    ['empty string', ['']],
    ['object instead of hex', [{ hex: '0200000001' }]],
  ],
};

const DISPATCHED_METHODS = [
  'xcp_requestAccounts', 'xcp_accounts', 'xcp_disconnect', 'xcp_getAddresses', 'xcp_chainId',
  'xcp_getNetwork', 'xcp_signMessage', 'xcp_signTransaction', 'xcp_signPsbts', 'xcp_signPsbt',
  'xcp_signBitcoinPsbt', 'xcp_getBalances', 'xcp_getAssets', 'xcp_getHistory', 'xcp_broadcastTransaction',
];
const METHODS = [...DISPATCHED_METHODS, 'xcp_notARealMethod'];

// ==================== Environments ====================

type GrantState = 'not connected' | 'connected' | 'connected + paired grant';
type WalletState = 'unlocked P2WPKH' | 'unlocked P2TR' | 'locked';
const GRANT_STATES: GrantState[] = ['not connected', 'connected', 'connected + paired grant'];
const WALLET_STATES: WalletState[] = ['unlocked P2WPKH', 'unlocked P2TR', 'locked'];

interface Env {
  settings: typeof DEFAULT_SETTINGS;
  unlocked: boolean;
  wallet: { id: string; name: string; type: 'mnemonic'; addressFormat: string; addresses: Array<Record<string, string>> };
  active: Record<string, string>;
}

const PAIR = {
  legacy: { address: LEGACY, pubKey: '02bb', path: "m/44'/0'/0'/0/0", name: 'Legacy', format: 'p2pkh', type: 'p2pkh' },
  segwit: { address: SEGWIT, pubKey: '02aa', path: "m/84'/0'/0'/0/0", name: 'SegWit', format: 'p2wpkh', type: 'p2wpkh' },
};

function makeEnv(grant: GrantState, walletState: WalletState): Env {
  const taproot = walletState === 'unlocked P2TR';
  const active = taproot
    ? { address: TAPROOT.address!, pubKey: hex.encode(TAPROOT_KEY), path: "m/86'/0'/0'/0/0", name: 'Address 1' }
    : { address: SEGWIT, pubKey: '02aa', path: "m/84'/0'/0'/0/0", name: 'Address 1' };
  const unlocked = walletState !== 'locked';
  const settings = {
    ...DEFAULT_SETTINGS,
    lastActiveAddress: active.address,
    connectedWebsites: grant === 'not connected' ? [] : [ORIGIN],
    providerCapabilities: grant === 'connected + paired grant'
      ? { [ORIGIN]: { pairedAddresses: true, walletId: 'wallet1', address: active.address, ...(taproot ? {} : { pairedAddress: LEGACY }) } }
      : {},
  } as typeof DEFAULT_SETTINGS;
  return {
    settings,
    unlocked,
    active,
    // A locked wallet keeps its identity but drops its addresses (walletManager.lockKeychain).
    wallet: { id: 'wallet1', name: 'Wallet', type: 'mnemonic', addressFormat: taproot ? 'p2tr' : 'p2wpkh', addresses: unlocked ? [active] : [] },
  };
}

const limiters = { api: apiRateLimiter, connection: connectionRateLimiter, transaction: transactionRateLimiter, signPopup: signPopupRateLimiter };

let env: Env;
let walletMocks: Record<string, ReturnType<typeof vi.fn>>;
let connectionMocks: Record<string, ReturnType<typeof vi.fn>>;

function installServices() {
  walletMocks = {
    isKeychainUnlocked: vi.fn(async () => env.unlocked),
    getActiveWallet: vi.fn(async () => env.wallet),
    getActiveAddress: vi.fn(async () => env.unlocked ? env.active : undefined),
    // Mirrors walletManager.getPairedAddresses's refusals.
    getPairedAddresses: vi.fn(async () => {
      if (env.wallet.addressFormat !== 'p2wpkh') throw new Error('The active address format has no paired Legacy/SegWit format');
      if (!env.unlocked) throw new Error('No active address');
      return PAIR;
    }),
    signMessage: vi.fn(async (_message: string, address: string) => ({ signature: `sig(${address})`, address })),
    broadcastTransaction: vi.fn(async () => ({ txid: 'ab'.repeat(32) })),
  };
  vi.mocked(getWalletService).mockReturnValue(walletMocks as never);

  const capabilities = () => env.settings.providerCapabilities as Record<string, unknown>;
  const grantPair = (origin: string, walletId: string, address: string) => {
    env.settings = { ...env.settings, providerCapabilities: { ...capabilities(), [origin]: {
      pairedAddresses: true, walletId, address, ...(env.wallet.addressFormat === 'p2wpkh' ? { pairedAddress: LEGACY } : {}),
    } } } as typeof DEFAULT_SETTINGS;
  };
  connectionMocks = {
    hasPermission: vi.fn(async (origin: string) => env.settings.connectedWebsites.includes(origin)),
    hasPairedAddressPermission: vi.fn(async (origin: string, walletId: string, address: string) =>
      pairedGrantCovers(capabilities()[origin] as never, walletId, address)),
    // The user approves whatever the connection service asks.
    connect: vi.fn(async (origin: string, address: string, walletId: string, paired: boolean) => {
      env.settings = { ...env.settings, connectedWebsites: [...env.settings.connectedWebsites, origin] };
      if (paired) grantPair(origin, walletId, address);
      return [address];
    }),
    requestPairedAddressPermission: vi.fn(async (origin: string, address: string, walletId: string) => {
      grantPair(origin, walletId, address);
    }),
    disconnect: vi.fn(async (origin: string) => {
      const { [origin]: _removed, ...rest } = capabilities();
      env.settings = { ...env.settings, connectedWebsites: env.settings.connectedWebsites.filter(site => site !== origin), providerCapabilities: rest } as typeof DEFAULT_SETTINGS;
    }),
  };
  vi.mocked(getConnectionService).mockReturnValue(connectionMocks as never);
  vi.mocked(walletManager.getSettings).mockImplementation(() => env.settings);
  vi.mocked(walletManager.getActiveWallet).mockImplementation(() => env.wallet as never);
}

function installChrome() {
  const sessionData: Record<string, unknown> = {};
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: {
      session: {
        set: vi.fn(async (data: Record<string, unknown>) => { Object.assign(sessionData, structuredClone(data)); }),
        get: vi.fn(async (keys: string | null) =>
          structuredClone(typeof keys === 'string' ? { [keys]: sessionData[keys] } : sessionData)),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete sessionData[key];
        }),
      },
    },
    windows: {
      // Every window a request watches is closed by the user as soon as it is watched.
      onRemoved: {
        addListener: vi.fn((listener: (windowId: number) => void) => queueMicrotask(() => listener(POPUP_WINDOW_ID))),
        removeListener: vi.fn(),
      },
    },
  };
}

const POPUP_WINDOW_ID = 77;

// ==================== Recording ====================

function normalize(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    const named = NAMED_HEX.find(([, candidate]) => candidate === value);
    if (named) return `<${named[0]}>`;
    let text = value
      .replace(/-\d{13}-[a-z0-9]{1,6}\b/g, '-<ts>-<rand>')
      .replace(/nonce:[0-9a-f]{16}/g, 'nonce:<nonce>');
    if (key === 'requestKey') text = text.replace(/:[0-9a-f]{64}$/, ':<sha256>');
    return text.length > 120 ? `${text.slice(0, 40)}…<${text.length} chars>` : text;
  }
  if (key === 'timestamp' && value === NOW) return '<now>';
  if (Array.isArray(value)) return value.map(item => normalize(item));
  if (value && typeof value === 'object') {
    const named = NAMED_VALUES.find(([, candidate]) => JSON.stringify(candidate) === JSON.stringify(value));
    if (named) return `<${named[0]}>`;
    return Object.fromEntries(Object.entries(value).map(([entryKey, item]) => [entryKey, normalize(item, entryKey)]));
  }
  return value;
}

const nonZero = (counts: Record<string, number>) =>
  Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));

async function run(method: string, params: unknown) {
  const provider = createProviderService();
  const promise = params === undefined
    ? provider.handleRequest(ORIGIN, method)
    : provider.handleRequest(ORIGIN, method, params as never);
  let settled: { ok: true; value: unknown } | { ok: false; error: unknown } | undefined;
  promise.then(value => { settled = { ok: true, value }; }, error => { settled = { ok: false, error }; });
  // Flush microtasks and zero-delay timers only; nothing advances toward an approval timeout.
  const isSettled = () => settled !== undefined;
  for (let step = 0; step < 200 && !isSettled(); step++) await vi.advanceTimersByTimeAsync(0);
  const pendingTimers = vi.getTimerCount();

  let outcome: unknown;
  if (!settled) outcome = 'STILL PENDING';
  else if (settled.ok) outcome = { result: normalize(settled.value) };
  else {
    const classified = classifyProviderError(settled.error);
    const raw = settled.error as Error;
    outcome = classified.code === -32603
      // Masked for the site; the thrown error is recorded so a masked site-caused failure is visible.
      ? { error: classified, thrown: `${raw?.constructor?.name}: ${normalize(String(raw?.message ?? raw))}` }
      : { error: classified };
  }

  const record: Record<string, unknown> = {
    outcome,
    lookups: {
      hasPermission: connectionMocks.hasPermission!.mock.calls.length,
      hasPairedAddressPermission: connectionMocks.hasPairedAddressPermission!.mock.calls.length,
      getPairedAddresses: walletMocks.getPairedAddresses!.mock.calls.length,
    },
    limiterCharges: nonZero(Object.fromEntries(Object.entries(limiters)
      .map(([name, limiter]) => [name, vi.mocked(limiter.isAllowed).mock.calls.length]))),
    analytics: vi.mocked(analytics.track).mock.calls.map(([name]) => name),
  };
  const actions = nonZero({
    connect: connectionMocks.connect!.mock.calls.length,
    requestPairedAddressPermission: connectionMocks.requestPairedAddressPermission!.mock.calls.length,
    disconnect: connectionMocks.disconnect!.mock.calls.length,
    signMessage: walletMocks.signMessage!.mock.calls.length,
    broadcastTransaction: walletMocks.broadcastTransaction!.mock.calls.length,
    rememberSuccessfulBroadcast: vi.mocked(rememberSuccessfulBroadcast).mock.calls.length,
  });
  if (Object.keys(actions).length) record.actions = actions;
  const begun = vi.mocked(signFlow.beginSignFlow).mock.calls.map(([entry]) => normalize(entry));
  if (begun.length) record.beginSignFlow = begun;
  const popups = vi.mocked(openExtensionPopup).mock.calls.map(([path]) => normalize(path ?? ''));
  if (popups.length) record.popups = popups;
  const reused = vi.mocked(reusePopupWindow).mock.calls.map(([id, path]) => `${id} ${path}`);
  if (reused.length) record.reusedPopups = reused;
  if (pendingTimers) record.pendingTimers = pendingTimers;
  if (!settled) promise.catch(() => {});
  return record;
}

/** Run one method/params pair in every environment, grouping environments that behave the same. */
async function characterize(method: string, params: unknown) {
  const groups = new Map<string, { environments: string[]; record: unknown }>();
  for (const grant of GRANT_STATES) {
    for (const walletState of WALLET_STATES) {
      reset(makeEnv(grant, walletState));
      const record = await run(method, params);
      const key = JSON.stringify(record);
      const group = groups.get(key) ?? { environments: [], record };
      group.environments.push(`${grant} · ${walletState}`);
      groups.set(key, group);
      vi.clearAllTimers();
    }
  }
  return [...groups.values()].map(({ environments, record }) => ({ environments, ...record as object }));
}

function reset(next: Env) {
  // clearAllTimers resets the fake clock to when it was installed, so pin it again every case.
  vi.setSystemTime(NOW);
  env = next;
  vi.clearAllMocks();
  installChrome();
  installServices();
  for (const limiter of Object.values(limiters)) {
    vi.mocked(limiter.isAllowed).mockReturnValue(true);
    vi.mocked(limiter.getResetTime).mockReturnValue(30_000);
  }
  vi.mocked(keychainExists).mockResolvedValue(true);
  vi.mocked(checkReplayAttempt).mockResolvedValue({ isReplay: false });
  vi.mocked(rememberSuccessfulBroadcast).mockResolvedValue(undefined);
  vi.mocked(fetchBTCBalance).mockResolvedValue(12_345);
  vi.mocked(fetchTokenBalance).mockResolvedValue({ quantity_normalized: '1.50000000' } as never);
  vi.mocked(openExtensionPopup).mockResolvedValue({ id: POPUP_WINDOW_ID, close: vi.fn() } as never);
  vi.mocked(reusePopupWindow).mockResolvedValue(null);
}

// ==================== Tests ====================

describe('provider dispatch characterization', () => {
  const originalOn = eventEmitterService.on.bind(eventEmitterService);

  beforeEach(() => {
    session.generation = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(NOW);
    // The user cancels every signing approval the moment the request starts waiting on it.
    vi.spyOn(eventEmitterService, 'on').mockImplementation(((event: string, callback: (data: unknown) => void) => {
      originalOn(event as never, callback as never);
      if (/-cancel-/.test(event)) queueMicrotask(() => eventEmitterService.emit(event as never, { reason: 'characterization' } as never));
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('covers every method the service dispatches', async () => {
    const source = await import('node:fs').then(fs => fs.readFileSync('src/services/providerService.ts', 'utf8'));
    const dispatched = [...new Set([...source.matchAll(/case '(xcp_\w+)':/g)].map(match => match[1]!))];
    expect(dispatched.sort()).toEqual([...DISPATCHED_METHODS].sort());
  });

  for (const method of METHODS) {
    describe(method, () => {
      const cases = [...SHARED_CASES, ...(METHOD_CASES[method] ?? [])];
      it.each(cases)('%s', async (_name, params) => {
        expect(await characterize(method, params)).toMatchSnapshot();
      });
    });
  }

  describe('rate limits (connected · unlocked P2WPKH, valid params)', () => {
    const validParams: Record<string, unknown> = {
      xcp_signMessage: ['Hello Bitcoin'],
      xcp_signTransaction: ['0200000001' + '00'.repeat(40)],
      xcp_signPsbt: [{ hex: SEGWIT_PSBT_HEX }],
      xcp_signBitcoinPsbt: [{ hex: VALID_PSBT_HEX, signInputs: { [SEGWIT]: [1] }, sighashTypes: [0x01, 0x01], intent: BITCOIN_PAYMENT_INTENT }],
      xcp_signPsbts: cpfpBundle(VALID_PSBT_HEX),
      xcp_broadcastTransaction: ['0200000001' + '00'.repeat(40)],
    };
    it.each(METHODS)('%s', async (method) => {
      const byLimiter: Record<string, unknown> = {};
      for (const refused of Object.keys(limiters) as Array<keyof typeof limiters>) {
        reset(makeEnv('connected + paired grant', 'unlocked P2WPKH'));
        vi.mocked(limiters[refused].isAllowed).mockReturnValue(false);
        byLimiter[`${refused} refuses`] = await run(method, validParams[method] ?? []);
        vi.clearAllTimers();
      }
      expect(byLimiter).toMatchSnapshot();
    });
  });
});
