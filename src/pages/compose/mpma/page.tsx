import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { MPMAForm } from "./form";
import { ReviewMPMA } from "./review";
import { Composer } from "@/components/composer";
import { composeMPMA } from "@/utils/blockchain/counterparty";

export function ComposeMPMA() {
  const { asset } = useParams<{ asset: string }>();
  return (
    <div className="p-4">
      <Suspense fallback={<div>Loading asset details...</div>}>
        <Composer
          initialTitle="Send"
          FormComponent={(props) => <MPMAForm {...props} initialAsset={asset} />}
          ReviewComponent={ReviewMPMA}
          composeTransaction={composeMPMA}
        />
      </Suspense>
    </div>
  );
}
