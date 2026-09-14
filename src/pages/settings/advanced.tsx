import { Description, Field, Label, RadioGroup } from "@headlessui/react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FiHelpCircle } from "@/components/icons";
import { SelectionCard, SelectionCardGroup } from "@/components/ui/cards/selection-card";
import { ApiUrlInput } from "@/components/ui/inputs/api-url-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import type { AutoLockTimer } from "@/core/settings";
import { isValidZeldHuntSeconds, MAX_ZELD_HUNT_SECONDS, ZELD_MIN_ZERO_COUNT } from "@/core/zeld/protocol";

/**
 * Constants for navigation paths and auto-lock options.
 */
const PATHS = {
  BACK: -1, // Using -1 for navigate(-1)
} as const;
const AUTO_LOCK_OPTIONS = [
  { value: "1m" as AutoLockTimer, label: "1 Minute" },
  { value: "5m" as AutoLockTimer, label: "5 Minutes" },
  { value: "15m" as AutoLockTimer, label: "15 Minutes" },
  { value: "30m" as AutoLockTimer, label: "30 Minutes" },
] as const;

/**
 * AdvancedSettings component manages advanced wallet settings.
 *
 * Features:
 * - Configures auto-lock timer, MPMA sends, unconfirmed TXs, help text visibility, and analytics
 * - Toggles help text display with a header button
 *
 * @returns {ReactElement} The rendered advanced settings UI.
 * @example
 * ```tsx
 * <AdvancedSettings />
 * ```
 */
