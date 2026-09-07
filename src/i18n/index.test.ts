import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentLocale, configureLocale, currentLocale, currentNumberLocale, t } from '@/i18n';
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
  configureLocale({});
  vi.unstubAllGlobals();
  document.documentElement.lang = 'en';
});

describe('t', () => {
  it('reads the English catalog when there is no extension runtime', () => {
    vi.stubGlobal('chrome', undefined);
    expect(t('common_cancel')).toBe(EN.common_cancel);
    expect(t('settings_version', ['1.2.3'])).toBe('Version 1.2.3');
  });

  it('reads the English catalog when the runtime stub throws, as the fake browser does', () => {
    vi.stubGlobal('chrome', { i18n: { getMessage: () => { throw new Error('not implemented'); } } });
    expect(t('common_cancel')).toBe(EN.common_cancel);
  });

  it('prefers the message the browser resolved for its own locale', () => {
    const getMessage = runtimeWith({ common_cancel: 'キャンセル', settings_version: 'バージョン $1' });
    expect(t('common_cancel')).toBe('キャンセル');
    expect(t('settings_version', ['1.2.3'])).toBe('バージョン 1.2.3');
    expect(getMessage).toHaveBeenCalledWith('settings_version', ['1.2.3']);
  });

  it('falls back to English for a key the active locale lacks, which Chrome reports as an empty string', () => {
    runtimeWith({ common_cancel: 'キャンセル' });
    expect(t('common_close')).toBe(EN.common_close);
  });

  it('substitutes every positional placeholder and blanks a missing one', () => {
    vi.stubGlobal('chrome', undefined);
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
    runtimeWith({});
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
    expect(EN.appName).toBe('XCP Wallet');
    expect(EN.appLocale).toBe('en');
  });
});


describe('independent saved display preferences', () => {
  it('explicit language overrides the browser and updates the document', () => {
    runtimeWith({ appLocale: 'zh-TW', common_cancel: 'browser text' });
    configureLocale({ language: 'ja' });
    expect(t('common_cancel')).toBe('キャンセル');
    expect(currentLocale()).toBe('ja');
    expect(currentNumberLocale()).toBe('ja');
    expect(document.documentElement.lang).toBe('ja');
    configureLocale({ language: 'en', numberLocale: 'de-DE' });
    expect(t('common_cancel')).toBe('Cancel');
    expect(currentNumberLocale()).toBe('de-DE');
    configureLocale({ language: 'zh-TW', numberLocale: 'de-DE' });
    expect(currentLocale()).toBe('zh-TW');
    expect(currentNumberLocale()).toBe('de-DE');
    configureLocale({ language: 'auto' });
    expect(currentLocale()).toBe('zh-TW');
    expect(currentNumberLocale()).toBe('zh-TW');
  });

  it('unrecognized preferences fall back to the resolved catalog, never an invalid Intl locale', () => {
    runtimeWith({ appLocale: 'ja' });
    configureLocale({ language: 'made-up', numberLocale: 'bad_tag' });
    expect(currentNumberLocale()).toBe('ja');
  });
});


describe('Chrome named placeholders', () => {
  it('keeps adjacent substitutions exact in explicit and English catalogs', () => {
    configureLocale({ language: 'en' });
    expect(t('swap_form_impact', ['+', '1.5'])).toBe('Impact: +1.5%');
    configureLocale({ language: 'ja' });
    expect(t('swap_form_impact', ['+', '1.5'])).toContain('+1.5');
  });
});
