import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { TransferOwnershipForm } from "@/pages/compose/issuance/transfer-ownership/form";
import { ReviewIssuanceTransferOwnership } from "@/pages/compose/issuance/transfer-ownership/review";

function ComposeTransferOwnershipPage() {
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
        initialTitle="Transfer Asset"
        FormComponent={(props) => <TransferOwnershipForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceTransferOwnership}
      />
    </div>
  );
}

export default ComposeTransferOwnershipPage;
