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
import { useWallet } from "@/contexts/wallet-context";
import type { AutoLockTimer } from "@/core/settings";
import { setNotificationWatch } from "@/services/notificationService";

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
  const { wallets } = useWallet();
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);

  /**
   * Turning notifications on has to ask Chrome first, and the request must come from this click —
   * `chrome.permissions.request()` requires a user gesture, so it cannot be deferred to the poller.
   * If the prompt is declined the setting stays off rather than reading as on and never firing.
   */
  const handleNotificationsChange = async (checked: boolean): Promise<void> => {
    setNotificationError(null);

    if (!checked) {
      await updateSettings({ notificationsEnabled: false });
      await setNotificationWatch(false, []);
      return;
    }

    let granted = false;
    try {
      granted = await chrome.permissions.request({ permissions: ['notifications'] });
    } catch (error) {
      console.error('[Settings] Notification permission request failed:', error);
    }

    if (!granted) {
      setNotificationError('Chrome denied the notification permission, so this stays off.');
      return;
    }

    const addresses = wallets.flatMap((wallet) => wallet.addresses.map((a) => a.address));
    await updateSettings({ notificationsEnabled: true });
    await setNotificationWatch(true, addresses);
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

        <SettingSwitch
          label="Strict TXs Verification"
          description="Block signing if local transaction verification fails. When off, a warning is shown but signing is allowed."
          checked={settings.strictTransactionVerification}
          onChange={(checked) => updateSettings({ strictTransactionVerification: checked })}
          showHelpText={shouldShowHelpText}
        />
      </SettingsSection>

      <SettingsSection id="adv-transactions" title="Transactions">
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
          label="Notifications"
          description="Get notified when a dispenser sells or an order fills. Checks your addresses in the background once per block, and stores them unencrypted so it can keep checking while the wallet is locked. Turning this off clears them."
          checked={settings.notificationsEnabled === true}
          onChange={handleNotificationsChange}
          showHelpText={shouldShowHelpText}
        />
        {notificationError && (
          <p className="text-sm text-red-600" role="status">{notificationError}</p>
        )}
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
              The Counterparty API endpoint URL. Must be a mainnet API server running Counterparty Core 11.2.0 or newer.
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
