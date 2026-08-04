import { useParams, useSearchParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { OrderOptions } from "@/core/counterparty/compose";
import { composeOrder } from "@/core/counterparty/compose";
import { OrderForm } from "@/pages/compose/order/form";
import { ReviewOrder } from "@/pages/compose/order/review";

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
