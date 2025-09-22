import { useParams } from "react-router-dom";
import { DividendForm } from "./form";
import { ReviewDividend } from "./review";
import { Composer } from "@/components/composer";
import { composeDividend } from "@/utils/blockchain/counterparty/compose";
import type { DividendOptions } from "@/utils/blockchain/counterparty/compose";

function ComposeDividendPage() {
  const { asset } = useParams<{ asset?: string }>();

  return (
    <div className="p-4">
      <Composer<DividendOptions>
        initialTitle="Dividend"
        FormComponent={(props) => <DividendForm {...props} asset={asset || ""} />}
        ReviewComponent={ReviewDividend}
        composeApiMethod={composeDividend}
      />
    </div>
  );
}

export default ComposeDividendPage;
