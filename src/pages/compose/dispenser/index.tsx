import { useParams } from "react-router-dom";
import { DispenserForm } from "./form";
import { ReviewDispenser } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty/compose";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispenserPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle="Dispenser"
        FormComponent={(props) => <DispenserForm {...props} asset={asset || ""} />}
        ReviewComponent={(props) => <ReviewDispenser {...props} asset={asset || ""} />}
      />
    </div>
  );
}

export default ComposeDispenserPage;
