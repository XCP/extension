import { type ReactNode, useState } from "react";
import { isAssetDivisible, normalizeQuantity } from '@/components/domain/tx/tx-action-info';
import { FaExchangeAlt } from "@/components/icons";
import type { Transaction } from "@/core/counterparty/api";
import { formatAmount, formatAmountExact } from "@/core/format";
import { divide, toBigNumber } from "@/core/numeric";
import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';

type Params = Record<string, unknown>;
type Field = { label: string; value: string | ReactNode };
const record = (value: unknown): Params | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Params : null;

function decimal(value: unknown, integer = false): string | null {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const text = String(value);
  return (integer ? /^\d+$/ : /^\d+(?:\.\d{1,8})?$/).test(text) ? text : null;
}

/** A later raw value invalidates any older normalized value derived from it. */
function mergeParams(before: Params | null, after: Params): Params {
  const merged = { ...before, ...after };
  for (const field of Object.keys(after)) {
    if (!(field + '_normalized' in after)) delete merged[field + '_normalized'];
  }
  return merged;
}

/** Event rows are a snapshot at this transaction, not a current order lookup. */
function orderData(tx: Transaction): { params: Params; snapshot: Params | null } | null {
  const decoded = record(tx.unpacked_data?.message_data) ?? record(tx.unpacked_data?.params);
  // Mempool parsing uses a synthetic block height; it cannot establish a mined expiry or state.
  if (tx.confirmed === false) return decoded ? { params: decoded, snapshot: null } : null;
  const openings = (tx.events ?? []).filter(event =>
    ['OPEN_ORDER', 'ORDER', 'NEW_ORDER'].includes(event.event)
    && (event.params?.tx_hash === tx.tx_hash
      || (event.params?.tx_hash === undefined && event.tx_hash === tx.tx_hash)));
  const opening = openings.sort((a, b) => a.event_index - b.event_index)[0];
  let snapshot = record(opening?.params);
  const params = snapshot ? mergeParams(decoded, snapshot) : decoded;
  if (!params) return null;
  if (snapshot && opening) {
    for (const event of (tx.events ?? []).filter(event =>
      event.event === 'ORDER_UPDATE' && event.params?.tx_hash === tx.tx_hash
      && event.event_index > opening.event_index)
      .sort((a, b) => a.event_index - b.event_index)) {
      snapshot = mergeParams(snapshot, record(event.params)!);
    }
  }
  return { params, snapshot };
}

function quantity(params: Params, field: string, assetField: string): { display: string; normalized: string | null } {
  const asset = typeof params[assetField] === 'string' ? params[assetField] : '';
  const divisible = isAssetDivisible(asset, params, assetField);
  const raw = decimal(params[field], true);
  const enriched = decimal(params[field + '_normalized'], divisible === false);
  // Known slot divisibility makes the integer authoritative; otherwise an explicit normalized
  // field is usable, but an unlabelled raw integer must never pretend to be whole tokens.
  const normalized = raw !== null && divisible !== undefined
    ? divide(raw, divisible ? 100_000_000 : 1).toFixed()
    : enriched;
  if (normalized !== null) {
    return { normalized, display: divisible === undefined
      ? formatAmount({ value: normalized, maximumFractionDigits: 8 })
      : formatAmountExact(normalized, { divisible }) };
  }
  return {
    normalized: null,
    display: raw !== null && asset ? normalizeQuantity(raw, asset, params, assetField) : t('tx_action_unavailable'),
  };
}

function PriceDisplay({ giveAsset, getAsset, giveQuantity, getQuantity }: {
  giveAsset: string; getAsset: string; giveQuantity: string; getQuantity: string;
}) {
  useLocaleRevision();
  const [isFlipped, setIsFlipped] = useState(false);
  // Divide the original quantities in either direction, never the rounded displayed inverse.
  const ratio = isFlipped ? divide(giveQuantity, getQuantity) : divide(getQuantity, giveQuantity);
  const value = formatAmount({ value: ratio.isZero() ? '0.00000001' : ratio, minimumFractionDigits: 8, maximumFractionDigits: 8 });
  const display = '1 ' + (isFlipped ? getAsset : giveAsset) + ' = ' + (ratio.isZero() ? '< ' : '')
    + value + ' ' + (isFlipped ? giveAsset : getAsset);
  return (
    <div className="flex items-center justify-between">
      <span>{display}</span>
      <button type="button" onClick={() => setIsFlipped(!isFlipped)}
        className="p-1 hover:bg-gray-100 rounded-full transition-colors ml-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={t('common_flip_price_ratio')}>
        <FaExchangeAlt className="size-3 text-gray-600" aria-hidden="true" />
      </button>
    </div>
  );
}

