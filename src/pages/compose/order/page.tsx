import { useParams } from 'react-router-dom';
import { OrderForm } from './form';
import { ReviewOrder } from './review';
import { Composer } from '@/components/composer';
import { composeOrder } from '@/utils/blockchain/counterparty';
import { useComposer } from "@/contexts/composer-context";

export function ComposeOrderPage() {
  const { asset: giveAssetParam } = useParams<{ asset?: string }>();
  const giveAsset = giveAssetParam ? decodeURIComponent(giveAssetParam) : '';
  const { setError } = useComposer();

  const handleSubmit = async (data: OrderOptions) => {
    try {
      const response = await composeOrder(data);
      // Handle successful response
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="p-4">
      <Composer
        initialTitle="Dex Order"
        FormComponent={(props) => <OrderForm {...props} giveAsset={giveAsset} setError={setError} />}
        ReviewComponent={(props) => <ReviewOrder {...props} giveAsset={giveAsset} />}
        composeTransaction={composeOrder}
      />
    </div>
  );
}

export default ComposeOrderPage;
