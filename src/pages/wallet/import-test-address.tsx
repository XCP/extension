import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertTriangle } from '@/components/icons';
import { Button } from '@/components/button';
import { useHeader } from '@/contexts/header-context';
import { useWallet } from '@/contexts/wallet-context';

function ImportTestAddress() {
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
      navigate('/add-wallet');
      return;
    }
    
    setHeaderProps({
      title: 'Import Test Address',
      onBack: () => navigate('/add-wallet'),
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
          {/* Warning Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <FiAlertTriangle className="size-4 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-amber-900">Development Mode</h2>
                <p className="text-sm text-amber-800 mt-1">
                  This creates a watch-only wallet for testing. You cannot sign or broadcast transactions.
                </p>
              </div>
            </div>
          </div>
          
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
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

export default ImportTestAddress;