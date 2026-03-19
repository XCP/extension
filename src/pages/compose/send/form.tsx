import { useEffect, useState, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { BalanceHeader } from "@/components/ui/headers/balance-header";
import { AmountWithMaxInput } from "@/components/ui/inputs/amount-with-max-input";
import { DestinationsInput } from "@/components/ui/inputs/destinations-input";
import { MemoInput } from "@/components/ui/inputs/memo-input";
import { useComposer } from "@/contexts/composer-context";
import { useWallet } from "@/contexts/wallet-context";
import { useAssetDetails } from "@/hooks/useAssetDetails";
import { validateQuantity } from "@/utils/validation/amount";
import { toSatoshis } from "@/utils/numeric";
import type { SendOptions } from "@/utils/blockchain/counterparty/compose";
import type { Destination } from "@/utils/validation/destinations";
import type { ReactElement } from "react";
import { ErrorAlert } from "@/components/ui/error-alert";

interface SendFormProps {
  formAction: (formData: FormData) => void;
  initialAsset?: string;
  initialFormData: SendOptions | null;
}

export function SendForm({
  formAction,
  initialAsset,
  initialFormData
}: SendFormProps): ReactElement {
  // Get everything from composer context
  const { activeAddress, settings, showHelpText, feeRate } = useComposer<SendOptions>();
  const { activeWallet } = useWallet();
  const enableMPMA = settings?.enableMPMA ?? false;
  const enableMoreOutputs = settings?.enableMoreOutputs ?? false;

  // Data fetching hooks
  const currentAsset = initialAsset || initialFormData?.asset || "BTC";
  const { data: assetDetails, error: assetDetailsError } = useAssetDetails(currentAsset);
  const { data: btcDetails } = useAssetDetails("BTC");
  const btcBalance = currentAsset !== "BTC" ? (btcDetails?.availableBalance || "0") : "0";

  // Form status
  const { pending } = useFormStatus();

  // Local validation error state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState<string>(
    initialFormData?.quantity?.toString() || ""
  );

  // Destinations state for MPMA
  const [destinations, setDestinations] = useState<Destination[]>(() => [
    { id: Date.now(), address: initialFormData?.destination || "" }
  ]);
  const [destinationsValid, setDestinationsValid] = useState(false);

  // Memo state and validation
  const [memo, setMemo] = useState(initialFormData?.memo || "");
  const [memoValid, setMemoValid] = useState(true);

  // More outputs (attach BTC) state
  const [showBtcOutput, setShowBtcOutput] = useState(false);
  const [btcAmount, setBtcAmount] = useState('');

  // Reset BTC output when switching to MPMA
  useEffect(() => {
    if (destinations.length > 1) {
      setShowBtcOutput(false);
      setBtcAmount('');
    }
  }, [destinations.length]);

  // Computed values
  const isDivisible = useMemo(() => {
    if (initialAsset === "BTC" || initialFormData?.asset === "BTC") return true;
    return assetDetails?.assetInfo?.divisible || false;
  }, [initialAsset, initialFormData?.asset, assetDetails?.assetInfo]);

  const isBtcAsset = (initialAsset || initialFormData?.asset) === "BTC";

  // Asset details error effect
  useEffect(() => {
    if (assetDetailsError) {
      setValidationError(`Failed to fetch details for asset ${initialAsset || initialFormData?.asset || "BTC"}. ${assetDetailsError.message || "Please try again later."}`);
    } else {
      setValidationError(null);
    }
  }, [assetDetailsError, initialAsset, initialFormData?.asset]);

  // Sync amount when initialFormData changes
  useEffect(() => {
    if (initialFormData?.quantity !== undefined) {
      setAmount(initialFormData.quantity.toString());
    }
  }, [initialFormData?.quantity]);

  // Handlers
  const handleAmountChange = (value: string) => {
    setAmount(value);
    setValidationError(null);
  };

  const handleFormAction = (formData: FormData) => {
    if (amount) {
      formData.set("quantity", amount);
    }

    const asset = initialAsset || initialFormData?.asset || "BTC";

    // Add all destinations to form data
    if (destinations.length > 1) {
      formData.set("destinations", destinations.map(d => d.address).join(","));
      formData.delete("destination");
    } else {
      const destination = destinations[0].address;
      formData.set("destination", destination);

      // Prevent triggering dispensers when sending BTC to self,
      // or when attaching BTC via more_outputs (the extra BTC could trigger a dispenser)
      const isOwnAddress = activeWallet?.addresses.some(a => a.address === destination);
      const hasBtcOutput = showBtcOutput && btcAmount && Number(toSatoshis(btcAmount)) > 0;
      if ((asset === "BTC" && isOwnAddress) || hasBtcOutput) {
        formData.set("no_dispense", "true");
      }

      // Add more_outputs if BTC amount is set (format: <sats>:<address>)
      if (hasBtcOutput) {
        formData.set("more_outputs", `${toSatoshis(btcAmount)}:${destination}`);
      }
    }

    // Add memo to form data
    if (memo) {
      formData.set("memo", memo);
    }

    formAction(formData);
  };

  // Validation helpers
  const isAmountValid = (): boolean => {
    if (!amount || amount.trim() === "") return false;

    const validation = validateQuantity(amount, {
      divisible: isDivisible,
      allowZero: false
    });

    return validation.isValid;
  };

  const isBtcAmountValid = !showBtcOutput || (btcAmount !== '' && Number(toSatoshis(btcAmount)) > 0);

  const isSubmitDisabled = !isAmountValid() || !destinationsValid || !memoValid || !isBtcAmountValid;

  return (
    <ComposerForm
      formAction={handleFormAction}
      header={
        activeAddress && assetDetails ? (
          <BalanceHeader
            balance={{
              asset: initialAsset || initialFormData?.asset || "BTC",
              quantity_normalized: assetDetails.availableBalance,
              asset_info: assetDetails.assetInfo ? {
                asset_longname: assetDetails.assetInfo.asset_longname,
                description: assetDetails.assetInfo.description || '',
                issuer: assetDetails.assetInfo.issuer || 'Unknown',
                divisible: assetDetails.assetInfo.divisible,
                locked: assetDetails.assetInfo.locked,
                supply: assetDetails.assetInfo.supply,
              } : undefined,
            }}
            className="mt-1 mb-5"
          />
        ) : null
      }
      submitText="Continue"
      submitDisabled={isSubmitDisabled}
      showFeeRate={true}
    >
          {validationError && (
            <ErrorAlert
              message={validationError}
              onClose={() => setValidationError(null)}
            />
          )}
          <DestinationsInput
            destinations={destinations}
            onChange={setDestinations}
            onValidationChange={setDestinationsValid}
            asset={initialAsset || initialFormData?.asset || "BTC"}
            enableMPMA={enableMPMA}
            required
            disabled={pending}
            showHelpText={showHelpText}
          />
          <input type="hidden" name="asset" value={initialAsset || initialFormData?.asset || "BTC"} />

          <AmountWithMaxInput
            asset={initialAsset || initialFormData?.asset || "BTC"}
            availableBalance={assetDetails?.availableBalance || "0"}
            value={amount}
            onChange={handleAmountChange}
            feeRate={feeRate}
            setError={setValidationError}
            sourceAddress={activeAddress}
            maxAmount={assetDetails?.availableBalance || "0"}
            showHelpText={showHelpText}
            label="Amount"
            name="quantity"
            description={
              isDivisible
                ? "Enter the amount to send."
                : "Enter a whole number amount."
            }
            disabled={pending}
            destinationCount={destinations.length}
            destination={destinations.length === 1 ? destinations[0].address : undefined}
            memo={memo}
            isDivisible={isDivisible}
            placeholder={showBtcOutput && (initialAsset || initialFormData?.asset) ? `${isDivisible ? "0.00000000" : "0"} ${initialAsset || initialFormData?.asset}` : undefined}
            labelRight={
              enableMoreOutputs && !isBtcAsset && destinations.length === 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowBtcOutput(!showBtcOutput);
                    if (showBtcOutput) setBtcAmount('');
                  }}
                  className="text-xs font-normal text-blue-600 hover:text-blue-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  {showBtcOutput ? '− BTC' : '+ BTC'}
                </button>
              ) : undefined
            }
          />

          {/* Attached BTC output — reuses AmountWithMaxInput for BTC with max calculation */}
          {showBtcOutput && (
            <AmountWithMaxInput
              asset="BTC"
              availableBalance={btcBalance}
              value={btcAmount}
              onChange={setBtcAmount}
              feeRate={feeRate}
              setError={() => {}}
              sourceAddress={activeAddress}
              maxAmount={btcBalance}
              showHelpText={showHelpText}
              label="Add BTC"
              labelSrOnly
              placeholder="0.00000000 BTC"
              name="btc_output_display"
              description="BTC to send alongside the asset to the same destination."
              disabled={pending}
              isDivisible={true}
              extraOutputCount={1}
            />
          )}

          {!isBtcAsset && (
            <MemoInput
              value={memo}
              onChange={setMemo}
              onValidationChange={setMemoValid}
              disabled={pending}
              showHelpText={showHelpText}
            />
          )}

    </ComposerForm>
  );
}
