"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiChevronDown } from "react-icons/fi";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { CheckboxInput } from "@/components/inputs/checkbox-input";
import { PasswordInput } from "@/components/inputs/password-input";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";

const ImportPrivateKey = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { wallets, createAndUnlockPrivateKeyWallet, verifyPassword } = useWallet();
  const { pending } = useFormStatus();

  const [addressType, setAddressType] = useState<AddressType>(AddressType.P2PKH);
  const [submissionError, setSubmissionError] = useState("");
  const privateKeyInputRef = useRef<HTMLInputElement>(null);
  const walletExists = wallets.length > 0;

  const PATHS = {
    BACK: walletExists ? "/add-wallet" : "/onboarding",
    SUCCESS: "/index",
  } as const;
  const MIN_PASSWORD_LENGTH = 8;
  const ADDRESS_TYPES = [
    { value: AddressType.P2PKH, label: "Legacy" },
    { value: AddressType.P2SH_P2WPKH, label: "Nested SegWit" },
    { value: AddressType.P2WPKH, label: "Native SegWit" },
  ] as const;

  const isValidPrivateKey = (key: string): boolean =>
    /^[0-9a-fA-F]{64}$|^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(key.trim());
  const isWIFUncompressed = (key: string): boolean =>
    key.startsWith("5") && /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(key);
  const isWIFCompressed = (key: string): boolean =>
    (key.startsWith("K") || key.startsWith("L")) && /^[5KL][1-9A-HJ-NP-Za-km-z]{50,51}$/.test(key);
  const isHexPrivateKey = (key: string): boolean => /^[0-9a-fA-F]{64}$/.test(key);
  const determineAddressType = (key: string): AddressType =>
    isWIFUncompressed(key)
      ? AddressType.P2PKH
      : isWIFCompressed(key)
      ? AddressType.P2SH_P2WPKH
      : isHexPrivateKey(key)
      ? AddressType.P2PKH
      : AddressType.P2PKH;

  useEffect(() => {
    setHeaderProps({
      title: "Import Key",
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate, walletExists]);

  useEffect(() => {
    privateKeyInputRef.current?.focus();
  }, []);

  async function handleFormAction(formData: FormData) {
    setSubmissionError("");

    const privateKey = formData.get("private-key") as string;
    const isConfirmed = formData.get("confirmed") === "on";
    const password = formData.get("password") as string;

    if (!privateKey) {
      setSubmissionError("Private key is required.");
      return;
    }
    if (!isValidPrivateKey(privateKey)) {
      setSubmissionError("Invalid private key format. Please enter a valid WIF or hexadecimal key.");
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
      const suggestedType = determineAddressType(privateKey);
      setAddressType(suggestedType); // Update UI, though submission uses formData
      await createAndUnlockPrivateKeyWallet(privateKey.trim(), password, undefined, addressType);
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

  const handleAddressTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAddressType(e.target.value as AddressType);
  };

  return (
    <div className="flex-grow overflow-y-auto p-4" role="main" aria-labelledby="import-private-key-title">
      <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h2 id="import-private-key-title" className="text-2xl font-bold mb-2">Import Private Key</h2>
        <p className="mb-5" id="import-instructions">Enter your private key to use its address.</p>
        {submissionError && <ErrorAlert message={submissionError} onClose={() => setSubmissionError("")} />}
        <form action={handleFormAction} className="space-y-4" aria-describedby="import-instructions">
          <PasswordInput
            name="private-key"
            placeholder="Enter private key"
            disabled={pending}
            innerRef={privateKeyInputRef}
          />
          <div className="flex items-center gap-2 mb-4">
            <CheckboxInput
              name="confirmed"
              label="I have backed up this private key"
              defaultChecked={false}
              disabled={pending}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="address-type" className="block mb-2 text-sm font-medium">
              Address Type
            </label>
            <div className="relative">
              <select
                id="address-type"
                value={addressType}
                onChange={handleAddressTypeChange}
                className="w-full p-2 pr-8 rounded-md border bg-white appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={pending}
              >
                {ADDRESS_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <FiChevronDown
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </div>
          </div>
          <PasswordInput
            name="password"
            placeholder={walletExists ? "Confirm password" : "Create password"}
            disabled={pending}
          />
          <Button type="submit" disabled={pending} fullWidth>
            {pending ? "Importing..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ImportPrivateKey;
