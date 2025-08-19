import { useParams } from "react-router-dom";
import { UpdateDescriptionForm } from "./form";
import { ReviewIssuanceUpdateDescription } from "./review";
import { Composer } from "@/components/composer";
import { composeIssuance } from "@/utils/blockchain/counterparty";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceUpdateDescription() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
  }

  const initialFormData: Partial<IssuanceOptions> = {
    description: "",
    asset,
    quantity: 0,
    divisible: false,
    lock: false,
    reset: false,
    sat_per_vbyte: 0.1,
  };

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        initialTitle="Update Asset"
        FormComponent={(props) => <UpdateDescriptionForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceUpdateDescription}
        composeTransaction={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuanceUpdateDescription;
