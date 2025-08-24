"use client";

import { useEffect, useState, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/button";
import { ErrorAlert } from "@/components/error-alert";
import { FeeRateInput } from "@/components/inputs/fee-rate-input";
import { useSettings } from "@/contexts/settings-context";
import { useWallet } from "@/contexts/wallet-context";
import { formatAmount } from "@/utils/format";
import { toSatoshis } from "@/utils/numeric";
import { fetchAssetDetails, isHexMemo, stripHexPrefix, isValidMemoLength } from "@/utils/blockchain/counterparty";
import type { ReactElement } from "react";

interface ParsedRow {
  address: string;
  asset: string;
  quantity: string;
  memo?: string;
  isDivisible?: boolean;
  originalQuantity: string; // Keep original for display
}

interface MPMAFormProps {
  formAction: (formData: FormData) => void;
  initialFormData: any | null;
  error?: string | null;
  showHelpText?: boolean;
}

export function MPMAForm({
  formAction,
  initialFormData,
  error: composerError,
  showHelpText,
}: MPMAFormProps): ReactElement {
  const { activeAddress } = useWallet();
  const { settings } = useSettings();
  const shouldShowHelpText = showHelpText ?? settings?.showHelpText ?? false;
  const { pending } = useFormStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [error, setError] = useState<{ message: string } | null>(null);
  const [csvData, setCsvData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [satPerVbyte, setSatPerVbyte] = useState<number>(initialFormData?.sat_per_vbyte || 0.1);
  
  // Set composer error when it occurs
  useEffect(() => {
    if (composerError) {
      setError({ message: composerError });
    }
  }, [composerError]);

  const validateAddress = (address: string): boolean => {
    // Basic Bitcoin address validation (simplified)
    return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
  };

  const processCSV = async (text: string) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const lines = text.trim().split('\n');
      const parsedRows: ParsedRow[] = [];
      const assetCache: { [key: string]: boolean } = {};
      
      // Check if first line is a header and skip it
      let startIndex = 0;
      if (lines.length > 0) {
        const firstLine = lines[0].toLowerCase().replace(/["\s]/g, '');
        if (firstLine.includes('address') && firstLine.includes('asset') && firstLine.includes('quantity')) {
          startIndex = 1; // Skip header row
        }
      }
      
      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines
        
        // Parse CSV line (handle quoted values with commas)
        const parts = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map(part => 
          part.replace(/^"|"$/g, '').trim()
        ) || [];
        
        // Calculate actual line number for error messages (accounting for header if skipped)
        const lineNum = startIndex > 0 ? i : i + 1;
        
        if (parts.length < 3) {
          throw new Error(`Line ${lineNum}: Invalid format. Expected at least Address, Asset, Quantity`);
        }
        
        const [address, asset, quantity, memo] = parts;
        
        // Validate address
        if (!validateAddress(address)) {
          throw new Error(`Line ${lineNum}: Invalid Bitcoin address: ${address}`);
        }
        
        // Validate asset
        if (!asset || asset.length === 0) {
          throw new Error(`Line ${lineNum}: Asset is required`);
        }
        
        // Validate quantity
        const quantityNum = parseFloat(quantity);
        if (isNaN(quantityNum) || quantityNum <= 0) {
          throw new Error(`Line ${lineNum}: Invalid quantity: ${quantity}`);
        }
        
        // Check asset divisibility (cache results)
        let isDivisible = true;
        if (asset !== 'BTC') {
          if (!(asset in assetCache)) {
            try {
              const assetInfo = await fetchAssetDetails(asset);
              assetCache[asset] = assetInfo?.divisible ?? false;
            } catch (e) {
              // If we can't get asset info, assume divisible for now
              // The API will validate properly later
              assetCache[asset] = true;
            }
          }
          isDivisible = assetCache[asset];
        }
        
        // Validate memo length if provided
        if (memo) {
          const isHex = isHexMemo(memo);
          const memoToValidate = isHex ? stripHexPrefix(memo) : memo;
          if (!isValidMemoLength(memoToValidate, isHex)) {
            throw new Error(`Line ${lineNum}: Memo exceeds 34 bytes`);
          }
        }
        
        parsedRows.push({
          address,
          asset,
          quantity: isDivisible ? toSatoshis(quantity) : quantity,
          memo,
          isDivisible,
          originalQuantity: quantity
        });
      }
      
      if (parsedRows.length === 0) {
        throw new Error("No valid data found in CSV");
      }
      
      setCsvData(parsedRows);
      
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to parse CSV' });
      setCsvData([]);
      setUploadedFileName("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      setError({ message: 'Please select a CSV file' });
      return;
    }
    
    setUploadedFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await processCSV(text);
    };
    reader.onerror = () => {
      setError({ message: 'Failed to read file' });
      setUploadedFileName("");
    };
    reader.readAsText(file);
  };

  const handleTextPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (text) {
      setUploadedFileName("Pasted data");
      await processCSV(text);
    }
  };

  const handleFormAction = (formData: FormData) => {
    if (csvData.length === 0) return;
    
    // Convert parsed data to format expected by API
    formData.set('assets', csvData.map(r => r.asset).join(','));
    formData.set('destinations', csvData.map(r => r.address).join(','));
    formData.set('quantities', csvData.map(r => r.quantity).join(','));
    
    // Send memos as comma-separated (will be converted to array in page.tsx)
    const memos = csvData.map(r => r.memo || '');
    const hasAnyMemo = memos.some(m => m !== '');
    
    if (hasAnyMemo) {
      // Auto-detect hex memos and potentially strip 0x prefix
      const processedMemos = csvData.map(r => {
        if (r.memo && isHexMemo(r.memo)) {
          return stripHexPrefix(r.memo);
        }
        return r.memo || '';
      });
      
      formData.set('memos', processedMemos.join(','));
      formData.set('memos_are_hex', csvData.map(r => isHexMemo(r.memo || '')).map(b => b.toString()).join(','));
    }
    
    formAction(formData);
  };

  const isSubmitDisabled = pending || csvData.length === 0 || isProcessing;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-lg p-4">
        {error && (
          <ErrorAlert
            message={error.message}
            onClose={() => setError(null)}
          />
        )}
        
        <form action={handleFormAction} className="space-y-6">
          <div>
            <label htmlFor="csv-upload" className="text-sm font-medium text-gray-700">
              Upload CSV File <span className="text-red-500">*</span>
            </label>
            
            <div className="mt-2 space-y-4">
              {/* File upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  id="csv-upload"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={pending || isProcessing}
                />
                {uploadedFileName ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{uploadedFileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700"
                      disabled={pending || isProcessing}
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={pending || isProcessing}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload CSV
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Format: Address, Asset, Quantity, Memo
                    </p>
                  </>
                )}
              </div>
              
              {/* Or paste text */}
              <div className="text-center text-gray-500 text-sm">- OR -</div>
              
              <textarea
                placeholder="Paste CSV data here..."
                onPaste={handleTextPaste}
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={5}
                disabled={pending || isProcessing}
              />
            </div>
            
            {shouldShowHelpText && (
              <p className="mt-2 text-sm text-gray-500">
                Each line should contain: Address, Asset, Quantity, and Memo. (Memo is optional.)
              </p>
            )}
          </div>
          
          {/* Show parsed data preview */}
          {csvData.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Preview (First 5)</h4>
              <div className="space-y-1">
                {csvData.slice(0, 5).map((row, idx) => (
                  <div key={idx} className="text-xs text-gray-600 font-mono">
                    {row.address.slice(0, 10)}... → {row.originalQuantity} {row.asset}
                    {row.memo && ` (${row.memo.slice(0, 20)}${row.memo.length > 20 ? '...' : ''})`}
                  </div>
                ))}
                {csvData.length > 5 && (
                  <div className="text-xs text-gray-500">... and {csvData.length - 5} more</div>
                )}
              </div>
            </div>
          )}

          <FeeRateInput
            showHelpText={shouldShowHelpText}
            disabled={pending}
            onFeeRateChange={setSatPerVbyte}
          />

          <Button
            type="submit"
            color="blue"
            fullWidth
            disabled={isSubmitDisabled}
          >
            {pending ? "Processing..." : isProcessing ? "Validating..." : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}