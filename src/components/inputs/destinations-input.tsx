import React, { useState, useRef, useEffect } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { FiPlus, FiMinus } from "react-icons/fi";
import { isValidBitcoinAddress } from "@/utils/blockchain/bitcoin";

interface Destination {
  id: number;
  address: string;
}

interface DestinationsInputProps {
  destinations: Destination[];
  onChange: (destinations: Destination[]) => void;
  onValidationChange?: (isValid: boolean) => void;
  asset?: string;
  enableMPMA?: boolean;
  required?: boolean;
  disabled?: boolean;
  showHelpText?: boolean;
}

export function DestinationsInput({
  destinations,
  onChange,
  onValidationChange,
  asset = "BTC",
  enableMPMA = false,
  required = true,
  disabled = false,
  showHelpText = false,
}: DestinationsInputProps) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = useState<{ [key: number]: boolean }>({});

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    // Check for duplicates
    const addressCounts = new Map<string, number>();
    destinations.forEach(dest => {
      if (dest.address) {
        const count = addressCounts.get(dest.address.toLowerCase()) || 0;
        addressCounts.set(dest.address.toLowerCase(), count + 1);
      }
    });
    
    // Update validation errors for duplicates
    const newErrors: { [key: number]: boolean } = {};
    destinations.forEach(dest => {
      if (dest.address) {
        if (!isValidBitcoinAddress(dest.address)) {
          newErrors[dest.id] = true;
        } else if ((addressCounts.get(dest.address.toLowerCase()) || 0) > 1) {
          newErrors[dest.id] = true;
        }
      }
    });
    setValidationErrors(newErrors);
    
    // Check overall validation status
    const hasErrors = Object.keys(newErrors).length > 0;
    const hasAllAddresses = destinations.every(dest => dest.address);
    onValidationChange?.(!hasErrors && hasAllAddresses);
  }, [destinations, onValidationChange]);

  const handleDestinationChange = (id: number, value: string) => {
    const updatedDestinations = destinations.map(dest =>
      dest.id === id ? { ...dest, address: value.trim() } : dest
    );
    onChange(updatedDestinations);
  };

  const addDestination = () => {
    if (destinations.length >= 1000) {
      return; // Hard protocol limit
    }
    onChange([...destinations, { id: Date.now(), address: "" }]);
  };

  const removeDestination = (id: number) => {
    onChange(destinations.filter(dest => dest.id !== id));
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>, id: number) => {
    // Only handle multi-line paste if:
    // 1. MPMA is enabled
    // 2. Not BTC
    // 3. Only one input exists (no empty inputs added)
    if (!enableMPMA || asset === "BTC" || destinations.length > 1) {
      return; // Let default paste behavior handle it
    }

    const pastedText = event.clipboardData.getData("text");
    const lines = pastedText
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // If multiple lines and we only have one input, handle specially
    if (lines.length > 1 && destinations.length === 1) {
      event.preventDefault();
      
      // Update current input with first address
      const currentIndex = destinations.findIndex(d => d.id === id);
      const updatedDestinations = [...destinations];
      updatedDestinations[currentIndex] = { ...updatedDestinations[currentIndex], address: lines[0] };
      
      // Add remaining addresses as new destinations (respect 1000 limit)
      const remainingSlots = 1000 - updatedDestinations.length;
      const linesToAdd = lines.slice(1, Math.min(lines.length, remainingSlots + 1));
      const newDestinations = linesToAdd.map(address => ({
        id: Date.now() + Math.random(),
        address
      }));
      
      onChange([...updatedDestinations, ...newDestinations]);
    }
  };

  const showAddButton = asset !== "BTC" && enableMPMA && destinations.length < 1000;
  const canRemove = destinations.length > 1;

  return (
    <Field>
      <Label className="text-sm font-medium text-gray-700">
        Destination{destinations.length > 1 ? "s" : ""} {required && <span className="text-red-500">*</span>}
      </Label>
      
      {destinations.map((destination, index) => (
        <div key={destination.id} className="relative mt-1 mb-2">
          <Input
            ref={index === 0 ? firstInputRef : undefined}
            type="text"
            value={destination.address}
            onChange={(e) => handleDestinationChange(destination.id, e.target.value)}
            onPaste={(e) => handlePaste(e, destination.id)}
            required={required}
            disabled={disabled}
            placeholder={
              index === 0 && destinations.length === 1
                ? "Enter destination address"
                : `Enter destination address ${index + 1}`
            }
            className={`block w-full p-2 rounded-md border bg-gray-50 focus:ring-blue-500 focus:border-blue-500 ${
              validationErrors[destination.id] ? "border-red-500" : ""
            } ${
              (showAddButton && index === 0) || canRemove ? "pr-12" : "pr-2"
            }`}
          />
          
          {/* Add/Remove buttons */}
          {((index === 0 && showAddButton) || (index > 0 && canRemove)) && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {index === 0 && showAddButton ? (
                <button
                  type="button"
                  onClick={addDestination}
                  disabled={disabled}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  title="Add another destination"
                >
                  <FiPlus className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => removeDestination(destination.id)}
                  disabled={disabled}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  title={`Remove destination ${index + 1}`}
                >
                  <FiMinus className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          
        </div>
      ))}
      
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {destinations.length > 1 
            ? `Enter the addresses to send to. Each destination will receive the same amount. Duplicate addresses are not allowed. (${destinations.length}/1000 destinations)`
            : enableMPMA && asset !== "BTC"
              ? "Enter the address to send to. Paste multiple addresses (one per line) to send to multiple destinations. (Max: 1000)"
              : "Enter the recipient's Bitcoin address."}
        </Description>
      )}
      {destinations.length >= 900 && destinations.length < 1000 && (
        <p className="mt-1 text-sm text-orange-600">
          Approaching destination limit: {destinations.length}/1000
        </p>
      )}
      {destinations.length >= 1000 && (
        <p className="mt-1 text-sm text-red-600">
          Maximum destination limit reached: 1000
        </p>
      )}
    </Field>
  );
}