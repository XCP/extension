import type { ReactElement } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ComposerForm } from "@/components/composer/composer-form";
import { AssetHeader } from "@/components/domain/asset/asset-header";
import { AmountWithMaxInput } from "@/components/domain/balance/amount-with-max-input";
import { CheckboxInput } from "@/components/ui/inputs/checkbox-input";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { Spinner } from "@/components/ui/spinner";
import { useComposer } from "@/contexts/composer-context-object";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { asDisplayUnits } from "@/core/numeric";
import { maxSupplyForDivisibility } from "@/core/validation/amount";
import { useAssetInfo } from "@/hooks/useAssetInfo";

/**
 * Props for the ResetSupplyForm component, aligned with Composer's formAction.
 */
interface ResetSupplyFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: IssuanceOptions | null;
  asset: string;
}

/**
 * Form for re-issuing an asset from scratch.
 *
 * A reset is not merely a burn. Core destroys the owner's entire holding and then, in the same
 * transaction, writes a fresh issuance from the message's own fields — `quantity`, `divisible`,
 * `description` and `lock` (`messages/issuance.py`, the `reset` branch of `parse`). So this form
 * asks the same questions the new-asset issuance form does, and describes the asset as it will
 * exist afterwards rather than only what is being destroyed.
 *
 * Divisibility deserves particular note: a reset is the only way to change it. Every other
 * reissuance is rejected with "cannot change divisibility", a check core explicitly waives when
 * `reset` is set.
 */
export function ResetSupplyForm({
  formAction,
  initialFormData,
  asset,
}: ResetSupplyFormProps): ReactElement {
  // Context hooks
  const { showHelpText, activeAddress } = useComposer();

  // Data fetching hooks
  const { error: assetError, data: assetInfo, isLoading: assetLoading } = useAssetInfo(asset);

  // Form status
  const { pending } = useFormStatus();

  // The asset's present divisibility and description are the starting points, not constraints.
  // They are held as "unchosen" rather than seeded directly because this component first renders
  // while `assetInfo` is still loading, and a `useState` initializer only runs once — seeding from
  // a null asset would latch the defaults to `false` and `""` and never pick the real ones up.
  const [amount, setAmount] = useState(initialFormData?.quantity?.toString() || "");
  const [divisibleChoice, setDivisibleChoice] = useState<boolean | null>(
    initialFormData?.divisible ?? null
  );
  const [descriptionChoice, setDescriptionChoice] = useState<string | null>(
    initialFormData?.description ?? null
  );
  const [isLocked, setIsLocked] = useState(initialFormData?.lock ?? false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [, setError] = useState<string | null>(null);

  const currentDescription = assetInfo?.description ?? "";
  const isDivisible = divisibleChoice ?? assetInfo?.divisible ?? false;
  const description = descriptionChoice ?? currentDescription;

  // Calculate maximum amount based on divisibility. A reset overwrites the supply rather than
  // adding to it, so the whole range is available whatever the asset holds today.
  const getMaxAmount = () => maxSupplyForDivisibility(isDivisible);

  const processedFormAction = (formData: FormData) => {
    formData.set("asset", asset);
    formData.set("reset", "true");
    // Display units; `normalizeFormData` scales by the divisibility submitted here rather than the
    // asset's current one, precisely because a reset may change it.
    formData.set("quantity", amount || "0");
    formData.set("divisible", String(isDivisible));
    formData.set("lock", String(isLocked));
    // An unchanged description is omitted rather than restated: `composeIssuance` drops empty
    // descriptions, and a reissuance that carries none keeps the asset's existing one, which
    // costs fewer OP_RETURN bytes than re-sending identical text.
    formData.set("description", description === currentDescription ? "" : description);
    formAction(formData);
  };

  // Early returns
  if (assetLoading) {
    return <Spinner message="Loading asset details…" />;
  }

  if (assetError || !assetInfo) {
    return (
      <div className="p-4 text-red-500">
        Unable to load asset details. Please ensure the asset exists and you have the necessary
        permissions.
      </div>
    );
  }

  if (asset === "BTC" || asset === "XCP") {
    return <div className="p-4 text-red-500">Cannot reset {asset}</div>;
  }

  if (assetInfo.locked) {
    return (
      <div className="p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <p className="text-yellow-800">
            This asset's supply is locked, so it cannot be reset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ComposerForm
      formAction={processedFormAction}
      submitDisabled={!isConfirmed}
      header={
        <AssetHeader
          assetInfo={{
            asset: asset,
            asset_longname: assetInfo?.asset_longname ?? null,
            description: assetInfo?.description,
            issuer: assetInfo?.issuer,
            divisible: assetInfo?.divisible ?? false,
            locked: assetInfo?.locked ?? false,
            supply: assetInfo?.supply,
            supply_normalized: asDisplayUnits(assetInfo?.supply_normalized || "0"),
          }}
          className="mt-1 mb-5"
        />
      }
    >
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
        <p className="text-sm text-yellow-700">
          This destroys all {assetInfo?.supply_normalized || "0"} existing {asset} and re-issues the
          asset with the supply below. It cannot be undone.
        </p>
      </div>

      <AmountWithMaxInput
        asset={asset}
        availableBalance={getMaxAmount()}
        value={amount}
        onChange={setAmount}
        setError={setError}
        showHelpText={showHelpText}
        sourceAddress={activeAddress}
        maxAmount={getMaxAmount()}
        label="New Supply"
        name="quantity_display"
        description={`The quantity of ${asset} to issue after the reset.`}
        disabled={pending}
        disableMaxButton={true}
        isDivisible={isDivisible}
      />

      <div className="grid grid-cols-3 gap-4">
        <CheckboxInput
          name="divisible"
          label="Divisible"
          checked={isDivisible}
          onChange={setDivisibleChoice}
          disabled={pending}
        />
        <CheckboxInput
          name="lock"
          label="Locked"
          checked={isLocked}
          onChange={setIsLocked}
          disabled={pending}
        />
      </div>

      <TextAreaInput
        value={description}
        onChange={setDescriptionChoice}
        label="Description"
        name="description_display"
        rows={1}
        disabled={pending}
        showHelpText={showHelpText}
        helpText="A textual description for the asset. Leave unchanged to keep the current one."
      />

      <CheckboxInput
        name="confirm"
        label="I understand this cannot be undone"
        checked={isConfirmed}
        onChange={setIsConfirmed}
        disabled={pending}
      />
    </ComposerForm>
  );
}
