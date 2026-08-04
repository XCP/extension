import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import { TransferOwnershipForm } from "@/pages/compose/issuance/transfer-ownership/form";
import { ReviewIssuanceTransferOwnership } from "@/pages/compose/issuance/transfer-ownership/review";
import { composeIssuance } from "@/utils/blockchain/counterparty/compose";
import type { IssuanceOptions } from "@/utils/blockchain/counterparty/compose";

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
