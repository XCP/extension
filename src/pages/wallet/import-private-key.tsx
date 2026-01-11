
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiX } from "@/components/icons";
import { 
  Field, 
  Label, 
  Listbox, 
  ListboxButton, 
  ListboxOption, 
  ListboxOptions 
} from "@headlessui/react";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressFormat } from '@/utils/blockchain/bitcoin/address';
import { validatePrivateKeyFormat } from "@/utils/validation/privateKey";

const ImportPrivateKey = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockPrivateKeyWallet, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [addressFormat, setAddressFormat] = useState<AddressFormat>(AddressFormat.P2PKH);
  const [submissionError, setSubmissionError] = useState("");
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [privateKeyValue, setPrivateKeyValue] = useState("");
  const privateKeyInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const walletExists = wallets.length > 0;

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    CLOSE: "/index",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;
  const ADDRESS_TYPES = [
    { value: AddressFormat.P2PKH, label: "Legacy", hint: "1..." },
    { value: AddressFormat.P2SH_P2WPKH, label: "Nested SegWit", hint: "3..." },
    { value: AddressFormat.P2WPKH, label: "Native SegWit", hint: "bc1q..." },
    { value: AddressFormat.P2TR, label: "Taproot", hint: "bc1p..." },
  ] as const;


  useEffect(() => {
    setHeaderProps({
      title: "Import Key",
      onBack: () => navigate(PATHS.BACK),
      rightButton: {
        icon: <FiX className="w-4 h-4" aria-hidden="true" />,
        onClick: () => navigate(PATHS.CLOSE),
        ariaLabel: 'Close',
      },
    });
  }, [setHeaderProps, navigate, walletExists]);

  useEffect(() => {
    privateKeyInputRef.current?.focus();
  }, []);

  const handleCheckboxChange = (checked: boolean) => {
    setIsConfirmed(checked);
    // Focus password input when checkbox is checked
    if (checked) {
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 50);
    }
  };
  
  const handlePrivateKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPrivateKeyValue(value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");

    const privateKey = formData.get("private-key") as string;
    const password = formData.get("password") as string;

    if (!privateKey) {
      setSubmissionError("Private key is required.");
      return;
    }
    
    const validation = validatePrivateKeyFormat(privateKey);
    if (!validation.isValid) {
      setSubmissionError(validation.error || "Invalid private key format.");
      return;
    }
    if (!isConfirmed) {
      setSubmissionError("Please confirm you have backed up your private key.");
      return;
    }
    if (!password) {
      setSubmissionError("Password is required.");
      return;
    }
    if (walletExists) {
      const isValid = await verifyPassword(password);
      if (!isValid) {
        setSubmissionError("Invalid password.");
        return;
      }
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      setSubmissionError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      return;
    }

    try {
      // Always use the user-selected address type from the dropdown
      await createAndUnlockPrivateKeyWallet(privateKey.trim(), password, undefined, addressFormat);
      navigate(PATHS.SUCCESS);
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
      setSubmissionError(errorMessage);
    }
  }

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-private-key-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 id="import-private-key-title" className="text-2xl font-bold mb-2">Import Private Key</h2>
        <p className="mb-5" id="import-instructions">Enter your private key to use its address.</p>
        {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
        <form action={handleFormAction} className="space-y-4" aria-describedby="import-instructions">
          <div className="bg-gray-100 rounded-lg pt-2 pb-4 p-2 space-y-4">
            <Field>
              <Label className="block text-sm font-medium text-gray-700">
                Address Type <span className="text-red-500">*</span>
              </Label>
              <div className="mt-1 relative">
                <input type="hidden" name="address-type" value={addressFormat} />
                <Listbox value={addressFormat} onChange={setAddressFormat} disabled={pending}>
                  <ListboxButton className="w-full p-2 text-left rounded-md border border-gray-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
                    {({ value }) => {
                      const selected = ADDRESS_TYPES.find(type => type.value === value);
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
                        className="p-2 cursor-pointer hover:bg-gray-100 data-[selected]:bg-gray-100"
                      >
                        {({ selected }) => (
                          <div className="flex justify-between items-center">
                            <span className={selected ? "font-medium" : ""}>{type.label}</span>
                            <span className="text-gray-500 font-mono text-sm">{type.hint}</span>
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
                  name="private-key"
                  placeholder="Enter your private key"
                  disabled={pending}
                  ref={privateKeyInputRef}
                  onChange={handlePrivateKeyChange}
                />
              </div>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <CheckboxInput
              name="confirmed"
              label="I have backed up this private key securely."
              defaultChecked={false}
              disabled={pending || !privateKeyValue.trim()}
              checked={isConfirmed}
              onChange={handleCheckboxChange}
            />
          </div>
          {isConfirmed && (
            <>
              <PasswordInput
                name="password"
                placeholder={walletExists ? "Confirm password" : "Create password"}
                disabled={pending}
                onChange={handlePasswordChange}
                ref={passwordInputRef}
              />
              <Button type="submit" disabled={pending || !isPasswordValid} fullWidth>
                {pending ? "Importing..." : "Continue"}
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
};

export default ImportPrivateKey;
