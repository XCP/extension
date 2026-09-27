/**
 * File upload validation utilities.
 * Error strings are shown to the user as they are, so each one is translated here.
 */

import { t } from '@/i18n';

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
}

export interface FileValidationOptions {
  maxSizeKB?: number;
  allowedExtensions?: string[];
}

/**
 * Validate file size
 */
export function validateFileSize(file: File | { size: number }, maxSizeKB: number): FileValidationResult {
  if (!file || typeof file.size !== 'number') {
    return { isValid: false, error: t('file_validation_invalid_file') };
  }

  if (file.size <= 0) {
    return { isValid: false, error: t('file_validation_empty') };
  }

  const maxBytes = maxSizeKB * 1024;
  
  // Check for suspiciously large files that might cause memory issues
  const MAX_SAFE_SIZE = 50 * 1024 * 1024; // 50MB absolute max
  if (file.size > MAX_SAFE_SIZE) {
    return { isValid: false, error: t('file_validation_safety_limit') };
  }
  
  if (file.size > maxBytes) {
    return { 
      isValid: false, 
      error: t('file_validation_too_large', [String(maxSizeKB), String(Math.round(file.size / 1024))])
    };
  }

  return { isValid: true };
}

/**
 * Validate and sanitize filename
 */
export function validateFileName(filename: string): FileValidationResult {
  if (!filename || typeof filename !== 'string') {
    return { isValid: false, error: t('file_validation_invalid_name') };
  }

  // Check length
  if (filename.length === 0) {
    return { isValid: false, error: t('file_validation_invalid_name') };
  }

  if (filename.length > 255) {
    return { isValid: false, error: t('file_validation_name_too_long') };
  }

  // No path-traversal check: the name is only displayed, never joined into a path or used to
  // open anything, so `payouts..csv` is an ordinary name. Control characters are still refused
  // because they would render as invisible or misleading text.
  if (/[\x00-\x1f\x7f]/.test(filename)) {
    return { isValid: false, error: t('file_validation_control_characters') };
  }

  // Check for Windows reserved names
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  const baseNameUpper = filename.split('.')[0]!.toUpperCase();
  if (reservedNames.includes(baseNameUpper)) {
    return { isValid: false, error: t('file_validation_reserved_name') };
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
    return { isValid: false, error: t('file_validation_invalid_name') };
  }

  if (allowedExtensions.length === 0) {
    return { isValid: true }; // No restrictions
  }

  // Extract extension
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) {
    return { isValid: false, error: t('file_validation_no_extension') };
  }

  const extension = filename.slice(lastDot).toLowerCase();
  const normalizedAllowed = allowedExtensions.map(ext => 
    ext.startsWith('.') ? ext.toLowerCase() : '.' + ext.toLowerCase()
  );

  if (!normalizedAllowed.includes(extension)) {
    return { 
      isValid: false, 
      error: t('file_validation_extension_not_allowed', [normalizedAllowed.join(', ')])
    };
  }

  // Check for double extensions that might bypass filters
  const doubleExtensions = ['.php.png', '.exe.jpg', '.asp.gif', '.jsp.jpeg'];
  const lowerFilename = filename.toLowerCase();
  
  for (const dangerous of doubleExtensions) {
    if (lowerFilename.includes(dangerous)) {
      return { isValid: false, error: t('file_validation_double_extension') };
    }
  }

  return { isValid: true };
}

/**
 * Comprehensive file validation
 */
export async function validateFile(
  file: File,
  options: FileValidationOptions = {}
): Promise<FileValidationResult> {
  const { maxSizeKB, allowedExtensions } = options;

  // Validate size
  if (maxSizeKB !== undefined) {
    const sizeResult = validateFileSize(file, maxSizeKB);
    if (!sizeResult.isValid) {
      return sizeResult;
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

  return { 
    isValid: true, 
    sanitizedName: nameResult.sanitizedName 
  };
}
