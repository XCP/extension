import { useParams } from "react-router-dom";
import { DispenserCloseForm } from "./form";
import { ReviewDispenserClose } from "./review";
import { Composer } from "@/components/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty/compose";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispenserClose() {
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

export default ComposeDispenserClose;
