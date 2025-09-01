import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { DispenserForm } from "./form";
import { ReviewDispenser } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";

export function ComposeDispenserPage() {
  // Grab the asset from the URL parameters (if provided)
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  // Memoize the component props to prevent unnecessary re-renders
  const formComponent = useMemo(
    () => (props: any) => <DispenserForm {...props} asset={asset} />,
    [asset]
  );

  const reviewComponent = useMemo(
    () => (props: any) => <ReviewDispenser {...props} asset={asset} />,
    [asset]
  );

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        initialTitle="Dispenser"
        FormComponent={formComponent}
        ReviewComponent={reviewComponent}
        composeTransaction={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserPage;
