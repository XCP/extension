import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { composePoolWithdraw, type PoolWithdrawOptions } from "@/core/counterparty/compose";
import { PoolWithdrawForm } from "@/pages/compose/pool/withdraw/form";
import { ReviewPoolWithdraw } from "@/pages/compose/pool/withdraw/review";

export default function ComposePoolWithdrawPage() {
  const { lpAsset } = useParams<{ lpAsset: string }>();
  const asset = lpAsset ? decodeURIComponent(lpAsset) : "";

  return (
    <div className="p-4">
      <Composer<PoolWithdrawOptions>
        composeType="poolwithdraw"
        composeApiMethod={composePoolWithdraw}
        initialTitle="Pool"
        FormComponent={(props) => <PoolWithdrawForm {...props} lpAsset={asset} />}
        ReviewComponent={ReviewPoolWithdraw}
      />
    </div>
  );
}
