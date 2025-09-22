import { BTCPayForm } from './form';
import { ReviewBTCPay } from './review';
import { Composer } from '@/components/composer';
import { composeBTCPay } from '@/utils/blockchain/counterparty/compose';
import type { BTCPayOptions } from '@/utils/blockchain/counterparty/compose';

function ComposeBTCPay() {
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

export default ComposeBTCPay;
