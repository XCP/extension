import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WarningItem } from '@/components/ui/warning-stack';
import {
  ApprovalAttentionScreen,
  highFeeAttentionItem,
  partitionApprovalItems,
  verificationAttentionItem,
} from './approval-attention';

vi.mock('@/components/icons', () => ({
  FiAlertTriangle: (props: any) => <span {...props} />,
  FiChevronDown: (props: any) => <span {...props} />,
  FiInfo: (props: any) => <span {...props} />,
}));

const items: WarningItem[] = [
  { key: 'routine', severity: 'info', title: 'Other inputs may be added' },
  { key: 'scope', severity: 'warning', title: 'Authorization remains valid' },
  { key: 'loss', severity: 'danger', title: 'BTC is not guaranteed back' },
];

describe('approval attention presentation', () => {
  it('keeps only decision friction, dropping routine information entirely', () => {
    expect(partitionApprovalItems(items)).toEqual({
      attention: [items[1], items[2]],
    });
  });

  it('requires a separate action-specific confirmation', () => {
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ApprovalAttentionScreen
        title="Review authorization"
        description="Confirm the reusable authorization."
        items={[items[1]!]}
        confirmLabel="Authorize offer"
        busy={false}
        isHardware={false}
        onBack={onBack}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Authorization remains valid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize offer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('uses shared, quantified copy for provider exceptions', () => {
    expect(highFeeAttentionItem(120_000, 200)).toMatchObject({
      title: 'Unusually high network fee',
      description: expect.stringContaining('600 sat/vB'),
    });
    expect(verificationAttentionItem('Quantity differs')).toMatchObject({
      title: expect.stringMatching(/could not reproduce/i),
      description: expect.stringContaining('Quantity differs'),
    });
  });
});
