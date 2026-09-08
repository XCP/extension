import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate, useParams } from "react-router";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { useSecretReveal } from "@/hooks/useSecretReveal";

import { t } from '@/i18n';

const PATHS = {
  BACK: "/keychain/wallets",
} as const;

export default function ShowPassphrasePage(): ReactElement {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { selectWallet, getUnencryptedMnemonic, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [passphrase, setPassphrase] = useState("");

  const {
    isRevealed: isConfirmed,
    submissionError,
    clearError,
    passwordInputRef,
    formAction: handleFormAction,
  } = useSecretReveal({
    walletId,
    verifyPassword,
    onVerified: async () => {
      let mnemonic: string | null;
      try {
        // Load the wallet to decrypt its secret
        await selectWallet(walletId!);
        mnemonic = await getUnencryptedMnemonic(walletId!);
      } catch (err) {
        console.error("Error revealing passphrase:", err);
        throw new Error(t('secrets_show_passphrase_incorrect_password_or_failed_to'));
      }
      // Kept distinct from the failure above: retrieving nothing is not the same
      // as the retrieval throwing, and the two said different things before.
      if (!mnemonic) throw new Error(t('secrets_show_passphrase_unable_to_retrieve_recovery_phrase'));
      setPassphrase(mnemonic);
    },
  });

  useEffect(() => {
    setHeaderProps({
      title: t('secrets_show_passphrase_passphrase'),
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="show-passphrase-title">
      <h2 id="show-passphrase-title" className="sr-only">{t('secrets_show_passphrase_show_recovery_phrase')}</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={clearError} />}
      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <Banner
            severity="warning"
            className="max-w-md w-full mb-6"
            title={t('secrets_show_passphrase_keep_your_recovery_phrase_private')}
            description={t('secrets_show_passphrase_never_share_it_with_anyone')}
          />
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder={t('common_enter_your_password')}
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="red" aria-label={t('secrets_show_passphrase_show_recovery_phrase')}>
              {pending ? t('common_verifying') : t('secrets_show_passphrase_show_recovery_phrase')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <p className="text-sm text-gray-600">
                {t('secrets_show_passphrase_write_down_these_12_words')}
              </p>
            </div>
            <div className="bg-gray-50 border-2 border-gray-200 p-6 rounded-xl shadow-sm">
              <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2">
                {passphrase.split(" ").map((word, index) => (
                  <li
                    key={index}
                    className="bg-white rounded p-1 flex items-center relative border border-gray-200 select-none"
                  >
                    <span className="absolute left-2 w-4 text-right mr-2 text-gray-500 select-none">
                      {index + 1}.
                    </span>
                    <span className="font-mono ml-8 text-gray-800 select-none">{word}</span>
                  </li>
                ))}
              </ol>
            </div>
            <Banner
              severity="warning"
              title={t('common_keep_this_private')}
              description={t('common_anyone_with_it_can_steal')}
            />
          </div>
        </div>
      )}
    </section>
  );
}
