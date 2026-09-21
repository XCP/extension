import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DispenserOptions } from "@/core/counterparty/compose";
import { composeDispenser } from "@/core/counterparty/compose";
import { toNumber } from "@/core/numeric";
import { DispenserForm } from "@/pages/compose/dispenser/form";
import { ReviewDispenser } from "@/pages/compose/dispenser/review";

function ComposeDispenserPage() {
  const { asset } = useParams<{ asset?: string }>();
  const [searchParams] = useSearchParams();

  // Support pre-filling form for refill: ?mainchainrate=X&give_quantity=Y
  const initialFormData = useMemo((): DispenserOptions | undefined => {
    const mainchainrate = searchParams.get("mainchainrate");
    const give_quantity = searchParams.get("give_quantity");

    if (!mainchainrate && !give_quantity) return undefined;

    return {
      ...(mainchainrate && { mainchainrate: toNumber(mainchainrate) }),
      ...(give_quantity && { give_quantity: toNumber(give_quantity) }),
    } as DispenserOptions;
  }, [searchParams]);

  const isRefill = searchParams.get("refill") === "true";

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle={isRefill ? "Refill Dispenser" : "Dispenser"}
        initialFormData={initialFormData}
        FormComponent={(props) => <DispenserForm {...props} asset={asset || ""} isRefill={isRefill} />}
        ReviewComponent={(props) => <ReviewDispenser {...props} asset={asset || ""} />}
      />
    </div>
  );
}

export default ComposeDispenserPage;
