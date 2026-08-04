import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DispenserOptions } from "@/core/blockchain/counterparty/compose";
import { composeDispenser } from "@/core/blockchain/counterparty/compose";
import { DispenserCloseForm } from "@/pages/compose/dispenser/close/form";
import { ReviewDispenserClose } from "@/pages/compose/dispenser/close/review";

function ComposeDispenserClosePage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle="Close"
        FormComponent={(props) => <DispenserCloseForm {...props} initialAsset={asset} />}
        ReviewComponent={ReviewDispenserClose}
      />
    </div>
  );
}

export default ComposeDispenserClosePage;
