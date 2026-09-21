import { Description, Field, Input, Label } from '@headlessui/react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import zeldIcon from '@/assets/zeld.svg';
import { Composer } from '@/components/composer/composer';
import { ComposerForm } from '@/components/composer/composer-form';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { ReviewScreen } from '@/components/screens/review-screen';
import { DestinationInput } from '@/components/ui/inputs/destination-input';
import { useComposer } from '@/contexts/composer-context-object';
import type { ApiResponse } from '@/core/counterparty/compose';
import { formatAmount } from '@/core/format';
import { fromSatoshis, toSatoshis } from '@/core/numeric';
import { validateQuantity } from '@/core/validation/amount';
import { fetchZeldBalance, ZELD_DISPLAY_NAME, type ZeldAddressBalance, zeldBaseUnitsToDisplay } from '@/core/zeld/api';
import { composeZeldSend, zeldRecipientDustSats } from '@/core/zeld/sendCompose';

interface ZeldSendFormData {
  destination: string;
  amountBaseUnits: string;
  zeld_display_amount?: string;
  /** Verified as a BTC spend of the recipient's dust output; see `sendCompose.ts`. */
  asset: 'BTC';
  quantity: string;
  sat_per_vbyte: number;
}

function ZeldSendForm({
  formAction,
  initialFormData,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  initialFormData: ZeldSendFormData | null;
}): ReactElement {
  const { activeAddress, showHelpText } = useComposer<ZeldSendFormData>();
  const [balance, setBalance] = useState<ZeldAddressBalance | null>(null);
  const [amount, setAmount] = useState(() => initialFormData?.zeld_display_amount
    ?? (initialFormData?.amountBaseUnits && /^\d+$/.test(initialFormData.amountBaseUnits)
      ? fromSatoshis(initialFormData.amountBaseUnits, { removeTrailingZeros: true })
      : ''));
  const [destination, setDestination] = useState(initialFormData?.destination ?? '');
  const recipientSats = destination ? zeldRecipientDustSats(destination) : undefined;

  const address = activeAddress?.address;
  useEffect(() => {
    if (!address) return;
    void fetchZeldBalance(address).then(setBalance).catch((error) => {
      console.error('Failed to load ZELD send balance:', error);
    });
  }, [address]);

  const available = balance?.baseUnits ?? 0n;
  const amountBaseUnits = useMemo(() => {
    try {
      return toSatoshis(amount);
    } catch {
      return '0';
    }
  }, [amount]);
  const amountValid = validateQuantity(amount, { divisible: true, allowZero: false }).isValid
    && /^\d+$/.test(amountBaseUnits)
    && BigInt(amountBaseUnits) <= available;

  const handleSubmit = (formData: FormData) => {
    if (!amountValid || recipientSats === undefined) return;
    formData.set('destination', destination);
    formData.set('amountBaseUnits', amountBaseUnits);
    formData.set('asset', 'BTC');
    formData.set('quantity', fromSatoshis(recipientSats));
    formData.set('no_dispense', 'true');
    return formAction(formData);
  };

  return (
    <ComposerForm
      formAction={handleSubmit}
      submitText="Continue"
      submitDisabled={!amountValid || recipientSats === undefined}
      showFeeRate
    >
      <div className="rounded-lg bg-gray-50 p-3 text-sm flex items-center gap-3">
        <AssetIcon asset={ZELD_DISPLAY_NAME} size="md" imageSrc={zeldIcon} />
        <div className="min-w-0 flex-1 flex justify-between gap-3">
          <span className="text-gray-500">Available</span>
          <span className="font-medium text-gray-900">
            {formatAmount({ value: zeldBaseUnitsToDisplay(available), minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD
          </span>
        </div>
      </div>
      <DestinationInput
        value={destination}
        onChange={setDestination}
        showHelpText={showHelpText}
        helpText={recipientSats === undefined
          ? 'The ZELD arrives on a small Bitcoin output.'
          : `The ZELD arrives on a ${recipientSats}-sat Bitcoin output; the rest of the BTC returns to you.`}
      />
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          Amount <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            name="zeld_display_amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.trim())}
            placeholder="0.00000000"
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 outline-none focus-visible:ring-2 focus:border-blue-500 focus-visible:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setAmount(fromSatoshis(available.toString(), { removeTrailingZeros: true }))}
            disabled={available === 0n}
            className="px-3 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Max
          </button>
        </div>
        {showHelpText && (
          <Description className="mt-1 text-sm text-gray-500">
            Up to 8 decimal places. Unsent ZELD stays with you.
          </Description>
        )}
      </Field>
    </ComposerForm>
  );
}

function ZeldSendReview({
  apiResponse,
  onSign,
  onBack,
  error,
  isSigning,
}: {
  apiResponse: ApiResponse;
  onSign: () => void;
  onBack: () => void;
  error: string | null;
  isSigning: boolean;
}): ReactElement {
  const send = apiResponse.result.zeld_send;
  const amount = send ? zeldBaseUnitsToDisplay(BigInt(send.amount_base_units)) : '0';
  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      error={error}
      isSigning={isSigning}
      customFields={[
        { label: 'Amount', value: `${formatAmount({ value: amount, minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD` },
        { label: 'Recipient BTC', value: `${apiResponse.result.btc_out.toLocaleString()} sats (${fromSatoshis(apiResponse.result.btc_out)} BTC)` },
      ]}
    />
  );
}

export default function ZeldSendPage(): ReactElement {
  const compose = (data: ZeldSendFormData & { sourceAddress: string }) => composeZeldSend({
    sourceAddress: data.sourceAddress,
    destination: data.destination,
    amountBaseUnits: data.amountBaseUnits,
    sat_per_vbyte: Number(data.sat_per_vbyte),
  });
  return (
    <div className="p-4">
      <Composer<ZeldSendFormData>
        composeType="send"
        composeApiMethod={compose as unknown as (data: ZeldSendFormData) => Promise<ApiResponse>}
        initialTitle="Send ZELD"
        FormComponent={ZeldSendForm}
        ReviewComponent={ZeldSendReview}
      />
    </div>
  );
}
