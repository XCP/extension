import { useState, useRef, useEffect } from "react";
import { Field, Label, Description, Input } from "@headlessui/react";
import { FiPlus, FiMinus } from "@/components/icons";
import { lookupAssetOwner, shouldTriggerAssetLookup } from "@/utils/validation/assetOwner";
import { validateDestinations, parseMultiLineDestinations, isMPMASupported } from "@/utils/validation/destinations";
import { validateBitcoinAddress } from "@/utils/validation/bitcoin";
import { useMultiAssetOwnerLookup } from "@/hooks/useAssetOwnerLookup";

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
  
  const { performLookup, getLookupState } = useMultiAssetOwnerLookup({
    onResolve: (destinationId, assetName, ownerAddress) => {
      // Update the destination with the resolved address
      const updatedDestinations = destinations.map(dest =>
        dest.id === destinationId ? { ...dest, address: ownerAddress } : dest
      );
      onChange(updatedDestinations);
    }
  });

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const validation = validateDestinations(destinations);
    
    // Convert errors to boolean map for backward compatibility
    const errorMap: { [key: number]: boolean } = {};
    Object.keys(validation.errors).forEach(id => {
      errorMap[Number(id)] = true;
    });
    setValidationErrors(errorMap);
    
    onValidationChange?.(validation.isValid);
  }, [destinations, onValidationChange]);

  const handleDestinationChange = (id: number, value: string) => {
    const trimmedValue = value.trim();

    // Update the destination immediately
    const updatedDestinations = destinations.map(dest =>
      dest.id === id ? { ...dest, address: trimmedValue } : dest
    );
    onChange(updatedDestinations);

    // Trigger asset lookup through the hook
    performLookup(id, trimmedValue);
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

  const handlePaste = async (event: React.ClipboardEvent<HTMLInputElement>, id: number) => {
    // Only handle multi-line paste if:
    // 1. MPMA is enabled
    // 2. Not BTC
    // 3. Only one input exists (no empty inputs added)
    if (!enableMPMA || asset === "BTC" || destinations.length > 1) {
      return; // Let default paste behavior handle it
    }

    const pastedText = event.clipboardData.getData("text");
    const lines = parseMultiLineDestinations(pastedText);

    // If multiple lines and we only have one input, handle specially
    if (lines.length > 1 && destinations.length === 1) {
      event.preventDefault();
      
      // Process each line - resolve asset names to addresses
      const resolvedLines: string[] = [];
      for (const line of lines) {
        if (validateBitcoinAddress(line).isValid) {
          // Already a valid address
          resolvedLines.push(line);
        } else if (shouldTriggerAssetLookup(line)) {
          // Try to resolve asset name
          try {
            const result = await lookupAssetOwner(line);
            if (result.isValid && result.ownerAddress) {
              resolvedLines.push(result.ownerAddress);
            } else {
              resolvedLines.push(line); // Keep original if can't resolve
            }
          } catch (error) {
            resolvedLines.push(line); // Keep original on error
          }
        } else {
          // Not a valid address or asset name, but keep it
          resolvedLines.push(line);
        }
      }
      
      // Update current input with first resolved address
      const currentIndex = destinations.findIndex(d => d.id === id);
      const updatedDestinations = [...destinations];
      updatedDestinations[currentIndex] = { ...updatedDestinations[currentIndex], address: resolvedLines[0] };
      
      // Add remaining addresses as new destinations (respect 1000 limit)
      const remainingSlots = 1000 - updatedDestinations.length;
      const linesToAdd = resolvedLines.slice(1, Math.min(resolvedLines.length, remainingSlots + 1));
      const newDestinations = linesToAdd.map(address => ({
        id: Date.now() + Math.random(),
        address
      }));
      
      onChange([...updatedDestinations, ...newDestinations]);
    }
  };

  const showAddButton = isMPMASupported(asset) && enableMPMA && destinations.length < 1000;
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
            className={`block w-full p-2.5 rounded-md border bg-gray-50 focus:ring-2 ${
              validationErrors[destination.id] 
                ? "border-red-500 focus:border-red-500 focus:ring-red-500" 
                : getLookupState(destination.id).isLookingUp 
                  ? "border-blue-500 focus:border-blue-500 focus:ring-blue-500" 
                  : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            } ${
              (showAddButton && index === 0) || canRemove || getLookupState(destination.id).isLookingUp 
                ? "pr-12" 
                : "pr-2"
            }`}
          />
          
          {/* Loading spinner, Add/Remove buttons */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            {getLookupState(destination.id).isLookingUp ? (
              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full" title="Looking up asset owner..."></div>
            ) : ((index === 0 && showAddButton) || (index > 0 && canRemove)) ? (
              index === 0 && showAddButton ? (
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
              )
            ) : null}
          </div>
          
        </div>
      ))}
      
      {showHelpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {destinations.length > 1 
            ? `Enter the addresses to send to. Each destination will receive the same amount. Duplicate addresses are not allowed. (${destinations.length}/1000 destinations)`
            : enableMPMA && asset !== "BTC"
              ? "Enter the address to send to. Paste multiple addresses (one per line) to send to multiple destinations. (Max: 1000)"
              : "Enter recipient's address."}
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