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
          label="Mine DIESEL (Experimental)"
          description="Attach one Alkanes DIESEL mint to eligible single-recipient BTC and asset sends from native SegWit addresses. This currently adds 57 vB; the review shows the estimated extra miner fee separately from the wallet-owned 330 sat storage output. Reward is unknown until confirmation and can be worth less than the fee. Memos, extra outputs, MPMA, and provider requests are skipped. Enabling this also protects DIESEL-bearing UTXOs from accidental spending."
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
