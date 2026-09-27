import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Transaction } from '@/core/counterparty/api';
import { mockBrowserLocale } from '@/i18n/__tests__/helpers/locale';
import ja from '../../../../public/_locales/ja/messages.json';
import live from './__fixtures__/live-transactions.json';
import { getMessageHandler } from './index';

/**
 * Transaction details rendered from real mainnet responses to `GET /v2/transactions/{hash}?verbose=true`,
 * the request the transaction page makes (`fetchTransaction`). Core puts a message's own fields in
 * `unpacked_data.message_data` (never `params`), and what happened as a result in `events`.
 * Fetched 2026-09-27; long descriptions are cut and `asset_info` is reduced to the fields read here.
 */
const fixtures = live as unknown as Record<string, Transaction>;

function shown(name: string | Transaction): string {
  const tx = typeof name === 'string' ? fixtures[name]! : name;
  const type = tx.unpacked_data?.message_type || tx.transaction_type!;
  const handler = getMessageHandler(type);
  expect(handler, `handler for ${type}`).toBeDefined();
  const fields = handler!(tx);
  expect(fields.length, `${tx.tx_hash} renders facts`).toBeGreaterThan(0);
  const { container } = render(
    <div>{fields.map((field, i) => <p key={i}>{field.label}: {field.value}</p>)}</div>
  );
  return container.textContent ?? '';
}

