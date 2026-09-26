import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/contexts/wallet-context';
import { t } from '@/i18n';
import { hasTrezorSuiteAccess, requestTrezorSuiteAccess } from '@/platform/suiteAccess';

/**
 * Asks once for Trezor Suite access when a Trezor wallet does not have it yet: people who
 * connected their Trezor before 0.13.0, when the wallet reached the device another way.
 * The button's click is the user gesture Chrome requires for its prompt.
 */
export function TrezorAccessNotice(): ReactElement | null {
  const { activeWallet } = useWallet();
  // The device vendor lives in the wallet's encrypted secret, not on the wallet the popup sees.
  // Trezor is the only hardware wallet the wallet can create (walletManager refuses any other),
  // so a hardware wallet is a Trezor.
  const isTrezor = activeWallet?.type === 'hardware';
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isTrezor) return;
    let live = true;
    hasTrezorSuiteAccess()
      .then(granted => { if (live) setMissing(!granted); })
      .catch(() => {});
    return () => { live = false; };
  }, [isTrezor]);

  const allow = async () => {
    setFailed(false);
    try {
      if (await requestTrezorSuiteAccess()) setMissing(false);
    } catch (error) {
      console.error('Trezor Suite access request failed:', error);
      setFailed(true);
    }
  };

  if (!isTrezor || !missing) return null;
  return (
    <div role="status" className="mb-3">
      <Banner severity="warning" title={t('trezor_access_notice_title')} description={t('trezor_access_notice_body')}>
        {failed && <p role="alert" className="text-xs mt-1">{t('trezor_access_notice_failed')}</p>}
        <Button
          className="mt-2"
          fullWidth
          onClick={() => { void allow(); }}
        >
          {t('trezor_access_notice_allow')}
        </Button>
      </Banner>
    </div>
  );
}
