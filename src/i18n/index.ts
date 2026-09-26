// Type only: the English catalog value is 138 KB, and the browser already carries it as
// public/_locales/en/messages.json, the default locale every other catalog falls back to.
import type { MessageKey } from '@/i18n/en.generated';

export type { MessageKey } from '@/i18n/en.generated';

/** Resolve messages through the browser-selected extension catalog. */
export function t(key: MessageKey, substitutions?: string | readonly string[]): string {
  const subs = substitutions === undefined
    ? undefined
    : typeof substitutions === 'string' ? substitutions : [...substitutions];
  return fromRuntime(key, subs) || key;
}

/**
 * The browser's answer, or nothing. Chrome resolves a key missing from the
 * active locale from the default (English) catalog itself, so every key in
 * `MessageKey` gets text in a real extension. Empty or thrown means there is no
 * extension runtime at all; the key itself is shown then. Unit tests install an
 * English `getMessage` in vitest.setup.ts.
 */
function fromRuntime(key: MessageKey, subs?: string | string[]): string {
  try {
    return globalThis.chrome?.i18n?.getMessage?.(key, subs) ?? '';
  } catch {
    return '';
  }
}

/**
 * The language the wallet is actually reading in, as a BCP 47 tag: each catalog
 * carries its own `appLocale`, so Chrome answers this with the catalog it
 * selected. Do not infer the catalog from getUILanguage(): Chrome's preferred extension locale can differ
 * from its UI locale (for example Hong Kong wording with a zh-TW browser UI),
 * and unsupported languages fall back to the wallet's English catalog.
 */
export function currentLocale(): string {
  const tag = t('appLocale');
  // Without an extension runtime t() answers with the key, which is not a language tag.
  return tag === 'appLocale' ? 'en' : tag;
}

/**
 * Stamp that language on the document, for font selection, hyphenation and
 * assistive technology. The entry HTML is static and says `en`; the extension
 * context knows better once it runs.
 */
export function applyDocumentLocale(): void {
  document.documentElement.lang = currentLocale();
}

/** Number and date display follow the catalog, including English fallback. */
export function currentNumberLocale(): string {
  return currentLocale();
}
