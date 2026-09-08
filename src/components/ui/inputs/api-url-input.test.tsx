import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiValidation from '@/core/validation/api';
import { configureLocale, t } from '@/i18n';
import { ApiUrlInput } from './api-url-input';

const captured = vi.hoisted(() => ({ blur: null as Promise<unknown> | null }));

// Capture a rejected async blur handler so the test can assert that the original save error
// propagates. A normal React event does not await that promise and would report it as unhandled.
vi.mock('@headlessui/react', () => ({
  Input: ({ onBlur, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} onBlur={(event) => {
      captured.blur = Promise.resolve(onBlur?.(event));
      void captured.blur.catch(() => {});
    }} />
  ),
}));

const URL_VALUE = 'https://custom.example.com';
const originalFetch = global.fetch;

function renderInput(onValidationSuccess = vi.fn(async () => {})) {
  const onChange = vi.fn();
  const result = render(<ApiUrlInput value={URL_VALUE} onChange={onChange} onValidationSuccess={onValidationSuccess} />);
  return { ...result, onChange, onValidationSuccess, input: screen.getByRole('textbox') };
}

describe('ApiUrlInput localized validation', () => {
  beforeEach(() => {
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    captured.blur = null;
  });

  afterEach(() => {
    cleanup();
    configureLocale({ language: 'en', numberLocale: 'en-US' });
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('translates a stored HTTP failure in every language without validation, save or draft changes', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const { input, onChange, onValidationSuccess } = renderInput();
    fireEvent.blur(input);
    await screen.findByText('❌ API returned error: 429');

    for (const [language, expected] of [
      ['ja', 'APIエラー：429'],
      ['zh-CN', 'API 返回错误：429'],
      ['zh-TW', 'API 回傳錯誤：429'],
      ['zh-HK', 'API 返回錯誤：429'],
      ['en', 'API returned error: 429'],
    ] as const) {
      act(() => { configureLocale({ language, numberLocale: 'de-DE' }); });
      expect(screen.getByText(`❌ ${expected}`)).toBeInTheDocument();
      expect(input).toHaveAccessibleName(t('inputs_api_url_input_api_url'));
      expect(input).toHaveValue(URL_VALUE);
      expect(input).toBeEnabled();
      expect(global.fetch).toHaveBeenCalledExactlyOnceWith(`${URL_VALUE}/v2`, expect.any(Object));
      expect(onChange).not.toHaveBeenCalled();
      expect(onValidationSuccess).not.toHaveBeenCalled();
    }
  });

  it('keeps the minimum Core version literal while translating an existing rejection', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: { server_ready: true, network: 'mainnet', version: '11.2.9' } }),
    });
    const { input, onValidationSuccess } = renderInput();
    fireEvent.blur(input);
    await screen.findByText('❌ API must be Counterparty Core 11.3.0 or newer');
    act(() => { configureLocale({ language: 'zh-CN', numberLocale: 'de-DE' }); });
    expect(screen.getByText('❌ API 必须为 Counterparty Core 11.3.0 或更新版本')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onValidationSuccess).not.toHaveBeenCalled();
  });

  it('translates a malformed URL draft without a network request or rewriting its contents', async () => {
    global.fetch = vi.fn();
    const { input, onChange } = renderInput();
    fireEvent.change(input, { target: { value: 'not a URL' } });
    fireEvent.blur(input);
    await screen.findByText('❌ Invalid URL format');
    act(() => { configureLocale({ language: 'ja' }); });
    expect(screen.getByText('❌ URLの形式が正しくありません')).toBeInTheDocument();
    expect(input).toHaveValue('not a URL');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps an unknown diagnostic exactly as supplied across language changes', async () => {
    const error = 'Gateway NODE_A rejected the configured path: /v2';
    const validate = vi.spyOn(apiValidation, 'validateCounterpartyApi').mockResolvedValueOnce({ isValid: false, error });
    const { input, onValidationSuccess } = renderInput();
    fireEvent.blur(input);
    await screen.findByText(`❌ ${error}`);
    act(() => { configureLocale({ language: 'zh-TW' }); });
    expect(screen.getByText(`❌ ${error}`)).toBeInTheDocument();
    expect(validate).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
    expect(onValidationSuccess).not.toHaveBeenCalled();
  });

  it('translates an in-flight local message without starting a second validation or premature save', async () => {
    let resolveRead!: (response: { ok: boolean; status: number }) => void;
    global.fetch = vi.fn(() => new Promise((resolve) => { resolveRead = resolve; })) as typeof fetch;
    const { input, onValidationSuccess } = renderInput();
    fireEvent.blur(input);
    expect(input).toBeDisabled();
    act(() => { configureLocale({ language: 'ja' }); });
    expect(screen.getByText(t('inputs_api_url_input_validating_api_endpoint'))).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onValidationSuccess).not.toHaveBeenCalled();
    await act(async () => { resolveRead({ ok: false, status: 503 }); });
    expect(input).toBeEnabled();
    expect(screen.getByText('❌ APIエラー：503')).toBeInTheDocument();
  });

  it('restores the input after a caller save failure while preserving that exact rejection', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: { server_ready: true, network: 'mainnet', version: '11.3.0' } }),
    });
    const failure = new Error('Unable to persist settings: quota 17');
    const onValidationSuccess = vi.fn().mockRejectedValueOnce(failure);
    const { input, onChange } = renderInput(onValidationSuccess);
    fireEvent.blur(input);
    await act(async () => { await expect(captured.blur).rejects.toBe(failure); });
    await waitFor(() => { expect(input).toBeEnabled(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(t('inputs_api_url_input_api_endpoint_validated_and_saved'))).not.toBeInTheDocument();
    act(() => { configureLocale({ language: 'zh-CN' }); });
    expect(input).toHaveValue(URL_VALUE);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onValidationSuccess).toHaveBeenCalledExactlyOnceWith(URL_VALUE);
  });
});
