import { describe, expect, it } from 'vitest';
import type { WarningItem } from '@/components/ui/warning-stack';
import { withPolicyAcknowledgement } from '../approval-attention';

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
