import { Description, Field, Input, Label } from '@headlessui/react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ZELD_DISPLAY_NAME, zeldBaseUnitsToDisplay } from '@/core/zeld/api';
import { composeZeldSend, zeldRecipientDustSats } from '@/core/zeld/sendCompose';
import { type SpendableZeld, selectSpendableZeld } from '@/core/zeld/spendable';
import { t } from '@/i18n';

interface ZeldSendFormData {
  destination: string;
  amountBaseUnits: string;
  zeld_display_amount?: string;
  /** Verified as a BTC spend of the recipient's dust output; see `sendCompose.ts`. */
  asset: 'BTC';
  quantity: string;
  sat_per_vbyte: number;
}

interface ZeldSendFormProps {
  formAction: (formData: FormData) => void | Promise<void>;
  initialFormData: ZeldSendFormData | null;
}

function ZeldSendForm(props: ZeldSendFormProps): ReactElement {
  const { activeAddress } = useComposer<ZeldSendFormData>();
  return <AddressZeldSendForm key={activeAddress?.address} {...props} />;
}

function AddressZeldSendForm({ formAction, initialFormData }: ZeldSendFormProps): ReactElement {
  const { activeAddress, showHelpText } = useComposer<ZeldSendFormData>();
  const [balance, setBalance] = useState<{ address: string; coins: SpendableZeld } | null>(null);
  const [amount, setAmount] = useState(() => initialFormData?.zeld_display_amount
    ?? (initialFormData?.amountBaseUnits && /^\d+$/.test(initialFormData.amountBaseUnits)
      ? fromSatoshis(initialFormData.amountBaseUnits, { removeTrailingZeros: true })
      : ''));
  const [destination, setDestination] = useState(initialFormData?.destination ?? '');
  const recipientSats = destination ? zeldRecipientDustSats(destination) : undefined;

  const [balanceError, setBalanceError] = useState(false);
  const [balanceRevision, setBalanceRevision] = useState(0);
  const [balanceLoading, setBalanceLoading] = useState(!!activeAddress?.address);
  const request = useRef({ revision: 0 });
  const amountRevision = useRef(0);

  const address = activeAddress?.address;
  useEffect(() => {
    const session = request.current;
    const revision = ++session.revision;
    if (!address) return;
    void selectSpendableZeld(address).then((result) => {
      if (revision !== session.revision) return;
      setBalance({ address, coins: result });
      setBalanceError(false);
    }).catch((error) => {
      console.error('Failed to load ZELD send balance:', error);
      if (revision === session.revision) setBalanceError(true);
    }).finally(() => {
      if (revision === session.revision) setBalanceLoading(false);
    });
    return () => { session.revision++; };
  }, [address, balanceRevision]);

  const available = balance?.address === address ? balance?.coins.available ?? 0n : 0n;
  const handleMax = async () => {
    if (!address) return;
    const revision = ++request.current.revision;
    const draftRevision = amountRevision.current;
    setBalanceLoading(true);
    setBalanceError(false);
    try {
      // Re-read locks when clicked; another tab may have protected an offer since mount.
      const coins = await selectSpendableZeld(address);
      if (revision !== request.current.revision) return;
      setBalance({ address, coins });
      if (draftRevision === amountRevision.current) setAmount(fromSatoshis(coins.available.toString(), { removeTrailingZeros: true }));
    } catch {
      if (revision !== request.current.revision) return;
      setBalance(null);
      setBalanceError(true);
    } finally {
      if (revision === request.current.revision) setBalanceLoading(false);
    }
  };
  const amountBaseUnits = useMemo(() => {
    try {
      return toSatoshis(amount);
    } catch {
      return '0';
    }
  }, [amount]);
  const amountValid = validateQuantity(amount, { divisible: true, allowZero: false }).isValid
    && !balanceLoading && !balanceError
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
      submitText={t('common_continue')}
      submitDisabled={!amountValid || recipientSats === undefined}
      showFeeRate
    >
      <div className="rounded-lg bg-gray-50 p-3 text-sm flex items-center gap-3">
        <AssetIcon asset={ZELD_DISPLAY_NAME} size="md" imageSrc={zeldIcon} />
        <div className="min-w-0 flex-1 flex flex-wrap justify-between gap-3">
          <span className="text-gray-500">{t('zeld_available')}</span>
          <span className="font-medium text-gray-900">
            {balanceLoading || balanceError ? '—' : `${formatAmount({ value: zeldBaseUnitsToDisplay(available), minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD`}
          </span>
        </div>
      </div>
      {balanceError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p role="alert" className="text-sm text-amber-800">{t('zeld_spendable_unavailable')}</p>
          <button type="button" onClick={() => { setBalance(null); setBalanceLoading(true); setBalanceError(false); setBalanceRevision(value => value + 1); }} className="text-sm font-medium text-blue-700 underline cursor-pointer">{t('common_try_again')}</button>
        </div>
      )}
      <DestinationInput
        value={destination}
        onChange={setDestination}
        showHelpText={showHelpText}
        helpText={recipientSats === undefined
          ? t('zeld_recipient_help')
          : t('zeld_recipient_sats_help', [formatAmount({ value: recipientSats, maximumFractionDigits: 0 })])}
      />
      <Field>
        <Label className="text-sm font-medium text-gray-700">
          {t('common_amount')} <span className="text-red-500">*</span>
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            name="zeld_display_amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => { amountRevision.current++; setAmount(event.target.value.trim()); }}
            placeholder="0.00000000"
            className="block w-full p-2.5 rounded-md border border-gray-200 bg-gray-50 outline-none focus-visible:ring-2 focus:border-blue-500 focus-visible:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => void handleMax()}
            disabled={balanceLoading || balanceError || available === 0n}
            className="px-3 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {t('common_max')}
          </button>
        </div>
        <Description className="mt-1 text-sm text-gray-500">{t('zeld_max_spendable_help')}</Description>
        {showHelpText && (
          <Description className="mt-1 text-sm text-gray-500">
            {t('zeld_amount_help')}
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
        { label: t('common_amount'), value: `${formatAmount({ value: amount, minimumFractionDigits: 8, maximumFractionDigits: 8 })} ZELD` },
        { label: t('zeld_recipient_btc'), value: `${formatAmount({ value: apiResponse.result.btc_out, maximumFractionDigits: 0 })} sats (${fromSatoshis(apiResponse.result.btc_out)} BTC)` },
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
        initialTitle={t('zeld_send')}
        FormComponent={ZeldSendForm}
        ReviewComponent={ZeldSendReview}
      />
    </div>
  );
}
