import { useParams } from 'react-router';
import { Composer } from "@/components/composer/composer";
import { DispenserCloseByHashForm } from "@/pages/compose/dispenser/close-by-hash/form";
import { ReviewDispenserCloseByHash } from "@/pages/compose/dispenser/close-by-hash/review";
import type { DispenserOptions } from "@/utils/blockchain/counterparty/compose";
import { composeDispenser } from "@/utils/blockchain/counterparty/compose";

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
