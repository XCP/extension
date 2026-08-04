import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ComposerForm } from "@/components/composer/composer-form";
import { ErrorAlert } from "@/components/ui/error-alert";
import { TextAreaInput } from "@/components/ui/inputs/textarea-input";
import { useComposer } from "@/contexts/composer-context-object";
import { fetchAssetDetails } from "@/core/counterparty/api";
import { isHexMemo, isValidMemoLength, stripHexPrefix } from "@/core/counterparty/memo";
import { validateBitcoinAddress } from "@/core/validation/bitcoin";
import { parseCSV } from "@/core/validation/csv";
import { validateFile } from "@/core/validation/file";

/** Bounds the CSV read; parseCSV caps rows at 10000, which is well under this. */
const MAX_CSV_SIZE_KB = 2048;

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
}

export function MPMAForm({
  formAction,
  initialFormData,
}: MPMAFormProps): ReactElement {
  // Context hooks
  const { showHelpText } = useComposer();
  
  // Error state management
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Form state
  const [csvData, setCsvData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Effects

  // Handlers
  const processCSV = async (text: string) => {
    setIsProcessing(true);
    setValidationError(null);
    
    try {
      // parseCSV owns turning text into rows: it normalises line endings, parses quoted values
      // properly, caps the row count and rejects spreadsheet formula injection - none of which the
      // hand-rolled loop here did. Address checking is left off so the checksum-validating
      // validateBitcoinAddress below runs instead of the module's format-only test.
      const parsed = parseCSV(text, { validateAddresses: false });
      if (!parsed.success || !parsed.rows) {
        throw new Error(parsed.errorLine ? `Line ${parsed.errorLine}: ${parsed.error}` : parsed.error ?? 'Invalid CSV');
      }

      const parsedRows: ParsedRow[] = [];
      const assetCache: { [key: string]: boolean } = {};

      for (const row of parsed.rows) {
        const { address, asset, quantity, memo, lineNumber } = row;

        const addressValidation = validateBitcoinAddress(address);
        if (!addressValidation.isValid) {
          throw new Error(`Line ${lineNumber}: Invalid Bitcoin address: ${address}. ${addressValidation.error || ''}`);
        }

        // Check asset divisibility (cache results)
        let isDivisible = true;
        if (asset !== 'BTC') {
          if (!(asset in assetCache)) {
            try {
              const assetInfo = await fetchAssetDetails(asset);
              assetCache[asset] = assetInfo?.divisible ?? false;
            } catch (_e) {
              // If we cannot get asset info, assume divisible; the API validates properly later
              assetCache[asset] = true;
            }
          }
          isDivisible = assetCache[asset]!;
        }

        // Validate memo length if provided
        if (memo) {
          const isHex = isHexMemo(memo);
          const memoToValidate = isHex ? stripHexPrefix(memo) : memo;
          if (!isValidMemoLength(memoToValidate, isHex)) {
            throw new Error(`Line ${lineNumber}: Memo exceeds 34 bytes`);
          }
        }

        parsedRows.push({
          address,
          asset,
          quantity,
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
      setValidationError(err instanceof Error ? err.message : 'Failed to parse CSV');
      setCsvData([]);
      setUploadedFileName("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Bounded before the whole file is read into memory. parseCSV caps rows, but that only
    // applies once the text exists, and nothing capped the bytes. detectMaliciousPatterns is left
    // off deliberately: parseCSV already screens every field for injection, which covers the whole
    // file rather than the first kilobyte, and a scan for script markers could trip on a memo.
    const fileCheck = await validateFile(file, {
      maxSizeKB: MAX_CSV_SIZE_KB,
      allowedExtensions: ['.csv'],
      detectMaliciousPatterns: false,
    });
    if (!fileCheck.isValid) {
      setValidationError(fileCheck.error ?? 'Please select a CSV file');
      return;
    }
    
    setUploadedFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      await processCSV(text);
    };
    reader.onerror = () => {
      setValidationError('Failed to read file');
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

  const isSubmitDisabled = csvData.length === 0 || isProcessing;

  return (
    <ComposerForm
      formAction={handleFormAction}
      submitDisabled={isSubmitDisabled}
      submitText={isProcessing ? "Validating…" : "Continue"}
    >
      {validationError && (
        <div className="mb-4">
          <ErrorAlert
            message={validationError}
            onClose={() => setValidationError(null)}
          />
        </div>
      )}
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
                  disabled={isProcessing}
                />
                {uploadedFileName ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="size-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-gray-700">{uploadedFileName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      disabled={isProcessing}
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isProcessing}
                    >
                      <svg className="size-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
              
              <TextAreaInput
                value=""
                onChange={() => {}} // We only care about paste
                placeholder="Paste CSV data here…"
                onPaste={handleTextPaste}
                rows={4}
                disabled={isProcessing}
              />
            </div>
            
            {showHelpText && (
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
                    {row.address.slice(0, 10)}… → {row.originalQuantity} {row.asset}
                    {row.memo && ` (${row.memo.slice(0, 20)}${row.memo.length > 20 ? '…' : ''})`}
                  </div>
                ))}
                {csvData.length > 5 && (
                  <div className="text-xs text-gray-500">… and {csvData.length - 5} more</div>
                )}
              </div>
            </div>
          )}

    </ComposerForm>
  );
}