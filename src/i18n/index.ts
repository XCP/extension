import { EN, type MessageKey } from '@/i18n/en.generated';

export type { MessageKey } from '@/i18n/en.generated';

import { languagePreference, numberLocalePreference } from '@/i18n/preferences';
import ja from '../../public/_locales/ja/messages.json';
import zhCN from '../../public/_locales/zh_CN/messages.json';
import zhHK from '../../public/_locales/zh_HK/messages.json';
import zhTW from '../../public/_locales/zh_TW/messages.json';

const catalogs = { ja, 'zh-CN': zhCN, 'zh-TW': zhTW, 'zh-HK': zhHK };
let language = languagePreference('auto');
let numberLocale = numberLocalePreference('auto');
const listeners = new Set<() => void>();

/** Browser catalog by default; explicit choices use the same bundled catalogs. */
export function configureLocale(preferences: { language?: unknown; numberLocale?: unknown }): void {
  const nextLanguage = languagePreference(preferences.language);
  const nextNumbers = numberLocalePreference(preferences.numberLocale);
  if (nextLanguage === language && nextNumbers === numberLocale) return;
  language = nextLanguage;
  numberLocale = nextNumbers;
  if (typeof document !== 'undefined') applyDocumentLocale();
  listeners.forEach(listener => { listener(); });
}

export const localeSnapshot = (): string => `${language}:${numberLocale}`;
export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Auto follows the resolved interface catalog. A saved override affects display only. */
export function currentNumberLocale(): string {
  return numberLocale === 'auto' ? currentLocale() : numberLocale;
}

/** Chrome positional substitutions are shared by platform and explicit catalogs. */
export function t(key: MessageKey, substitutions?: string | readonly string[]): string {
  const subs = substitutions === undefined
    ? undefined
    : typeof substitutions === 'string' ? substitutions : [...substitutions];
  if (language === 'en') return substitute(EN[key], subs);
  if (language !== 'auto') return substitute(expandCatalogMessage(catalogs[language][key]) || EN[key], subs);
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

/** Resolve Chrome named placeholders before positional substitutions (including adjacent values). */
export function expandCatalogMessage(entry: { message: string; placeholders?: Record<string, { content: string }> }): string {
  return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (match, name: string) => entry.placeholders?.[name.toLowerCase()]?.content ?? match);
}

function substitute(message: string, subs?: string | string[]): string {
  if (subs === undefined) return message;
  const list = typeof subs === 'string' ? [subs] : subs;
  return message.replace(/\$(\d)/g, (_, index: string) => list[Number(index) - 1] ?? '');
}

/**
 * The language the wallet is actually reading in, as a BCP 47 tag: each catalog
 * carries its own `appLocale`, so Chrome answers this with the catalog it
 * selected, or the explicitly selected catalog answers it. Do not infer the
 * catalog from getUILanguage(): Chrome's preferred extension locale can differ
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