function status(value: unknown): string {
  switch (value) {
    case 'open': return '🟢 ' + t('messages_order_status_open');
    case 'filled': return '✅ ' + t('messages_order_status_filled');
    case 'cancelled': return '❌ ' + t('messages_order_status_cancelled');
    case 'expired': return '⏰ ' + t('messages_order_status_expired');
    case 'pending': return t('common_pending');
    default: return typeof value === 'string' && value ? value : t('messages_order_status_unknown');
  }
}

/** Historical order terms and the state recorded by this transaction's own events. No live reads. */
export function order(tx: Transaction): Field[] {
  const data = orderData(tx);
  if (!data) return [];
  const { params, snapshot } = data;
  const giveAsset = typeof params.give_asset === 'string' ? params.give_asset : '';
  const getAsset = typeof params.get_asset === 'string' ? params.get_asset : '';
  const give = quantity(params, 'give_quantity', 'give_asset');
  const get = quantity(params, 'get_quantity', 'get_asset');
  const fields: Field[] = [
    { label: t('common_type'), value: giveAsset === 'BTC' ? t('messages_order_buy_order')
      : getAsset === 'BTC' ? t('messages_order_sell_order') : t('messages_order_token_swap') },
    { label: t('common_give'), value: give.display + (giveAsset ? ' ' + giveAsset : '') },
    { label: t('common_get'), value: get.display + (getAsset ? ' ' + getAsset : '') },
    { label: t('common_price'), value: giveAsset && getAsset && give.normalized !== null && get.normalized !== null
      && toBigNumber(give.normalized).isGreaterThan(0) && toBigNumber(get.normalized).isGreaterThan(0)
      ? <PriceDisplay giveAsset={giveAsset} getAsset={getAsset} giveQuantity={give.normalized} getQuantity={get.normalized} />
      : t('approval_order_card_price_unavailable') },
  ];

  if (snapshot) {
    const remainingParams = mergeParams(params, snapshot);
    const remainingGive = quantity(remainingParams, 'give_remaining', 'give_asset');
    const remainingGet = quantity(remainingParams, 'get_remaining', 'get_asset');
    const originalRaw = decimal(params.give_quantity, true);
    const remainingRaw = decimal(snapshot.give_remaining, true);
    const original = originalRaw ?? give.normalized;
    const remaining = originalRaw !== null ? remainingRaw : remainingGive.normalized;
    const fraction = original !== null && remaining !== null && toBigNumber(original).isGreaterThan(0)
      && toBigNumber(remaining).isLessThan(original)
      ? toBigNumber(original).minus(remaining).dividedBy(original).multipliedBy(100) : null;
    fields.push({
      label: t('messages_order_recorded_state'),
      value: <div className="space-y-2">
        <p>{status(snapshot.status)}</p>
        <p className="text-xs text-gray-500">{t('messages_order_snapshot_notice')}</p>
        {fraction !== null && <dl className="space-y-1 text-sm">
          <div><dt>{t('messages_order_give_remaining')}</dt><dd>{remainingGive.display} {giveAsset}</dd></div>
          {(decimal(snapshot.get_remaining, true) !== null || decimal(snapshot.get_remaining_normalized) !== null)
            && <div><dt>{t('messages_order_get_remaining')}</dt><dd>{remainingGet.display} {getAsset}</dd></div>}
          <div><dt>{t('messages_order_fill_progress')}</dt>
            <dd>{formatAmount({ value: fraction, minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</dd></div>
        </dl>}
      </div>,
    });
  }

  const expiration = decimal(params.expiration, true);
  if (expiration !== null) {
    // Core changed the meaning of expiration=0 and the height offset historically.
    // An event's recorded expire_index proves the boundary without hardcoding network gates.
    const expiry = decimal(snapshot?.expire_index, true);
    const value = expiry !== null
      ? t('messages_order_expires_after_block', [formatAmount({ value: expiry, maximumFractionDigits: 0 })])
      : snapshot?.expire_index === null && expiration === '0'
        ? t('common_never_expires')
        : toBigNumber(expiration).isGreaterThan(0)
          ? (expiration === '1' ? t('tx_action_block', ['1']) : t('tx_action_blocks', [formatAmount({ value: expiration, maximumFractionDigits: 0 })]))
          : t('tx_action_unavailable');
    fields.push({ label: t('common_expiration'), value });
  }

  for (const field of ['fee_required', 'fee_provided'] as const) {
    const fee = quantity({ ...params, fee_asset: 'BTC' }, field, 'fee_asset');
    if (fee.normalized !== null && toBigNumber(fee.normalized).isGreaterThan(0)) {
      fields.push({ label: field === 'fee_required' ? t('common_fee_required') : t('messages_order_fee_provided'), value: fee.display + ' BTC' });
    }
  }
  return fields;
}
