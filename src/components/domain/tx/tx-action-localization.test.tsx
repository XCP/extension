import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApprovalSummaryCard } from '@/components/domain/approval/approval-summary-card';
import type { MoneyMovement } from '@/components/domain/approval/money-movement';
import { describeMessage, protocolFields } from '@/core/counterparty/describe';
import { configureLocale, t } from '@/i18n';
import { getTxActionInfo } from './tx-action-info';

const address = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const rawQuantity = 18446744073709551615n;
const locales = ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
const movement: MoneyMovement = {
  spent: 1000, backToYou: 0, atRisk: 0, external: [], fee: 1000, net: -1000, incomplete: false,
};

const decoded = (messageType: string, data: Record<string, unknown>, messageData?: Record<string, unknown>) => ({
  verification: { localUnpack: { success: true, messageType, data } },
  ...(messageData ? { counterpartyMessage: { messageType, messageData, description: 'Unmerged API prose must not replace local fields' } } : {}),
}) as never;

afterEach(() => {
  cleanup();
  configureLocale({ language: 'en', numberLocale: 'auto' });
});

describe.each(locales)('localized Counterparty approval: %s', (language) => {
  it('keeps the complete structured destination separate from translated grammar and exact uint64 quantities', () => {
    configureLocale({ language, numberLocale: 'en' });
    const info = getTxActionInfo(decoded('enhanced_send', {
      asset: 'RAREPEPE', quantity: rawQuantity, destination: address,
    }, { asset: 0, asset_info: { divisible: true } }));
    expect(info?.presentation?.address).toBe(address);
    expect(info?.presentation?.headline).toBe(t('tx_action_send_amount', ['184467440737.09551615', 'RAREPEPE']));
    expect(info?.presentation?.headline).not.toContain(address);
    expect(info?.description).toBe(t('tx_action_send_amount_to', ['184467440737.09551615', 'RAREPEPE', address]));
    render(<ApprovalSummaryCard txAction={info} movement={movement} hasHighFee={false} hideMovement protocolFeeXcp={null} />);
    expect(screen.getByText(info!.presentation!.headline)).toBeTruthy();
    expect(screen.getByText(address, { exact: true })).toBeTruthy();
  });

  it('keeps each pool leg in its own known units and withholds ratios when a unit is unknown', () => {
    configureLocale({ language, numberLocale: 'en' });
    const data = { assetA: 'XCP', quantityA: 9999999999999999n, assetB: 'RAREPEPE', quantityB: rawQuantity, minLpQuantity: 123n };
    const info = getTxActionInfo(decoded('pooldeposit', data, {
      asset_a: 'XCP', asset_a_info: { divisible: true }, asset_b: 0, asset_b_info: { divisible: false },
    }));
    expect(info?.protocol.filter(field => field.label === t('tx_action_deposit')).map(field => field.value))
      .toEqual(['99999999.99999999 XCP', '18,446,744,073,709,551,615 RAREPEPE']);
    expect(info?.protocol.find(field => field.label === t('tx_action_min_lp_received'))?.value).toBe('0.00000123 LP');
    const unknown = getTxActionInfo(decoded('pooldeposit', data));
    expect(unknown?.protocol.find(field => field.label === t('tx_action_ratio'))).toBeUndefined();
    expect(unknown?.protocol.filter(field => field.label === t('tx_action_deposit')).map(field => field.value))
      .toContain(`${t('tx_action_base_units', ['18,446,744,073,709,551,615'])} RAREPEPE`);
  });

  it('translates only the memo label and supply consequences, preserving payload bytes and user text', () => {
    configureLocale({ language, numberLocale: 'en' });
    const info = getTxActionInfo(decoded('enhanced_send', {
      asset: 'XCP', quantity: 1n, destination: address,
      memoBytes: new Uint8Array([0, 255, 36, 49]), memoIsBinary: true, memo: 'untrusted replacement',
    }));
    expect(info?.protocol).toContainEqual({
      label: t('tx_action_hex_label', [t('tx_action_memo')]), value: '00ff2431', kind: 'identifier',
    });
    const text = 'No limit $1 <script>CounterWallet / FreeWallet</script> 日本語';
    const issuance = getTxActionInfo(decoded('issuance', {
      asset: 'PEPECASH', quantity: 1n, divisible: false, lock: true, reset: true, description: text, destination: address,
    }));
    expect(issuance?.protocol).toContainEqual({ label: t('tx_action_description'), value: text, kind: 'paragraph' });
    expect(issuance?.protocol).toContainEqual({ label: t('tx_action_new_owner'), value: address, kind: 'address' });
    expect(issuance?.protocol).toContainEqual({ label: t('tx_action_lock'), value: t('tx_action_lock_consequence'), kind: 'paragraph' });
    expect(issuance?.protocol).toContainEqual({ label: t('tx_action_reset'), value: t('tx_action_reset_consequence'), kind: 'paragraph' });
    expect(getTxActionInfo(decoded('broadcast', { text }))?.presentation?.headline).toBe(text);
  });

  it('states the dividend rate without inventing a recipient total, and preserves unknown fee status', () => {
    configureLocale({ language, numberLocale: 'en' });
    const info = getTxActionInfo(decoded('dividend', { asset: 'BONPARTY', dividendAsset: 'XCP', quantityPerUnit: 1n }));
    expect(info?.presentation?.headline).toBe(t('tx_action_per_unit', ['0.00000001', 'XCP']));
    expect(info?.presentation?.subline).toBe(t('tx_action_all_holders', ['BONPARTY']));
    expect(info?.protocol).toEqual([]);
    render(<ApprovalSummaryCard txAction={info} movement={movement} hasHighFee={false} hideMovement protocolFeeXcp={Number.MAX_SAFE_INTEGER + 1} />);
    expect(screen.getByText(t('tx_action_unavailable'), { exact: true })).toBeTruthy();
    expect(screen.queryByText('0.00000000 XCP', { exact: true })).toBeNull();
  });

  it('uses address counts for MPMA without changing recipient records', () => {
    configureLocale({ language, numberLocale: 'en' });
    for (const count of [1, 23, 69]) {
      const sends = Array.from({ length: count }, () => ({ asset: 'XCP', quantity: 1n, destination: address }));
      const source = decoded('mpma_send', { sends });
      const info = getTxActionInfo(source);
      expect(info?.presentation?.headline).toBe(t(count === 1 ? 'tx_action_send_one_recipient' : 'tx_action_send_recipients', [String(count)]));
      expect(sends.every(send => send.quantity === 1n && send.destination === address)).toBe(true);
    }
  });
});

