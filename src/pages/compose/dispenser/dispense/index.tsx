import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { DispenseForm } from "@/pages/compose/dispenser/dispense/form";
import { ReviewDispense } from "@/pages/compose/dispenser/dispense/review";
import type { DispenseOptions } from "@/utils/blockchain/counterparty/compose";
import { composeDispense } from "@/utils/blockchain/counterparty/compose";

// Extended type for initial form data with asset pre-selection
interface DispenseInitialData extends Partial<DispenseOptions> {
  initialAsset?: string;
}

function ComposeDispensePage() {
  const [searchParams] = useSearchParams();

  // Extract address and asset query params for pre-filling the form
  const initialFormData = useMemo((): DispenseInitialData | undefined => {
    const address = searchParams.get("address");
    const asset = searchParams.get("asset");
    if (!address) return undefined;
    return {
      dispenser: address,
      ...(asset && { initialAsset: asset }),
    };
  }, [searchParams]);

  return (
    <div className="p-4">
      <Composer<DispenseOptions>
        composeType="dispense"
        composeApiMethod={composeDispense}
        initialTitle="Dispense"
        initialFormData={initialFormData as DispenseOptions | undefined}
        FormComponent={DispenseForm}
        ReviewComponent={ReviewDispense}
      />
    </div>
  );
}

export default ComposeDispensePage;
