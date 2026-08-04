import { useParams } from "react-router";
import { CancelForm } from "@/pages/compose/order/cancel/form";
import { ReviewCancel } from "@/pages/compose/order/cancel/review";
import { Composer } from "@/components/composer/composer";
import { composeCancel } from "@/utils/blockchain/counterparty/compose";
import type { CancelOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeOrderCancelPage() {
  const { hash } = useParams<{ hash?: string }>();

  return (
    <div className="p-4">
      <Composer<CancelOptions>
        composeType="cancel"
        composeApiMethod={composeCancel}
        initialTitle="Cancel"
        FormComponent={(props) => <CancelForm {...props} initialHash={hash} />}
        ReviewComponent={ReviewCancel}
      />
    </div>
  );
}

export default ComposeOrderCancelPage;
