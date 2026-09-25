import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
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
  const isTrezor = activeWallet?.type === 'hardware';
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!isTrezor) return;
    let live = true;
    hasTrezorSuiteAccess()
      .then(granted => { if (live) setMissing(!granted); })
      .catch(() => {});
    return () => { live = false; };
  }, [isTrezor]);

  const allow = async () => {
    if (await requestTrezorSuiteAccess()) setMissing(false);
  };

  if (!isTrezor || !missing) return null;
  return (
    <div role="status" className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p>{t('trezor_access_notice_body')}</p>
      <Button
        className="mt-2"
        fullWidth
        onClick={() => { void allow(); }}
      >
        {t('trezor_access_notice_allow')}
      </Button>
    </div>
  );
}
