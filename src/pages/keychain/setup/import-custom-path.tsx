import {
  Field,
  Input as HeadlessInput,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { FaEye, FaEyeSlash } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from "@/core/bitcoin/address";
import { getPrivateKeyFromMnemonic } from "@/core/bitcoin/privateKey";
import { isValidCounterwalletMnemonic } from "@/core/counterwallet";
import { analytics } from "@/platform/fathom";

const PATH_TYPES = [
  { value: AddressFormat.P2PKH, label: "Legacy", hint: "1..." },
  { value: AddressFormat.P2WPKH, label: "Bech32", hint: "bc1q..." },
] as const;

const PATHS = {
  BACK: "/keychain/wallets/add",
  SUCCESS: "/index",
} as const;

const BIP32_INDEX_MAX = 0x7fffffff;

function parsePathIndex(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > BIP32_INDEX_MAX) return null;
  return n;
}

function buildDerivationPath(change: string, index: string): string | null {
  const chg = parsePathIndex(change);
  const idx = parsePathIndex(index);
  if (chg === null || idx === null) return null;
  return `m/0'/${chg}/${idx}`;
}

function PathSegmentInput({
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <HeadlessInput
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      aria-label={ariaLabel}
      disabled={disabled}
      className="w-10 p-1 text-center font-mono text-sm rounded border border-gray-200 bg-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-100"
    />
  );
}

function ImportCustomPathPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createPrivateKeyWallet } = useWallet();

  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicWords, setMnemonicWords] = useState<string[]>(Array(12).fill(""));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2WPKH);
  const [change, setChange] = useState("0");
  const [addressIndex, setAddressIndex] = useState("0");
  const [errorDismissed, setErrorDismissed] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(12).fill(null));

  const derivationPath = buildDerivationPath(change, addressIndex);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      const words = Array.from({ length: 12 }, (_, i) => formData.get(`word-${i}`) as string);
      const mnemonic = words.join(" ").trim().toLowerCase();

      if (!isValidCounterwalletMnemonic(mnemonic)) {
        return { error: "Invalid recovery phrase. Please check each word carefully." };
      }

      const path = buildDerivationPath(change, addressIndex);
      if (!path) {
        return { error: "Enter a valid derivation path." };
      }

      try {
        // Old Electrum / Counterwallet seed, encoded as Legacy or Native SegWit.
        const seedFormat = addressFormat === AddressFormat.P2WPKH
          ? AddressFormat.CounterwalletSegwit
          : AddressFormat.Counterwallet;
        const privateKey = getPrivateKeyFromMnemonic(mnemonic, path, seedFormat);
        await createPrivateKeyWallet(privateKey, "", undefined, addressFormat);
        analytics.track("private_key_imported");
        navigate(PATHS.SUCCESS);
        return { error: null };
      } catch (error) {
        let errorMessage = "Failed to import custom path. ";
        if (error instanceof Error) {
          errorMessage +=
            error.message.includes("already exists")
              ? "This private key has already been imported."
              : error.message;
        } else {
          errorMessage += "Please check your input and try again.";
        }
        return { error: errorMessage };
      }
    },
    { error: null }
  );

  const allWordsPopulated = mnemonicWords.every((word) => word.trim().length > 0);
  const canSubmit = allWordsPopulated && derivationPath !== null && !isPending;

  useEffect(() => {
    if (state.error) setErrorDismissed(false);
  }, [state.error]);

  useEffect(() => {
    setHeaderProps({
      title: "Import Path",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: showMnemonic
          ? <FaEyeSlash className="size-3" aria-hidden="true" />
          : <FaEye className="size-3" aria-hidden="true" />,
        onClick: () => setShowMnemonic((prev) => !prev),
        ariaLabel: showMnemonic ? "Hide recovery phrase" : "Show recovery phrase",
      },
    });
  }, [navigate, setHeaderProps, showMnemonic]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function handleWordChange(index: number, value: string) {
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

  return (
    <section className="flex-grow overflow-y-auto p-4" aria-labelledby="import-custom-path-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && !errorDismissed && (
          <ErrorAlert message={state.error} onClose={() => setErrorDismissed(true)} />
        )}
        <h2 id="import-custom-path-title" className="text-2xl font-bold mb-2">Import Custom Path</h2>
        <p className="mb-5" id="import-instructions">
          Enter your 12-word recovery phrase and the derivation path for this address.
        </p>
        <form
          action={formAction}
          className="space-y-4"
          aria-describedby="import-instructions"
          onSubmit={(e) => { if (!canSubmit) e.preventDefault(); }}
        >
          <section className="bg-gray-100 p-2 rounded-md" aria-label="Recovery phrase input">
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
                        className={`font-mono w-full bg-transparent outline-none ${!showMnemonic && hasValue ? "opacity-0" : ""}`}
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

          <div className="bg-gray-100 rounded-lg pt-2 pb-4 p-2 space-y-3">
            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Derivation Path
              </Label>
              <div className="mt-1 relative">
                <Listbox value={addressFormat} onChange={setAddressFormat} disabled={isPending}>
                  <ListboxButton className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer disabled:cursor-not-allowed">
                    {({ value }) => {
                      const selected = PATH_TYPES.find((type) => type.value === value);
                      return (
                        <div className="flex justify-between items-center">
                          <span>{selected?.label}</span>
                          <span className="text-gray-500 font-mono text-sm">{selected?.hint}</span>
                        </div>
                      );
                    }}
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {PATH_TYPES.map((type) => (
                      <ListboxOption
                        key={type.value}
                        value={type.value}
                        className={({ focus, selected }) =>
                          `p-2.5 cursor-pointer select-none ${focus ? "bg-blue-500 text-white" : "text-gray-900"} ${selected ? "font-medium" : ""}`
                        }
                      >
                        {({ selected, focus }) => (
                          <div className="flex justify-between items-center">
                            <span className={selected ? "font-medium" : ""}>{type.label}</span>
                            <span className={`font-mono text-sm ${focus ? "text-blue-100" : "text-gray-500"}`}>{type.hint}</span>
                          </div>
                        )}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </Listbox>
              </div>
            </Field>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 font-mono text-sm text-gray-700" aria-label="Derivation path">
              <span className="px-2 py-1 rounded bg-gray-200 text-gray-600">m/0'</span>
              <span aria-hidden="true">/</span>
              <PathSegmentInput value={change} onChange={setChange} ariaLabel="Change" disabled={isPending} />
              <span aria-hidden="true">/</span>
              <PathSegmentInput value={addressIndex} onChange={setAddressIndex} ariaLabel="Address index" disabled={isPending} />
            </div>
          </div>

          <Button
            type="submit"
            fullWidth
            disabled={!canSubmit}
          >
            {isPending ? "Importing…" : "Continue"}
          </Button>
        </form>
      </div>
    </section>
  );
}

export default ImportCustomPathPage;
