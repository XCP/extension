import { Description, Field, Label, Select } from '@headlessui/react';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { FIAT_CURRENCIES, type FiatCurrency } from '@/core/bitcoin/price';
import { t } from '@/i18n';

/**
 * Settings → Advanced → Privacy & Display: the currency used for estimated values.
 *
 * Laid out like the other Advanced controls (bold label, help text that follows the page's
 * help-text toggle). The select is disabled while a save is in flight, and a failed save
 * leaves the stored currency unchanged and says so.
 */
export function PriceCurrencySetting({ showHelpText = false }: { showHelpText?: boolean }): ReactElement {
  const { settings, updateSettings } = useSettings();
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(fiat: FiatCurrency) {
    setFailed(false);
    setSaving(true);
    try { await updateSettings({ fiat }); } catch { setFailed(true); } finally { setSaving(false); }
  }

  return (
    <Field>
      <Label className="font-bold">{t('display_preferences_fiat')}</Label>
      <Description className={`mt-2 text-sm text-gray-500 ${showHelpText ? '' : 'hidden'}`}>
        {t('settings_advanced_price_currency_description')}
      </Description>
      <Select
        className="mt-2 block w-full px-3 py-2.5 text-sm border border-gray-300 rounded-md bg-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        value={settings.fiat}
        disabled={saving}
        onChange={event => void save(event.target.value as FiatCurrency)}
      >
        {FIAT_CURRENCIES.map(currency => <option key={currency} value={currency}>{currency.toUpperCase()}</option>)}
      </Select>
      {failed && <p role="alert" className="mt-2 text-sm text-red-600">{t('display_preferences_save_failed')}</p>}
    </Field>
  );
}
