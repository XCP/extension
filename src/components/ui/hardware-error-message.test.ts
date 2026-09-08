import { afterEach, describe, expect, it } from 'vitest';
import { transactionErrorMessage } from '@/components/composer/transaction-error-message';
import { providerReviewErrorMessage } from '@/components/domain/approval/provider-review-error';
import { hardwareErrorMetadata, parseHardwareErrorMetadata, withHardwareErrorMetadata } from '@/core/hardware/errorMetadata';
import { HardwareWalletError } from '@/core/hardware/types';
import { withProviderReviewCode } from '@/core/providerReviewErrors';
import { ProviderError } from '@/core/rpcErrors';
import { configureLocale, t } from '@/i18n';
import { hardwareErrorMessage } from './hardware-error-message';

afterEach(() => configureLocale({}));

describe('hardware error presentation', () => {
  it.each(['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])('translates live local and transported diagnostics in %s without changing evidence', language => {
    const local = new HardwareWalletError('Device disconnected: exact device evidence', 'DEVICE_DISCONNECTED', 'trezor', 'Existing English hint');
    const received = withHardwareErrorMetadata(new Error(local.message), { code: local.code, vendor: local.vendor });
    configureLocale({ language });
    for (const error of [local, received]) {
      expect(hardwareErrorMessage(error)).toBe(t('hardware_error_disconnected'));
      expect(transactionErrorMessage(error)).toBe(t('hardware_error_disconnected'));
      expect(providerReviewErrorMessage(error)).toBe(t('hardware_error_disconnected'));
      expect(error.message).toBe('Device disconnected: exact device evidence');
    }
    expect(local.code).toBe('DEVICE_DISCONNECTED');
    expect(local.userMessage).toBe('Existing English hint');
    expect(hardwareErrorMetadata(received)).toEqual({ vendor: 'trezor', code: 'DEVICE_DISCONNECTED' });
  });

  it.each(['INVALID_PSBT', 'UNSUPPORTED_SIGHASH', 'SIGN_MESSAGE_FAILED', 'Failure_DataError'])('retains exact %s evidence rather than guessing a diagnosis', code => {
    const error = new HardwareWalletError('input 7 / P2TR / 0x83 / bc1pEXACT', code, 'trezor', 'Generic English hint');
    configureLocale({ language: 'ja' });
    expect(hardwareErrorMessage(error)).toBeUndefined();
    expect(transactionErrorMessage(error)).toBeUndefined();
    expect(providerReviewErrorMessage(error)).toBe(error.message);
  });

  it('does not infer device guidance from arbitrary English or a different vendor', () => {
    expect(hardwareErrorMessage(new Error('Trezor P2TR cancelled'))).toBeUndefined();
    expect(hardwareErrorMessage(new HardwareWalletError('vendor raw', 'DEVICE_BUSY', 'ledger'))).toBeUndefined();
  });

  it('distinguishes the exact Taproot message-signing restriction from firmware age', () => {
    const error = new HardwareWalletError('original P2TR diagnostic', 'TAPROOT_SIGNING_NOT_SUPPORTED', 'trezor');
    configureLocale({ language: 'ja' });
    const displayed = hardwareErrorMessage(error);
    expect(displayed).toBe(t('hardware_error_taproot_message', [t('address_type_native_segwit')]));
    expect(displayed).toContain('P2TR');
    expect(displayed).not.toContain('firmware');
    expect(error.message).toBe('original P2TR diagnostic');
  });

  it('preserves the numeric RPC code and gives authorization errors priority', () => {
    const error = withHardwareErrorMetadata(withProviderReviewCode(new ProviderError(4100, 'unchanged auth evidence'), 'identity_changed'), {
      vendor: 'trezor', code: 'DEVICE_BUSY',
    });
    expect(providerReviewErrorMessage(error)).toBe(t('provider_review_identity_changed'));
    expect(error.code).toBe(4100);
    expect(error.message).toBe('unchanged auth evidence');
  });

  it.each([null, [], {}, { vendor: 'unknown', code: 'DEVICE_BUSY' }, { vendor: 'trezor', code: 4100 },
    { vendor: 'trezor', code: '' }, { vendor: 'trezor', code: 'a'.repeat(129) },
    { vendor: 'trezor', code: 'DEVICE_BUSY\n<script>' }])('ignores malformed metadata %j', metadata => {
    expect(parseHardwareErrorMetadata(metadata)).toBeUndefined();
  });

  it('drops arbitrary metadata fields including captured user messages', () => {
    expect(parseHardwareErrorMetadata({ vendor: 'trezor', code: 'DEVICE_BUSY', userMessage: 'cached English', amount: 9007199254740993n }))
      .toEqual({ vendor: 'trezor', code: 'DEVICE_BUSY' });
  });
});
