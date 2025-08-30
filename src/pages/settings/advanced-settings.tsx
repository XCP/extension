"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaCheck } from "react-icons/fa";
import { FiHelpCircle } from "react-icons/fi";
import { Switch, Field, Label, Description, RadioGroup, Input } from "@headlessui/react";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { validateCounterpartyApi } from "@/utils/validation";
import type { AutoLockTimer } from "@/utils/storage";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and auto-lock options.
 */
const CONSTANTS = {
  PATHS: {
    BACK: -1, // Using -1 for navigate(-1)
  } as const,
  AUTO_LOCK_OPTIONS: [
    { value: "1m" as AutoLockTimer, label: "1 Minute" },
    { value: "5m" as AutoLockTimer, label: "5 Minutes" },
    { value: "15m" as AutoLockTimer, label: "15 Minutes" },
    { value: "30m" as AutoLockTimer, label: "30 Minutes" },
  ],
} as const;

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
export default function AdvancedSettings(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings, isLoading } = useSettings();
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [apiUrlError, setApiUrlError] = useState<string | null>(null);
  const [isValidatingApi, setIsValidatingApi] = useState(false);

  // Initialize API URL from settings
  useEffect(() => {
    if (settings?.counterpartyApiBase) {
      setApiUrl(settings.counterpartyApiBase);
    }
  }, [settings?.counterpartyApiBase]);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Advanced",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: "Toggle help text",
      },
    });
  }, [setHeaderProps, navigate]);

  // Handle API URL validation and update
  const handleApiUrlValidation = async (url: string): Promise<boolean> => {
    setIsValidatingApi(true);
    setApiUrlError(null);

    const result = await validateCounterpartyApi(url);
    
    if (result.isValid) {
      // Success - update the setting
      await updateSettings({ counterpartyApiBase: url });
      setApiUrlError(null);
      setIsValidatingApi(false);
      return true;
    } else {
      setApiUrlError(result.error || "Failed to validate API");
      setIsValidatingApi(false);
      return false;
    }
  };

  // Handle API URL change
  const handleApiUrlChange = async () => {
    if (apiUrl === settings.counterpartyApiBase) {
      return; // No change
    }
    await handleApiUrlValidation(apiUrl);
  };

  if (isLoading || !settings) return <div className="p-4 text-center text-gray-500">Loading...</div>;

  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  return (
    <div className="space-y-6 p-4" role="main" aria-labelledby="advanced-settings-title">
      <h2 id="advanced-settings-title" className="sr-only">
        Advanced Settings
      </h2>
      <Field>
        <Label className="font-bold">Auto-Lock Timer</Label>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Choose how long to wait before automatically locking your wallet.
        </Description>
        <RadioGroup
          value={settings.autoLockTimer}
          onChange={(value: AutoLockTimer) => updateSettings({ autoLockTimer: value })}
          className="mt-4 space-y-2"
        >
          {CONSTANTS.AUTO_LOCK_OPTIONS.map((option) => (
            <RadioGroup.Option
              key={option.value}
              value={option.value}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${checked ? "cursor-pointer bg-white shadow-md" : "cursor-pointer bg-white hover:bg-gray-50"}
              `}
            >
              {({ checked }) => (
                <>
                  {checked && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaCheck className="w-4 h-4 text-blue-500" aria-hidden="true" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">{option.label}</span>
                  </div>
                </>
              )}
            </RadioGroup.Option>
          ))}
        </RadioGroup>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Enable MPMA Sends</Label>
          <Switch
            checked={settings.enableMPMA}
            onChange={(checked) => updateSettings({ enableMPMA: checked })}
            className={`${settings.enableMPMA ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.enableMPMA ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Enable multi-destination sends (MPMA) for supported assets.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Advanced Broadcasts</Label>
          <Switch
            checked={settings.enableAdvancedBroadcasts}
            onChange={(checked) => updateSettings({ enableAdvancedBroadcasts: checked })}
            className={`${settings.enableAdvancedBroadcasts ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.enableAdvancedBroadcasts ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Show advanced options for broadcast transactions (value and fee fraction).
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Use Advanced Betting</Label>
          <Switch
            checked={settings.enableAdvancedBetting}
            onChange={(checked) => updateSettings({ enableAdvancedBetting: checked })}
            className={`${settings.enableAdvancedBetting ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.enableAdvancedBetting ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Show betting options in the actions menu.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Use Unconfirmed TXs</Label>
          <Switch
            checked={settings.allowUnconfirmedTxs}
            onChange={(checked) => updateSettings({ allowUnconfirmedTxs: checked })}
            className={`${settings.allowUnconfirmedTxs ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.allowUnconfirmedTxs ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Enable this to chain transactions that haven't been confirmed yet.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Show/Hide Help Text</Label>
          <Switch
            checked={settings.showHelpText}
            onChange={(checked) => updateSettings({ showHelpText: checked })}
            className={`${settings.showHelpText ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.showHelpText ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Show or hide help text by default.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Anonymous Analytics</Label>
          <Switch
            checked={settings.analyticsAllowed}
            onChange={(checked) => updateSettings({ analyticsAllowed: checked })}
            className={`${settings.analyticsAllowed ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span
              className={`${
                settings.analyticsAllowed ? "translate-x-6" : "translate-x-1"
              } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
            />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          Choose whether to share usage data.
        </Description>
      </Field>

      <Field>
        <Label className="font-bold">Counterparty API URL</Label>
        <div className="mt-2 space-y-2">
          <Input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            onBlur={handleApiUrlChange}
            disabled={isValidatingApi}
            placeholder="https://api.counterparty.io:4000"
            className="w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          {isValidatingApi && (
            <p className="text-sm text-gray-500">Validating API endpoint...</p>
          )}
          {apiUrlError && (
            <p className="text-sm text-red-500">{apiUrlError}</p>
          )}
          {!apiUrlError && !isValidatingApi && apiUrl === settings.counterpartyApiBase && (
            <p className="text-sm text-green-500">✓ API endpoint is valid</p>
          )}
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
          The Counterparty API endpoint URL. Must be a mainnet API server.
        </Description>
      </Field>

      {process.env.NODE_ENV === 'development' && (
        <Field>
          <div className="flex items-center justify-between">
            <Label className="font-bold">Transaction Dry Run</Label>
            <Switch
              checked={settings.transactionDryRun}
              onChange={(checked) => updateSettings({ transactionDryRun: checked })}
              className={`${settings.transactionDryRun ? "bg-blue-600" : "bg-gray-200"} p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
            >
              <span
                className={`${
                  settings.transactionDryRun ? "translate-x-6" : "translate-x-1"
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </Switch>
          </div>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            When enabled, transactions will be simulated instead of being broadcast to the network.
          </Description>
        </Field>
      )}
    </div>
  );
}
