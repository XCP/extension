import { useParams } from "react-router";
import { SweepForm } from "@/pages/compose/sweep/form";
import { ReviewSweep } from "@/pages/compose/sweep/review";
import { Composer } from "@/components/composer/composer";
import { composeSweep } from "@/utils/blockchain/counterparty/compose";
import { useWallet } from "@/contexts/wallet-context";
import type { SweepOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeSweepPage() {
  const {} = useParams<{ address?: string }>();
  const {} = useWallet();
  

  return (
    <div className="p-4">
      <Composer<SweepOptions>
        composeType="sweep"
        composeApiMethod={composeSweep}
        initialTitle="Sweep"
        FormComponent={SweepForm}
        ReviewComponent={ReviewSweep}
      />
    </div>
  );
}

export default ComposeSweepPage;
