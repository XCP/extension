import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "@/components/icons";
import { Field, Label, Description, RadioGroup } from "@headlessui/react";
import { SelectionCard, SelectionCardGroup } from "@/components/ui/cards/selection-card";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { ApiUrlInput } from "@/components/ui/inputs/api-url-input";
import { SettingSwitch } from "@/components/ui/inputs/setting-switch";
import type { AutoLockTimer } from "@/utils/settings";
import type { ReactElement } from "react";

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
    <div className="space-y-6 p-4 mb-2" role="main" aria-labelledby="advanced-settings-title">
      <h2 id="advanced-settings-title" className="sr-only">
        Advanced Settings
      </h2>
      
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
            The Counterparty API endpoint URL. Must be a mainnet API server.
          </Description>
        )}
      </Field>

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

      <SettingSwitch
        label="Use Unconfirmed TXs"
        description="Enable this to chain transactions that haven't been confirmed yet."
        checked={settings.allowUnconfirmedTxs}
        onChange={(checked) => updateSettings({ allowUnconfirmedTxs: checked })}
        showHelpText={shouldShowHelpText}
      />

      <SettingSwitch
        label="Strict TXs Verification"
        description="Block signing if local transaction verification fails. When off, a warning is shown but signing is allowed."
        checked={settings.strictTransactionVerification}
        onChange={(checked) => updateSettings({ strictTransactionVerification: checked })}
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
        label="Show/Hide Help Text"
        description="Show or hide help text by default."
        checked={settings.showHelpText}
        onChange={(checked) => updateSettings({ showHelpText: checked })}
        showHelpText={shouldShowHelpText}
      />

      <SettingSwitch
        label="Anonymous Analytics"
        description="Choose whether to share usage data."
        checked={settings.analyticsAllowed}
        onChange={(checked) => updateSettings({ analyticsAllowed: checked })}
        showHelpText={shouldShowHelpText}
      />

      {process.env.NODE_ENV === 'development' && (
        <SettingSwitch
          label="Transaction Dry Run"
          description="When enabled, transactions will be simulated instead of being broadcast to the network."
          checked={settings.transactionDryRun}
          onChange={(checked) => updateSettings({ transactionDryRun: checked })}
          showHelpText={shouldShowHelpText}
        />
      )}
    </div>
  );
}
