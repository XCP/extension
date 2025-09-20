import { useParams } from "react-router-dom";
import { DispenserForm } from "./form";
import { ReviewDispenser } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty";
import type { DispenserOptions } from "@/utils/blockchain/counterparty";

function ComposeDispenserPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        initialTitle="Dispenser"
        FormComponent={(props) => <DispenserForm {...props} asset={asset || ""} />}
        ReviewComponent={(props) => <ReviewDispenser {...props} asset={asset || ""} />}
        composeApiMethod={composeDispenser}
      />
    </div>
  );
}

export default ComposeDispenserPage;
