import { useParams } from "react-router-dom";
import { DispenserForm } from "./form";
import { ReviewDispenser } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty";

export function ComposeDispenserPage() {
  // Grab the asset from the URL parameters (if provided)
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  return (
    <div className="p-4">
      <Composer
        initialTitle="Dispenser"
        FormComponent={(props) => <DispenserForm {...props} asset={asset} />}
        ReviewComponent={(props) => <ReviewDispenser {...props} asset={asset} />}
        composeTransaction={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserPage;
