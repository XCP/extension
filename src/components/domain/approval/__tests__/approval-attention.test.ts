import { afterEach, describe, expect, it } from 'vitest';
import type { WarningItem } from '@/components/ui/warning-stack';
import { mockBrowserLocale } from '@/i18n/test-utils';
import { highFeeAttentionItem, withPolicyAcknowledgement } from '../approval-attention';

const highFee: WarningItem = { key: 'high-fee', severity: 'warning', title: 'High fee' };

describe('withPolicyAcknowledgement', () => {
  it('adds a review step when the policy requires one and the screen found nothing to show', () => {
    const items = withPolicyAcknowledgement([], true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'policy-acknowledgement', severity: 'warning' });
  });

  it("keeps the screen's own items when it has something to show", () => {
    expect(withPolicyAcknowledgement([highFee], true)).toEqual([highFee]);
  });

  it('adds nothing when the policy does not require acknowledgement', () => {
    expect(withPolicyAcknowledgement([], false)).toEqual([]);
    expect(withPolicyAcknowledgement([], undefined)).toEqual([]);
  });
});

describe('highFeeAttentionItem', () => {
  afterEach(() => mockBrowserLocale({ language: 'en' }));

  it('states the fee and its rate as one sentence', () => {
    expect(highFeeAttentionItem(12_000, 400).description)
      .toBe('This transaction pays 12,000 sats (about 30 sat/vB). Confirm that this fee is intentional.');
  });

  it('leaves the rate out when the size is unknown', () => {
    expect(highFeeAttentionItem(12_000).description)
      .toBe('This transaction pays 12,000 sats. Confirm that this fee is intentional.');
    expect(highFeeAttentionItem(12_000, 0).description)
      .toBe('This transaction pays 12,000 sats. Confirm that this fee is intentional.');
  });

  it("uses the language's own punctuation, not an English full stop", () => {
    mockBrowserLocale({ language: 'ja' });
    const ja = highFeeAttentionItem(12_000, 400).description as string;
    expect(ja).toContain('（約 30 sat/vB）');
    expect(ja).not.toMatch(/\. /);
    mockBrowserLocale({ language: 'zh-CN' });
    const zh = highFeeAttentionItem(12_000, 400).description as string;
    expect(zh).toContain('（约 30 sat/vB）。');
    expect(zh).not.toMatch(/\. /);
  });
});
