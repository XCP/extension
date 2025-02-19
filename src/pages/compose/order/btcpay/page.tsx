import { BTCPayForm } from './form';
import { ReviewBTCPay } from './review';
import { Composer } from '@/components/composer';
import { composeBTCPay } from '@/utils/blockchain/counterparty';

export function ComposeBTCPay() {
  return (
    <div className="p-4">
      <Composer
        initialTitle="BTCPay"
        FormComponent={BTCPayForm}
        ReviewComponent={ReviewBTCPay}
        composeTransaction={composeBTCPay}
      />
    </div>
  );
}

export default ComposeBTCPay;
