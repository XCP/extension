import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import zeldIcon from '@/assets/zeld.svg';
import { Composer } from '@/components/composer/composer';
import { ComposerForm } from '@/components/composer/composer-form';
import { AssetIcon } from '@/components/domain/asset/asset-icon';
import { ReviewScreen } from '@/components/screens/review-screen';
import { useComposer } from '@/contexts/composer-context-object';
import type { ApiResponse } from '@/core/counterparty/compose';
import { formatAmount } from '@/core/format';
import { fetchZeldBalance, ZELD_DISPLAY_NAME, type ZeldAddressBalance, zeldBaseUnitsToDisplay } from '@/core/zeld/api';
import { composeZeldPark } from '@/core/zeld/sendCompose';

interface ZeldParkFormData {
  asset: 'BTC';
  sat_per_vbyte: number;
}

function ZeldParkForm({
  formAction,
}: {
  formAction: (formData: FormData) => void | Promise<void>;
  initialFormData: ZeldParkFormData | null;
}): ReactElement {
  const { activeAddress, showHelpText } = useComposer<ZeldParkFormData>();
  const address = activeAddress?.address;
  const [balance, setBalance] = useState<ZeldAddressBalance | null>(null);

  useEffect(() => {
    if (!address) return;
    void fetchZeldBalance(address).then(setBalance).catch((error) => {
      console.error('Failed to load ZELD balance:', error);
    });
  }, [address]);

  const total = balance?.baseUnits ?? 0n;
  const handleSubmit = (formData: FormData) => {
    formData.set('asset', 'BTC');
    return formAction(formData);
  };

  return (
    <ComposerForm
      formAction={handleSubmit}
      submitText="Review"
      submitDisabled={total === 0n}
      showFeeRate
    >
      <div className="rounded-lg bg-gray-50 p-3 text-sm flex items-center gap-3">
        <AssetIcon asset={ZELD_DISPLAY_NAME} size="md" imageSrc={zeldIcon} />
        <div className="min-w-0 flex-1 flex justify-between gap-3">
          <span className="text-gray-500">ZELD to move</span>
          <span className="font-medium text-gray-900">
            {formatAmount({ value: zeldBaseUnitsToDisplay(total), minimumFractionDigits: 8, maximumFractionDigits: 8 })}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Moves all your ZELD onto one small output of this address and returns the rest of the
        Bitcoin as ordinary change. Do this when a payment that must pay someone else first, such
        as a BTCPay or a burn, is refused because every output here carries ZELD.
      </p>
      {showHelpText && (
        <p className="text-sm text-gray-500">
          Ordinary sends and dispenser purchases never need this: the wallet places your change
          first so the ZELD stays with you. This is one transaction at your chosen fee rate.
        </p>
      )}
    </ComposerForm>
  );
}

function ZeldParkReview({
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
  const moved = apiResponse.result.zeld_send;
  const amount = moved ? zeldBaseUnitsToDisplay(BigInt(moved.amount_base_units)) : '0';
  return (
    <ReviewScreen
      apiResponse={apiResponse}
      onSign={onSign}
      onBack={onBack}
      error={error}
      isSigning={isSigning}
      customFields={[
        { label: 'ZELD moved', value: `${formatAmount({ value: amount, minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD` },
        { label: 'Small output', value: `${apiResponse.result.btc_out.toLocaleString()} sats, holding the ZELD` },
        { label: 'Clean change', value: `${apiResponse.result.btc_change.toLocaleString()} sats` },
      ]}
    />
  );
}

export default function ZeldParkPage(): ReactElement {
  const compose = (data: ZeldParkFormData & { sourceAddress: string }) => composeZeldPark({
    sourceAddress: data.sourceAddress,
    sat_per_vbyte: Number(data.sat_per_vbyte),
  });
  return (
    <div className="p-4">
      <Composer<ZeldParkFormData>
        composeType="send"
        composeApiMethod={compose as unknown as (data: ZeldParkFormData) => Promise<ApiResponse>}
        initialTitle="Move ZELD"
        FormComponent={ZeldParkForm}
        ReviewComponent={ZeldParkReview}
      />
    </div>
  );
}
