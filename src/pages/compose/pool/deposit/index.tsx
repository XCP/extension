import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer/composer";
import { composePoolDeposit, type PoolDepositOptions } from "@/utils/blockchain/counterparty/compose";
import { PoolDepositForm } from "./form";
import { ReviewPoolDeposit } from "./review";

export default function ComposePoolDepositPage() {
  const { assetA, assetB } = useParams<{ assetA?: string; assetB?: string }>();

  return (
    <div className="p-4">
      <Composer<PoolDepositOptions>
        composeType="pooldeposit"
        composeApiMethod={composePoolDeposit}
        initialTitle="Pool Deposit"
        FormComponent={(props) => (
          <PoolDepositForm
            {...props}
            initialAssetA={assetA ? decodeURIComponent(assetA) : undefined}
            initialAssetB={assetB ? decodeURIComponent(assetB) : undefined}
          />
        )}
        ReviewComponent={ReviewPoolDeposit}
      />
    </div>
  );
}
