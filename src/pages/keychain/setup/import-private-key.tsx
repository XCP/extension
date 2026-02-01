import { useActionState, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Field,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FiX } from "@/components/icons";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { PasswordInput } from "@/components/ui/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from "@/utils/blockchain/bitcoin/address";
import { MIN_PASSWORD_LENGTH } from "@/utils/encryption/encryption";
import { analytics } from "@/utils/fathom";
import { validatePrivateKeyFormat } from "@/utils/validation/privateKey";

const ADDRESS_TYPES = [
  { value: AddressFormat.P2PKH, label: "Legacy", hint: "1..." },
  { value: AddressFormat.P2SH_P2WPKH, label: "Nested SegWit", hint: "3..." },
  { value: AddressFormat.P2WPKH, label: "Native SegWit", hint: "bc1q..." },
  { value: AddressFormat.P2TR, label: "Taproot", hint: "bc1p..." },
] as const;

const PATHS = {
  BACK: "/keychain/wallets/add",
  SUCCESS: "/index",
} as const;

function ImportPrivateKeyPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { createPrivateKeyWallet, verifyPassword } = useWallet();

  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2PKH);
  const [privateKeyValue, setPrivateKeyValue] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);

  const privateKeyInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, isPending] = useActionState(
    async (_prevState: { error: string | null }, formData: FormData) => {
      const privateKey = formData.get("private-key") as string;
      const password = formData.get("password") as string;

      if (!privateKey) {
        return { error: "Private key is required." };
      }

      const validation = validatePrivateKeyFormat(privateKey);
      if (!validation.isValid) {
        return { error: validation.error || "Invalid private key format." };
      }

      if (!isConfirmed) {
        return { error: "Please confirm you have backed up your private key." };
      }

      if (!password) {
        return { error: "Password is required." };
      }

      const isValid = await verifyPassword(password);
      if (!isValid) {
        return { error: "Password does not match." };
      }

      try {
        await createPrivateKeyWallet(privateKey.trim(), password, undefined, addressFormat);
        analytics.track('private_key_imported');
        navigate(PATHS.SUCCESS);
        return { error: null };
      } catch (error) {
        let errorMessage = "Failed to import private key. ";
        if (error instanceof Error) {
          errorMessage +=
            error.message.includes("Invalid private key")
              ? "The private key format is invalid."
              : error.message.includes("already exists")
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

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = isConfirmed && isPasswordValid && !isPending;

  useEffect(() => {
    if (state.error) setErrorDismissed(false);
  }, [state.error]);

  useEffect(() => {
    setHeaderProps({
      title: "Import Key",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiX className="size-4" aria-hidden="true" />,
        onClick: () => navigate(PATHS.SUCCESS),
        ariaLabel: "Close",
      },
    });
  }, [setHeaderProps, navigate]);

  useEffect(() => {
    privateKeyInputRef.current?.focus();
  }, []);

  function handlePrivateKeyChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPrivateKeyValue(e.target.value);
  }

  function handleCheckboxChange(checked: boolean) {
    setIsConfirmed(checked);
    if (checked) {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }

  function handlePasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPassword(e.target.value);
  }

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-private-key-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        {state.error && !errorDismissed && (
          <ErrorAlert message={state.error} onClose={() => setErrorDismissed(true)} />
        )}
        <h2 id="import-private-key-title" className="text-2xl font-bold mb-2">Import Private Key</h2>
        <p className="mb-5" id="import-instructions">Enter your private key to use its address.</p>
        <form
          action={formAction}
          className="space-y-4"
          aria-describedby="import-instructions"
          onSubmit={(e) => { if (!canSubmit) e.preventDefault(); }}
        >
          <div className="bg-gray-100 rounded-lg pt-2 pb-4 p-2 space-y-4">
            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Address Type <span className="text-red-500">*</span>
              </Label>
              <div className="mt-1 relative">
                <input type="hidden" name="address-type" value={addressFormat} />
                <Listbox value={addressFormat} onChange={setAddressFormat} disabled={isPending}>
                  <ListboxButton className="w-full p-2.5 text-left rounded-md border border-gray-200 bg-white outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer disabled:cursor-not-allowed">
                    {({ value }) => {
                      const selected = ADDRESS_TYPES.find((type) => type.value === value);
                      return (
                        <div className="flex justify-between items-center">
                          <span>{selected?.label}</span>
                          <span className="text-gray-500 font-mono text-sm">{selected?.hint}</span>
                        </div>
                      );
                    }}
                  </ListboxButton>
                  <ListboxOptions className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
                    {ADDRESS_TYPES.map((type) => (
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

            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Private Key <span className="text-red-500">*</span>
              </Label>
              <div className="mt-1">
                <PasswordInput
                  innerRef={privateKeyInputRef}
                  name="private-key"
                  placeholder="Enter your private key"
                  disabled={isPending}
                  onChange={handlePrivateKeyChange}
                />
              </div>
            </Field>
          </div>
          <CheckboxInput
            name="confirmed"
            label="I have backed up this private key securely."
            disabled={isPending || !privateKeyValue.trim()}
            checked={isConfirmed}
            onChange={handleCheckboxChange}
          />
          {isConfirmed && (
            <>
              <PasswordInput
                innerRef={passwordInputRef}
                name="password"
                placeholder="Confirm your password"
                disabled={isPending}
                onChange={handlePasswordChange}
              />
              <Button
                type="submit"
                fullWidth
                disabled={!canSubmit}
              >
                {isPending ? "Importing…" : "Continue"}
              </Button>
            </>
          )}
        </form>
      </div>
      {!isConfirmed && (
        <Button
          variant="youtube"
          href="https://youtu.be/FxJKsmdtU-8"
        >
          Watch Tutorial: How to Import a Private Key
        </Button>
      )}
    </div>
  );
}

export default ImportPrivateKeyPage;
