/**
 * File upload validation utilities
 * Security-focused validation for file uploads
 */

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
}

export interface FileValidationOptions {
  maxSizeKB?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  detectMaliciousPatterns?: boolean;
}

/**
 * Validate file size
 */
export function validateFileSize(file: File | { size: number }, maxSizeKB: number): FileValidationResult {
  if (!file || typeof file.size !== 'number') {
    return { isValid: false, error: 'Invalid file object' };
  }

  if (file.size <= 0) {
    return { isValid: false, error: 'File is empty' };
  }

  const maxBytes = maxSizeKB * 1024;
  
  // Check for suspiciously large files that might cause memory issues
  const MAX_SAFE_SIZE = 50 * 1024 * 1024; // 50MB absolute max
  if (file.size > MAX_SAFE_SIZE) {
    return { isValid: false, error: 'File exceeds safety limit' };
  }
  
  if (file.size > maxBytes) {
    return { 
      isValid: false, 
      error: `File too large. Maximum size: ${maxSizeKB}KB, actual: ${Math.round(file.size / 1024)}KB` 
    };
  }

  return { isValid: true };
}

/**
 * Validate file type/MIME type
 */
export function validateFileType(file: File | { type: string }, allowedTypes: string[]): FileValidationResult {
  if (!file || typeof file.type !== 'string') {
    return { isValid: false, error: 'Invalid file object' };
  }

  if (allowedTypes.length === 0) {
    return { isValid: true }; // No restrictions
  }

  // Normalize MIME types
  const fileType = file.type.toLowerCase();
  const normalizedAllowed = allowedTypes.map(t => t.toLowerCase());

  // Check exact match or wildcard match (e.g., "image/*")
  const isAllowed = normalizedAllowed.some(allowed => {
    if (allowed.endsWith('/*')) {
      const prefix = allowed.slice(0, -2);
      return fileType.startsWith(prefix + '/');
    }
    return fileType === allowed;
  });

  if (!isAllowed) {
    return { 
      isValid: false, 
      error: `File type not allowed. Accepted types: ${allowedTypes.join(', ')}` 
    };
  }

  // Check for MIME type spoofing attempts
  const suspiciousTypes = [
    'application/x-msdownload',
    'application/x-msdos-program',
    'application/x-executable',
    'application/x-sharedlib',
  ];

  if (suspiciousTypes.includes(fileType)) {
    return { isValid: false, error: 'Potentially malicious file type detected' };
  }

  return { isValid: true };
}

/**
 * Validate and sanitize filename
 */
export function validateFileName(filename: string): FileValidationResult {
  if (!filename || typeof filename !== 'string') {
    return { isValid: false, error: 'Invalid filename' };
  }

  // Check length
  if (filename.length === 0) {
    return { isValid: false, error: 'Filename is empty' };
  }

  if (filename.length > 255) {
    return { isValid: false, error: 'Filename too long' };
  }

  // Check for path traversal attempts
  const pathTraversalPatterns = [
    '..',
    '..\\',
    '../',
    '..\\\\',
    '%2e%2e',
    '0x2e0x2e',
    '..;',
    '..%00',
    '..%01',
  ];

  const lowerFilename = filename.toLowerCase();
  for (const pattern of pathTraversalPatterns) {
    if (lowerFilename.includes(pattern)) {
      return { isValid: false, error: 'Path traversal attempt detected' };
    }
  }

  // Check for null bytes and control characters
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return { isValid: false, error: 'Path traversal attempt detected' };
  }

  // Check for Windows reserved names
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  const baseNameUpper = filename.split('.')[0].toUpperCase();
  if (reservedNames.includes(baseNameUpper)) {
    return { isValid: false, error: 'Reserved filename detected' };
  }

  // Sanitize filename
  const sanitized = sanitizeFileName(filename);

  return { isValid: true, sanitizedName: sanitized };
}

/**
 * Sanitize a filename for safe storage
 */
