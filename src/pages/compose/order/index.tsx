import { useParams } from "react-router-dom";
import { OrderForm } from "./form";
import { ReviewOrder } from "./review";
import { Composer } from "@/components/composer";
import { composeOrder } from "@/utils/blockchain/counterparty";
import type { OrderOptions } from "@/utils/blockchain/counterparty";

function ComposeOrderPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<OrderOptions>
        initialTitle="Dex Order"
        FormComponent={(props) => <OrderForm {...props} giveAsset={asset || ''} />}
        ReviewComponent={ReviewOrder}
        composeApiMethod={composeOrder}
      />
    </div>
  );
}

export default ComposeOrderPage;
