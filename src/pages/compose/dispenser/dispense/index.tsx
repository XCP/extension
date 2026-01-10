import { useSearchParams } from "react-router-dom";
import { useMemo } from "react";
import { DispenseForm } from "./form";
import { ReviewDispense } from "./review";
import { Composer } from "@/components/composer";
import { composeDispense } from "@/utils/blockchain/counterparty/compose";
import type { DispenseOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispense() {
  const [searchParams] = useSearchParams();

  // Extract address query param for pre-filling the dispenser address
  const initialFormData = useMemo((): DispenseOptions | undefined => {
    const address = searchParams.get("address");
    if (!address) return undefined;
    // Cast to full type - form handles missing fields with defaults
    return { dispenser: address } as DispenseOptions;
  }, [searchParams]);

  return (
    <div className="p-4">
      <Composer<DispenseOptions>
        composeType="dispense"
        composeApiMethod={composeDispense}
        initialTitle="Dispense"
        initialFormData={initialFormData}
        FormComponent={DispenseForm}
        ReviewComponent={ReviewDispense}
      />
    </div>
  );
}

export default ComposeDispense;
