import { EN, type MessageKey } from '@/i18n/en.generated';

export type { MessageKey } from '@/i18n/en.generated';

/**
 * The wallet's one translation call, over the platform's own mechanism.
 *
 * Strings live in `public/_locales/<locale>/messages.json`, the format
 * Chrome and Firefox load themselves: the browser picks the locale from its
 * own UI language (`zh_TW`, then `zh`, then `default_locale`), loads only
 * that file, and answers synchronously. There is no in-wallet language
 * setting by design — the wallet reads in the language the browser does,
 * exactly as its manifest name does — and no runtime library, because the
 * platform already is one.
 *
 * There is a `zh` catalog as well as `zh_CN`, and it is not redundant. That
 * search order is the reason: exact locale, then the language without its
 * region, then the default. Chrome's supported list names only `zh_CN` and
 * `zh_TW` for Chinese, so `zh_HK`, `zh_SG`, `zh_MO` and a bare `zh` all miss
 * the first step — and with no language-level catalog they fell straight
 * through to ENGLISH. `zh` holds the Simplified text, so every Chinese reader
 * the two regional files do not name gets Chinese rather than English.
 * `zh_TW` still wins for Taiwan on the exact match, and `zh_HK` still wins
 * wherever it is honoured.
 *
 * `en/messages.json` is the source of truth. `scripts/i18n.mjs build` mirrors
 * it into `en.generated.ts` so a key is a type: a call site cannot name a
 * message that does not exist, and a message no call site names is reported.
 * Outside an extension context (unit tests under jsdom) the English text is
 * returned directly, so tests keep asserting on the copy they always did.
 *
 * Substitutions are Chrome's positional `$1`, `$2`, passed as strings; the
 * English message documents what each stands for in its `description`.
 */
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
 * carries its own `appLocale`, so the browser's own fallback chain (`zh_TW`,
 * then `zh`, then the default) answers this the same way it answers every
 * other message. The browser UI language alone would be wrong whenever the
 * wallet does not speak it and falls back to English.
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