describe('presentation boundary', () => {
  it('relocalizes the same decoded action on rerender, without caching text in the decoded result', () => {
    const source = decoded('detach', { destination: address });
    configureLocale({ language: 'en' });
    const first = getTxActionInfo(source);
    configureLocale({ language: 'ja' });
    const second = getTxActionInfo(source);
    expect(first?.presentation?.headline).toBe('Detach all assets from UTXO');
    expect(second?.presentation?.headline).toBe('UTXOからすべてのアセットを切り離す');
    expect(first?.presentation?.address).toBe(second?.presentation?.address);
    expect(second?.description).toContain(address);
  });

  it('leaves core/history English by default and unknown API-only descriptions untouched', () => {
    configureLocale({ language: 'ja' });
    const view = { asset: 'XCP', quantity: 1n, destination: address, format: () => '0.00000001' };
    expect(describeMessage('send', view)).toBe(`Send 0.00000001 XCP to ${address}`);
    expect(describeMessage('future_message', view)).toBeNull();
    const apiOnly = getTxActionInfo({ counterpartyMessage: { messageType: 'future_message', description: 'Unknown $1 identifier', messageData: {} } } as never);
    expect(apiOnly).toEqual({ label: 'Future Message', description: 'Unknown $1 identifier', protocol: [] });
  });

  it('never offers user payload values to a localizer', () => {
    const raw = 'No limit $1 <b>CounterWallet</b>';
    const seen: string[] = [];
    const localize = (source: string) => { seen.push(source); return source; };
    const result = protocolFields('issuance', { asset: 'PEPECASH', text: raw, destination: address, format: String }, {}, localize);
    expect(result).toContainEqual({ label: 'Description', value: raw, kind: 'paragraph' });
    expect(seen).not.toContain(raw);
    expect(seen).not.toContain(address);
  });
});
