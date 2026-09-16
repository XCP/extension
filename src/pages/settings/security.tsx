import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FiHelpCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";

import { t } from '@/i18n';

const PATHS = {
  BACK: "/settings",
} as const;

/**
 * SecuritySettings component allows users to change their wallet password.
 *
 * Features:
 * - Validates and updates the password with current, new, and confirm fields
 * - Toggles help text visibility with a header button
 *
 * @returns {ReactElement} The rendered security settings UI.
 * @example
 * ```tsx
 * <SecuritySettings />
 * ```
 */
export default function SecuritySettingsPage(): ReactElement {
  const [formReady, setFormReady] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { lockKeychain, updatePassword } = useWallet();
  const { settings } = useSettings();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: t('common_security'),
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: t('common_toggle_help_text'),
      },
    });
  }, [setHeaderProps, navigate]);

  // Focus current password input on mount
  useEffect(() => {
    currentPasswordRef.current?.focus();
  }, []);

  /**
   * Checks if the form has enough input to enable submission.
   */
  const checkFormReady = () => {
    const current = currentPasswordRef.current?.value ?? "";
    const newPw = newPasswordRef.current?.value ?? "";
    const confirm = confirmPasswordRef.current?.value ?? "";
    setFormReady(
      current.length > 0 &&
      newPw.length >= MIN_PASSWORD_LENGTH &&
      confirm.length > 0
    );
  };

  /**
   * Handles the password change process.
   */
  const handlePasswordChange = async () => {
    setError("");
    setSuccess("");
    setIsLoading(true);

    const currentPassword = currentPasswordRef.current?.value ?? "";
    const newPassword = newPasswordRef.current?.value ?? "";
    const confirmPassword = confirmPasswordRef.current?.value ?? "";

    try {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        throw new Error(t('settings_security_new_password_must_be_at', [String(MIN_PASSWORD_LENGTH)]));
      }
      if (newPassword !== confirmPassword) {
        throw new Error(t('settings_security_new_passwords_do_not_match'));
      }
      await updatePassword(currentPassword, newPassword);
      await lockKeychain();
      if (currentPasswordRef.current) currentPasswordRef.current.value = "";
      if (newPasswordRef.current) newPasswordRef.current.value = "";
      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
      setFormReady(false);
      setSuccess(t('settings_security_password_successfully_changed'));
    } catch (err) {
      console.error("Error changing password:", err);
      setError(err instanceof Error ? err.message : t('settings_security_failed_to_change_password'));
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles Enter key press to submit the form.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading && formReady) {
      handlePasswordChange();
    }
  };

  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="security-settings-title">
      <h2 id="security-settings-title" className="sr-only">
        {t('settings_security_security_settings')}
      </h2>
      
      <div className="flex flex-col items-center justify-center flex-grow">
        <div className="w-full max-w-md space-y-6">
          {error && <ErrorAlert message={error} onClose={() => setError("")} />}
          {success && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg">
              {success}
            </div>
          )}
          
          <div className="bg-white rounded-lg shadow-lg p-4 space-y-4">
            <PasswordInput
              innerRef={currentPasswordRef}
              label={t('settings_security_current_password')}
              name="currentPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText={t('settings_security_enter_your_current_wallet_password')}
            />

            <PasswordInput
              innerRef={newPasswordRef}
              label={t('settings_security_new_password')}
              name="newPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText={t('settings_security_choose_a_new_password_that', [String(MIN_PASSWORD_LENGTH)])}
            />

            <PasswordInput
              innerRef={confirmPasswordRef}
              label={t('settings_security_confirm_new_password')}
              name="confirmPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText={t('settings_security_re_enter_your_new_password')}
            />

            <Button
              color="blue"
              onClick={handlePasswordChange}
              fullWidth
              disabled={isLoading || !formReady}
              aria-label={t('settings_security_change_password')}
            >
              {isLoading ? t('settings_security_changing_password') : t('settings_security_change_password')}
            </Button>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>{t('settings_security_security_tip')}</strong>  {t('settings_security_use_a_strong_unique_password')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
