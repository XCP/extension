import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { TransferOwnershipForm } from "@/pages/compose/issuance/transfer-ownership/form";
import { ReviewIssuanceTransferOwnership } from "@/pages/compose/issuance/transfer-ownership/review";

function ComposeTransferOwnershipPage() {
  const { asset } = useParams<{ asset?: string }>();

  if (!asset) {
    return (
      <div className="p-4">
        <ErrorAlert message={t('common_asset_parameter_is_required')} />
      </div>
    );
  }

  return (
    <div className="p-4">
      <Composer<IssuanceOptions>
        composeType="issuance"
        composeApiMethod={composeIssuance}
        initialTitle={t('issuance_transfer_ownership_transfer_asset')}
        FormComponent={(props) => <TransferOwnershipForm {...props} asset={asset} />}
        ReviewComponent={ReviewIssuanceTransferOwnership}
      />
    </div>
  );
}

export default ComposeTransferOwnershipPage;
