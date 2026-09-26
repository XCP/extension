import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { applyDocumentLocale, currentLocale, currentNumberLocale, t } from '@/i18n';
import { EN } from '@/i18n/en.generated';

/** A browser whose i18n answers with the given catalog, empty for anything else (Chrome's behaviour). */
function runtimeWith(catalog: Record<string, string>) {
  const getMessage = vi.fn((key: string, subs?: string | string[]) => {
    const message = catalog[key] ?? '';
    const list = subs === undefined ? [] : typeof subs === 'string' ? [subs] : subs;
    return message.replace(/\$(\d)/g, (_, index: string) => list[Number(index) - 1] ?? '');
  });
  vi.stubGlobal('chrome', { i18n: { getMessage } });
  return getMessage;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.lang = 'en';
});

describe('t', () => {
  it('reads English from the default-locale catalog, as the test setup answers like Chrome', () => {
    expect(t('common_cancel')).toBe(EN.common_cancel);
    expect(t('settings_version', ['1.2.3'])).toBe('Version 1.2.3');
  });

  it('shows the key when there is no extension runtime (no English is bundled)', () => {
    vi.stubGlobal('chrome', undefined);
    expect(t('common_cancel')).toBe('common_cancel');
  });

  it('shows the key when the runtime throws', () => {
    vi.stubGlobal('chrome', { i18n: { getMessage: () => { throw new Error('not implemented'); } } });
    expect(t('common_cancel')).toBe('common_cancel');
  });

  it('prefers the message the browser resolved for its own locale', () => {
    const getMessage = runtimeWith({ common_cancel: 'キャンセル', settings_version: 'バージョン $1' });
    expect(t('common_cancel')).toBe('キャンセル');
    expect(t('settings_version', ['1.2.3'])).toBe('バージョン 1.2.3');
    expect(getMessage).toHaveBeenCalledWith('settings_version', ['1.2.3']);
  });

  it('substitutes every positional placeholder and blanks a missing one', () => {
    vi.stubGlobal('chrome', fakeBrowser);
    expect(t('addresses_history_page_of', ['2', '9'])).toBe('Page 2 of 9');
    expect(t('addresses_history_page_of', ['2'])).toBe('Page 2 of ');
  });
});

describe('currentLocale', () => {
  it('is the tag of the catalog the browser resolved, not the browser UI language', () => {
    runtimeWith({ appLocale: 'zh-TW' });
    expect(currentLocale()).toBe('zh-TW');
  });

  it('is English when the wallet does not speak the browser language', () => {
    runtimeWith({ appLocale: 'en' });
    expect(currentLocale()).toBe('en');
  });

  it('is English outside an extension runtime', () => {
    vi.stubGlobal('chrome', undefined);
    expect(currentLocale()).toBe('en');
  });

  it('stamps that tag on the document', () => {
    runtimeWith({ appLocale: 'ja' });
    applyDocumentLocale();
    expect(document.documentElement.lang).toBe('ja');
  });
});

describe('the catalog', () => {
  it('names the manifest and its own language', () => {
    // EN is the generated type source; tests may read it as a value, the extension never does.
    expect(EN.appName).toBe('XCP Wallet');
    expect(EN.appLocale).toBe('en');
  });
});


describe('automatic formatting', () => {
  it.each(['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'])('follows the resolved %s catalog', locale => {
    runtimeWith({ appLocale: locale });
    expect(currentNumberLocale()).toBe(locale);
  });
  it('uses English formatting with an unsupported browser language', () => {
    runtimeWith({});
    expect(currentNumberLocale()).toBe('en');
  });
});
