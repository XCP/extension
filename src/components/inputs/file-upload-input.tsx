import { useRef, type ReactElement } from 'react';
import { Field, Label, Description } from '@headlessui/react';

interface FileUploadInputProps {
  label: string;
  required?: boolean;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  error?: string | null;
  disabled?: boolean;
  accept?: string;
  maxSizeKB?: number;
  helpText?: string;
  showHelpText?: boolean;
  uploadButtonText?: string;
  className?: string;
}

/**
 * Shared file upload input component with dotted border design
 * Can be used for CSV uploads, inscription files, or any other file input needs
 */
export function FileUploadInput({
  label,
  required = false,
  selectedFile,
  onFileChange,
  error,
  disabled = false,
  accept,
  maxSizeKB = 400,
  helpText,
  showHelpText = false,
  uploadButtonText = "Choose File",
  className = "",
}: FileUploadInputProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      onFileChange(null);
      return;
    }
    
    // Always pass the file to parent for validation - let parent handle size checking
    onFileChange(file);
  };

  const handleRemoveFile = () => {
    onFileChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Field className={className}>
      <Label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
          accept={accept}
        />
        
        {selectedFile ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 truncate max-w-xs">
                {selectedFile.name}
              </span>
            </div>
            
            <p className="text-xs text-gray-500">
              Size: {(selectedFile.size / 1024).toFixed(2)} KB
              {selectedFile.type && ` • ${selectedFile.type}`}
            </p>
            
            <button
              type="button"
              onClick={handleRemoveFile}
              className="text-xs text-red-600 hover:text-red-700"
              disabled={disabled}
            >
              Remove file
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={disabled}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {uploadButtonText}
            </button>
            
            {maxSizeKB && (
              <p className="text-xs text-gray-500 mt-2">
                Max file size: {maxSizeKB}KB
                {accept && ` • ${accept}`}
              </p>
            )}
          </>
        )}
      </div>
      
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      
      {showHelpText && helpText && (
        <Description className="mt-2 text-sm text-gray-500">
          {helpText}
        </Description>
      )}
    </Field>
  );
}

/**
 * Specialized version for CSV uploads
 */
export function CSVUploadInput(props: Omit<FileUploadInputProps, 'accept' | 'uploadButtonText'> & {
  uploadButtonText?: string;
}): ReactElement {
  return (
    <FileUploadInput
      {...props}
      accept=".csv"
      uploadButtonText={props.uploadButtonText || "Upload CSV"}
    />
  );
}

/**
 * Specialized version for inscription uploads
 */
export function InscriptionUploadInput(props: Omit<FileUploadInputProps, 'label' | 'uploadButtonText'> & {
  label?: string;
  uploadButtonText?: string;
}): ReactElement {
  return (
    <FileUploadInput
      {...props}
      label={props.label || "Inscription"}
      uploadButtonText={props.uploadButtonText || "Choose File"}
    />
  );
}