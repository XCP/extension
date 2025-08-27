"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiHelpCircle } from "react-icons/fi";
import { Field, Label, Input, Description } from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import type { ReactElement } from "react";

/**
 * Constants for navigation paths and validation rules.
 */
const CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  PATHS: {
    BACK: "/settings",
  } as const,
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
export default function SecuritySettings(): ReactElement {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);

  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { lockAll, updatePassword } = useWallet();
  const { settings } = useSettings();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Security",
      onBack: () => navigate(CONSTANTS.PATHS.BACK),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" aria-hidden="true" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: "Toggle help text",
      },
    });
  }, [setHeaderProps, navigate]);

  /**
   * Validates the password length.
   * @param password - The password to validate.
   * @returns {boolean} Whether the password is valid.
   */
  const isPasswordValid = (password: string): boolean =>
    password.length >= CONSTANTS.MIN_PASSWORD_LENGTH;

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
        throw new Error(`New password must be at least ${CONSTANTS.MIN_PASSWORD_LENGTH} characters long`);
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("New passwords do not match");
      }
      await updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
      await lockAll();
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
            <Field>
              <Label className="text-sm font-medium text-gray-700">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                onKeyDown={handleKeyDown}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
                aria-label="Current Password"
              />
              {shouldShowHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  Enter your current wallet password to authorize the change.
                </Description>
              )}
            </Field>
            
            <Field>
              <Label className="text-sm font-medium text-gray-700">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                onKeyDown={handleKeyDown}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
                aria-label="New Password"
              />
              {shouldShowHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  Choose a new password that is at least {CONSTANTS.MIN_PASSWORD_LENGTH} characters long.
                </Description>
              )}
            </Field>
            
            <Field>
              <Label className="text-sm font-medium text-gray-700">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                onKeyDown={handleKeyDown}
                className="mt-1 block w-full p-2 rounded-md border border-gray-300 bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                disabled={isLoading}
                aria-label="Confirm New Password"
              />
              {shouldShowHelpText && (
                <Description className="mt-2 text-sm text-gray-500">
                  Re-enter your new password to confirm it was typed correctly.
                </Description>
              )}
            </Field>
            
            <Button
              color="blue"
              onClick={handlePasswordChange}
              fullWidth
              disabled={isLoading || !isFormValid()}
              aria-label="Change Password"
            >
              {isLoading ? "Changing Password..." : "Change Password"}
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
