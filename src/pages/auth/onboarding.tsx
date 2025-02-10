import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoCreateOutline } from 'react-icons/io5';
import { FiUpload } from 'react-icons/fi';
import { Button } from '@/components/button';
import { useHeader } from '@/contexts/header-context';

const Onboarding = () => {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  useEffect(() => {
    setHeaderProps({
      useLogoTitle: true,
      title: 'Onboarding',
    });
  }, [setHeaderProps]);

  function handleCreateWallet() {
    navigate('/create-wallet');
  }

  function handleImportWallet() {
    navigate('/import-wallet');
  }

  return (
    <div className="flex flex-col h-full" role="main">
      <div className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
          <h1 className="text-3xl mb-5 flex justify-between items-center">
            <span className="font-bold">XCP Wallet</span>
            <span>v0.0.1</span>
          </h1>
          <div className="space-y-4">
            <Button
              color="green"
              fullWidth
              onClick={handleCreateWallet}
              aria-label="Create wallet"
            >
              <IoCreateOutline className="mr-2" aria-hidden="true" />
              Create Wallet
            </Button>
            <Button
              color="blue"
              fullWidth
              onClick={handleImportWallet}
              aria-label="Import wallet"
            >
              <FiUpload className="mr-2" aria-hidden="true" />
              Import Wallet
            </Button>
          </div>
        </div>
      </div>

      <div className="text-center text-xs p-4">
        By continuing, you agree to our <a href="#" className="font-bold">Terms of Service</a>.
      </div>
    </div>
  );
};

export default Onboarding;
