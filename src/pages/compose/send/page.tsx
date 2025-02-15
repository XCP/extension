import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { SendForm } from "./form";
import { ReviewSend } from "./review";
import { Composer } from "@/components/composer";
import { composeSend } from "@/utils/blockchain/counterparty";

export function ComposeSend() {
  const { asset } = useParams<{ asset: string }>();
  return (
    <div className="p-4">
      <Suspense fallback={<div>Loading asset details...</div>}>
        <Composer
          initialTitle="Send"
          FormComponent={(props) => <SendForm {...props} initialAsset={asset} />}
          ReviewComponent={ReviewSend}
          composeTransaction={composeSend}
        />
      </Suspense>
    </div>
  );
}
