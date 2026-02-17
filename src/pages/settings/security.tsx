import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/utils/encryption/encryption";
import type { ReactElement } from "react";

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
      title: "Security",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: "Toggle help text",
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
        throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New passwords do not match");
      }
      await updatePassword(currentPassword, newPassword);
      await lockKeychain();
      if (currentPasswordRef.current) currentPasswordRef.current.value = "";
      if (newPasswordRef.current) newPasswordRef.current.value = "";
      if (confirmPasswordRef.current) confirmPasswordRef.current.value = "";
      setFormReady(false);
      setSuccess("Password successfully changed");
    } catch (err) {
      console.error("Error changing password:", err);
      setError(err instanceof Error ? err.message : "Failed to change password");
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
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="security-settings-title">
      <h2 id="security-settings-title" className="sr-only">
        Security Settings
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
              label="Current Password"
              name="currentPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText="Enter your current wallet password to authorize the change."
            />

            <PasswordInput
              innerRef={newPasswordRef}
              label="New Password"
              name="newPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText={`Choose a new password that is at least ${MIN_PASSWORD_LENGTH} characters long.`}
            />

            <PasswordInput
              innerRef={confirmPasswordRef}
              label="Confirm New Password"
              name="confirmPassword"
              onChange={() => checkFormReady()}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText="Re-enter your new password to confirm it was typed correctly."
            />

            <Button
              color="blue"
              onClick={handlePasswordChange}
              fullWidth
              disabled={isLoading || !formReady}
              aria-label="Change Password"
            >
              {isLoading ? "Changing Password…" : "Change Password"}
            </Button>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>Security Tip:</strong> Use a strong, unique password that you don't use for any other accounts. Consider using a password manager.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
