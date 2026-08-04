import { useParams } from 'react-router';
import { Composer } from "@/components/composer/composer";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { IssuanceForm } from "@/pages/compose/issuance/form";
import { ReviewIssuance } from "@/pages/compose/issuance/review";

function ComposeIssuancePage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle="Issue Asset"
        FormComponent={(props) => <IssuanceForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuance}
      />
    </div>
  );
}

export default ComposeIssuancePage;
