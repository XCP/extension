/**
 * Round-trip oracle: rebuild real on-chain messages and require the bytes to match.
 *
 * The compose oracle next door asks a node "what would you compose for these params?", which is the
 * strongest check available — but core can only answer for types it can compose from a synthetic
 * request. A dividend needs an asset with holders, a fairmint needs an open fairminter, a btcpay
 * needs a live order match. For those, a public node returns an error rather than bytes.
 *
 * This closes that gap from the other direction: take transactions that are *already on the chain*,
 * unpack each one, rebuild the message from what it decodes to, and require byte equality with the
 * original. Consensus data is the reference, so no ledger state has to be arranged.
 *
 * What it proves and what it does not: it pins the *encoding* — field widths, byte order, address
 * prefixes, CBOR head choices. The address-prefix bug found by the compose oracle would have failed
 * here too, since real sends carry the modern prefix and the old packer emitted the legacy one. It
 * cannot catch a field-order error shared by both the packer and the unpacker; the compose oracle
 * covers that for the types core can compose, and the mainnet fixtures in `messages.test.ts` cover
 * send and issuance directly.
 *
 * Skipped unless `COUNTERPARTY_API_URL` is set. Runs nightly — see nightly-tests.yml.
 */

import { describe, expect, it } from 'vitest';
import { unpackCounterpartyMessage } from '../../unpack';
import { bytesToHex } from '../../unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '../../unpack/messageTypes';
import { packComposeMessage } from '../messages';

const API_URL = process.env.COUNTERPARTY_API_URL;
/**
 * How many recent transactions of each type to check. Wide enough that a burst of same-shaped
 * traffic does not leave nothing to compare — see the note where `declined` is checked below.
 */
const SAMPLE_SIZE = 25;

interface OnChainTransaction {
  tx_hash: string;
  /** The Counterparty message: type id byte followed by the body, without the CNTRPRTY prefix. */
  data: string;
  block_index: number;
}

/**
 * Rebuild the compose params from what a message decodes to, per message type. The packers take a
 * request, and a decoded message is not shaped like one.
 *
 * Returning null means the sample cannot be rebuilt — an encoding variant the packer declines,
 * such as a hex memo, or a shape the wallet's own compose path never produces — and it is skipped
 * rather than failed.
 */
const PARAMS_FROM_DECODED: Record<string, (data: Record<string, any>) => Record<string, unknown> | null> = {
  enhanced_send: (data) => ({
    asset: data.asset,
    destination: data.destination,
    quantity: data.quantity,
    memo: data.memo ?? '',
  }),
  sweep: (data) => (data.memoIsBinary ? null : {
    destination: data.destination,
    flags: data.flags,
    memo: data.memo ?? '',
  }),
  destroy: (data) => ({ asset: data.asset, quantity: data.quantity, tag: data.tag ?? '' }),
  cancel: (data) => ({ offer_hash: data.offerHash }),
  order: (data) => ({
    give_asset: data.giveAsset,
    give_quantity: data.giveQuantity,
    get_asset: data.getAsset,
    get_quantity: data.getQuantity,
    expiration: data.expiration,
    fee_required: data.feeRequired ?? 0,
  }),
  dividend: (data) => ({
    asset: data.asset,
    dividend_asset: data.dividendAsset,
    quantity_per_unit: data.quantityPerUnit,
  }),
  fairmint: (data) => ({ asset: data.asset, quantity: data.quantity }),
  fairminter: (data) => (data.assetParent ? null : {
    asset: data.asset,
    lot_price: data.price,
    lot_size: data.quantityByPrice,
    max_mint_per_tx: data.maxMintPerTx,
    max_mint_per_address: data.maxMintPerAddress,
    hard_cap: data.hardCap,
    premint_quantity: data.premintQuantity,
    start_block: data.startBlock,
    end_block: data.endBlock,
    soft_cap: data.softCap,
    soft_cap_deadline_block: data.softCapDeadlineBlock,
    // The decoded value is already scaled; undo it so the packer can redo core's arithmetic.
    minted_asset_commission: Number(data.mintedAssetCommissionInt) / 1e8,
    burn_payment: data.burnPayment,
    lock_description: data.lockDescription,
    lock_quantity: data.lockQuantity,
    divisible: data.divisible,
    pool_quantity: data.poolQuantity,
    lp_asset: data.lpAsset ?? undefined,
    mime_type: data.mimeType,
    description: data.description,
  }),
  issuance: (data) => {
    // Core distinguishes an absent description (CBOR null) from an empty one (empty byte string),
    // and `composeIssuance` drops an empty description from the request — so the wallet can only
    // ever produce the null form. A message carrying empty bytes was composed by something else
    // and is not a shape this build can rebuild.
    if (data.description === '') return null;
    return {
      // A subasset issuance composes from the longname; the numeric asset id it carries is the
      // random draw the packer borrows from the decoded message, passed below as `observed`.
      asset: data.subassetLongname ?? data.asset,
      quantity: data.quantity,
      divisible: data.divisible,
      lock: data.isLock,
      reset: data.isReset,
      // Passed through rather than defaulted, so "absent" is not silently turned into "empty".
      description: data.description,
      mime_type: data.mimeType ?? '',
    };
  },
  broadcast: (data) => {
    // The wire stores the scaled integer; undo it so the packer can redo core's arithmetic. Skip
    // the rare value whose double round-trip does not survive — a mismatch there would be
    // arithmetic noise, not an encoding defect.
    const feeFraction = data.feeFractionInt / 1e8;
    if (Math.trunc(feeFraction * 1e8) !== data.feeFractionInt) return null;
    return {
      text: data.text,
      value: String(data.value),
      fee_fraction: String(feeFraction),
      timestamp: data.timestamp,
      mime_type: data.mimeType ?? '',
    };
  },
  mpma_send: (data) => {
    // A whole-send memo is copied into each send by the decoder, indistinguishable from per-send
    // memos that happen to agree — the original layout cannot be recovered, so skip. A
    // present-but-empty memo (its bit set, zero length) is also inexpressible from params.
    if (data.globalMemo !== undefined) return null;
    const sends = data.sends as Array<{
      asset: string; destination: string; quantity: bigint; memo?: string; memoIsHex?: boolean;
    }>;
    if (sends.some((send) => send.memo === '')) return null;
    // Params are comma-separated, so a memo containing a comma cannot travel that way.
    if (sends.some((send) => (send.memo ?? '').includes(','))) return null;
    const withMemos = sends.filter((send) => send.memo);
    const hexFlags = new Set(withMemos.map((send) => send.memoIsHex === true));
    if (hexFlags.size > 1) return null; // one flag covers all memos on the API

    return {
      assets: sends.map((send) => send.asset).join(','),
      destinations: sends.map((send) => send.destination).join(','),
      quantities: sends.map((send) => send.quantity).join(','),
      ...(withMemos.length > 0
        ? {
          memos: sends.map((send) => send.memo ?? '').join(','),
          memos_are_hex: String(hexFlags.values().next().value ?? false),
        }
        : {}),
    };
  },
};

