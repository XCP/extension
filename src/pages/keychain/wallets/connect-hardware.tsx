"use client";

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { FiHelpCircle, FiShield } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { hardwareErrorMessage } from '@/components/ui/hardware-error-message';
import { Spinner } from "@/components/ui/spinner";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";

import { t } from '@/i18n';
import { useLocaleRevision } from '@/i18n/use-locale';
export default function ConnectHardware(): ReactElement {
  const localeRevision = useLocaleRevision();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createHardwareWalletWithDiscovery, setHardwareOperationInProgress } = useWallet();

  const [isConnecting, setIsConnecting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const error = failure ? hardwareErrorMessage(failure)
    ?? (failure instanceof Error ? failure.message : t('wallets_connect_hardware_failed_to_connect_hardware_wallet')) : '';

  useEffect(() => {
    setHeaderProps({
      title: t('wallets_connect_hardware_connect_trezor'),
      onBack: () => navigate(-1),
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open("#", "_blank"),
        ariaLabel: t('common_help'),
      },
    });
  }, [setHeaderProps, navigate, localeRevision]);

  async function handleConnect() {
    setFailure(null);
    setIsConnecting(true);
    setHardwareOperationInProgress(true);

    try {
      // Reset adapter before connecting to ensure clean state
      const { resetTrezorAdapter } = await import('@/core/hardware/trezorAdapter');
      await resetTrezorAdapter();

      // Use account discovery - Trezor will show account selection UI
      await createHardwareWalletWithDiscovery("trezor");

      // Success - go straight to index
      navigate("/index");
    } catch (err) {
      console.error('[ConnectHardware] Error:', err);
      setFailure(err instanceof Error ? err : {});
    } finally {
      setIsConnecting(false);
      setHardwareOperationInProgress(false);
    }
  }

  if (isConnecting) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
        <Spinner />
        <div className="text-center mt-6">
          <h2 className="text-lg font-semibold mb-2 text-gray-900">{t('wallets_connect_hardware_connecting')}</h2>
          <p className="text-sm text-gray-600">
            {t('wallets_connect_hardware_select_your_account_on_your')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-full p-4">
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00854D]/10 flex items-center justify-center">
            <FiShield className="w-8 h-8 text-[#00854D]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('wallets_connect_hardware_connect_your_trezor')}</h2>
          <p className="text-sm text-gray-600">
            {t('wallets_connect_hardware_your_trezor_will_discover_your')}
          </p>
        </div>

        {error && <ErrorAlert message={error} onClose={() => setFailure(null)} />}

        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">{t('wallets_connect_hardware_before_connecting')}</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">1</span>
              
              {t('wallets_connect_hardware_connect_your_trezor_via_usb')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">2</span>
              
              {t('wallets_connect_hardware_unlock_your_device_with_pin')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-xs">3</span>
              
              {t('wallets_connect_hardware_select_your_account_when_prompted')}
            </li>
          </ul>
        </div>

        <Button onClick={handleConnect} className="w-full">
          {t('wallets_connect_hardware_connect_trezor')}
        </Button>

        <p className="text-xs text-gray-500 text-center">
          {t('wallets_connect_hardware_your_private_keys_never_leave')}
        </p>
      </div>
    </div>
  );
}
