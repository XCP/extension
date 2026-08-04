import { Composer } from '@/components/composer/composer';
import { BTCPayForm } from '@/pages/compose/order/btcpay/form';
import { ReviewBTCPay } from '@/pages/compose/order/btcpay/review';
import type { BTCPayOptions } from '@/utils/blockchain/counterparty/compose';
import { composeBTCPay } from '@/utils/blockchain/counterparty/compose';

function ComposeOrderBtcPayPage() {
  return (
    <div className="p-4">
      <Composer<BTCPayOptions>
        composeType="btcpay"
        composeApiMethod={composeBTCPay}
        initialTitle="BTCPay"
        FormComponent={BTCPayForm}
        ReviewComponent={ReviewBTCPay}
      />
    </div>
  );
}

export default ComposeOrderBtcPayPage;
