import React from "react";
import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer";
import { composeDividend } from "@/utils/composer";
import { DividendForm } from "./form";
import { ReviewDividend } from "./review";

export function ComposeDividendPage() {
  const { asset: assetParam } = useParams<{ asset?: string }>();
  const asset = assetParam ? decodeURIComponent(assetParam) : "";

  return (
    <div className="p-4">
      <Composer
        initialTitle="Dividend"
        FormComponent={(props) => <DividendForm {...props} asset={asset} />}
        ReviewComponent={(props) => <ReviewDividend {...props} />}
        composeTransaction={composeDividend}
      />
    </div>
  );
}

export default ComposeDividendPage;
