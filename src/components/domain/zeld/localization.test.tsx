import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { transactionErrorMessage } from '@/components/composer/transaction-error-message';
import { buildApprovalWarnings } from '@/components/domain/approval/approval-warnings';
import { CounterpartyApiError } from '@/core/errors';
import { DEFAULT_SETTINGS } from '@/core/settings';
import { t } from '@/i18n';
import { mockBrowserLocale } from '@/i18n/test-utils';
import { HuntProgress } from './hunt-progress';
import { HuntSettings } from './hunt-settings';
import { zeldReviewLine } from './zeld-field';

const updateSettings = vi.fn();
vi.mock('@/contexts/settings-context', () => ({ useSettings: () => ({ settings: DEFAULT_SETTINGS, updateSettings }) }));
afterEach(() => { cleanup(); mockBrowserLocale({ language: 'en' }); vi.clearAllMocks(); });

describe.each(['ja', 'zh-CN', 'zh-TW', 'zh-HK'])('ZELD presentation in %s', language => {
  it('translates progress without changing the clock or continue action', () => {
    mockBrowserLocale({ language });
    const onContinue = vi.fn();
    const { rerender } = render(<HuntProgress progress={{ attempts: 1, elapsedMs: 5000, seconds: 30, hashRate: 1600000, targetZeros: 6 }} onContinue={onContinue} />);
    expect(screen.getByText(t('zeld_hunt_remaining', ['25']))).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '5');
    fireEvent.click(screen.getByRole('button', { name: t('zeld_hunt_continue_without') }));
    rerender(<HuntProgress progress={{ attempts: 2, elapsedMs: 6000, seconds: 30, hashRate: 1600000, targetZeros: 6, bestZeroCount: 7 }} onContinue={onContinue} />);
    expect(screen.getByRole('status')).toHaveTextContent(t('zeld_hunt_found_searching', ['7']));
    fireEvent.click(screen.getByRole('button', { name: t('zeld_hunt_use_now') }));
    expect(onContinue).toHaveBeenCalledTimes(2);
  });

  it('keeps an invalid seconds draft and does not change saved settings', () => {
    mockBrowserLocale({ language });
    render(<HuntSettings showHelpText />);
    const input = screen.getByRole('textbox', { name: t('zeld_hunt_seconds_label') });
    fireEvent.change(input, { target: { value: '0,5' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('0,5');
    expect(screen.getByRole('alert')).toHaveTextContent(t('zeld_hunt_invalid_seconds', ['60']));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('preserves exact ZELD quantities and translates only known local errors', () => {
    mockBrowserLocale({ language });
    const send = { amount_base_units: '10000000000000001', remainder_base_units: '1', spent_outpoints: ['a:0'], change_vout: 0, recipient_vout: 1 };
    const original = { ...send };
    expect(zeldReviewLine({ send })).toContain('100,000,000.00000001');
    expect(zeldReviewLine({ send })).toContain('0.00000001');
    expect(send).toEqual(original);
    expect(transactionErrorMessage(new Error('Insufficient ZELD balance.'))).toBe(t('zeld_error_balance'));
    const error = new CounterpartyApiError('This output also holds ZELD, which would go to the destination with the assets. Detach first: the ZELD stays with you, and a new attach uses a clean output.', 'move');
    expect(transactionErrorMessage(error)).toBe(t('zeld_error_detach_first'));
    expect(error.endpoint).toBe('move');
    expect(transactionErrorMessage(new Error('unknown vendor ZELD diagnostic: 123'))).toBeUndefined();
  });

  it.each(['block', 'warning'] as const)('retains the %s decision and output count across serialized approval evidence', severity => {
    mockBrowserLocale({ language });
    const warning = { severity, code: 'zeld_would_leave' as const, data: { count: 2 }, title: 'fallback', message: 'raw evidence' };
    const items = buildApprovalWarnings({
      safetyWarnings: [JSON.parse(JSON.stringify(warning))], displayedText: [], attachedAssetDestination: null,
      structureFindings: [], signedInputsWithAssets: [], signedInputsUnknownStatus: [],
    });
    expect(items[0]).toMatchObject({
      severity: severity === 'block' ? 'danger' : 'warning', blocking: severity === 'block',
      title: severity === 'block' ? t('zeld_safety_blocked') : t('zeld_safety_warning'),
      description: severity === 'block' ? t('zeld_safety_blocked_detail', ['2']) : t('zeld_safety_warning_detail', ['2']),
    });
    expect(warning.data.count).toBe(2);
    expect(warning.message).toBe('raw evidence');
  });
});
