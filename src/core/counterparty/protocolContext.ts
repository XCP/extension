/**
 * Ledger facts a Counterparty message does not carry.
 *
 * A cancel names an order by hash and nothing else. A destroy names an amount with no sense of
 * scale. A dividend names a per-unit rate whose actual cost depends on the supply it is paid
 * across. A dispense carries a single marker byte and says nothing at all about what comes back.
 * None of that is in the bytes being signed, and no amount of local decoding will produce it —
 * this is the class of question the API is the correct source for, as distinct from asking it to
 * re-read bytes we already hold.
 *
 * Every lookup fails soft: a field that could not be resolved is omitted, and the detail list
 * simply says less. An approval must not depend on a third party being reachable.
 *
 * Values are bare numbers, never a number with a unit appended: the describer knows which asset
 * each figure belongs to and does the labelling, and a value labelled here cannot be used in
 * arithmetic downstream.
 */

import { getCurrentBlockHeight } from '@/core/bitcoin/blockHeight';
import {
  fetchAssetDetails,
  fetchAssetFairminter,
  fetchAssetHolderCount,
  fetchOrder,
  fetchOrderMatch,
  fetchPool,
  fetchUtxoBalances,
} from '@/core/counterparty/api';
import type { ProtocolContext } from '@/core/counterparty/describe';
import { describePayout, resolveDispensersAt } from '@/core/counterparty/dispenseOutcome';
import { DIVIDEND_FEE_XCP_PER_HOLDER } from '@/core/counterparty/dividendModel';
import {
  oracleDispenserWarning,
  oracleDispenseWarning,
} from '@/core/counterparty/oraclePolicy';
import type { SecurityWarning } from '@/core/counterparty/transactionSafety';
import { readFairminterPaymentModel } from '@/core/counterparty/fairminterModel';
import { type BigNumber, formatDecimal, fromSatoshis, isGreaterThan, roundUp, toBigNumber } from '@/core/numeric';

export type { ProtocolContext };

/**
 * A figure as a row on the approval screen should read it: at most eight decimals, no trailing
 * zeros.
 *
 * Core's normalized values carry their full working precision, and they were reaching the screen
 * verbatim — a fairminter priced at 0.00001 XCP arrived as `price_normalized`
 * "0.00001000000000000" and was signed off from a row reading exactly that. Eight places is where
 * the ledger itself stops, so everything past them is noise on the number being agreed to.
 *
 * A value too small to show at that precision is stated as a bound rather than rounded down to
 * "0", which on a price row would read as free.
 */
function toDisplayAmount(value: string | number | BigNumber): string {
  const amount = toBigNumber(value);
  const shown = formatDecimal(amount);
  return shown === '0' && amount.isGreaterThan(0) ? '<0.00000001' : shown;
}

export interface ProtocolContextInput {
  messageType: string | undefined;
  data: unknown;
  transactionId?: string;
  apiMessageData?: Record<string, unknown>;
  /** Outputs, for a dispense: which addresses are being paid, and how much. */
  outputs?: { address?: string; value: number }[];
  /** Signer addresses, so change is not mistaken for a dispenser payment. */
  signerAddresses?: string[];
  /** Outpoints being spent, for a detach: what is coming back off them. */
  spentUtxos?: string[];
}

/**
 * The context, plus any policy warnings the lookups turned up.
 *
 * Kept together because the dispenser lookup is what reveals an oracle-priced dispenser, and doing
 * it twice would mean two round trips and two chances to disagree.
 */
export interface ResolvedProtocolContext {
  context: ProtocolContext;
  warnings: SecurityWarning[];
}

