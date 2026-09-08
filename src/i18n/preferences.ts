/** Display preferences never participate in transaction parsing or fiat conversion. */
export const LANGUAGES = ['auto', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
export type LanguagePreference = typeof LANGUAGES[number];
export const NUMBER_LOCALES = ['auto', 'en-US', 'de-DE', 'fr-FR', 'es-VE', 'ja-JP', 'zh-CN', 'zh-TW', 'zh-HK'] as const;
export type NumberLocalePreference = typeof NUMBER_LOCALES[number];

export function languagePreference(value: unknown): LanguagePreference {
  return LANGUAGES.find(locale => locale === value) ?? 'auto';
}

export function numberLocalePreference(value: unknown): NumberLocalePreference {
  return NUMBER_LOCALES.find(locale => locale === value) ?? 'auto';
}
