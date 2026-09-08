import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import { configureLocale, t } from '@/i18n';
import OnboardingPage from '../onboarding';
import ImportPrivateKeyPage from '../setup/import-private-key';
import UnlockPage from '../unlock';

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  header: vi.fn(),
  unlock: vi.fn(),
  verify: vi.fn(),
  createPrivateKey: vi.fn(),
}));
vi.mock('react-router', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/contexts/header-context', () => ({ useHeader: () => ({ setHeaderProps: fixture.header }) }));
vi.mock('@/contexts/wallet-context', () => ({ useWallet: () => ({
  unlockKeychain: fixture.unlock,
  verifyPassword: fixture.verify,
  createPrivateKeyWallet: fixture.createPrivateKey,
}) }));
vi.mock('@/platform/version', () => ({ getDisplayVersion: () => 'test-version' }));
vi.mock('@/platform/fathom', () => ({ analytics: { track: vi.fn() } }));

const languages = ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.verify.mockResolvedValue(true);
  fixture.createPrivateKey.mockResolvedValue(undefined);
  configureLocale({ language: 'en', numberLocale: 'de-DE' });
});
afterEach(() => {
  cleanup();
  configureLocale({ language: 'en', numberLocale: 'auto' });
});

describe('onboarding and unlock localization', () => {
  it('renders complete natural legal sentences around the same two links', () => {
    render(<OnboardingPage />);
    const terms = screen.getByRole('link', { name: 'Terms of Service' });
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' });
    const sentence = terms.parentElement!;
    const expected = {
      en: 'By continuing you agree to our Terms of Service and Privacy Policy.',
      ja: '続行すると、利用規約およびプライバシーポリシーに同意したものとみなされます。',
      'zh-CN': '继续即表示你同意我们的服务条款和隐私政策。',
      'zh-TW': '繼續即表示你同意我們的服務條款及隱私政策。',
      'zh-HK': '繼續即表示你同意我們的服務條款及隱私政策。',
    };
    for (const language of languages) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      expect(sentence.textContent).toBe(expected[language]);
      expect(screen.getByRole('link', { name: t('common_terms_of_service') })).toBe(terms);
      expect(screen.getByRole('link', { name: t('common_privacy_policy') })).toBe(privacy);
      expect(terms).toHaveAttribute('href', 'https://www.xcp.io/terms');
      expect(privacy).toHaveAttribute('href', 'https://www.xcp.io/privacy');
      for (const link of [terms, privacy]) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
      expect(sentence.querySelectorAll('a')).toHaveLength(2);
    }
    fireEvent.click(screen.getByRole('button', { name: t('keychain_onboarding_create_wallet') }));
    expect(fixture.navigate).toHaveBeenLastCalledWith('/keychain/setup/create-mnemonic');
    fireEvent.click(screen.getByRole('button', { name: t('keychain_onboarding_import_wallet') }));
    expect(fixture.navigate).toHaveBeenLastCalledWith('/keychain/setup/import-mnemonic');
  });

  it('updates idle and pending unlock labels without editing or submitting the password draft', async () => {
    let finishUnlock!: () => void;
    fixture.unlock.mockImplementation(() => new Promise<void>(resolve => { finishUnlock = resolve; }));
    render(<UnlockPage />);
    const button = screen.getByRole('button', { name: 'Unlock' });
    const input = screen.getByPlaceholderText(t('common_enter_your_password'));
    expect(button).toBeDisabled();
    const password = '  KeepMyExactPassword123!  ';
    fireEvent.change(input, { target: { value: password } });
    for (const language of languages) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      expect(screen.getByRole('button', { name: t('keychain_unlock_unlock') })).toBe(button);
      expect(button).toHaveTextContent(t('keychain_unlock_unlock'));
      expect(button).toBeEnabled();
      expect(screen.getByPlaceholderText(t('common_enter_your_password'))).toBe(input);
      expect(input).toHaveValue(password);
      expect(fixture.unlock).not.toHaveBeenCalled();
    }
    fireEvent.click(button);
    expect(fixture.unlock).toHaveBeenCalledExactlyOnceWith(password);
    act(() => configureLocale({ language: 'ja', numberLocale: 'de-DE' }));
    expect(screen.getByRole('button', { name: t('keychain_unlock_unlocking') })).toBe(button);
    expect(button).toBeDisabled();
    expect(input).toHaveValue(password);
    await act(async () => { finishUnlock(); });
    await waitFor(() => expect(fixture.navigate).toHaveBeenCalledWith('/index'));
    expect(input).toHaveValue('');
  });

  it('retains local password validation and the original rate-limit diagnostic', async () => {
    configureLocale({ language: 'ja' });
    const rateLimit = 'Too many password attempts. Try again in 30 seconds.';
    fixture.unlock.mockRejectedValueOnce(new Error(rateLimit));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<UnlockPage />);
      const input = screen.getByPlaceholderText(t('common_enter_your_password'));
      fireEvent.submit(input.closest('form')!);
      expect(screen.getByRole('alert')).toHaveTextContent(t('common_password_cannot_be_empty'));
      expect(fixture.unlock).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: 'ValidPassword123!' } });
      fireEvent.click(screen.getByRole('button', { name: t('keychain_unlock_unlock') }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(rateLimit));
      expect(fixture.unlock).toHaveBeenCalledExactlyOnceWith('ValidPassword123!');
      expect(input).toHaveValue('ValidPassword123!');
      expect(fixture.navigate).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('refreshes private-key address labels while keeping the chosen format and secret drafts', async () => {
    const { container } = render(<ImportPrivateKeyPage />);
    const picker = container.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    fireEvent.click(picker);
    fireEvent.click(screen.getByText(t('setup_import_private_key_nested_segwit')));
    const keyInput = screen.getByPlaceholderText(t('setup_import_private_key_enter_your_private_key'));
    const privateKey = '0'.repeat(63) + '1';
    fireEvent.change(keyInput, { target: { value: privateKey } });
    fireEvent.click(screen.getByRole('checkbox'));
    const password = screen.getByPlaceholderText(t('common_confirm_your_password'));
    fireEvent.change(password, { target: { value: 'ExactPassword123!' } });
    const button = screen.getByRole('button', { name: t('common_continue') });
    for (const language of languages) {
      act(() => configureLocale({ language, numberLocale: 'de-DE' }));
      expect(picker).toHaveTextContent(t('setup_import_private_key_nested_segwit'));
      expect(picker).toHaveTextContent('3...');
      expect(container.querySelector('input[name="address-type"]')).toHaveValue(AddressFormat.P2SH_P2WPKH);
      expect(screen.getByPlaceholderText(t('setup_import_private_key_enter_your_private_key'))).toBe(keyInput);
      expect(keyInput).toHaveValue(privateKey);
      expect(screen.getByPlaceholderText(t('common_confirm_your_password'))).toBe(password);
      expect(password).toHaveValue('ExactPassword123!');
      expect(screen.getByRole('button', { name: t('common_continue') })).toBe(button);
      expect(button).toBeEnabled();
      expect(fixture.verify).not.toHaveBeenCalled();
      expect(fixture.createPrivateKey).not.toHaveBeenCalled();
    }
    fireEvent.click(button);
    await waitFor(() => expect(fixture.createPrivateKey).toHaveBeenCalledExactlyOnceWith(
      privateKey, 'ExactPassword123!', undefined, AddressFormat.P2SH_P2WPKH,
    ));
  });
});