/** API transaction type → the compose type our packers are keyed by. */
const COMPOSE_TYPE_FOR: Record<string, string> = {
  enhanced_send: 'send',
  sweep: 'sweep',
  destroy: 'destroy',
  cancel: 'cancel',
  order: 'order',
  dividend: 'dividend',
  fairmint: 'fairmint',
  issuance: 'issuance',
  fairminter: 'fairminter',
  broadcast: 'broadcast',
  mpma: 'mpma',
};

async function recentTransactions(type: string): Promise<OnChainTransaction[]> {
  const url = `${API_URL}/v2/transactions?type=${type}&limit=${SAMPLE_SIZE}&valid=true`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`core returned ${response.status} listing ${type}`);
  const body = await response.json() as { result?: OnChainTransaction[] };
  return (body.result ?? []).filter((tx) => typeof tx.data === 'string' && tx.data.length > 0);
}

describe.skipIf(!API_URL)('rebuilding real on-chain messages', () => {
  it.each(Object.keys(COMPOSE_TYPE_FOR))('%s', async (apiType) => {
    const transactions = await recentTransactions(apiType);
    expect(transactions.length, `no ${apiType} transactions returned`).toBeGreaterThan(0);

    let compared = 0;
    /** Samples the packer refuses on purpose, as opposed to ones it got wrong. */
    let declined = 0;
    const failures: string[] = [];

    for (const transaction of transactions) {
      // The API omits the CNTRPRTY prefix; the unpacker and our packers both include it.
      const fullMessage = COUNTERPARTY_PREFIX_HEX + transaction.data;
      const unpacked = unpackCounterpartyMessage(fullMessage);
      if (!unpacked.success || !unpacked.messageType || !unpacked.data) continue;

      const toParams = PARAMS_FROM_DECODED[unpacked.messageType];
      if (!toParams) continue;
      const params = toParams(unpacked.data as Record<string, any>);
      if (!params) {
        // A shape the wallet's compose path never produces. Counts the same as a packer decline:
        // nothing was compared, but nothing is wrong either.
        declined += 1;
        continue;
      }

      // Real transactions are the reference, so the decoded message is also what a packer would
      // borrow unknowable fields from in production.
      const packed = packComposeMessage(
        COMPOSE_TYPE_FOR[apiType]!, params, unpacked.data as Record<string, unknown>
      );
      if (!packed) {
        // A variant this build declines by design — a locked or reset subasset, a hex memo, a
        // Taproot MPMA destination — rather than one it got wrong. Counted so that a window full
        // of them reads as "nothing to compare" instead of "the packer is broken".
        declined += 1;
        continue;
      }

      compared += 1;
      const rebuilt = bytesToHex(packed.bytes).toLowerCase();
      const original = (COUNTERPARTY_PREFIX_HEX + transaction.data).toLowerCase();
      if (rebuilt !== original) {
        failures.push(`${transaction.tx_hash} (block ${transaction.block_index})\n  on-chain: ${original}\n  rebuilt:  ${rebuilt}`);
      }
    }

    expect(failures, `rebuilt bytes differ from chain:\n${failures.join('\n')}`).toEqual([]);
    // A type where every sample was skipped proves nothing, so say so rather than pass quietly.
    // Comparing nothing proves nothing, so this must never pass quietly — but there are two
    // reasons it happens and only one is a defect. Traffic is bursty enough that a single prolific
    // minter fills the whole window with a shape the packer refuses on purpose: at the time of
    // writing all 100 most recent issuances were locked subassets, which the borrow guard declines
    // by design. That run is uninformative rather than wrong.
    //
    // So when nothing was compared, the invariant is that *every* sample was one this build
    // declines on purpose. A sample that was attempted and still could not be rebuilt means the
    // packer is wrong.
    if (compared === 0) {
      expect(
        declined,
        `no ${apiType} sample could be rebuilt, and not all were shapes this build declines by `
        + 'design — the packer is likely wrong rather than the sample unrepresentative'
      ).toBe(transactions.length);
      return;
    }
  }, 30_000);
});
