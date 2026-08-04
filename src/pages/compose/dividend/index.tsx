import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import type { DividendOptions } from "@/core/counterparty/compose";
import { composeDividend } from "@/core/counterparty/compose";
import { DividendForm } from "@/pages/compose/dividend/form";
import { ReviewDividend } from "@/pages/compose/dividend/review";

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