export function sanitizeFileName(filename: string): string {
  if (!filename) return 'unnamed';

  // Remove path components
  const basename = filename.split(/[/\\]/).pop() || 'unnamed';

  // Replace dangerous characters
  let sanitized = basename
    .replace(/[<>"\\|?*\x00-\x1f\x7f]/g, '_') // Windows forbidden chars
    .replace(/:/g, '__') // Replace colon with double underscore
    .replace(/\//g, '_') // Replace forward slash
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Collapse multiple underscores
    .trim();

  // Ensure non-empty or just underscores  
  if (!sanitized) {
    sanitized = 'unnamed';
  } else if (sanitized === '_' && basename.trim() === '___') {
    // Special case: if input was just underscores, keep one
    sanitized = '_';
  } else if (sanitized === '_') {
    sanitized = 'unnamed';
  }

  // Limit length
  if (sanitized.length > 200) {
    const ext = sanitized.match(/\.[^.]+$/)?.[0] || '';
    const base = sanitized.slice(0, 200 - ext.length);
    sanitized = base + ext;
  }

  return sanitized;
}

/**
 * Validate file extension
 */
export function validateFileExtension(filename: string, allowedExtensions: string[]): FileValidationResult {
  if (!filename) {
    return { isValid: false, error: 'No filename provided' };
  }

  if (allowedExtensions.length === 0) {
    return { isValid: true }; // No restrictions
  }

  // Extract extension
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return { isValid: false, error: 'File has no extension' };
  }

  const extension = filename.slice(lastDot).toLowerCase();
  const normalizedAllowed = allowedExtensions.map(ext => 
    ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase()
  );

  if (!normalizedAllowed.includes(extension)) {
    return { 
      isValid: false, 
      error: `File extension not allowed. Accepted: ${normalizedAllowed.join(', ')}` 
    };
  }

  // Check for double extensions that might bypass filters
  const doubleExtensions = ['.php.png', '.exe.jpg', '.asp.gif', '.jsp.jpeg'];
  const lowerFilename = filename.toLowerCase();
  
  for (const dangerous of doubleExtensions) {
    if (lowerFilename.includes(dangerous)) {
      return { isValid: false, error: 'Suspicious double extension detected' };
    }
  }

  return { isValid: true };
}

/**
 * Check file content for malicious patterns (for text files)
 */
export async function detectMaliciousContent(file: File): Promise<FileValidationResult> {
  // Only check text files
  if (!file.type.startsWith('text/') && !file.name.endsWith('.csv')) {
    return { isValid: true }; // Skip binary files
  }

  // Read first 1KB of file
  const slice = file.slice(0, 1024);
  
  try {
    const text = await slice.text();
    
    // Check for script tags or JavaScript
    const scriptPatterns = [
      /<script/i,
      /javascript:/i,
      /onclick=/i,
      /onerror=/i,
      /onload=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(text)) {
        return { isValid: false, error: 'Potentially malicious content detected' };
      }
    }

    // Check for PHP/ASP/JSP tags
    const serverSidePatterns = [
      /<\?php/i,
      /<\?=/,
      /<%/,
      /%>/,
    ];

    for (const pattern of serverSidePatterns) {
      if (pattern.test(text)) {
        return { isValid: false, error: 'Potentially malicious content detected' };
      }
    }

    return { isValid: true };
  } catch (error) {
    // If we can't read the file, consider it suspicious
    return { isValid: false, error: 'Unable to validate file content' };
  }
}

/**
 * Comprehensive file validation
 */
export async function validateFile(
  file: File,
  options: FileValidationOptions = {}
): Promise<FileValidationResult> {
  const {
    maxSizeKB,
    allowedTypes,
    allowedExtensions,
    detectMaliciousPatterns = true,
  } = options;

  // Validate size
  if (maxSizeKB !== undefined) {
    const sizeResult = validateFileSize(file, maxSizeKB);
    if (!sizeResult.isValid) {
      return sizeResult;
    }
  }

  // Validate MIME type
  if (allowedTypes && allowedTypes.length > 0) {
    const typeResult = validateFileType(file, allowedTypes);
    if (!typeResult.isValid) {
      return typeResult;
    }
  }

  // Validate filename
  const nameResult = validateFileName(file.name);
  if (!nameResult.isValid) {
    return nameResult;
  }

  // Validate extension
  if (allowedExtensions && allowedExtensions.length > 0) {
    const extResult = validateFileExtension(file.name, allowedExtensions);
    if (!extResult.isValid) {
      return extResult;
    }
  }

  // Check for malicious content
  if (detectMaliciousPatterns) {
    const contentResult = await detectMaliciousContent(file);
    if (!contentResult.isValid) {
      return contentResult;
    }
  }

  return { 
    isValid: true, 
    sanitizedName: nameResult.sanitizedName 
  };
}

/**
 * Convert file to base64 safely
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Validate file size before reading
    const MAX_BASE64_SIZE = 10 * 1024 * 1024; // 10MB max for base64 conversion
    
    if (file.size > MAX_BASE64_SIZE) {
      reject(new Error('File too large for base64 conversion'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // Extract base64 part (remove data:type;base64, prefix)
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Error reading file'));
    };
    
    reader.readAsDataURL(file);
  });
}