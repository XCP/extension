import { Description, Field, Label } from "@headlessui/react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useSettings } from "@/contexts/settings-context";
import { isValidZeldHuntSeconds, MAX_ZELD_HUNT_SECONDS, ZELD_MIN_ZERO_COUNT } from "@/core/zeld/protocol";

interface HuntSecondsInputProps {
  showHelpText?: boolean;
}

/**
 * The one control for the ZELD hunt budget, shared by Advanced settings and the ZELD page so the
 * two can never disagree about validation or wording.
 */
export function HuntSecondsInput({ showHelpText = false }: HuntSecondsInputProps): ReactElement {
  const { settings, updateSettings } = useSettings();
  const stored = settings.zeldHuntSeconds ?? 0;
  const [draft, setDraft] = useState(String(stored));
  const [error, setError] = useState<string | null>(null);
  // Follow the stored value when it changes elsewhere (another window), without an effect: adjust
  // the draft during render, as React documents for state derived from a changed prop.
  const [synced, setSynced] = useState(stored);
  if (synced !== stored) {
    setSynced(stored);
    setDraft(String(stored));
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

  return (
    <Field>
      <Label htmlFor="zeld-hunt-seconds" className="font-bold">Hunt for ZELD</Label>
      <div className="mt-2 flex items-center gap-2">
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
          aria-label="Seconds to hunt for a ZELD txid before signing"
          aria-invalid={error ? true : undefined}
          className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <span className="text-sm text-gray-500">seconds (0 is off, {MAX_ZELD_HUNT_SECONDS} max)</span>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
      <Description className={`mt-2 text-sm text-gray-500 ${showHelpText ? "" : "hidden"}`}>
        Before signing, spend up to this long searching for a transaction ID that starts with
        {" "}{ZELD_MIN_ZERO_COUNT} zeros, which earns ZELD (zeldhash.com) on your change output.
        The search changes only the transaction&apos;s locktime field, adds no bytes and no fee,
        and when it runs out of time the transaction is sent as composed. Native SegWit and Taproot addresses
        only, and only when the first output is your own.
      </Description>
    </Field>
  );
}
