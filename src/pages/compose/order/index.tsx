import { useParams, useSearchParams } from "react-router-dom";
import { OrderForm } from "./form";
import { ReviewOrder } from "./review";
import { Composer } from "@/components/composer/composer";
import { composeOrder } from "@/utils/blockchain/counterparty/compose";
import type { OrderOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeOrderPage() {
  const { asset } = useParams<{ asset?: string }>();
  const [searchParams] = useSearchParams();

  // Read URL params for pre-filling the form (e.g., from market order click)
  const urlParams = {
    type: searchParams.get("type") as "buy" | "sell" | null,
    quote: searchParams.get("quote"),
    price: searchParams.get("price"),
    amount: searchParams.get("amount"),
  };

  return (
    <div className="p-4">
      <Composer<OrderOptions>
        composeType="order"
        composeApiMethod={composeOrder}
        initialTitle="Dex Order"
        FormComponent={(props) => <OrderForm {...props} giveAsset={asset || ''} urlParams={urlParams} />}
        ReviewComponent={ReviewOrder}
      />
    </div>
  );
}

export default ComposeOrderPage;
