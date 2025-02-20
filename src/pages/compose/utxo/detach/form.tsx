import React, { useState, useRef, useEffect } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { Button } from "@/components/button";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { isValidBase58Address } from "@/utils/blockchain/bitcoin";

export interface DetachFormData {
  destination: string;
}

interface DetachFormProps {
  onSubmit: (data: DetachFormData) => void;
}

export function DetachForm({ onSubmit }: DetachFormProps) {
  const [formData, setFormData] = useState<DetachFormData>({ destination: "" });
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettings();
  const shouldShowHelpText = settings?.showHelpText;

  const { activeAddress } = useWallet();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.destination || !isValidBase58Address(formData.destination)) {
      setLocalError("Please enter a valid Bitcoin address.");
      return;
    }
    setLocalError(null);
    onSubmit(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-4">
      {localError && <div className="text-red-500 mb-2">{localError}</div>}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Field>
          <Label className="text-sm font-medium text-gray-700">
            Destination <span className="text-red-500">*</span>
          </Label>
          <div className="relative mt-1 mb-2">
            <Input
              ref={inputRef}
              type="text"
              name="destination"
              value={formData.destination}
              onChange={(e) =>
                setFormData({ ...formData, destination: e.target.value.trim() })
              }
              required
              placeholder="Enter destination address"
              className="block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <Description className={shouldShowHelpText ? "mt-2 text-sm text-gray-500" : "hidden"}>
            Enter the destination address for detaching.
          </Description>
        </Field>

        <Button type="submit" color="blue" fullWidth>
          Continue
        </Button>
      </form>
    </div>
  );
}
