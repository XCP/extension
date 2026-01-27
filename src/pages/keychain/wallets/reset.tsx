import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FaExclamationTriangle } from "@/components/icons";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/utils/encryption/encryption";

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
      title: "Reset Wallet",
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
      await resetKeychain(password);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error resetting wallet:", err);
      setSubmissionError("Failed to reset wallet. Please try again.");
    }
  }

  return (
    <div className="flex flex-col h-full p-4" role="main" aria-labelledby="reset-wallet-title">
      <h2 id="reset-wallet-title" className="sr-only text-2xl font-bold mb-2">Reset Wallet</h2>
      {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
      <form action={handleFormAction} className="flex flex-col items-center justify-center flex-grow" aria-describedby="reset-wallet-warning">
        <div className="max-w-md w-full bg-red-50 border-2 border-red-500 rounded-xl p-6 mb-6" id="reset-wallet-warning">
          <div className="flex items-center mb-4">
            <FaExclamationTriangle className="size-6 text-red-500 mr-2" aria-hidden="true" />
            <h2 className="text-xl font-bold text-red-700">Warning</h2>
          </div>
          <p className="text-red-700 font-medium leading-relaxed">
            Resetting your wallet will delete all wallet data. This action cannot be undone.
          </p>
        </div>
        <div className="w-full max-w-md space-y-4">
          <PasswordInput
            name="password"
            placeholder="Confirm your password"
            disabled={pending}
            innerRef={passwordInputRef}
          />
          <Button type="submit" disabled={pending} fullWidth color="red" aria-label="Reset Wallet">
            {pending ? "Resetting…" : "Reset Wallet"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default ResetWalletPage;
