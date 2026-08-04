import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { DividendForm } from "@/pages/compose/dividend/form";
import { ReviewDividend } from "@/pages/compose/dividend/review";
import type { DividendOptions } from "@/utils/blockchain/counterparty/compose";
import { composeDividend } from "@/utils/blockchain/counterparty/compose";

function ComposeDividendPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DividendOptions>
        composeType="dividend"
        composeApiMethod={composeDividend}
        initialTitle="Dividend"
        FormComponent={(props) => <DividendForm {...props} asset={asset || ""} />}
        ReviewComponent={ReviewDividend}
      />
    </div>
  );
}

export default ComposeDividendPage;
