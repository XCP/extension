import { useParams } from "react-router-dom";
import { Composer } from "@/components/composer/composer";
import { composePoolWithdraw, type PoolWithdrawOptions } from "@/utils/blockchain/counterparty/compose";
import { PoolWithdrawForm } from "./form";
import { ReviewPoolWithdraw } from "./review";

export default function ComposePoolWithdrawPage() {
  const { lpAsset } = useParams<{ lpAsset: string }>();
  const asset = lpAsset ? decodeURIComponent(lpAsset) : "";

  return (
    <div className="p-4">
      <Composer<PoolWithdrawOptions>
        composeType="poolwithdraw"
        composeApiMethod={composePoolWithdraw}
        initialTitle="Pool Withdraw"
        FormComponent={(props) => <PoolWithdrawForm {...props} lpAsset={asset} />}
        ReviewComponent={ReviewPoolWithdraw}
      />
    </div>
  );
}
