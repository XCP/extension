/**
 * Print what each approval screen says: the headline, and the protocol detail list beneath it.
 *
 * Generated from `describe.ts` rather than written by hand, so it cannot drift from the screens.
 * The rule it exists to check is that no detail row repeats what the headline already said — the
 * headline is the one line someone reads, and a detail list that restates it wastes the space
 * where the protocol facts should be.
 *
 * Run: npx tsx scripts/approval-matrix.ts
 */

import { describeMessage, labelFor, protocolFields } from '../src/core/counterparty/describe';
import type { DescribableMessage, ProtocolContext } from '../src/core/counterparty/describe';

/** Representative values, chosen so every branch of a case produces output. */
const SAMPLE: Omit<DescribableMessage, 'format'> = {
  asset: 'PEPECASH',
  quantity: 100_000_000,
  destination: '1QLbz7JHiBTspS962RLKV8GndWFwi5j6Qr',
  memo: 'invoice 42',
  giveAsset: 'XCP',
  giveQuantity: 250_000_000,
  getAsset: 'PEPECASH',
  getQuantity: 500_000_000,
  expiration: 1000,
  escrowQuantity: 1_000_000_000,
  mainchainrate: 10_000,
  dividendAsset: 'XCP',
  quantityPerUnit: 10_000_000,
  offerHash: 'e'.repeat(64),
  text: 'A description of the asset',
  assetA: 'XCP',
  quantityA: 100_000_000,
  assetB: 'PEPECASH',
  quantityB: 200_000_000,
  recipientCount: 3,
  destinationVout: 1,
  mimeType: 'image/png',
  value: 42,
  feeFractionInt: 5_000_000,
  subassetLongname: 'PEPECASH.RARE',
  sweepBalances: true,
  sweepOwnership: true,
  divisible: true,
  lock: true,
  reset: false,
  sourceUtxo: `${'f'.repeat(64)}:0`,
  feeRequired: 10_000,
  lpAsset: 'XCPPEPE',
  recipients: [
    { asset: 'PEPECASH', destination: '1QLbz7JHiBTspS962RLKV8GndWFwi5j6Qr', quantity: 100_000_000 },
    { asset: 'XCP', destination: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT', quantity: 50_000_000 },
  ],
};

const CONTEXT: ProtocolContext = {
  cancelledOrder: {
    giveQuantity: '100',
    giveAsset: 'PEPECASH',
    getQuantity: '2.5',
    getAsset: 'XCP',
  },
  assetSupply: '1,000,000',
  dividendTotal: '100,000',
  dividendFeeXcp: '0.04',
  transactionId: 'a'.repeat(64),
  protocolFeeXcp: '0.5',
  detachingAssets: ['1.5 PEPECASH', '10 XCP'],
  btcpayBlocksLeft: 14,
  dispensePayouts: ['5 PEPECASH', '2 RAREPEPE'],
};

const TYPES = [
  'send',
  'enhanced_send',
  'mpma_send',
  'order',
  'cancel',
  'btcpay',
  'dispenser',
  'dispense',
  'issuance',
  'subasset_issuance',
  'lr_issuance',
  'lr_subasset',
  'dividend',
  'sweep',
  'broadcast',
  'fairminter',
  'fairmint',
  'pooldeposit',
  'poolwithdraw',
  'attach',
  'detach',
  'utxo',
  'destroy',
];

const view: DescribableMessage = {
  ...SAMPLE,
  format: (quantity, asset) => {
    if (quantity == null) return '?';
    const divisible = asset !== 'PEPECASH';
    return divisible
      ? (Number(quantity) / 1e8).toFixed(8)
      : Number(quantity).toLocaleString();
  },
  name: (asset) => asset ?? '',
};

const rows: string[] = [];
const repeats: string[] = [];

for (const type of TYPES) {
  const cancelView = type === 'cancel'
    ? { ...view, cancelledOrderSummary: 'sell 100 PEPECASH for 2.5 XCP' }
    : view;
  const headline = describeMessage(type, cancelView);
  const fields = protocolFields(type, cancelView, CONTEXT);

  rows.push(`| \`${type}\` | ${labelFor(type)} | ${headline ?? '—'} | ${
    fields.length === 0 ? '—' : fields.map((f) => `**${f.label}:** ${f.value}`).join('<br>')
  } |`);

  // The rule, checked mechanically: a detail value must not already be in the headline.
  for (const field of fields) {
    if (headline && field.value.length > 3 && headline.includes(field.value)) {
      repeats.push(`${type}: "${field.label}: ${field.value}" is already in the headline`);
    }
  }
}

console.log('| Type | Label | Headline (bold line) | Counterparty Details |');
console.log('| --- | --- | --- | --- |');
console.log(rows.join('\n'));

if (repeats.length > 0) {
  console.log('\n## Details repeating the headline\n');
  console.log(repeats.map((r) => `- ${r}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nNo detail row repeats its headline.');
}
