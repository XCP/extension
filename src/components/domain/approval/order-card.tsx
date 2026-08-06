/**
 * The DEX order card, shared by both approval screens.
 *
 * An order is the one message type with a layout of its own: two boxes and the rate between them,
 * because a trade is two amounts that only mean something as a pair. It lived inside the
 * raw-transaction screen, so a PSBT carrying the identical message fell through to the generic
 * headline-and-details rendering — one message, two appearances, depending on which method the
 * site happened to call.
 *
 * That is the same shape as the bug that made pool deposits disagree by 1e8 between two decoders:
 * a rule with two implementations gets fixed in whichever one the author is looking at. Here the
 * cost is milder (a person recognises one screen and not the other) but the cause is identical, so
 * the card and the builder live together and both screens call them.
 */

import { useState } from 'react';
import { isAssetDivisible, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import { FiArrowDown } from '@/components/icons';
import type { CounterpartyMessage } from '@/core/counterparty/transaction';
import type { ProviderVerificationResult } from '@/core/counterparty/unpack';
import { formatPriceRatio } from '@/core/format';
import { divide, toNumber } from '@/core/numeric';

export interface OrderAction {
  giveAmount: string;
  giveAsset: string;
  getAmount: string;
  getAsset: string;
  /**
   * Give/get quantities in display units, for the price ratio — or null when divisibility could
   * not be established for both assets, in which case no ratio is shown. A ratio of raw base units
   * is wrong by 1e8 for a mixed-divisibility pair, and silently right for a matched one, which is
   * what hid it.
   */
  normalizedGive: number | null;
  normalizedGet: number | null;
  expiration: number;
}

/** The parts of a decoded transaction or PSBT this builder reads — both screens supply them. */
export interface OrderSource {
  counterpartyMessage?: CounterpartyMessage;
  verification?: ProviderVerificationResult;
}

/**
 * Build the order card's data, or null when this is not an order.
 *
 * Prefers the API decode, which carries `*_info` divisibility, and falls back to the local unpack,
 * which carries asset names but no divisibility — so on that path the ratio is withheld for
 * anything but BTC and XCP rather than computed against a guess.
 */
export function buildOrderAction(source: OrderSource): OrderAction | null {
  if (source.counterpartyMessage?.messageType === 'order') {
    const { messageData } = source.counterpartyMessage;
    const giveAssetRaw = String(messageData.give_asset ?? '');
    const getAssetRaw = String(messageData.get_asset ?? '');

    // Prefer asset_longname (subasset display name) over numeric ID
    const giveInfo = messageData.give_asset_info as { asset_longname?: string | null } | undefined;
    const getInfo = messageData.get_asset_info as { asset_longname?: string | null } | undefined;

    const giveDivisor = isAssetDivisible(giveAssetRaw, messageData, 'give_asset') ? 1e8 : 1;
    const getDivisor = isAssetDivisible(getAssetRaw, messageData, 'get_asset') ? 1e8 : 1;

    return {
      giveAmount: normalizeQuantity(
        messageData.give_quantity,
        giveAssetRaw,
        messageData,
        'give_asset'
      ),
      giveAsset: giveInfo?.asset_longname || giveAssetRaw,
      getAmount: normalizeQuantity(messageData.get_quantity, getAssetRaw, messageData, 'get_asset'),
      getAsset: getInfo?.asset_longname || getAssetRaw,
      // Divided as BigNumber before narrowing to a float: a 64-bit quantity passed through
      // Number() first is already rounded, and the result feeds the displayed price.
      normalizedGive: toNumber(divide(String(messageData.give_quantity), giveDivisor)),
      normalizedGet: toNumber(divide(String(messageData.get_quantity), getDivisor)),
      expiration: Number(messageData.expiration ?? 0),
    };
  }

  const unpack = source.verification?.localUnpack;
  if (unpack?.success && unpack.messageType === 'order' && unpack.data) {
    const data = unpack.data as {
      giveAsset: string;
      giveQuantity: bigint;
      getAsset: string;
      getQuantity: bigint;
      expiration: number;
    };

    /** 1e8 for a known-divisible asset, 1 for a known-indivisible one, null when unknown. */
    const divisorFor = (asset: string): number | null => {
      const divisible = isAssetDivisible(asset);
      return divisible === undefined ? null : divisible ? 1e8 : 1;
    };
    const giveDivisor = divisorFor(data.giveAsset);
    const getDivisor = divisorFor(data.getAsset);

    return {
      giveAmount: normalizeQuantity(data.giveQuantity, data.giveAsset),
      giveAsset: data.giveAsset,
      getAmount: normalizeQuantity(data.getQuantity, data.getAsset),
      getAsset: data.getAsset,
      // Divisibility is not available on this path — the local unpack carries asset names, not
      // asset_info — so it can only be established for BTC and XCP. Rather than dividing by a
      // guess, the ratio is withheld unless both sides are known.
      normalizedGive:
        giveDivisor === null ? null : toNumber(divide(String(data.giveQuantity), giveDivisor)),
      normalizedGet:
        getDivisor === null ? null : toNumber(divide(String(data.getQuantity), getDivisor)),
      expiration: data.expiration,
    };
  }

  return null;
}

/** The give/receive card, with a rate the user can flip. */
export function OrderCard({ order }: { order: OrderAction }) {
  const [priceFlipped, setPriceFlipped] = useState(false);

  return (
    <div className="mb-3">
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-1">You give</p>
        <p className="text-xl font-bold text-gray-900">
          {order.giveAmount}{' '}
          <span className="text-base font-normal text-gray-500">{order.giveAsset}</span>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 py-2">
        <div className="bg-white border border-gray-200 rounded-full p-1">
          <FiArrowDown className="size-3.5 text-gray-400" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => setPriceFlipped((f) => !f)}
          className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          title="Click to flip price"
        >
          {order.normalizedGive === null || order.normalizedGet === null
            ? 'Price unavailable'
            : formatPriceRatio(
                order.normalizedGive,
                order.normalizedGet,
                order.giveAsset,
                order.getAsset,
                priceFlipped
              )}
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-1">You receive</p>
        <p className="text-xl font-bold text-gray-900">
          {order.getAmount}{' '}
          <span className="text-base font-normal text-gray-500">{order.getAsset}</span>
        </p>
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">
        {order.expiration === 0
          ? 'Never expires'
          : `Expires in ${order.expiration.toLocaleString()} blocks`}
      </p>
    </div>
  );
}
