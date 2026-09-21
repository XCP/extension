import { Description, Field, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { useSettings } from "@/contexts/settings-context";
import { isValidZeldHuntSeconds, MAX_ZELD_HUNT_SECONDS } from "@/core/zeld/protocol";
import { t } from '@/i18n';
import { zeldErrorMessage } from './error-message';

interface HuntSettingsProps {
  showHelpText?: boolean;
  showTimeInput?: boolean;
}

/**
 * Shared hunt setting: Advanced shows the toggle; the balance page also edits the wait budget.
 */
export function HuntSettings({ showHelpText = false, showTimeInput = true }: HuntSettingsProps): ReactElement {
  const { settings, updateSettings } = useSettings();
  const stored = settings.zeldHuntSeconds ?? 0;
  const [draft, setDraft] = useState(String(stored));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastBudget, setLastBudget] = useState(stored || 15);
  // Follow the stored value when it changes elsewhere (another window), without an effect: adjust
  // the draft during render, as React documents for state derived from a changed prop.
  const [synced, setSynced] = useState(stored);
  if (synced !== stored) {
    setSynced(stored);
    setDraft(String(stored));
    if (stored > 0) setLastBudget(stored);
  }

  const save = async () => {
    const trimmed = draft.trim();
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (!isValidZeldHuntSeconds(parsed)) {
      setError(t('zeld_hunt_invalid_seconds', [String(MAX_ZELD_HUNT_SECONDS)]));
      return;
    }
    setError(null);
    if (parsed === stored) {
      setDraft(String(parsed));
      return;
    }
    try {
      await updateSettings({ zeldHuntSeconds: parsed });
    } catch (cause) {
      setError(zeldErrorMessage(cause) ?? (cause instanceof Error ? cause.message : t('zeld_hunt_save_time_failed')));
    }
  };

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ zeldHuntSeconds: enabled ? lastBudget : 0 });
    } catch (cause) {
      setError(zeldErrorMessage(cause) ?? (cause instanceof Error ? cause.message : t('zeld_hunt_save_setting_failed')));
    } finally { setSaving(false); }
  };

  return (
    <div>
      <SettingSwitch label={t('zeld_hunt_enable')} checked={stored > 0} onChange={enabled => { void toggle(enabled); }}
        disabled={saving} showHelpText={showHelpText}
        description={t('zeld_hunt_description')} />
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
      {showTimeInput && (
        <Field className="mt-3">
          <Label htmlFor="zeld-hunt-seconds" className="text-sm font-medium">{t('zeld_hunt_wait')}</Label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="zeld-hunt-seconds"
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => { void save(); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label={t('zeld_hunt_seconds_label')}
              aria-invalid={error ? true : undefined}
              className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <span className="text-sm text-gray-500">{t('zeld_hunt_seconds_hint', [String(MAX_ZELD_HUNT_SECONDS)])}</span>
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${showHelpText ? "" : "hidden"}`}>
            {t('zeld_hunt_device_help')}
          </Description>
        </Field>
      )}
    </div>
  );
}