export default function AdvancedSettingsPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings, isLoading } = useSettings();
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const [zeldSecondsInput, setZeldSecondsInput] = useState(String(settings.zeldHuntSeconds ?? 0));
  const [zeldSecondsError, setZeldSecondsError] = useState<string | null>(null);
  // Follow the stored value when it changes elsewhere (another window), without an effect: adjust
  // the draft during render, as React documents for state derived from a changed prop.
  const [syncedZeldSeconds, setSyncedZeldSeconds] = useState(settings.zeldHuntSeconds);
  if (syncedZeldSeconds !== settings.zeldHuntSeconds) {
    setSyncedZeldSeconds(settings.zeldHuntSeconds);
    setZeldSecondsInput(String(settings.zeldHuntSeconds ?? 0));
  }

  const saveZeldSeconds = async () => {
    const trimmed = zeldSecondsInput.trim();
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (!isValidZeldHuntSeconds(parsed)) {
      setZeldSecondsError(`Enter a whole number of seconds from 0 to ${MAX_ZELD_HUNT_SECONDS}.`);
      return;
    }
    setZeldSecondsError(null);
    if (parsed === settings.zeldHuntSeconds) {
      setZeldSecondsInput(String(parsed));
      return;
    }
    try {
      await updateSettings({ zeldHuntSeconds: parsed });
    } catch (error) {
      setZeldSecondsError(error instanceof Error ? error.message : "Could not save the hunt time.");
    }
  };

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Advanced",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: "Toggle help text",
      },
    });
  }, [setHeaderProps, navigate]);

  if (isLoading || !settings) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  return (
    <section className="space-y-8 p-4 mb-2" aria-labelledby="advanced-settings-title">
      <h2 id="advanced-settings-title" className="sr-only">
        Advanced Settings
      </h2>

      <SettingsSection id="adv-security" title="Security">
        <Field>
          <Label className="font-bold">Auto-Lock Timer</Label>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Choose how long to wait before automatically locking your wallet.
          </Description>
          <RadioGroup
            value={settings.autoLockTimer}
            onChange={(value: AutoLockTimer) => updateSettings({ autoLockTimer: value })}
            className="mt-4"
          >
            <SelectionCardGroup>
              {AUTO_LOCK_OPTIONS.map((option) => (
                <SelectionCard
                  key={option.value}
                  value={option.value}
                  title={option.label}
                />
              ))}
            </SelectionCardGroup>
          </RadioGroup>
        </Field>

      </SettingsSection>

      <SettingsSection id="adv-transactions" title="Transactions">
        <SettingSwitch
          label="Strict TXs Verification"
          description="Block signing if local transaction verification fails. When off, a warning is shown but signing is allowed."
          checked={settings.strictTransactionVerification}
          onChange={(checked) => updateSettings({ strictTransactionVerification: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label="Use Unconfirmed TXs"
          description="Enable this to chain transactions that haven't been confirmed yet."
          checked={settings.allowUnconfirmedTxs}
          onChange={(checked) => updateSettings({ allowUnconfirmedTxs: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label="Enable More Outputs"
          description="Attach BTC to asset sends. Adds a + BTC option on the send form."
          checked={settings.enableMoreOutputs}
          onChange={(checked) => updateSettings({ enableMoreOutputs: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label="Enable MPMA Sends"
          description="Enable multi-destination sends (MPMA) for supported assets."
          checked={settings.enableMPMA}
          onChange={(checked) => updateSettings({ enableMPMA: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label="Advanced Broadcasts"
          description="Show advanced options for broadcast transactions (value and fee fraction)."
          checked={settings.enableAdvancedBroadcasts}
          onChange={(checked) => updateSettings({ enableAdvancedBroadcasts: checked })}
          showHelpText={shouldShowHelpText}
        />

        <Field>
          <Label htmlFor="zeld-hunt-seconds" className="font-bold">Hunt for ZELD</Label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="zeld-hunt-seconds"
              type="text"
              inputMode="numeric"
              value={zeldSecondsInput}
              onChange={(event) => setZeldSecondsInput(event.target.value)}
              onBlur={() => { void saveZeldSeconds(); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label="Seconds to hunt for a ZELD txid before signing"
              aria-invalid={zeldSecondsError ? true : undefined}
              className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <span className="text-sm text-gray-500">seconds (0 is off, {MAX_ZELD_HUNT_SECONDS} max)</span>
          </div>
          {zeldSecondsError && (
            <p className="mt-1 text-sm text-red-600" role="alert">{zeldSecondsError}</p>
          )}
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            Before signing, spend up to this long searching for a transaction ID that starts with
            {" "}{ZELD_MIN_ZERO_COUNT} zeros, which earns ZELD (zeldhash.com) on your change output.
            The search changes only a sequence number, adds no bytes and no fee, and when it runs
            out of time the transaction is sent as composed. Native SegWit and Taproot addresses
            only, and only when the first output is your own.
          </Description>
        </Field>
      </SettingsSection>

      <SettingsSection id="adv-connection" title="Connection">
        <Field>
          <Label className="font-bold">Counterparty API</Label>
          <ApiUrlInput
            value={settings.counterpartyApiBase}
            onChange={() => {}}
            onValidationSuccess={async (url) => {
              await updateSettings({ counterpartyApiBase: url });
            }}
            showHelpText={shouldShowHelpText}
            className="mt-2"
          />
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              The Counterparty API endpoint URL. Must be a mainnet API server running Counterparty Core 11.3.0 or newer.
            </Description>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection id="adv-privacy" title="Privacy & Display">
        <SettingSwitch
          label="Anonymous Analytics"
          description="Choose whether to share usage data."
          checked={settings.analyticsAllowed}
          onChange={(checked) => updateSettings({ analyticsAllowed: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label="Show/Hide Help Text"
          description="Show or hide help text by default."
          checked={settings.showHelpText}
          onChange={(checked) => updateSettings({ showHelpText: checked })}
          showHelpText={shouldShowHelpText}
        />
      </SettingsSection>

      {process.env.NODE_ENV === 'development' && (
        <SettingsSection id="adv-developer" title="Developer">
          <SettingSwitch
            label="Transaction Dry Run"
            description="When enabled, transactions will be simulated instead of being broadcast to the network."
            checked={settings.transactionDryRun}
            onChange={(checked) => updateSettings({ transactionDryRun: checked })}
            showHelpText={shouldShowHelpText}
          />
        </SettingsSection>
      )}
    </section>
  );
}

/**
 * SettingsSection — a labeled group of related controls. The heading gives the
 * flat list of advanced toggles some scannable structure without hiding
 * anything behind a mode switch.
 */
function SettingsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <h3 id={id} className="text-sm font-medium text-gray-500">
        {title}
      </h3>
      {children}
    </section>
  );
}
