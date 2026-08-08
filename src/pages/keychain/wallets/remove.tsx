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

const PATHS = {
  BACK: -1,
  SUCCESS: "/keychain/wallets",
} as const;

function RemoveWalletPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, setActiveWallet, activeWallet, removeWallet, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<"mnemonic" | "privateKey" | "hardware">("mnemonic");
  const [submissionError, setSubmissionError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!walletId || !wallet) {
      setSubmissionError(walletId ? "Wallet not found." : "Invalid wallet identifier.");
      return;
    }
    setWalletName(wallet.name);
    setWalletType(wallet.type);
    setHeaderProps({
      title: "Remove Wallet",
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
      setSubmissionError("Invalid wallet identifier.");
      return;
    }
    if (!password) {
      setSubmissionError("Password cannot be empty.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    try {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setSubmissionError("Password does not match.");
        return;
      }
    } catch {
      setSubmissionError("Password verification failed.");
      return;
    }

    try {
      const remainingWallets = wallets.filter((w) => w.id !== walletId);
      if (activeWallet?.id === walletId) {
        await setActiveWallet(remainingWallets.length > 0 ? remainingWallets[0]! : null);
      }
      await removeWallet(walletId);
      navigate(PATHS.SUCCESS, { replace: true });
    } catch (err) {
      console.error("Error removing wallet:", err);
      setSubmissionError("Failed to remove wallet. Please try again.");
    }
  }

  return (
    <section className="flex flex-col h-full p-4" aria-labelledby="remove-wallet-title">
      <h2 id="remove-wallet-title" className="sr-only text-2xl font-bold mb-2">Remove Wallet</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow" aria-describedby="remove-wallet-warning">
        <Banner
          id="remove-wallet-warning"
          severity="danger"
          className="max-w-md w-full mb-6"
          title="This can't be undone"
          description={`Make sure you have backed up your wallet's ${walletType === "mnemonic" ? "mnemonic" : "private key"} before removing it.`}
        />
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            name="password"
            placeholder="Confirm your password"
            disabled={pending}
            innerRef={passwordInputRef}
          />
          <Button type="submit" disabled={pending} fullWidth color="red" aria-label={`Remove ${walletName || "wallet"}`}>
            {pending ? "Removing…" : `Remove ${walletName || "Wallet"}`}
          </Button>
        </div>
      </form>
    </section>
  );
}

export default RemoveWalletPage;
