import { useParams } from "react-router-dom";
import { DispenserCloseForm } from "./form";
import { ReviewDispenserClose } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";

export function ComposeDispenserClose() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        initialTitle="Close"
        FormComponent={(props) => <DispenserCloseForm {...props} initialAsset={asset} />}
        ReviewComponent={ReviewDispenserClose}
        composeApiMethod={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserClose;
