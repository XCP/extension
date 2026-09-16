import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate, useParams } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";

import { t } from '@/i18n';

const PATHS = {
  BACK: -1,
  SUCCESS: "/keychain/wallets",
} as const;

function RemoveWalletPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, removeWallet, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<"mnemonic" | "privateKey" | "hardware">("mnemonic");
  const [submissionError, setSubmissionError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!walletId || !wallet) {
      setSubmissionError(walletId ? t('common_wallet_not_found') : t('wallets_remove_invalid_wallet_identifier'));
      return;
    }
    setWalletName(wallet.name);
    setWalletType(wallet.type);
    setHeaderProps({
      title: t('wallets_remove_remove_wallet'),
      onBack: () => navigate(PATHS.BACK),
    });
  }, [walletId, wallets, setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");

    const password = formData.get("password") as string;
    if (!walletId) {
      setSubmissionError(t('wallets_remove_invalid_wallet_identifier'));
      return;
    }
    if (!password) {
      setSubmissionError(t('common_password_cannot_be_empty'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmissionError(t('common_password_must_be_at_least', [String(MIN_PASSWORD_LENGTH)]));
      return;
    }
    try {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setSubmissionError(t('common_password_does_not_match'));
        return;
      }
    } catch {
      setSubmissionError(t('common_password_verification_failed'));
      return;
    }

    try {
      await removeWallet(walletId);
      navigate(PATHS.SUCCESS, { replace: true });
    } catch (err) {
      console.error("Error removing wallet:", err);
      setSubmissionError(t('wallets_remove_failed_to_remove_wallet_please'));
    }
  }

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="remove-wallet-title">
      <h2 id="remove-wallet-title" className="sr-only text-2xl font-bold mb-2">{t('wallets_remove_remove_wallet')}</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow" aria-describedby="remove-wallet-warning">
        <Banner
          id="remove-wallet-warning"
          severity="danger"
          className="max-w-md w-full mb-6"
          title={t('common_this_can_t_be_undone')}
          description={walletType === "mnemonic"
            ? t('wallets_remove_make_sure_you_have_backed')
            : t('wallets_remove_make_sure_you_have_backed_2')}
        />
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            name="password"
            placeholder={t('common_confirm_your_password')}
            disabled={pending}
            innerRef={passwordInputRef}
          />
          <Button type="submit" disabled={pending} fullWidth color="red" aria-label={t('wallets_remove_remove', [String(walletName || "wallet")])}>
            {pending ? t('wallets_remove_removing') : t('wallets_remove_remove', [String(walletName || "Wallet")])}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default RemoveWalletPage;