describe('transaction details from live API responses', () => {
  it('dividend: the per-unit amount at the dividend asset\'s divisibility, by its name', () => {
    const text = shown('dividend');
    expect(text).toContain('Asset: HOPEFORYOU');
    expect(text).toContain('Quantity per Unit: 1 YELLPEPE.BTCVEGAS2026 per HOPEFORYOU');
  });

  it('cancel: the order it cancelled', () => {
    const text = shown('cancel');
    expect(text).toContain('Cancelled Order TX: b20574aa8842886440ca756c39847f1b99c3f465bfb1a2207d1080a3f90deba4');
    expect(text).toContain('Cancelled Successfully');
  });

  it('btcpay: the order match and the BTC paid', () => {
    const text = shown('btcpay');
    expect(text).toContain('1815c64781174e83c4d8982563184be90bf3c9651852ce9a2f354d7fd2f07bd9_e2135fdc');
    expect(text).toContain('BTC Amount: 0.00043955 BTC');
  });

  it('broadcast: a text broadcast is not an oracle broadcast', () => {
    const text = shown('broadcast');
    expect(text).toContain('Type: General Broadcast');
    expect(text).toContain('Text: platykkan');
    expect(text).not.toContain('Oracle');
  });

  it('broadcast: an oracle broadcast shows its value and fee fraction in Core\'s units', () => {
    const tx = fixtures.broadcast!;
    const message = { ...tx.unpacked_data.message_data, value: -1, fee_fraction_int: 5_000_000 };
    const text = shown({ ...tx, unpacked_data: { ...tx.unpacked_data, message_data: message } });
    expect(text).toContain('Type: Oracle Broadcast');
    expect(text).toContain('Value: -1');
    expect(text).toContain('Fee Fraction: 5%');
  });

  it('sweep: destination, flags and memo', () => {
    const text = shown('sweep_memo');
    expect(text).toContain('Destination: 1AFUDyJEfhHffr1ejFAp3qC1gAYZ4Q6csA');
    expect(text).toContain('Flags: Include Balances');
    expect(text).toContain('Memo: recovery');
  });

  it('sweep: lists the ownership it transferred', () => {
    const text = shown('sweep_transfer');
    expect(text).toContain('Flags: Include Balances, Include Ownership');
    expect(text).toContain('A12069251163470862000: ownership');
  });

  // Core's sweep flags are 1 balances, 2 ownership, 4 binary memo (messages/sweep.py). With 4 set,
  // the memo is raw bytes and the API returns them as hex; nothing about dispensers.
  it('sweep: the binary-memo flag shows the memo as hex bytes, not as a sweep option', () => {
    const tx = fixtures.sweep_memo!;
    const message = { ...tx.unpacked_data.message_data, flags: 5, memo: 'deadbeef00' };
    const text = shown({ ...tx, unpacked_data: { ...tx.unpacked_data, message_data: message } });
    expect(text).toContain('Flags: Include Balances');
    expect(text).not.toContain('Dispenser');
    expect(text).toContain('Memo (hex): deadbeef00');
  });

  it('sweep: without the binary-memo flag a hex-looking memo is text', () => {
    const tx = fixtures.sweep_memo!;
    const message = { ...tx.unpacked_data.message_data, flags: 2, memo: 'FFFF' };
    const text = shown({ ...tx, unpacked_data: { ...tx.unpacked_data, message_data: message } });
    expect(text).toContain('Flags: Include Ownership');
    expect(text).toContain('Memo: FFFF');
    expect(text).not.toContain('(hex)');
  });

  it('attach: the amount and the UTXO it went to', () => {
    const text = shown('attach');
    expect(text).toContain('Quantity: 1 LFGXCER');
    expect(text).toContain('Destination UTXO: f6c1ab22bda26b1f4eb0dc821a4235db2c387d3140605867016280cb01c77ea0:0');
    expect(text).not.toContain('null');
  });

  it('detach: the destination and what was detached', () => {
    const text = shown('detach');
    expect(text).toContain('Destination: bc1qhqjrjdce6kvgahuvu4dv5nh29j9va2p2clkug2');
    expect(text).toContain('1 BANKRUPTPEPE');
  });

  it('dispenser: an opening shows its terms', () => {
    const text = shown('dispenser_open');
    expect(text).toContain('Status: 🟢 Open');
    expect(text).toContain('Give per Dispense: 1.00000000 XCP');
    expect(text).toContain('Price per Dispense: 0.00005949 BTC');
    expect(text).toContain('Total Escrow: 384.40972147 XCP');
  });

  it('dispenser: a close says so, without zero or missing terms', () => {
    const text = shown('dispenser');
    expect(text).toContain('Asset: XCP');
    expect(text).toContain('Status: ⚠️ Closing');
    expect(text).not.toContain('N/A');
    expect(text).not.toContain('Give per Dispense');
  });

  it('fairmint: what was minted and what it cost', () => {
    const text = shown('fairmint');
    expect(text).toContain('Asset: FAKEBANG');
    expect(text).toContain('Quantity Minted: 1,000,000.00000000 FAKEBANG');
    expect(text).toContain('XCP Paid: 10.00000000 XCP');
  });

  // Core mints the asked-for quantity, gives the fairminter's issuer a commission out of it, and
  // credits the rest (`earn_quantity`) to the minter.
  it('fairmint: what the minter received, with the commission apart', () => {
    const text = shown('fairmint_commission');
    expect(text).toContain('Quantity Minted: 1.14000000 A15794528998597699419');
    expect(text).toContain('Commission Paid: 0.06000000 A15794528998597699419');
    expect(text).toContain('XCP Paid: 2.00000000 XCP');
    expect(text).toContain('Effective Price: 1.75438596 XCP per A15794528998597699419');
    expect(text).not.toContain('1.20000000');
  });

  it('fairmint: a free mint asks for 0 and shows what the fairminter gave', () => {
    const text = shown('fairmint_free');
    expect(text).toContain('Quantity Minted: 10,555,545.00000000 A384698646958623498');
    expect(text).toContain('Commission Paid: 555,555.00000000 A384698646958623498');
    expect(text).not.toContain('XCP Paid');
  });

  it('fairmint: before a mint is recorded, what was asked for, labelled as such', () => {
    const tx = fixtures.fairmint_commission!;
    const text = shown({ ...tx, events: [] });
    expect(text).toContain('Quantity Requested: 1.20000000 A15794528998597699419');
    expect(text).not.toContain('Quantity Minted');
  });

  it('fairminter: its terms and state', () => {
    const text = shown('fairminter');
    expect(text).toContain('Asset: NODOOMING');
    expect(text).toContain('Status: ⚠️ Pending');
    expect(text).toContain('Price per Unit: 0.00001000 XCP');
    expect(text).toContain('Hard Cap: 100,000,000.00000000');
  });

  it('issuance: a new asset', () => {
    const text = shown('issuance');
    expect(text).toContain('Type: Asset Issuance');
    expect(text).toContain('Asset: PIMPE');
    expect(text).toContain('Quantity: 1');
  });

  it('issuance: a new subasset, by its long name', () => {
    const text = shown('issuance_sub');
    expect(text).toContain('Type: Subasset Creation');
    expect(text).toContain('Asset: PEPEFRENZ.SECURITY.WINKEL.DANDARK.BARRY');
    expect(text).toContain('Quantity: 21');
  });

  it('issuance: reads a creation from the event\'s asset_events alone', () => {
    const tx = fixtures.issuance_sub!;
    const text = shown({ ...tx, events: tx.events!.filter(event => event.event !== 'ASSET_CREATION') });
    expect(text).toContain('Type: Subasset Creation');
  });

  it('issuance: a supply lock', () => {
    const text = shown('issuance_lock');
    expect(text).toContain('Type: Supply Lock');
    expect(text).toContain('Supply Locked: 🔒 Yes');
  });

  it('issuance: an ownership transfer and its new owner', () => {
    const text = shown('issuance_transfer');
    expect(text).toContain('Type: Ownership Transfer');
    expect(text).toContain('Transfer To: bc1q06mlqmpfgvhrpgz2cmaedwh696hm9n0rh2x5c0');
  });

  it('issuance: a description change', () => {
    const text = shown('issuance_desc');
    expect(text).toContain('Type: Description Update');
    expect(text).toContain('Asset: RARE.PEPE');
  });

  // These already read real responses correctly; kept so a change to the shared readers shows here.
  it.each([
    ['send', '1.00000000 TESTNETPEPE'],
    ['enhanced_send', '0.00004540 FIRSTGM'],
    ['mpma', 'KAYLAGRUN'],
    ['order', 'KATYPEPE'],
    ['dispense', '24.00000000 XCP'],
    ['destroy', '1947 GRYPEPEXPRSS'],
    ['utxomove', '2 A3344466055756786903'],
  ])('%s still shows its facts', (name, expected) => {
    expect(shown(name)).toContain(expected);
  });
});

