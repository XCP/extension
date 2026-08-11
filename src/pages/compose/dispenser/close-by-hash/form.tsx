import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AddressHeader } from "@/components/domain/address/address-header";
import { HashInput } from "@/components/ui/inputs/hash-input";
import { useComposer } from "@/contexts/composer-context-object";
import { fetchDispenserByHash } from "@/core/counterparty/api";
import type { DispenserOptions } from "@/core/counterparty/compose";

interface DispenserCloseByHashFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: DispenserOptions | null;
  initialTxHash?: string;
}

export function DispenserCloseByHashForm({
  formAction,
  initialFormData,
  initialTxHash,
}: DispenserCloseByHashFormProps): ReactElement {
  const { activeAddress, activeWallet, showHelpText } = useComposer();
  const { pending } = useFormStatus();
  // Not seeded from initialFormData: DispenserOptions carries no transaction hash,
  // and open_address — the only address-shaped field on it — is the dispenser's
  // host, which the hash input rejects as "must be 64 hexadecimal characters".
  const [txHash, setTxHash] = useState<string>(initialTxHash || "");
  const [selectedDispenser, setSelectedDispenser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const closingOnAnotherAddress =
    !!selectedDispenser && selectedDispenser.source !== activeAddress?.address;

  // Fetch dispenser data when initialTxHash is provided or when txHash changes
  useEffect(() => {
    if (initialTxHash) {
      setTxHash(initialTxHash);
      handleLookup(initialTxHash);
    }
  }, [initialTxHash]);

  // Auto-lookup when txHash changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (txHash && txHash.trim().length > 0) {
        handleLookup(txHash);
      } else {
        setSelectedDispenser(null);
      }
    }, 500); // Debounce for 500ms

    return () => clearTimeout(timeoutId);
  }, [txHash]);

  // Auto-focus handled by HashInput component

  const handleLookup = async (hashToLookup: string) => {
    if (!hashToLookup) return;
    
    setIsLoading(true);
    
    try {
      const dispenser = await fetchDispenserByHash(hashToLookup);
      if (dispenser && dispenser.status === 0) { // STATUS_OPEN
        setSelectedDispenser(dispenser);
      } else {
        setSelectedDispenser(null);
      }
    } catch (err) {
      console.error("Failed to fetch dispenser:", err);
      setSelectedDispenser(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ComposerForm
      formAction={formAction}
      header={
        activeAddress && (
          <AddressHeader
            address={activeAddress.address}
            walletName={activeWallet?.name ?? ""}
            className="mt-1 mb-5"
          />
        )
      }
    >
      {isLoading ? (
        <div className="py-4 text-center">Loading dispenser details…</div>
      ) : (
        <>
          <HashInput
            value={txHash}
            onChange={setTxHash}
            label="Transaction Hash"
            hashType="transaction"
            placeholder="Enter dispenser transaction hash"
            required={false}
            disabled={pending}
            showHelpText={showHelpText}
            description="Transaction hash of the dispenser to close. Found in your dispenser history."
            showCopyButton={true}
          />
          {selectedDispenser && (
            <div className="mt-2 text-sm text-gray-700 p-3 bg-gray-50 rounded-md">
              <p><strong>Asset:</strong> {selectedDispenser.asset}</p>
              <p><strong>Give Quantity:</strong> {selectedDispenser.give_quantity_normalized}</p>
              <p><strong>Escrow Quantity:</strong> {selectedDispenser.escrow_quantity_normalized}</p>
              <p><strong>Price:</strong> {selectedDispenser.price_normalized}</p>
              <p><strong>Source:</strong> {selectedDispenser.source}</p>
            </div>
          )}
          <input type="hidden" name="asset" value={selectedDispenser?.asset || ""} />
          <input type="hidden" name="status" value="10" />
          {/* open_address names the address the dispenser sits on, and only belongs
              in the request when that is not the address we are signing from. Core
              packs an action address into a close only when it differs from the
              source, so sending our own address here composes a message without one
              and verification fails the close as an open-address mismatch. */}
          {closingOnAnotherAddress && (
            <input
              type="hidden"
              name="open_address"
              value={selectedDispenser?.source ?? ""}
            />
          )}
        </>
      )}
    </ComposerForm>
  );
}
