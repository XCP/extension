import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCheck } from 'react-icons/fa';
import { FiHelpCircle } from 'react-icons/fi';
import { Switch, Field, Label, Description, RadioGroup } from '@headlessui/react';
import { useHeader } from '@/contexts/header-context';
import { useSettings } from '@/contexts/settings-context';
import type { AutoLockTimer } from '@/utils/storage';

export function AdvancedSettings() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { settings, updateSettings, isLoading } = useSettings();
  const [isHelpTextOverride, setIsHelpTextOverride] = useState(false);

  useEffect(() => {
    setHeaderProps({
      title: 'Advanced',
      onBack: () => navigate(-1),
      rightButton: {
        icon: <FiHelpCircle className="w-4 h-4" />,
        onClick: () => setIsHelpTextOverride((prev) => !prev),
        ariaLabel: 'Toggle help text',
      },
    });
  }, [setHeaderProps, navigate]);

  if (isLoading || !settings) {
    return null;
  }

  const autoLockOptions: { value: AutoLockTimer; label: string }[] = [
    { value: '5m', label: '5 Minutes' },
    { value: '15m', label: '15 Minutes' },
    { value: '30m', label: '30 Minutes' },
  ];

  const shouldShowHelpText = isHelpTextOverride ? !settings.showHelpText : settings.showHelpText;

  return (
    <div className="space-y-6 p-4">
      <Field>
        <Label className="font-bold">Auto-Lock Timer</Label>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? '' : 'hidden'}`}>
          Choose how long to wait before automatically locking your wallet.
        </Description>
        <RadioGroup
          value={settings.autoLockTimer}
          onChange={(value: AutoLockTimer) => updateSettings({ autoLockTimer: value })}
          className="mt-4 space-y-2"
        >
          {autoLockOptions.map((option) => (
            <RadioGroup.Option
              key={option.value}
              value={option.value}
              className={({ checked }) => `
                relative w-full rounded transition duration-300 p-4
                ${checked ? 'cursor-pointer bg-white shadow-md' : 'cursor-pointer bg-white hover:bg-gray-50'}
              `}
            >
              {({ checked }) => (
                <>
                  {checked && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaCheck className="w-4 h-4 text-blue-500" />
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-900">
                      {option.label}
                    </span>
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
            className={`${
              settings.enableMPMA ? 'bg-blue-600' : 'bg-gray-200'
            } p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span className={`${
              settings.enableMPMA ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? '' : 'hidden'}`}>
          Enable multi-destination sends (MPMA) for supported assets.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Use Unconfirmed TXs</Label>
          <Switch
            checked={settings.allowUnconfirmedTxs}
            onChange={(checked) => updateSettings({ allowUnconfirmedTxs: checked })}
            className={`${
              settings.allowUnconfirmedTxs ? 'bg-blue-600' : 'bg-gray-200'
            } p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span className={`${
              settings.allowUnconfirmedTxs ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? '' : 'hidden'}`}>
          Enable this to chain transactions that haven't been confirmed yet.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Show/Hide Help Text</Label>
          <Switch
            checked={settings.showHelpText}
            onChange={(checked) => updateSettings({ showHelpText: checked })}
            className={`${
              settings.showHelpText ? 'bg-blue-600' : 'bg-gray-200'
            } p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span className={`${
              settings.showHelpText ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? '' : 'hidden'}`}>
          Show or hide help text by default.
        </Description>
      </Field>

      <Field>
        <div className="flex items-center justify-between">
          <Label className="font-bold">Anonymous Analytics</Label>
          <Switch
            checked={settings.analyticsAllowed}
            onChange={(checked) => updateSettings({ analyticsAllowed: checked })}
            className={`${
              settings.analyticsAllowed ? 'bg-blue-600' : 'bg-gray-200'
            } p-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer`}
          >
            <span className={`${
              settings.analyticsAllowed ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`} />
          </Switch>
        </div>
        <Description className={`mt-2 text-sm text-gray-500 ${shouldShowHelpText ? '' : 'hidden'}`}>
          Choose whether to share usage data.
        </Description>
      </Field>
    </div>
  );
}

export default AdvancedSettings;
