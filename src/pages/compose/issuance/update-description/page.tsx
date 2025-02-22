import { useParams } from "react-router-dom";
import { UpdateDescriptionForm } from "./form";
import { ReviewIssuanceUpdateDescription } from "./review";
import { Composer } from "@/components/composer";
import { composeIssuance } from "@/utils/blockchain/counterparty";

export function ComposeIssuanceUpdateDescription() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  if (!asset) {
    return <div>Asset not specified.</div>;
  }

  return (
    <div className="p-4">
      <Composer
        initialTitle="Description"
        FormComponent={UpdateDescriptionForm}
        ReviewComponent={ReviewIssuanceUpdateDescription}
        composeTransaction={composeIssuance}
        initialFormData={{
          description: "",
      
        }}
      />
    </div>
  );
}

export default ComposeIssuanceUpdateDescription;
