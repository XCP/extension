import { describe, expect, it } from 'vitest';
import {
  analyzeMarketplaceBatch,
  parseMarketplaceBatchIntents,
} from '@/core/counterparty/marketplaceBatch';
import type {
  MarketplaceApprovalReview,
  PrepareBulkFanoutIntentClaim,
} from '@/core/counterparty/marketplaceIntent';

const SELLER = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const fanout = (batchIndex: number): PrepareBulkFanoutIntentClaim => ({
  standard: 'counterparty-marketplace',
  version: 1,
  action: 'prepare_bulk_fanout',
  operationId: 'bulk-1',
  protocolVersion: 'counterparty_bulk_attach_v1',
  assets: [],
  batchIndex,
  seller: SELLER,
  fundingOutpoint: { txid: (batchIndex === 0 ? '11' : '12').repeat(32), vout: batchIndex },
  fundingValueSats: 100_000,
  slotCount: 2,
  slotValueSats: 10_000,
  networkFeeSats: 1_000,
  changeSats: 79_000,
  expectedTxid: (batchIndex === 0 ? '21' : '22').repeat(32),
  operationExpiresAt: 2_000_000_000,
});

const proved = (overrides: Partial<MarketplaceApprovalReview> = {}): MarketplaceApprovalReview => ({
  status: 'proved',
  family: 'prepare_bulk_fanout',
  title: 'Prepare funding slots',
  facts: [],
  notices: [],
  blockers: [],
  ...overrides,
});

describe('homogeneous marketplace batch parser', () => {
  it('accepts ordered independent fan-out parents for one operation', () => {
    expect(parseMarketplaceBatchIntents([fanout(0), fanout(1)])).toEqual({
      kind: 'bulk-fanout',
      intents: [fanout(0), fanout(1)],
    });
  });

  it.each([
    ['empty', []],
    ['mixed actions', [fanout(0), { ...fanout(1), action: 'attach_for_listing' }]],
    ['different operation', [fanout(0), { ...fanout(1), operationId: 'bulk-2' }]],
    ['wrong order', [fanout(1), fanout(0)]],
    ['duplicate funding', [fanout(0), { ...fanout(1), fundingOutpoint: fanout(0).fundingOutpoint }]],
  ])('refuses a %s batch', (_label, intents) => {
    expect(() => parseMarketplaceBatchIntents(intents)).toThrow();
  });
});

describe('marketplace batch aggregate proof', () => {
  it('shows exact aggregate slot and fee totals', () => {
    const intents = [fanout(0), fanout(1)];
    const review = analyzeMarketplaceBatch('bulk-fanout', intents, [proved(), proved()]);

    expect(review).toMatchObject({
      status: 'proved',
      family: 'marketplace_batch',
      blockers: [],
    });
    expect(review.facts).toContainEqual({ label: 'Attach slots', value: '4' });
    expect(review.facts).toContainEqual({ label: 'Total network fees', value: '2,000 sats' });
  });

  it.each([
    ['caution', proved({ status: 'caution' })],
    ['retry', proved({ status: 'retry', blockers: ['lookup failed'] })],
    ['blocked', proved({ status: 'blocked', blockers: ['output changed'] })],
  ] as const)('never weakens an item-level %s result', (status, secondReview) => {
    const review = analyzeMarketplaceBatch(
      'bulk-fanout',
      [fanout(0), fanout(1)],
      [proved(), secondReview],
    );
    expect(review.status).toBe(status);
    if (status === 'retry' || status === 'blocked') {
      expect(review.blockers[0]).toMatch(/item 2/i);
    }
  });
});
