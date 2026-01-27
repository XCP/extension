import { useParams } from 'react-router-dom';
import { DispenserCloseByHashForm } from "./form";
import { ReviewDispenserCloseByHash } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeDispenser } from "@/utils/blockchain/counterparty/compose";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDispenserCloseByHashPage() {
  const { txHash } = useParams<{ txHash?: string }>();

  return (
    <div className="p-4">
      <Composer<DispenserOptions>
        composeType="dispenser"
        composeApiMethod={composeDispenser}
        initialTitle="Close"
        FormComponent={(props) => <DispenserCloseByHashForm {...props} initialTxHash={txHash} />}
        ReviewComponent={ReviewDispenserCloseByHash}
      />
    </div>
  );
}

export default ComposeDispenserCloseByHashPage;
