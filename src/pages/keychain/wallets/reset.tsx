import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";

import { t } from '@/i18n';

const PATHS = {
  BACK: "/settings",
  SUCCESS: "/keychain/onboarding",
} as const;

function ResetWalletPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { resetKeychain, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [submissionError, setSubmissionError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderProps({
      title: t('common_reset_wallet'),
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");

    const password = formData.get("password") as string;
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
      await resetKeychain(password);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error resetting wallet:", err);
      setSubmissionError(t('wallets_reset_failed_to_reset_wallet_please'));
    }
  }

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="reset-wallet-title">
      <h2 id="reset-wallet-title" className="sr-only text-2xl font-bold mb-2">{t('common_reset_wallet')}</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow" aria-describedby="reset-wallet-warning">
        <Banner
          id="reset-wallet-warning"
          severity="danger"
          className="max-w-md w-full mb-6"
          title={t('common_this_can_t_be_undone')}
          description={t('wallets_reset_resetting_your_wallet_will_delete')}
        />
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            name="password"
            placeholder={t('common_confirm_your_password')}
            disabled={pending}
            innerRef={passwordInputRef}
          />
          <Button type="submit" disabled={pending} fullWidth color="red" aria-label={t('common_reset_wallet')}>
            {pending ? t('wallets_reset_resetting') : t('common_reset_wallet')}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default ResetWalletPage;
