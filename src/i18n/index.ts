import { EN, type MessageKey } from '@/i18n/en.generated';

export type { MessageKey } from '@/i18n/en.generated';

/** Resolve messages through the browser-selected extension catalog. */
export function t(key: MessageKey, substitutions?: string | readonly string[]): string {
  const subs = substitutions === undefined
    ? undefined
    : typeof substitutions === 'string' ? substitutions : [...substitutions];
  const message = fromRuntime(key, subs);
  return message || substitute(EN[key], subs);
}

/**
 * The browser's answer, or nothing. Empty means "no such message in the active
 * locale", which Chrome reports as an empty string; a thrown error means there
 * is no real extension runtime at all (unit tests run against a fake browser
 * whose `i18n.getMessage` is a stub that throws). Both fall back to English.
 */
function fromRuntime(key: MessageKey, subs?: string | string[]): string {
  try {
    return globalThis.chrome?.i18n?.getMessage?.(key, subs) ?? '';
  } catch {
    return '';
  }
}

function substitute(message: string, subs?: string | string[]): string {
  if (subs === undefined) return message;
  const list = typeof subs === 'string' ? [subs] : subs;
  return message.replace(/\$(\d)/g, (_, index: string) => list[Number(index) - 1] ?? '');
}

/**
 * The language the wallet is actually reading in, as a BCP 47 tag: each catalog
 * carries its own `appLocale`, so Chrome answers this with the catalog it
 * selected. Do not infer the catalog from getUILanguage(): Chrome's preferred extension locale can differ
 * from its UI locale (for example Hong Kong wording with a zh-TW browser UI),
 * and unsupported languages fall back to the wallet's English catalog.
 */
export function currentLocale(): string {
  return t('appLocale');
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
