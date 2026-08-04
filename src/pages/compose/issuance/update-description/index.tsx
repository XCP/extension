import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { UpdateDescriptionForm } from "@/pages/compose/issuance/update-description/form";
import { ReviewIssuanceUpdateDescription } from "@/pages/compose/issuance/update-description/review";

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
