import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { MPMAForm } from "./form";
import { ReviewSendMpma } from "./review";
import { Composer } from "@/components/composer";
import { composeMPMA } from "@/utils/blockchain/counterparty";
import type { MPMAOptions } from "@/utils/blockchain/counterparty";

export function ComposeMPMA() {
  const { asset } = useParams<{ asset: string }>();
  return (
    <div className="p-4">
      <Suspense fallback={<div>Loading asset details...</div>}>
        <Composer<MPMAOptions>
          initialTitle="Send"
          FormComponent={MPMAForm}
          ReviewComponent={ReviewSendMpma}
          composeTransaction={composeMPMA}
        />
      </Suspense>
    </div>
  );
}

export default ComposeMPMA;
