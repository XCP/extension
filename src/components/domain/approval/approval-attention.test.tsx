import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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

  it('focuses the exact consequence, traps tab navigation, and restores focus after Escape', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    function ApprovalWithAttention() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Review destruction</button>
          <button type="button">Background action</button>
          {open && (
            <ApprovalAttentionScreen
              title="Destroy 1 BONPARTY"
              description="Review the exact supply destruction before signing."
              items={[{
                key: 'destroy', severity: 'danger', title: 'Permanent supply destruction',
                description: 'This action is irreversible.',
              }]}
              confirmLabel="Destroy supply"
              busy={false}
              isHardware={false}
              onBack={() => setOpen(false)}
              onConfirm={onConfirm}
            />
          )}
        </>
      );
    }
    const { container } = render(<ApprovalWithAttention />);
    const trigger = screen.getByRole('button', { name: 'Review destruction' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Destroy 1 BONPARTY' });
    expect(dialog).toHaveAccessibleDescription('Review the exact supply destruction before signing.');
    expect(screen.getByText('This action is irreversible.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Destroy 1 BONPARTY' })).toHaveFocus());
    await waitFor(() => expect(container).toHaveAttribute('aria-hidden', 'true'));
    expect(container.inert).toBe(true);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Destroy supply' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Destroy supply' })).toHaveFocus();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(container.inert).toBe(false);

    // Reopening must restore the same protections and still require an explicit confirmation.
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Destroy 1 BONPARTY' })).toHaveFocus());
    expect(container.inert).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Destroy supply' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container.inert).toBe(false);
  });

  it.each([
    [false, 'Signing…'],
    [true, 'Confirm on device…'],
  ] as const)('keeps a busy signing decision open (hardware: %s)', async (isHardware, busyLabel) => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ApprovalAttentionScreen
        title="Review authorization"
        description="Confirm the reusable authorization."
        items={[items[1]!]}
        confirmLabel="Authorize offer"
        busy
        isHardware={isHardware}
        onBack={onBack}
        onConfirm={onConfirm}
      />
    );
    const back = screen.getByRole('button', { name: 'Back' });
    const confirm = screen.getByRole('button', { name: busyLabel });
    expect(back).toBeDisabled();
    expect(confirm).toBeDisabled();
    await user.click(back);
    await user.click(confirm);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Review authorization' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review authorization' })).toHaveFocus();
    expect(onBack).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
