import { useParams } from "react-router";
import { Composer } from "@/components/composer/composer";
import { ErrorAlert } from "@/components/ui/error-alert";
import type { IssuanceOptions } from "@/core/counterparty/compose";
import { composeIssuance } from "@/core/counterparty/compose";
import { t } from '@/i18n';
import { IssueSupplyForm } from "@/pages/compose/issuance/issue-supply/form";
import { ReviewIssuanceIssueSupply } from "@/pages/compose/issuance/issue-supply/review";

function ComposeIssueSupplyPage() {
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
        initialTitle={t('common_issue_supply')}
        renderForm={(props) => <IssueSupplyForm {...props} initialParentAsset={asset} />}
        ReviewComponent={ReviewIssuanceIssueSupply}
      />
    </div>
  );
}

export default ComposeIssueSupplyPage;