// Every value a handler writes itself is in the reader's language; only data from the chain is not.
describe("transaction details in the reader's language", () => {
  afterEach(() => mockBrowserLocale({ language: 'en' }));

  /** The Japanese catalog's text, with $1 filled in the way Chrome does. */
  const inJapanese = (key: keyof typeof ja, ...subs: string[]) =>
    ja[key].message.replace(/\$(\d)/g, (_, index: string) => subs[Number(index) - 1] ?? '');

  it.each([
    ['dividend', inJapanese('messages_dividend_amount_per', '1', 'YELLPEPE.BTCVEGAS2026', 'HOPEFORYOU')],
    ['dispenser_open', `🟢 ${inJapanese('common_open')}`],
    ['dispenser', `⚠️ ${inJapanese('dispenser_manage_dispenser_card_closing')}`],
    ['fairminter', `⚠️ ${inJapanese('messages_fairminter_status_pending')}`],
    ['fairminter', inJapanese('fairminter_payment_model_pool')],
    ['fairmint', inJapanese('fairminter_fairmint_fairmint')],
    ['issuance_lock', `🔒 ${inJapanese('tx_action_yes')}`],
    ['sweep_transfer', `A12069251163470862000: ${inJapanese('messages_sweep_ownership')}`],
  ] as const)('%s: %s', (name, expected) => {
    mockBrowserLocale({ language: 'ja' });
    expect(shown(name)).toContain(expected);
  });

  it.each(Object.keys(fixtures))('%s: no English left in the values', (name) => {
    mockBrowserLocale({ language: 'ja' });
    expect(shown(name)).not.toMatch(/\b(?:per|Open|Closed|Closing|Pending|Unknown|Yes|No|N\/A|Fairmint|ownership|Fee)\b/);
  });
});
