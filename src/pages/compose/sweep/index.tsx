import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { useWallet } from "@/contexts/wallet-context";
import type { SweepOptions } from "@/core/counterparty/compose";
import { composeSweep } from "@/core/counterparty/compose";
import { SweepForm } from "@/pages/compose/sweep/form";
import { ReviewSweep } from "@/pages/compose/sweep/review";

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
