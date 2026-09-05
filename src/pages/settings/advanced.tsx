import { Description, Field, Label, RadioGroup } from "@headlessui/react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FiHelpCircle } from "@/components/icons";
import { SelectionCard, SelectionCardGroup } from "@/components/ui/cards/selection-card";
import { ApiUrlInput } from "@/components/ui/inputs/api-url-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import type { AutoLockTimer } from "@/core/settings";
import { DEFAULT_SETTINGS } from "@/core/settings";

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
  const [alkanesApiInput, setAlkanesApiInput] = useState(settings.alkanesApiBase);
  const [alkanesApiError, setAlkanesApiError] = useState<string | null>(null);
  const [isSavingAlkanesApi, setIsSavingAlkanesApi] = useState(false);
  const [hasDisabledAlkanesProtection, setHasDisabledAlkanesProtection] = useState(false);

  useEffect(() => {
    setAlkanesApiInput(settings.alkanesApiBase);
  }, [settings.alkanesApiBase]);

  const saveAlkanesApi = async (value = alkanesApiInput) => {
    let normalized: string;
    try {
      const url = new URL(value.trim());
      const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal))
        || url.username || url.password || url.hash) {
        throw new Error('Invalid endpoint');
      }
      normalized = url.toString();
    } catch {
      setAlkanesApiError('Use an HTTPS URL, or HTTP on localhost, without credentials or a fragment.');
      return;
    }
    setIsSavingAlkanesApi(true);
    setAlkanesApiError(null);
    try {
      await updateSettings({ alkanesApiBase: normalized });
      setAlkanesApiInput(normalized);
    } catch {
      setAlkanesApiError('Could not save the Alkanes API. Please retry.');
    } finally {
      setIsSavingAlkanesApi(false);
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

        <SettingSwitch
          label="Protect Alkanes UTXOs"
          description="Exclude Alkanes token outputs from ordinary spending. Disabling this can burn tokens."
          checked={settings.protectAlkanesUtxos}
          onChange={(checked) => {
            setHasDisabledAlkanesProtection(!checked);
            void updateSettings(checked
              ? { protectAlkanesUtxos: true }
              : { protectAlkanesUtxos: false, enableDieselMinting: false });
          }}
          showHelpText={shouldShowHelpText}
        />
        {hasDisabledAlkanesProtection && !settings.protectAlkanesUtxos && (
          <p role="status" className="text-sm text-amber-700">
            Protection off: ordinary spending can burn Alkanes.
          </p>
        )}

        <SettingSwitch
          label="Mine DIESEL (Alkanes)"
          description="Mine on eligible transactions within your DIESEL fee limit."
          checked={settings.enableDieselMinting}
          onChange={(checked) => updateSettings(checked
            ? { enableDieselMinting: true, protectAlkanesUtxos: true }
            : { enableDieselMinting: false })}
          showHelpText={shouldShowHelpText}
        />
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
        <Field>
          <Label htmlFor="alkanes-api-url" className="font-bold">Alkanes API</Label>
          <input
            id="alkanes-api-url"
            type="url"
            value={alkanesApiInput}
            onChange={(event) => {
              setAlkanesApiInput(event.target.value);
              setAlkanesApiError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isSavingAlkanesApi) void saveAlkanesApi();
            }}
            disabled={isSavingAlkanesApi}
            aria-invalid={Boolean(alkanesApiError)}
            aria-describedby={alkanesApiError ? 'alkanes-api-error' : undefined}
            className="mt-2 w-full min-w-0 p-2.5 rounded-md border border-gray-300 bg-gray-50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              aria-label="Save Alkanes API"
              onClick={() => void saveAlkanesApi()}
              disabled={isSavingAlkanesApi || alkanesApiInput === settings.alkanesApiBase}
              className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white disabled:opacity-50"
            >
              {isSavingAlkanesApi ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              aria-label="Reset Alkanes API to default"
              onClick={() => void saveAlkanesApi(DEFAULT_SETTINGS.alkanesApiBase)}
              disabled={isSavingAlkanesApi || settings.alkanesApiBase === DEFAULT_SETTINGS.alkanesApiBase}
              className="px-3 py-2 text-sm rounded-md border border-gray-300 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
          {alkanesApiError && <p id="alkanes-api-error" role="alert" className="mt-2 text-sm text-red-600">{alkanesApiError}</p>}
          {shouldShowHelpText && (
            <Description className="mt-2 text-sm text-gray-500">
              Use a trusted mainnet Alkanes JSON-RPC endpoint. It sees your queried addresses and its responses determine which outputs are protected.
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
  children: ReactNode;
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
