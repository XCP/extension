import { useState } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { FIAT_CURRENCIES, type FiatCurrency } from '@/core/bitcoin/price';
import type { AppSettings } from '@/core/settings';
import { t } from '@/i18n';
import { LANGUAGES, languagePreference, NUMBER_LOCALES, numberLocalePreference } from '@/i18n/preferences';

const LANGUAGE_NAMES = { en: 'English', ja: '日本語', 'zh-CN': '简体中文', 'zh-TW': '繁體中文（台灣）', 'zh-HK': '繁體中文（香港）' };

export function DisplayPreferences() {
  const { settings, updateSettings } = useSettings();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save(patch: Partial<AppSettings>) {
    setFailed(false);
    setSaving(true);
    try { await updateSettings(patch); } catch { setFailed(true); } finally { setSaving(false); }
  }
  const selectClass = 'block w-full mt-1 p-2 border border-gray-300 rounded bg-white';
  return <section className="mt-6 space-y-4 px-4" aria-label={t('display_preferences_title')}>
    <h2 className="text-sm font-medium text-gray-500">{t('display_preferences_title')}</h2>
    <label className="block text-sm">
      {t('display_preferences_language')}
      <select className={selectClass} value={languagePreference(settings.language)} disabled={saving}
        onChange={event => void save({ language: languagePreference(event.target.value) })}>
        {LANGUAGES.map(locale => <option key={locale} value={locale}>{locale === 'auto' ? t('display_preferences_browser') : LANGUAGE_NAMES[locale]}</option>)}
      </select>
    </label>
    <label className="block text-sm">
      {t('display_preferences_numbers')}
      <select className={selectClass} value={numberLocalePreference(settings.numberLocale)} disabled={saving}
        onChange={event => void save({ numberLocale: numberLocalePreference(event.target.value) })}>
        {NUMBER_LOCALES.map(locale => <option key={locale} value={locale}>{locale === 'auto' ? t('display_preferences_follow_language') : `${locale} — ${new Intl.NumberFormat(locale).format(1234.56)}`}</option>)}
      </select>
    </label>
    <label className="block text-sm">
      {t('display_preferences_fiat')}
      <select className={selectClass} value={settings.fiat} disabled={saving}
        onChange={event => void save({ fiat: event.target.value as FiatCurrency })}>
        {FIAT_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
      </select>
    </label>
    <p className="text-xs text-gray-500">{t('display_preferences_input_help')}</p>
    {failed && <p role="alert" className="text-sm text-red-600">{t('display_preferences_save_failed')}</p>}
  </section>;
}
