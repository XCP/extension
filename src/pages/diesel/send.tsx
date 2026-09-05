import { Description, Field, Input, Label } from '@headlessui/react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import dieselLogo from '@/assets/diesel.jpg';
import { Composer } from '@/components/composer/composer';
import { ComposerForm } from '@/components/composer/composer-form';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { ReviewScreen } from '@/components/screens/review-screen';
import { DestinationInput } from '@/components/ui/inputs/destination-input';
import { useComposer } from '@/contexts/composer-context-object';
import {
  type DieselAddressBalance,
  dieselBaseUnitsToDisplay,
  fetchDieselBalance,
} from '@/core/alkanes/api';
import { dieselUtxoMinimumSats } from '@/core/alkanes/diesel';
import { parseRawTransactionLocally } from '@/core/bitcoin/localTransactionParse';
import { composeDieselSend } from '@/core/counterparty/compose';
import { formatAmount } from '@/core/format';
import { fromSatoshis, toSatoshis } from '@/core/numeric';
import { validateQuantity } from '@/core/validation/amount';

interface DieselSendFormData {
  destination: string;
  amountBaseUnits: string;
  diesel_display_amount?: string;
  asset: 'BTC';
  quantity: string;
  sat_per_vbyte: number;
}

function DieselSendForm({
  formAction,
  initialFormData,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  initialFormData: DieselSendFormData | null;
}): ReactElement {
  const { activeAddress, showHelpText } = useComposer<DieselSendFormData>();
  const [balance, setBalance] = useState<DieselAddressBalance | null>(null);
  const [amount, setAmount] = useState(() => initialFormData?.diesel_display_amount
    ?? (initialFormData?.amountBaseUnits && /^\d+$/.test(initialFormData.amountBaseUnits)
      ? fromSatoshis(initialFormData.amountBaseUnits, { removeTrailingZeros: true }) : ''));
  const [destination, setDestination] = useState(initialFormData?.destination ?? '');
  const recipientSats = dieselUtxoMinimumSats(destination);

  useEffect(() => {
    if (!activeAddress) return;
    void fetchDieselBalance(activeAddress.address).then(setBalance).catch((error) => {
      console.error('Failed to load DIESEL send balance:', error);
    });
  }, [activeAddress]);

  const availableDisplay = balance ? dieselBaseUnitsToDisplay(balance.baseUnits) : '0.00000000';
  const amountBaseUnits = useMemo(() => {
    try {
      return toSatoshis(amount);
    } catch {
      return '0';
    }
  }, [amount]);
  const amountValid = validateQuantity(amount, { divisible: true, allowZero: false }).isValid
    && /^\d+$/.test(amountBaseUnits)
    && BigInt(amountBaseUnits) <= BigInt(balance?.baseUnits ?? '0');

  const handleSubmit = (formData: FormData) => {
    if (recipientSats === undefined || !amountValid) return;
    formData.set('destination', destination);
    formData.set('amountBaseUnits', amountBaseUnits);
    // The outer BTC verification and the transfer builder use the same recipient dust policy.
    // DIESEL quantity is independently committed by the proved protostone script.
    formData.set('asset', 'BTC');
    formData.set('quantity', fromSatoshis(recipientSats));
    formData.set('no_dispense', 'true');
    return formAction(formData);
  };

  return (
    <ComposerForm
      formAction={handleSubmit}
      submitText="Review DIESEL send"
      submitDisabled={!amountValid || recipientSats === undefined}
      showFeeRate
    >
      <div className="rounded-lg bg-gray-50 p-3 text-sm flex items-center gap-3">
        <AssetIcon asset="DIESEL" size="md" imageSrc={dieselLogo} />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Available</span>
            <span className="font-medium text-gray-900">{availableDisplay} DIESEL</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-gray-500">Storage</span>
            <span className="text-gray-900">Protected</span>
          </div>
        </div>
      </div>
      <DestinationInput
        value={destination}
        onChange={setDestination}
        showHelpText={showHelpText}
        helpText={recipientSats === undefined
          ? 'Use a supported Bitcoin address. SegWit and Taproot recipients receive 330 sats; legacy addresses require a higher minimum.'
          : `The recipient receives DIESEL on a ${recipientSats}-sat Bitcoin output. Remaining Bitcoin returns to your wallet after the fee.`}
      />
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          Amount <span className="text-red-500">*</span>
        </Label>
        <Input
          name="diesel_display_amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value.trim())}
          placeholder="0.00000000"
          className="mt-1 block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 outline-none focus-visible:ring-2 focus:border-blue-500 focus-visible:ring-blue-500"
        />
        {showHelpText && (
          <Description className="mt-1 text-sm text-gray-500">
            Up to eight decimal places. Unsent DIESEL returns to protected wallet storage.
          </Description>
        )}
      </Field>
    </ComposerForm>
  );
}

function DieselSendReview({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: {
  apiResponse: Awaited<ReturnType<typeof composeDieselSend>>;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}): ReactElement {
  const transfer = apiResponse.result.diesel_transfer;
  const display = transfer
    ? dieselBaseUnitsToDisplay(transfer.amount_base_units)
    : 'Unknown';
  const recipient = transfer
    ? parseRawTransactionLocally(apiResponse.result.rawtransaction)?.outputs[transfer.recipient_vout]
    : undefined;
  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      error={error}
      isSigning={isSigning}
      customFields={[
        { label: 'Amount', value: `${formatAmount({ value: display, maximumFractionDigits: 8 })} DIESEL` },
        { label: 'Recipient Bitcoin', value: recipient ? `${recipient.value} sats (${fromSatoshis(recipient.value)} BTC)` : 'Unknown' },
        { label: 'Remainder', value: 'Unsent DIESEL and remaining Bitcoin return to this wallet' },
      ]}
    />
  );
}

export default function DieselSendPage(): ReactElement {
  const compose = async (data: DieselSendFormData & { sourceAddress: string }) => composeDieselSend({
    sourceAddress: data.sourceAddress,
    destination: data.destination,
    amountBaseUnits: data.amountBaseUnits,
    sat_per_vbyte: Number(data.sat_per_vbyte),
  });
  return (
    <div className="p-4">
      <Composer<DieselSendFormData>
        composeType="send"
        composeApiMethod={compose as unknown as (data: DieselSendFormData) => ReturnType<typeof composeDieselSend>}
        initialTitle="Send DIESEL"
        FormComponent={DieselSendForm}
        ReviewComponent={DieselSendReview}
      />
    </div>
  );
}
