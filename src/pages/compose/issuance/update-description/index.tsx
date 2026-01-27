import { useParams } from "react-router-dom";
import { UpdateDescriptionForm } from "./form";
import { ReviewIssuanceUpdateDescription } from "./review";
import { Composer } from "@/components/composer";
import { ErrorAlert } from "@/components/error-alert";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeUpdateDescriptionPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message="Asset parameter is required" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle="Update Asset"
        FormComponent={(props) => <UpdateDescriptionForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceUpdateDescription}
      />
    </div>
  );
}

export default ComposeUpdateDescriptionPage;
