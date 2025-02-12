import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiHelpCircle } from 'react-icons/fi';
import { Field, Label, Input, Description } from '@headlessui/react';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';
import { Button } from '@/components/button';
import { useSettings } from '@/contexts/settings-context';

export function SecuritySettings() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { setHeaderProps } = useHeader();
  const { lockAll, updatePassword } = useWallet();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);

  useEffect(() => {
    setHeaderProps({
      title: 'Security',
      onBack: () => navigate('/settings'),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: 'Toggle help text',
      },
    });
  }, [setHeaderProps, navigate]);

  const isPasswordValid = (password: string) => password.length >= 8;

  const isFormValid = () => {
    return (
      passwordForm.currentPassword &&
      passwordForm.newPassword &&
      passwordForm.confirmPassword &&
      isPasswordValid(passwordForm.newPassword)
    );
  };

  const handlePasswordChange = async () => {
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      if (!isPasswordValid(passwordForm.newPassword)) {
        throw new Error('New password must be at least 8 characters long');
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error('New passwords do not match');
      }

      await updatePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      await lockAll();

      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });

      setSuccess('Password successfully changed');
    } catch (err) {
      console.error('Error changing password:', err);
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  const shouldShowHelpText = isHelpTextOverride
    ? !settings.showHelpText
    : settings.showHelpText;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && isFormValid()) {
      handlePasswordChange();
    }
  };

  return (
    <div className="space-y-6 p-4">
      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded"
          role="alert"
        >
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <Field>
        <Label className="font-bold">Current Password</Label>
        <Input
          id="currentPassword"
          type="password"
          value={passwordForm.currentPassword}
          onChange={(e) =>
            setPasswordForm((prev) => ({
              ...prev,
              currentPassword: e.target.value,
            }))
          }
          onKeyDown={handleKeyDown}
          className="w-full p-2 border rounded-md mt-2"
        />
        {shouldShowHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            Enter your current wallet password to authorize the change.
          </Description>
        )}
      </Field>

      <Field>
        <Label className="font-bold">New Password</Label>
        <Input
          id="newPassword"
          type="password"
          value={passwordForm.newPassword}
          onChange={(e) =>
            setPasswordForm((prev) => ({
              ...prev,
              newPassword: e.target.value,
            }))
          }
          onKeyDown={handleKeyDown}
          className="w-full p-2 border rounded-md mt-2"
        />
        {shouldShowHelpText && (
          <Description className="mt-2 text-sm text-gray-500">
            Choose a new password that is at least 8 characters long.
          </Description>
        )}
      </Field>

      <Field>
        <Label className="font-bold">Confirm New Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={passwordForm.confirmPassword}
          onChange={(e) =>
            setPasswordForm((prev) => ({
              ...prev,
              confirmPassword: e.target.value,
            }))
          }
          onKeyDown={handleKeyDown}
          className="w-full p-2 border rounded-md mt-2"
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
      >
        {isLoading ? 'Changing Password...' : 'Change Password'}
      </Button>
    </div>
  );
}

export default SecuritySettings;
