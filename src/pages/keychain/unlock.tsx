import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FiHelpCircle } from "@/components/icons";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { MIN_PASSWORD_LENGTH } from "@/utils/encryption/encryption";
import { getDisplayVersion } from "@/utils/version";

const PATHS = {
  SUCCESS: "/index",
  HELP_URL: "https://youtube.com/droplister",
} as const;

function UnlockPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { unlockKeychain } = useWallet();

  const [passwordReady, setPasswordReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isUnlocking, setIsUnlocking] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      rightButton: {
        icon: <FiHelpCircle className="size-4" aria-hidden="true" />,
        onClick: () => window.open(PATHS.HELP_URL, "_blank"),
        ariaLabel: "Help",
      },
    });
  }, [setHeaderProps]);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(undefined);

    const password = passwordInputRef.current?.value ?? "";

    if (!password) {
      setError("Password cannot be empty.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setIsUnlocking(true);

    try {
      await unlockKeychain(password);
      if (passwordInputRef.current) passwordInputRef.current.value = "";
      setPasswordReady(false);
      navigate(PATHS.SUCCESS);
    } catch (err) {
      console.error("Error unlocking wallet:", err);
      setError(
        err instanceof Error && err.message.includes("No wallet")
          ? err.message
          : "Invalid password. Please try again."
      );
    } finally {
      setIsUnlocking(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !isUnlocking) {
      handleSubmit();
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPasswordReady(e.target.value.length >= MIN_PASSWORD_LENGTH);
  }

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="unlock-wallet-title">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
          <h1 id="unlock-wallet-title" className="text-3xl mb-5 flex justify-between items-center">
            <span className="font-bold">XCP Wallet</span>
            <span>{getDisplayVersion()}</span>
          </h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordInput
              innerRef={passwordInputRef}
              name="password"
              placeholder="Enter your password"
              onChange={handlePasswordChange}
              onKeyDown={handleKeyDown}
              disabled={isUnlocking}
              aria-label="Password"
              aria-invalid={!!error}
              aria-describedby={error ? "password-error" : undefined}
            />
            {error && (
              <p id="password-error" className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              fullWidth
              disabled={!passwordReady || isUnlocking}
              aria-label={isUnlocking ? "Unlocking…" : "Unlock"}
            >
              {isUnlocking ? "Unlocking…" : "Unlock"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default UnlockPage;
