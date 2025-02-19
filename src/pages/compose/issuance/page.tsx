import { IssuanceForm } from "./form";
import { ReviewIssuance } from "./review";
import { Composer } from "@/components/composer";
import { composeIssuance } from "@/utils/blockchain/counterparty";

export function ComposeIssuance() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="Issuance"
        FormComponent={IssuanceForm}
        ReviewComponent={ReviewIssuance}
        composeTransaction={composeIssuance}
      />
    </div>
  );
}

export default ComposeIssuance;
