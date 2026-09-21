import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { OrderOptions } from "@/core/counterparty/compose";
import { composeOrder } from "@/core/counterparty/compose";
import { SwapForm } from "@/pages/compose/swap/form";
import { ReviewSwap } from "@/pages/compose/swap/review";

/**
 * Swap composes a regular DEX order priced from the pool/book quote, so it
 * shares the order compose method and review screen.
 */
function ComposeSwapPage() {
  const { giveAsset, getAsset } = useParams<{ giveAsset?: string; getAsset?: string }>();

  return (
    <div className="p-4">
      <Composer<OrderOptions>
        composeType="order"
        composeApiMethod={composeOrder}
        initialTitle="Swap"
        FormComponent={(props) => (
          <SwapForm
            {...props}
            initialGiveAsset={giveAsset ? decodeURIComponent(giveAsset) : ""}
            initialGetAsset={getAsset ? decodeURIComponent(getAsset) : "XCP"}
          />
        )}
        ReviewComponent={ReviewSwap}
      />
    </div>
  );
}

export default ComposeSwapPage;