export async function resolveProtocolContext(
  input: ProtocolContextInput
): Promise<ResolvedProtocolContext> {
  const { messageType, data, transactionId, apiMessageData } = input;
  const context: ProtocolContext = {};
  const warnings: SecurityWarning[] = [];
  if (transactionId) context.transactionId = transactionId;

  // Attach, detach and fairmint charge an XCP fee that scales with demand (core
  // `gas.get_transaction_fee`), always paid in XCP — a cost beyond the Bitcoin fee.
  const fee = apiMessageData?.fee;
  if (fee != null && isGreaterThan(String(fee), 0)) {
    context.protocolFeeXcp = toDisplayAmount(fromSatoshis(String(fee)));
  }

  if (!messageType || data == null) return { context, warnings };
  const fields = data as Record<string, unknown>;

  // Opening a dispenser priced from a feed rather than at a fixed rate.
  if (messageType === 'dispenser') {
    const warning = oracleDispenserWarning(fields.oracleAddress);
    if (warning) warnings.push(warning);
  }

  try {
    if (messageType === 'cancel' && typeof fields.offerHash === 'string') {
      const order = await fetchOrder(fields.offerHash);
      if (order) {
        context.cancelledOrder = {
          giveQuantity: String(order.give_quantity_normalized ?? ''),
          giveAsset: String(order.give_asset ?? ''),
          getQuantity: String(order.get_quantity_normalized ?? ''),
          getAsset: String(order.get_asset ?? ''),
        };
      }
    }

    if (messageType === 'destroy' && typeof fields.asset === 'string') {
      const details = await fetchAssetDetails(fields.asset);
      if (details?.supply_normalized) context.assetSupply = String(details.supply_normalized);
    }

    if (messageType === 'dividend' && typeof fields.asset === 'string') {
      const details = await fetchAssetDetails(fields.asset);
      if (details?.supply_normalized) {
        context.assetSupply = String(details.supply_normalized);
        // The rate is what the message states; the bill is rate × supply, which is what the sender
        // actually parts with and the number they are most likely to have got wrong.
        const perUnit = fields.quantityPerUnit;
        if (perUnit != null) {
          const total = toBigNumber(details.supply_normalized).times(
            toBigNumber(fromSatoshis(String(perUnit)))
          );
          context.dividendTotal = toDisplayAmount(total);
        }
      }
      // The XCP half of the bill, which is charged per distinct holder rather than per unit.
      const holders = await fetchAssetHolderCount(fields.asset);
      if (holders != null && holders > 0) {
        context.dividendFeeXcp = toDisplayAmount(
          toBigNumber(DIVIDEND_FEE_XCP_PER_HOLDER).times(holders)
        );
      }
    }

    if (messageType === 'fairmint' && typeof fields.asset === 'string' && !context.protocolFeeXcp) {
      // A fairmint's cost is not in the message — and neither is where the payment goes: burned,
      // seeded into the pool, or paid to the issuer. Core charges `quantity / quantity_by_price *
      // price` (messages/fairmint.py), every term in base units, so the figure is derived the same
      // way from the same fields. The fairminter's `price_normalized` alone is the price of one
      // whole unit, which is what a mint of 1,000,000 units was being shown as costing.
      const fairminter = await fetchAssetFairminter(fields.asset);
      const quantity = fields.quantity;
      if (
        fairminter
        && (typeof quantity === 'number' || typeof quantity === 'string' || typeof quantity === 'bigint')
        && isGreaterThan(String(quantity), 0)
        && isGreaterThan(String(fairminter.quantity_by_price ?? 0), 0)
      ) {
        const cost = toBigNumber(String(quantity))
          .div(String(fairminter.quantity_by_price))
          .times(String(fairminter.price ?? 0));
        if (cost.isGreaterThan(0)) {
          context.protocolFeeXcp = toDisplayAmount(fromSatoshis(roundUp(cost).toString()));
        }
        const model = readFairminterPaymentModel(fairminter);
        if (model !== 'free') {
          context.fairmintPaymentModel = model === 'issuer' ? 'paid' : model;
        }
      }
    }

    if (messageType === 'btcpay' && typeof fields.offerHash === 'string') {
      const match = await fetchOrderMatch(fields.offerHash);
      if (match?.match_expire_index) {
        const height = await getCurrentBlockHeight();
        if (height > 0) context.btcpayBlocksLeft = match.match_expire_index - height;
      }
    }

    if (messageType === 'detach' && input.spentUtxos?.length) {
      // What a detach releases is on the UTXO, not in the message — the payload carries one field,
      // the destination, and that is already the headline.
      const detaching: string[] = [];
      for (const utxo of input.spentUtxos) {
        const balances = await fetchUtxoBalances(utxo);
        for (const balance of balances.result ?? []) {
          const name = balance.asset_info?.asset_longname || balance.asset;
          detaching.push(`${balance.quantity_normalized} ${name}`);
        }
      }
      if (detaching.length > 0) context.detachingAssets = detaching;
    }

    if (
      (messageType === 'pooldeposit' || messageType === 'poolwithdraw') &&
      typeof fields.assetA === 'string' &&
      typeof fields.assetB === 'string'
    ) {
      // The pool's identity and fee are ledger facts: a deposit's wire names the LP asset but a
      // withdrawal's does not, and neither carries the fee tier.
      const pool = await fetchPool(fields.assetA, fields.assetB);
      if (pool?.lp_asset) context.poolLpAsset = pool.lp_asset;
      // The fee field is not part of the typed Pool shape across core versions, so read it
      // defensively: a value below 1 is a fraction, at or above 1 it is basis points.
      const rawFee = [pool?.fee_bps, pool?.fee_rate, pool?.fee].find(
        (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
      ) as number | undefined;
      if (rawFee !== undefined) {
        const pct = rawFee < 1 ? rawFee * 100 : rawFee / 100;
        context.poolFeeRate = `${formatDecimal(toBigNumber(pct))}%`;
      }
    }

    if (messageType === 'dispense' && input.outputs?.length) {
      // Every open dispenser at a paid address pays out, so this is a list.
      const mine = new Set(input.signerAddresses ?? []);
      const payouts: string[] = [];
      const oracleAssets: string[] = [];
      for (const output of input.outputs) {
        if (!output.address || mine.has(output.address) || output.value <= 0) continue;
        const resolved = await resolveDispensersAt(output.address, output.value);
        for (const payout of resolved) {
          if (payout.oraclePriced) oracleAssets.push(payout.asset);
        }
        payouts.push(...resolved.map(describePayout));
      }
      if (payouts.length > 0) context.dispensePayouts = payouts;
      const warning = oracleDispenseWarning(oracleAssets);
      if (warning) warnings.push(warning);
    }
  } catch {
    // A lookup that fails leaves the field absent; the screen says less rather than nothing.
  }

  return { context, warnings };
}
