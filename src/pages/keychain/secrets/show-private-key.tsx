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
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useSecretReveal } from "@/hooks/useSecretReveal";

import { t } from '@/i18n';

const PATHS = {
  BACK: -1,
} as const;

export default function ShowPrivateKeyPage(): ReactElement {
  const { walletId, addressPath } = useParams<{ walletId: string; addressPath?: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { selectWallet, getPrivateKey, verifyPassword, wallets } = useWallet();
  const { pending } = useFormStatus();

  const [privateKey, setPrivateKey] = useState("");
  const [walletType, setWalletType] = useState<"mnemonic" | "privateKey" | "hardware" | null>(null);
  const { copy, isCopied } = useCopyToClipboard();

  const {
    isRevealed: isConfirmed,
    submissionError,
    setSubmissionError,
    clearError,
    passwordInputRef,
    formAction: handleFormAction,
  } = useSecretReveal({
    walletId,
    verifyPassword,
    onVerified: async () => {
      // Checked after the password, as it was before: a missing path is not a
      // reason to tell someone whether their password was right.
      if (walletType === "mnemonic" && !addressPath) {
        throw new Error(t('secrets_show_private_key_address_derivation_path_is_missing'));
      }
      try {
        // Load the wallet to decrypt its secret
        await selectWallet(walletId!);
        const privKeyData =
          walletType === "privateKey"
            ? await getPrivateKey(walletId!)
            : await getPrivateKey(walletId!, addressPath);

        if (!privKeyData) throw new Error(t('secrets_show_private_key_failed_to_retrieve_private_key'));
        if (!privKeyData.wif) throw new Error(t('secrets_show_private_key_private_key_wif_format_not'));

        setPrivateKey(privKeyData.wif);
      } catch (err) {
        console.error("Error revealing private key:", err);
        throw new Error(
          err instanceof Error ? err.message : t('secrets_show_private_key_failed_to_reveal_private_key')
        );
      }
    },
  });

  useEffect(() => {
    if (walletId) {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) {
        setSubmissionError(t('common_wallet_not_found'));
      } else if (wallet.type === "hardware") {
        setSubmissionError(t('secrets_show_private_key_hardware_wallets_do_not_expose'));
        setWalletType("hardware");
      } else {
        setWalletType(wallet.type);
      }
    }
    setHeaderProps({
      title: t('common_private_key'),
      onBack: () => navigate(PATHS.BACK),
    });
  }, [walletId, wallets, setHeaderProps, navigate, setSubmissionError]);

  const handleCopyPrivateKey = async () => {
    // useCopyToClipboard auto-clears the clipboard after 30 seconds
    await copy(privateKey);
  };

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="show-private-key-title">
      <h2 id="show-private-key-title" className="sr-only">{t('common_show_private_key')}</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={clearError} />}
      {!isConfirmed ? (
        <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow">
          <Banner
            severity="warning"
            className="max-w-md w-full mb-6"
            title={t('secrets_show_private_key_keep_your_private_key_private')}
            description={t('secrets_show_private_key_never_share_it_with_anyone')}
          />
          <div className="w-full max-w-md space-y-4">
            <PasswordInput
              name="password"
              placeholder={t('common_enter_your_password')}
              disabled={pending}
              innerRef={passwordInputRef}
            />
            <Button type="submit" disabled={pending} fullWidth color="red" aria-label={t('common_show_private_key')}>
              {pending ? t('common_verifying') : t('common_show_private_key')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col items-center justify-center flex-grow">
          <div className="w-full max-w-md space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{t('secrets_show_private_key_your_private_key_wif')}</h2>
              <p className="text-sm text-gray-600">
                {t('secrets_show_private_key_this_is_your_private_key')}
              </p>
            </div>
            <button type="button"
              onClick={handleCopyPrivateKey}
              // Distinct from the button below, which copies the same thing: two
              // controls sharing one accessible name is ambiguous to announce.
              aria-label={t('secrets_show_private_key_copy_the_private_key_shown')}
              className="block w-full text-left font-mono text-sm bg-white border border-gray-200 rounded-lg p-4 break-all text-gray-800 select-all cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors duration-200"
            >
              {privateKey}
            </button>
            <Button
              onClick={handleCopyPrivateKey}
              color="blue"
              fullWidth
              className="max-w-sm"
              aria-label={t('secrets_show_private_key_copy_private_key')}
            >
              {isCopied(privateKey) ? t('common_copied') : t('secrets_show_private_key_copy_private_key')}
            </Button>
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
