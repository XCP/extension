import { useParams } from "react-router-dom";
import { DividendForm } from "./form";
import { ReviewDividend } from "./review";
import { Composer } from "@/components/composer";
import { composeDividend } from "@/utils/blockchain/counterparty";
import type { DividendOptions } from "@/utils/blockchain/counterparty";

export function ComposeDividendPage() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  return (
    <div className="p-4">
      <Composer<DividendOptions>
        initialTitle="Dividend"
        FormComponent={(props) => <DividendForm {...props} asset={asset} />}
        ReviewComponent={ReviewDividend}
        composeApi={composeDividend}
      />
    </div>
  );
}

export default ComposeDividendPage;
