import { useEffect, useRef, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";

interface UseSecretRevealOptions {
  /** The wallet whose secret is being revealed; absent means the route was malformed. */
  walletId: string | undefined;
  /**
   * Retrieves and stores the secret. The password is checked in the background by the same call
   * that returns the secret, never here. Resolve true once the secret is stored, false when the
   * password was wrong. Throw to report any other failure: the thrown message is what the user
   * sees, so throw the message you want shown rather than letting an internal one escape.
   * Supplied by the caller so this hook stays free of context.
   */
  reveal: (password: string) => Promise<boolean>;
}

interface SecretReveal {
  /** True once reveal has resolved true; the caller swaps the form for the secret. */
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
 * stops the two screens from drifting into checking different things. Whether the
 * password is right is decided in the background, by the call that returns the secret.
 */
export function useSecretReveal({
  walletId,
  reveal,
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

    let revealed = false;
    try {
      revealed = await reveal(password);
    } catch (err) {
      // A failed reveal is never a revealed secret, whatever failed.
      setSubmissionError(
        err instanceof Error ? err.message : "Failed to reveal the secret."
      );
      return;
    }
    if (!revealed) {
      setSubmissionError("Incorrect password.");
      return;
    }
    setIsRevealed(true);
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
