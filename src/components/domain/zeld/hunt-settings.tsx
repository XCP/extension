import { Description, Field, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { useSettings } from "@/contexts/settings-context";
import { isValidZeldHuntSeconds, MAX_ZELD_HUNT_SECONDS } from "@/core/zeld/protocol";

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
      setError(`Enter a whole number of seconds from 0 to ${MAX_ZELD_HUNT_SECONDS}.`);
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
      setError(cause instanceof Error ? cause.message : "Could not save the hunt time.");
    }
  };

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ zeldHuntSeconds: enabled ? lastBudget : 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the hunt setting.");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <SettingSwitch label="Enable ZELD Hunting" checked={stored > 0} onChange={enabled => { void toggle(enabled); }}
        disabled={saving} showHelpText={showHelpText}
        description="Look for ZELD while making eligible transactions. No extra BTC fee. If no result is found, your transaction continues normally." />
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
      {showTimeInput && (
        <Field className="mt-3">
          <Label htmlFor="zeld-hunt-seconds" className="text-sm font-medium">Maximum wait per transaction</Label>
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
              aria-label="Seconds to hunt for a ZELD transaction ID"
              aria-invalid={error ? true : undefined}
              className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <span className="text-sm text-gray-500">seconds (0 is off, {MAX_ZELD_HUNT_SECONDS} max)</span>
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${showHelpText ? "" : "hidden"}`}>
            Uses your device's processing power for up to this many seconds. Finding ZELD is not guaranteed.
          </Description>
        </Field>
      )}
    </div>
  );
}
