import { Input as HeadlessInput } from "@headlessui/react";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FaEye, FaEyeSlash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat, detectAddressFormat, isCounterwalletFormat } from "@/core/bitcoin/address";
import { getPrivateKeyFromMnemonic } from "@/core/bitcoin/privateKey";
import { isValidCounterwalletMnemonic } from "@/core/counterwallet";
import { MIN_PASSWORD_LENGTH } from "@/core/encryption/encryption";
import { formatAddress } from "@/core/format";
import { detectGiftCard, GIFT_CARD_PATH } from "@/core/wallet/rarePepeWallet";
import { analytics } from "@/platform/fathom";

/** How long the phrase must hold still before it is worth spending lookups on. */
const GIFT_CARD_CHECK_DELAY_MS = 400;

/** What to do with a Counterwallet phrase once the gift card check has spoken. */
type GiftCardChoice = "gift-card" | "wallet";

/**
 * What the gift card check made of a phrase.
 *
 * Carries the phrase it describes so an edit invalidates it on its own — a finding about words
 * the user has since changed is worse than no finding at all.
 */
type GiftCardFinding =
  | { status: "gift-card"; mnemonic: string; address: string }
  | { status: "unavailable"; mnemonic: string };

function ImportMnemonicPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const {
    keychainExists,
    createMnemonicWallet,
    createPrivateKeyWallet,
    sweepUtxoAddresses,
    verifyPassword,
  } = useWallet();

  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [passwordReady, setPasswordReady] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);
  /** What the gift card check made of the phrase currently in the inputs. */
  const [giftCardFinding, setGiftCardFinding] = useState<GiftCardFinding | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(12).fill(null));
  /**
   * What the user pressed on the gift card prompt, read by the action on the submit that follows.
   *
   * A ref rather than state because the click handler runs in the same tick as the submit it
   * triggers: state set here would still read as its previous value inside the action's closure.
   */
  const giftCardChoiceRef = useRef<GiftCardChoice | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const PATHS = {
    BACK: keychainExists ? "/keychain/wallets/add" : "/keychain/onboarding",
    SUCCESS: "/index",
  } as const;

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      const words = Array.from({ length: 12 }, (_, i) => formData.get(`word-${i}`) as string);
      const mnemonic = words.join(" ").trim().toLowerCase();
      const password = formData.get("password") as string;
      // Set by whichever button was pressed; null when no gift card prompt was shown.
      const giftCardChoice = giftCardChoiceRef.current;

      const isBip39Valid = validateMnemonic(mnemonic, wordlist);
      const isCwValid = isValidCounterwalletMnemonic(mnemonic);
      if (!isBip39Valid && !isCwValid) {
        return { error: "Invalid recovery phrase. Please check each word carefully." };
      }

      // A gift card is not the holder's phrase to have backed up, so nothing is asked of them
      // about it — the words stay with whoever handed the card over either way.
      if (!isConfirmed && giftCardChoice !== "gift-card") {
        return { error: "Please confirm you have backed up your recovery phrase." };
      }

      if (!password) {
        return { error: "Password is required." };
      }

      if (keychainExists) {
        const isValid = await verifyPassword(password);
        if (!isValid) {
          return { error: "Password does not match." };
        }
      } else if (password.length < MIN_PASSWORD_LENGTH) {
        return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.` };
      }

      try {
        let addressFormat: AddressFormat;

        if (isCwValid && !isBip39Valid) {
          // Unambiguously a Counterwallet mnemonic (words are in CW list but
          // don't form a valid BIP39 checksum) — use CW format directly.
          addressFormat = AddressFormat.Counterwallet;

          // A gift card is a bearer instrument someone handed you, not a wallet on your own
          // phrase, so the two imports produce different things — see the prompt this answers.
          if (giftCardChoice === "gift-card") {
            const privateKey = getPrivateKeyFromMnemonic(
              mnemonic,
              GIFT_CARD_PATH,
              AddressFormat.Counterwallet
            );
            // Store the derived key, not the phrase: a card is a bearer instrument someone handed
            // you, and only its one address is yours to keep.
            await createPrivateKeyWallet(privateKey, password, "Gift Card", AddressFormat.P2PKH);
            analytics.track("gift_card_imported");
            window.location.hash = PATHS.SUCCESS;
            return { error: null };
          }
        } else {
          // Either a BIP39 mnemonic, or ambiguous (valid in both wordlists).
          // Use activity detection to pick the right format — detectAddressFormat
          // already checks CW-derived addresses alongside BIP39 formats.
          try {
            addressFormat = await detectAddressFormat(mnemonic);
          } catch (detectError) {
            console.warn("Address format detection failed, using P2TR default:", detectError);
            addressFormat = AddressFormat.P2TR;
          }
        }

        const wallet = await createMnemonicWallet(mnemonic, password, undefined, addressFormat);
        analytics.track('wallet_imported');
        window.location.hash = PATHS.SUCCESS;
        // A Counterwallet seed restored from Rare Pepe Wallet may have assets attached to the
        // change address of the address it starts with, so look once, here, where that address
        // first exists.
        //
        // Asked for only when the format could have one. `sweepUtxoAddresses` already returns
        // nothing for every other format, but that guard is inside the call: the context wraps it
        // in a state refresh that runs either way, so every BIP39 import was paying one mid-flow
        // and landing on an index page whose active address had been reset to nothing.
        //
        // After the navigation and unawaited, too. The wallet is already made, so nothing about it
        // should wait on an opportunistic lookup or be undone by one failing.
        if (isCounterwalletFormat(addressFormat)) {
          void sweepUtxoAddresses(wallet.id).catch((sweepError: unknown) => {
            console.warn("UTXO address lookup failed after import:", sweepError);
          });
        }
        return { error: null };
      } catch (error: unknown) {
        console.error("Detailed error importing wallet:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { error: `Failed to import wallet: ${errorMessage}` };
      }
    },
    { error: null }
  );

  const allWordsPopulated = mnemonicWords.every((word) => word.trim().length > 0);
  const enteredMnemonic = mnemonicWords.join(" ").trim().toLowerCase();
  // Only honour a finding that still describes what is in the inputs.
  const finding = giftCardFinding?.mnemonic === enteredMnemonic ? giftCardFinding : null;
  const giftCard = finding?.status === "gift-card" ? finding : null;
  // A card is not the holder's phrase to have saved, so there is nothing to confirm about it.
  const canSubmit = (isConfirmed || giftCard !== null) && passwordReady && !isPending;

  useEffect(() => {
    if (state.error) setErrorDismissed(false);
  }, [state.error]);

  useEffect(() => {
    setHeaderProps({
      title: "Import Wallet",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: showMnemonic
          ? <FaEyeSlash className="size-3" aria-hidden="true" />
          : <FaEye className="size-3" aria-hidden="true" />,
        onClick: () => setShowMnemonic((prev) => !prev),
        ariaLabel: showMnemonic ? "Hide recovery phrase" : "Show recovery phrase",
      },
    });
  }, [navigate, setHeaderProps, showMnemonic, keychainExists, PATHS.BACK]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Check for a gift card as soon as the phrase is complete, rather than on submit: the check
  // needs only the words, and what it finds decides which of two different things the Continue
  // button should offer to make.
  useEffect(() => {
    if (!allWordsPopulated) return;
    // Only an unambiguous Counterwallet phrase can be a card. A phrase valid under BIP39 too
    // belongs to format detection, which has its own opinion about where the funds are.
    if (!isValidCounterwalletMnemonic(enteredMnemonic)) return;
    if (validateMnemonic(enteredMnemonic, wordlist)) return;

    let current = true;
    // Settle first. Typing the last word passes through shorter words that are themselves on the
    // wordlist — "them" on the way to "there" — and each complete phrase would otherwise spend
    // its own pair of lookups on a phrase the user was still in the middle of writing.
    const timer = setTimeout(() => {
      detectGiftCard(enteredMnemonic)
        .then((result) => {
          if (!current) return;
          if (result.status === "found") {
            setGiftCardFinding({
              status: "gift-card",
              mnemonic: enteredMnemonic,
              address: result.value,
            });
          } else if (result.status === "unavailable") {
            setGiftCardFinding({ status: "unavailable", mnemonic: enteredMnemonic });
          } else {
            setGiftCardFinding(null);
          }
        })
        .catch((error) => {
          console.warn("Gift card check failed:", error);
          if (current) setGiftCardFinding({ status: "unavailable", mnemonic: enteredMnemonic });
        });
    }, GIFT_CARD_CHECK_DELAY_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [allWordsPopulated, enteredMnemonic]);

  function handleWordChange(index: number, value: string) {
    // A finding about the previous phrase says nothing about this one.
    giftCardChoiceRef.current = null;

    const trimmedValue = value.trim();
    const words = trimmedValue.split(/\s+/);
    const newMnemonicWords = [...mnemonicWords];

    if (words.length > 1 && trimmedValue.length > 0) {
      let lastFilledIndex = index;
      for (let i = 0; i < words.length && index + i < 12; i++) {
        newMnemonicWords[index + i] = words[i]!;
        lastFilledIndex = index + i;
      }

      if (lastFilledIndex === 11 && words.length >= 12 - index) {
        setTimeout(() => {
          inputRefs.current[11]?.blur();
          setFocusedIndex(null);
        }, 10);
      } else if (lastFilledIndex < 11) {
        inputRefs.current[lastFilledIndex + 1]?.focus();
      } else {
        inputRefs.current[lastFilledIndex]?.blur();
        setFocusedIndex(null);
      }
    } else {
      newMnemonicWords[index] = trimmedValue;
    }
    setMnemonicWords(newMnemonicWords);
  }

  function handleWordKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (index < 11) inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleCheckboxChange(checked: boolean) {
    setIsConfirmed(checked);
    if (checked) {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPasswordReady(e.target.value.length >= MIN_PASSWORD_LENGTH);
  }

  return (
    <section className="flex-grow overflow-y-auto p-4" aria-labelledby="import-wallet-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && !errorDismissed && (
          <ErrorAlert message={state.error} onClose={() => setErrorDismissed(true)} />
        )}
        <h2 id="import-wallet-title" className="text-2xl font-bold mb-2">Import Your Mnemonic</h2>
        <p className="mb-5" id="import-instructions">Please enter your 12-word recovery phrase below.</p>
        <form
          action={formAction}
          className="space-y-4"
          aria-describedby="import-instructions"
          onSubmit={(e) => { if (!canSubmit) e.preventDefault(); }}
        >
          <section className="bg-gray-100 p-2 rounded-md mb-4" aria-label="Recovery phrase input">
            <ol className="list-none p-0 m-0 grid grid-flow-col grid-cols-2 grid-rows-6 gap-2" aria-label="Recovery phrase words">
              {[...Array(12)].map((_, index) => {
                const isFocused = focusedIndex === index;
                const word = mnemonicWords[index]?.trim() || "";
                const hasValue = word.length > 0;

                let displayContent = "";
                if (hasValue && !showMnemonic) {
                  displayContent = isFocused ? "•".repeat(word.length) : "••••••";
                }

                return (
                  <li key={index} className="bg-white rounded p-1 flex items-center relative" aria-label={`Word ${index + 1}`}>
                    <span className="absolute left-2 w-6 text-right mr-2 text-gray-500" aria-hidden="true">
                      {index + 1}.
                    </span>
                    <div className="ml-8 w-full relative overflow-hidden">
                      <HeadlessInput
                        name={`word-${index}`}
                        ref={(el: HTMLInputElement | null) => { inputRefs.current[index] = el; }}
                        type={showMnemonic ? "text" : "password"}
                        value={word}
                        onChange={(e) => handleWordChange(index, e.target.value)}
                        onKeyDown={(e) => handleWordKeyDown(e, index)}
                        onFocus={() => setFocusedIndex(index)}
                        onBlur={() => setFocusedIndex(null)}
                        className={`font-mono w-full bg-transparent outline-none ${!showMnemonic && hasValue ? 'opacity-0' : ''}`}
                        placeholder="Enter word"
                        aria-label={`Word ${index + 1}`}
                        disabled={isPending}
                      />
                      {!showMnemonic && hasValue && (
                        <div
                          className="absolute inset-0 font-mono pointer-events-none overflow-hidden text-ellipsis whitespace-nowrap"
                          aria-hidden="true"
                        >
                          {displayContent}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          {giftCard && (
            <div className="bg-gray-100 rounded-lg p-4 space-y-2" role="status">
              <p className="text-sm font-medium">This looks like a Rare Pepe Wallet gift card.</p>
              <p className="text-sm text-gray-700">
                Its balance is on{" "}
                <span className="font-mono">{formatAddress(giftCard.address)}</span>, at{" "}
                <span className="font-mono">{GIFT_CARD_PATH}</span> — an address no wallet built on
                this phrase would ever show you. Importing the card keeps that one address and
                stores no phrase.
              </p>
              <p className="text-sm text-gray-700">
                A card is written to be handed over, so treat these words as known to whoever gave
                it to you. That is why they are not imported as a wallet: every address derived
                from them would be theirs to spend from as well. They can also still spend from
                the card itself, so move anything you want to keep to an address of your own.
              </p>
            </div>
          )}
          {finding?.status === "unavailable" && (
            <p className="text-sm text-gray-500" role="status">
              Couldn't check whether this phrase is a Rare Pepe Wallet gift card — importing it as a
              wallet works either way, and a card can be imported later once you're back online.
            </p>
          )}
          {!giftCard && (
            <CheckboxInput
              name="confirmed"
              label="I have saved my secret recovery phrase."
              disabled={!allWordsPopulated || isPending}
              checked={isConfirmed}
              onChange={handleCheckboxChange}
            />
          )}
          {(isConfirmed || giftCard) && (
            <>
              <PasswordInput
                innerRef={passwordInputRef}
                name="password"
                placeholder={keychainExists ? "Confirm your password" : "Create a password"}
                disabled={isPending}
                onChange={handlePasswordChange}
              />
              <Button
                type="submit"
                onClick={() => { giftCardChoiceRef.current = giftCard ? "gift-card" : null; }}
                fullWidth
                disabled={!canSubmit}
              >
                {isPending ? "Importing…" : giftCard ? "Import Gift Card" : "Continue"}
              </Button>
            </>
          )}
        </form>
      </div>
      {!isConfirmed && (
        <Button
          variant="youtube"
          href="https://youtu.be/pGj3vl8zaUA"
        >
          Watch Tutorial: How to Import a Wallet
        </Button>
      )}
    </section>
  );
}

export default ImportMnemonicPage;
