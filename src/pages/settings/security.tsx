import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "@/components/icons";
import { Button } from "@/components/button";
import { PasswordInput } from "@/components/inputs/password-input";
import { ErrorAlert } from "@/components/error-alert";
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
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);
  const currentPasswordRef = useRef<HTMLInputElement>(null);

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
   * Validates the password length.
   * @param password - The password to validate.
   * @returns {boolean} Whether the password is valid.
   */
  const isPasswordValid = (password: string): boolean =>
    password.length >= MIN_PASSWORD_LENGTH;

  /**
   * Checks if the form is valid for submission.
   * @returns {boolean} Whether the form is valid.
   */
  const isFormValid = (): boolean =>
    Boolean(passwordForm.currentPassword) &&
    Boolean(passwordForm.newPassword) &&
    Boolean(passwordForm.confirmPassword) &&
    isPasswordValid(passwordForm.newPassword);

  /**
   * Handles the password change process.
   */
  const handlePasswordChange = async () => {
    setError("");
    setSuccess("");
    setIsLoading(true);

    try {
      if (!isPasswordValid(passwordForm.newPassword)) {
        throw new Error(`New password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("New passwords do not match");
      }
      await updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
      await lockKeychain();
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
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
    if (e.key === "Enter" && !isLoading && isFormValid()) {
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
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText="Enter your current wallet password to authorize the change."
            />
            
            <PasswordInput
              label="New Password"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText={`Choose a new password that is at least ${MIN_PASSWORD_LENGTH} characters long.`}
            />
            
            <PasswordInput
              label="Confirm New Password"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              showHelpText={shouldShowHelpText}
              helpText="Re-enter your new password to confirm it was typed correctly."
            />
            
            <Button
              color="blue"
              onClick={handlePasswordChange}
              fullWidth
              disabled={isLoading || !isFormValid()}
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
