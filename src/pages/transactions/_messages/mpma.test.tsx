import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '@/core/counterparty/api';
import { configureLocale, t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';
import { getMessageHandler } from './index';
import { mpma } from './mpma';

type Data = Record<string, unknown>;
const hash = 'a'.repeat(64);
const a = '1AAAAA11111111111111111111111111111';
const b = '1BBBBB22222222222222222222222222222';
function transaction(rows: Data[]): Transaction {
  return { tx_hash: hash, block_index: 952800, block_time: 1, source: 'source', destination: '', supported: true, confirmed: true, data: {},
    // Core's projection includes only the first entry for each asset; events remain complete.
    unpacked_data: { message_type: 'mpma_send', message_data: rows.filter((row, index) => rows.findIndex(other => other.asset === row.asset) === index) },
    events: rows.map((params, index) => ({ event_index: index, event: 'MPMA_SEND', tx_hash: hash, block_index: 952800, block_time: 1, params: { tx_hash: hash, ...params } })),
  };
}
const transfer = (asset: string, destination: string, quantity: unknown, divisible?: boolean): Data => ({
  asset, destination, quantity, ...(divisible === undefined ? {} : { asset_info: { asset, divisible } }),
});
function Details({ tx }: { tx: Transaction }) {
  useLocaleRevision();
  return <dl>{mpma(tx).map((field, index) => <div key={index}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}
const value = (tx: Transaction, label: string) => mpma(tx).find(field => field.label === label)?.value;
beforeEach(() => { configureLocale({ language: 'en', numberLocale: 'en-US' }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); configureLocale({ language: 'en' }); });

describe('complete MPMA history', () => {
  it('dispatches Core’s mpma_send message type and retains the legacy alias', () => {
    expect(getMessageHandler('mpma_send')).toBe(mpma);
    expect(getMessageHandler('mpma')).toBe(mpma);
  });
  it('uses every matching send event, not Core’s lossy unpack projection, and keeps different amounts with their destinations', () => {
    const tx = transaction([
      transfer('PEPECASH', a, '125000000', true), transfer('PEPECASH', b, '275000000', true),
      transfer('RAREPEPE', a, '2', false), transfer('RAREPEPE', b, '10', false),
    ]);
    tx.events!.push({ event_index: 999, event: 'MPMA_SEND', tx_hash: hash, block_index: 952800, block_time: 1,
      params: { tx_hash: 'other-order', ...transfer('UNRELATED', a, '999', false) } });
    const before = JSON.stringify(tx);
    render(<Details tx={tx} />);
    expect(screen.getByText('Multi-Send (2 assets to 2 addresses)')).toBeTruthy();
    expect(screen.getByText('1.25000000 PEPECASH')).toBeTruthy();
    expect(screen.getByText('2.75000000 PEPECASH')).toBeTruthy();
    expect(screen.getByText('2 RAREPEPE')).toBeTruthy();
    expect(screen.getByText('10 RAREPEPE')).toBeTruthy();
    expect(value(tx, 'Total PEPECASH Sent')).toBe('4.00000000');
    expect(value(tx, 'Total RAREPEPE Sent')).toBe('12');
    expect(screen.queryByText(/per Address|UNRELATED/)).toBeNull();
    expect(screen.getAllByTitle(a)).toHaveLength(2);
    expect(screen.getAllByTitle(b)).toHaveLength(2);
    expect(JSON.stringify(tx)).toBe(before);
  });

  it('adds numeric strings exactly above Number precision rather than concatenating or rounding', () => {
    const tx = transaction([transfer('RAREPEPE', a, '9007199254740993', false), transfer('RAREPEPE', b, '1', false)]);
    expect(value(tx, 'Total RAREPEPE Sent')).toBe('9,007,199,254,740,994');
    render(<Details tx={tx} />);
    expect(screen.getByText('9,007,199,254,740,993 RAREPEPE')).toBeTruthy();
  });

  it('only claims an equal amount per address when the exact quantities are equal', () => {
    const tx = transaction([transfer('XCP', a, '1'), transfer('XCP', b, 1)]);
    expect(value(tx, 'XCP per Address')).toBe('0.00000001');
    expect(value(tx, 'Total XCP Sent')).toBe('0.00000002');
    const unequal = transaction([transfer('XCP', a, '1'), transfer('XCP', b, '2')]);
    expect(value(unequal, 'XCP per Address')).toBeUndefined();
  });

  it('preserves legacy explicit tuples but never applies one unidentified divisibility flag to different assets', () => {
    const tx = transaction([]);
    tx.unpacked_data = { message_type: 'mpma_send', params: { asset_info: { divisible: true },
      asset_dest_quant_list: [['PEPECASH', a, '2'], ['PEPECASH', b, '3'], ['XCP', a, '100000000']], memos: ['literal $1 memo'] } };
    expect(value(tx, 'Total PEPECASH Sent')).toBe('5 (base units)');
    expect(value(tx, 'Total XCP Sent')).toBe('1.00000000');
    render(<Details tx={tx} />);
    expect(screen.getByText('Multi-Send (2 assets to 2 addresses)')).toBeTruthy();
    expect(screen.getByText('literal $1 memo')).toBeTruthy();
  });

  it('does not turn an incomplete unpack list into a false total or recipient count', () => {
    const tx = transaction([transfer('PEPECASH', a, '100000000', true)]);
    tx.events = undefined;
    render(<Details tx={tx} />);
    expect(screen.getByText(t('messages_mpma_details_unavailable'))).toBeTruthy();
    expect(screen.queryByText(/Total|1 address/)).toBeNull();
  });

  it.each([undefined, '-1', '1,000', Number.MAX_SAFE_INTEGER + 1])('keeps a malformed quantity (%s) unavailable instead of reporting a partial total', quantity => {
    const tx = transaction([transfer('RAREPEPE', a, '2', false), transfer('RAREPEPE', b, quantity, false)]);
    expect(value(tx, 'Total RAREPEPE Sent')).toBe(t('tx_action_unavailable'));
    expect(value(tx, 'RAREPEPE per Address')).toBeUndefined();
    render(<Details tx={tx} />);
    expect(screen.getByText('2 RAREPEPE')).toBeTruthy();
    expect(screen.getByText(t('tx_action_unavailable') + ' RAREPEPE')).toBeTruthy();
  });

  it.each([
    { rows: [transfer('XCP', a, '1')], expected: 'Multi-Send (1 asset to 1 address)' },
    { rows: [transfer('XCP', a, '1'), transfer('XCP', b, '1')], expected: 'Multi-Send (1 asset to 2 addresses)' },
    { rows: [transfer('XCP', a, '1'), transfer('PEPECASH', a, '1')], expected: 'Multi-Send (2 assets to 1 address)' },
    { rows: [transfer('XCP', a, '1'), transfer('PEPECASH', a, '1'), transfer('PEPECASH', b, '1')], expected: 'Multi-Send (2 assets to 2 addresses)' },
  ])('counts distinct assets and addresses across transfer entries: $expected', ({ rows, expected }) => {
    expect(value(transaction(rows), t('common_type'))).toBe(expected);
  });

  it('relocalizes complete counts and quantities without replacing raw memos, payloads, or making API calls', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const tx = transaction([
      { ...transfer('RAREPEPE', a, '1000', false), memo: 'literal $1 日本語' },
      transfer('RAREPEPE', b, '234', false), transfer('XCP', a, '100000000'),
    ]);
    const before = JSON.stringify(tx);
    render(<Details tx={tx} />);
    for (const language of ['ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const) {
      act(() => { configureLocale({ language, numberLocale: 'de-DE' }); });
      const summary = value(tx, t('common_type')) as string;
      expect(summary).not.toMatch(/\bassets?\b|\baddresses?\b/);
      expect(summary).toContain('2');
      expect(screen.getByText(summary)).toBeTruthy();
      expect(screen.getByText('1.234')).toBeTruthy();
      expect(screen.getByText(/literal \$1 日本語/)).toBeTruthy();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(tx)).toBe(before);
  });
});
