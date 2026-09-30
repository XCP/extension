import { Description, Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import type { ReactElement } from "react";
import { formatCoinBtc, formatOutpoint } from "@/components/domain/coins/coin-lock-text";
import { FaLockOpen } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { backsOffers, type CoinLock } from "@/core/bitcoin/coinLocks";
import { t } from '@/i18n';

interface UnlockCoinDialogProps {
  /** The lock to confirm removing, or null when closed. */
  lock: CoinLock | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The one question before a coin is unlocked: what spending it would cost. An offer coin says how
 * many offers a send would cancel; a coin locked by hand only that it becomes spendable.
 */
export function UnlockCoinDialog({ lock, busy, onCancel, onConfirm }: UnlockCoinDialogProps): ReactElement {
  const offers = lock && backsOffers(lock) ? lock.refs.length : null;
  const description = offers === null
    ? t('coins_unlock_confirm_manual')
    : offers === 0
      ? t('coins_unlock_confirm_funding')
      : offers === 1
        ? t('coins_unlock_confirm_one_offer')
        : t('coins_unlock_confirm_offers', String(offers));

  return (
    <Dialog open={lock !== null} onClose={() => { if (!busy) onCancel(); }} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
          <div className="flex items-center gap-2">
            <FaLockOpen className="size-4 text-gray-500" aria-hidden="true" />
            <DialogTitle as="h2" className="text-base font-semibold text-gray-900">{t('coins_unlock_confirm_title')}</DialogTitle>
          </div>
          {lock && (
            <p className="mt-1 text-xs text-gray-500 tabular-nums">
              {t('coins_coin_label', [formatCoinBtc(lock.valueSats), formatOutpoint(lock.outpoint)])}
            </p>
          )}
          <Description className="mt-3 text-sm text-gray-700">{description}</Description>
          <div className="mt-4 flex gap-3">
            <Button color="gray" onClick={onCancel} disabled={busy} fullWidth>
              {t('common_cancel')}
            </Button>
            <Button color="blue" onClick={onConfirm} disabled={busy} fullWidth>
              {t('coins_unlock')}
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
