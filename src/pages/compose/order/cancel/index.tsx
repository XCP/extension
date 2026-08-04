import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { CancelOptions } from "@/core/counterparty/compose";
import { composeCancel } from "@/core/counterparty/compose";
import { CancelForm } from "@/pages/compose/order/cancel/form";
import { ReviewCancel } from "@/pages/compose/order/cancel/review";

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
