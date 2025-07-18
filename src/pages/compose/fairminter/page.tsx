import { useParams } from 'react-router-dom';
import { FairminterForm } from './form';
import { ReviewFairminter } from './review';
import { Composer } from '@/components/composer';
import { composeFairminter } from '@/utils/blockchain/counterparty';
import type { FairminterOptions } from '@/utils/blockchain/counterparty';

export function ComposeFairminterPage() {
  const { asset } = useParams<{ asset?: string }>();
  
  return (
    <div className="p-4">
      <Composer<FairminterOptions>
        initialTitle="Fairminter"
        FormComponent={(props) => <FairminterForm {...props} asset={asset || ''} />}
        ReviewComponent={ReviewFairminter}
        composeTransaction={composeFairminter}
      />
    </div>
  );
}

export default ComposeFairminterPage;
