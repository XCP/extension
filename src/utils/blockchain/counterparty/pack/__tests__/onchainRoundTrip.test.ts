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

import { describe, it, expect } from 'vitest';
import { packComposeMessage } from '../messages';
import { unpackCounterpartyMessage } from '../../unpack';
import { bytesToHex } from '../../unpack/binary';
import { COUNTERPARTY_PREFIX_HEX } from '../../unpack/messageTypes';

const API_URL = process.env.COUNTERPARTY_API_URL;
/** How many recent transactions of each type to check. */
const SAMPLE_SIZE = 5;

interface OnChainTransaction {
  tx_hash: string;
  /** The Counterparty message: type id byte followed by the body, without the CNTRPRTY prefix. */
  data: string;
  block_index: number;
}

/**
 * Rebuild the compose params from what a message decodes to. This is the per-type glue: the packers
 * take a request, and a decoded message is not shaped like one.
 *
 * Returning null means "this sample cannot be rebuilt" — an encoding variant the packer declines,
 * such as a hex memo or a subasset — and the sample is skipped rather than failed.
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
  issuance: (data) => ({
    // A subasset issuance composes from the longname; the numeric asset id it carries is the
    // random draw the packer borrows from the decoded message, which the harness already passes.
    asset: data.subassetLongname ?? data.asset,
    quantity: data.quantity,
    divisible: data.divisible,
    lock: data.isLock,
    reset: data.isReset,
    description: data.description ?? '',
    mime_type: data.mimeType ?? '',
  }),
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
    const failures: string[] = [];

    for (const transaction of transactions) {
      // The API omits the CNTRPRTY prefix; the unpacker and our packers both include it.
      const fullMessage = COUNTERPARTY_PREFIX_HEX + transaction.data;
      const unpacked = unpackCounterpartyMessage(fullMessage);
      if (!unpacked.success || !unpacked.messageType || !unpacked.data) continue;

      const toParams = PARAMS_FROM_DECODED[unpacked.messageType];
      if (!toParams) continue;
      const params = toParams(unpacked.data as Record<string, any>);
      if (!params) continue;

      // Real transactions are the reference, so the decoded message is also what a packer would
      // borrow unknowable fields from in production.
      const packed = packComposeMessage(
        COMPOSE_TYPE_FOR[apiType]!, params, unpacked.data as Record<string, unknown>
      );
      if (!packed) continue; // a variant this build declines to build

      compared += 1;
      const rebuilt = bytesToHex(packed.bytes).toLowerCase();
      const original = (COUNTERPARTY_PREFIX_HEX + transaction.data).toLowerCase();
      if (rebuilt !== original) {
        failures.push(`${transaction.tx_hash} (block ${transaction.block_index})\n  on-chain: ${original}\n  rebuilt:  ${rebuilt}`);
      }
    }

    expect(failures, `rebuilt bytes differ from chain:\n${failures.join('\n')}`).toEqual([]);
    // A type where every sample was skipped proves nothing, so say so rather than pass quietly.
    expect(compared, `every ${apiType} sample was skipped; none could be rebuilt`).toBeGreaterThan(0);
  }, 30_000);
});
