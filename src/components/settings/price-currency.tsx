import { useState } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { FIAT_CURRENCIES, type FiatCurrency } from '@/core/bitcoin/price';
import type { AppSettings } from '@/core/settings';
import { t } from '@/i18n';

export function PriceCurrencySettings() {
  const { settings, updateSettings } = useSettings();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save(patch: Partial<AppSettings>) {
    setFailed(false);
    setSaving(true);
    try { await updateSettings(patch); } catch { setFailed(true); } finally { setSaving(false); }
  }
  const selectClass = 'block w-full mt-1 p-2 border border-gray-300 rounded bg-white';
  return <section className="mt-6 space-y-4 px-4" aria-label={t('display_preferences_fiat')}>
    <label className="block text-sm">
      {t('display_preferences_fiat')}
      <select className={selectClass} value={settings.fiat} disabled={saving}
        onChange={event => void save({ fiat: event.target.value as FiatCurrency })}>
        {FIAT_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
      </select>
    </label>
    {failed && <p role="alert" className="text-sm text-red-600">{t('display_preferences_save_failed')}</p>}
  </section>;
}
