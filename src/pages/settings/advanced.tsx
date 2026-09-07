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

import { t } from '@/i18n';

/**
 * Constants for navigation paths and auto-lock options.
 */
const PATHS = {
  BACK: -1, // Using -1 for navigate(-1)
} as const;
const AUTO_LOCK_OPTIONS = [
  { value: "1m" as AutoLockTimer, label: t('settings_advanced_1_minute') },
  { value: "5m" as AutoLockTimer, label: t('settings_advanced_5_minutes') },
  { value: "15m" as AutoLockTimer, label: t('settings_advanced_15_minutes') },
  { value: "30m" as AutoLockTimer, label: t('settings_advanced_30_minutes') },
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
      title: t('common_advanced'),
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: t('common_toggle_help_text'),
      },
    });
  }, [setHeaderProps, navigate]);

  if (isLoading || !settings) return <div className="p-4 text-center text-gray-500">{t('common_loading')}</div>;

  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  return (
    <section className="space-y-8 p-4 mb-2" aria-labelledby="advanced-settings-title">
      <h2 id="advanced-settings-title" className="sr-only">
        {t('settings_advanced_advanced_settings')}
      </h2>

      <SettingsSection id="adv-security" title={t('common_security')}>
        <Field>
          <Label className="font-bold">{t('settings_advanced_auto_lock_timer')}</Label>
          <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? "" : "hidden"}`}>
            {t('settings_advanced_choose_how_long_to_wait')}
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

      <SettingsSection id="adv-transactions" title={t('common_transactions')}>
        <SettingSwitch
          label={t('settings_advanced_strict_txs_verification')}
          description={t('settings_advanced_block_signing_if_local_transaction')}
          checked={settings.strictTransactionVerification}
          onChange={(checked) => updateSettings({ strictTransactionVerification: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label={t('settings_advanced_use_unconfirmed_txs')}
          description={t('settings_advanced_enable_this_to_chain_transactions')}
          checked={settings.allowUnconfirmedTxs}
          onChange={(checked) => updateSettings({ allowUnconfirmedTxs: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label={t('settings_advanced_enable_more_outputs')}
          description={t('settings_advanced_attach_btc_to_asset_sends')}
          checked={settings.enableMoreOutputs}
          onChange={(checked) => updateSettings({ enableMoreOutputs: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label={t('settings_advanced_enable_mpma_sends')}
          description={t('settings_advanced_enable_multi_destination_sends_mpma')}
          checked={settings.enableMPMA}
          onChange={(checked) => updateSettings({ enableMPMA: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label={t('settings_advanced_advanced_broadcasts')}
          description={t('settings_advanced_show_advanced_options_for_broadcast')}
          checked={settings.enableAdvancedBroadcasts}
          onChange={(checked) => updateSettings({ enableAdvancedBroadcasts: checked })}
          showHelpText={shouldShowHelpText}
        />
      </SettingsSection>

      <SettingsSection id="adv-connection" title={t('settings_advanced_connection')}>
        <Field>
          <Label className="font-bold">{t('settings_advanced_counterparty_api')}</Label>
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
              {t('settings_advanced_the_counterparty_api_endpoint_url')}
            </Description>
          )}
        </Field>
      </SettingsSection>

      <SettingsSection id="adv-privacy" title={t('settings_advanced_privacy_display')}>
        <SettingSwitch
          label={t('settings_advanced_anonymous_analytics')}
          description={t('settings_advanced_choose_whether_to_share_usage')}
          checked={settings.analyticsAllowed}
          onChange={(checked) => updateSettings({ analyticsAllowed: checked })}
          showHelpText={shouldShowHelpText}
        />

        <SettingSwitch
          label={t('settings_advanced_show_hide_help_text')}
          description={t('settings_advanced_show_or_hide_help_text')}
          checked={settings.showHelpText}
          onChange={(checked) => updateSettings({ showHelpText: checked })}
          showHelpText={shouldShowHelpText}
        />
      </SettingsSection>

      {process.env.NODE_ENV === 'development' && (
        <SettingsSection id="adv-developer" title={t('settings_advanced_developer')}>
          <SettingSwitch
            label={t('settings_advanced_transaction_dry_run')}
            description={t('settings_advanced_when_enabled_transactions_will_be')}
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
