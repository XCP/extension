import { useEffect, useRef, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";

interface UseSecretRevealOptions {
  /** The wallet whose secret is being revealed; absent means the route was malformed. */
  walletId: string | undefined;
  /** Verifies the password. Supplied by the caller so this hook stays free of context. */
  verifyPassword: (password: string) => Promise<boolean>;
  /**
   * Runs only once the password has been verified. Retrieve and store the secret here.
   * Throw to report a failure: the thrown message is what the user sees, so throw the
   * message you want shown rather than letting an internal one escape.
   */
  onVerified: () => Promise<void>;
}

interface SecretReveal {
  /** True once onVerified has resolved; the caller swaps the form for the secret. */
  isRevealed: boolean;
  submissionError: string;
  /** For errors the page discovers outside the form, e.g. an unusable wallet. */
  setSubmissionError: (message: string) => void;
  clearError: () => void;
  passwordInputRef: React.RefObject<HTMLInputElement | null>;
  formAction: (formData: FormData) => Promise<void>;
}

/**
 * The password gate in front of a revealed secret.
 *
 * The passphrase and private key screens ask the same question in the same order —
 * is there a wallet, is there a password, is it long enough, does it verify — and
 * only then differ in what they reveal. Keeping that sequence in one place is what
 * stops the two screens from drifting into checking different things.
 */
export function useSecretReveal({
  walletId,
  verifyPassword,
  onVerified,
}: UseSecretRevealOptions): SecretReveal {
  const [isRevealed, setIsRevealed] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    passwordInputRef.current?.focus();
  }, []);

  async function formAction(formData: FormData) {
    setSubmissionError("");

    const password = formData.get("password") as string;
    if (!walletId) {
      setSubmissionError("Invalid wallet.");
      return;
    }
    if (!password) {
      setSubmissionError("Password is required.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    let passwordValid = false;
    try {
      passwordValid = await verifyPassword(password);
    } catch {
      // A thrown verifier is a failed verification, never a passing one.
      passwordValid = false;
    }
    if (!passwordValid) {
      setSubmissionError("Incorrect password.");
      return;
    }

    try {
      await onVerified();
      setIsRevealed(true);
    } catch (err) {
      setSubmissionError(
        err instanceof Error ? err.message : "Failed to reveal the secret."
      );
    }
  }

  return {
    isRevealed,
    submissionError,
    setSubmissionError,
    clearError: () => setSubmissionError(""),
    passwordInputRef,
    formAction,
  };
}
