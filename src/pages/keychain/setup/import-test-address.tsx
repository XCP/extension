import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

function ImportTestAddressPage() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { importTestAddress } = useWallet();
  
  const [addressToAdd, setAddressToAdd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Only allow in development mode
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  useEffect(() => {
    if (!isDevelopment) {
      navigate('/keychain/wallets/add');
      return;
    }

    setHeaderProps({
      title: 'Import Test Address',
      onBack: () => navigate('/keychain/wallets/add'),
    });
    
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate, isDevelopment]);
  
  const handleImportTestAddress = async () => {
    if (!addressToAdd.trim()) {
      setError('Please enter an address');
      return;
    }
    
    setError(null);
    setIsLoading(true);
    
    try {
      // Use the wallet manager method to import the test address
      await importTestAddress(addressToAdd);
      
      // Navigate to home
      navigate('/');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import test address');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isDevelopment) {
    return null;
  }
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <Banner
            severity="warning"
            title="Development Mode"
            description="This creates a watch-only wallet for testing. You cannot sign or broadcast transactions."
          />
          
          {/* Input Field */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="space-y-3">
              <div>
                <label htmlFor="test-address" className="block text-sm font-medium text-gray-700 mb-1">
                  Bitcoin Address
                </label>
                <input
                  id="test-address"
                  type="text"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                  placeholder="Enter any Bitcoin address…"
                  value={addressToAdd}
                  onChange={(e) => setAddressToAdd(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addressToAdd) {
                      handleImportTestAddress();
                    }
                  }}
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md" role="alert">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Save Button */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <Button
          onClick={handleImportTestAddress}
          color="blue"
          fullWidth
          disabled={!addressToAdd || isLoading}
        >
          {isLoading ? 'Importing…' : 'Import Test Address'}
        </Button>
      </div>
    </div>
  );
}

export default ImportTestAddressPage;