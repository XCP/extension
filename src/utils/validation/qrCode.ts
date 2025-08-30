/**
 * QR code validation utilities for security
 */

export interface QRCodeValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  sanitizedText?: string;
}

/**
 * Validates QR code text input for security issues
 */
export function validateQRCodeText(text: string): QRCodeValidationResult {
  if (typeof text !== 'string') {
    return { isValid: false, error: 'QR code text must be a string' };
  }

  const warnings: string[] = [];
  
  // Check for empty text
  if (!text.trim()) {
    return { isValid: false, error: 'QR code text cannot be empty' };
  }

  // Check for extremely long text (QR codes have practical limits)
  if (text.length > 4296) { // Version 40 QR code maximum capacity
    return { isValid: false, error: 'QR code text exceeds maximum length' };
  }

  // Check for control characters that might cause issues
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
    warnings.push('Text contains control characters');
  }

  // Check for potential XSS in URLs
  const lowerText = text.trim().toLowerCase();
  if (
    lowerText.startsWith('http') ||
    lowerText.startsWith('javascript:') ||
    lowerText.startsWith('data:') ||
    lowerText.startsWith('vbscript:') ||
    lowerText.startsWith('file:') ||
    lowerText.startsWith('ftp:')
  ) {
    const urlResult = validateQRCodeURL(text);
    if (!urlResult.isValid) {
      return urlResult;
    }
    if (urlResult.warnings) {
      warnings.push(...urlResult.warnings);
    }
  }

  // Check for potential command injection patterns
  if (/^[=@+\-]/.test(text.trim())) {
    return { isValid: false, error: 'Invalid QR code text format' };
  }

  // Check for null bytes and other dangerous characters
  if (text.includes('\x00')) {
    return { isValid: false, error: 'QR code text contains null bytes' };
  }

  // Check for very long repeating patterns that might cause performance issues
  if (/(.{1,10})\1{100,}/.test(text)) {
    warnings.push('Text contains long repeating patterns');
  }

  // Warn about private data that shouldn't be in QR codes
  if (detectPrivateData(text)) {
    warnings.push('Text may contain private information');
  }

  return { 
    isValid: true, 
    warnings: warnings.length > 0 ? warnings : undefined,
    sanitizedText: sanitizeQRCodeText(text)
  };
}

/**
 * Validates QR code URLs for security issues
 */
function validateQRCodeURL(url: string): QRCodeValidationResult {
  const warnings: string[] = [];
  
  // Check for dangerous protocols first (before URL parsing which might fail)
  const dangerousProtocols = [
    'javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'
  ];
  
  if (dangerousProtocols.some(proto => url.toLowerCase().startsWith(proto))) {
    return { isValid: false, error: 'Dangerous protocol detected in QR code URL' };
  }
  
  try {
    const urlObj = new URL(url.toLowerCase());
    
    // Check for localhost/private IPs
    const hostname = urlObj.hostname.toLowerCase();
    const privateIPPatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./, // Link-local
    ];
    
    if (hostname === 'localhost' || privateIPPatterns.some(pattern => pattern.test(hostname))) {
      warnings.push('QR code contains local/private network URL');
    }
    
    // Check for suspicious domains
    const suspiciousDomains = [
      'bit.ly', 'tinyurl.com', 't.co', 'goo.gl' // URL shorteners
    ];
    
    if (suspiciousDomains.some(domain => hostname.includes(domain))) {
      warnings.push('QR code contains URL shortener');
    }
    
    // Check for suspicious paths
    const decodedPath = decodeURIComponent(urlObj.pathname);
    if (decodedPath.includes('..') || urlObj.pathname.includes('%2e%2e')) {
      return { isValid: false, error: 'Path traversal detected in QR code URL' };
    }
    
    return { 
      isValid: true, 
      warnings: warnings.length > 0 ? warnings : undefined 
    };
    
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format in QR code' };
  }
}

/**
 * Detects potential private data in QR code text
 */
function detectPrivateData(text: string): boolean {
  const sensitivePatterns = [
    /\b[A-Fa-f0-9]{64}\b/,  // Potential private key (64 hex chars)
    /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/, // WIF private key
    /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b.*\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/, // Address + private key
    /password.*[:=]\s*\w+/i,
    /api[_\s]*key.*[:=]\s*\w+/i,
    /secret.*[:=]\s*\w+/i,
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(text));
}

/**
 * Sanitizes QR code text by removing/replacing dangerous characters
 */
export function sanitizeQRCodeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  
  // Remove control characters except newlines and tabs
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Remove null bytes (redundant but explicit)
  sanitized = sanitized.replace(/\x00/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Don't return empty string for single dots or other valid content
  return sanitized;
}

/**
 * Validates QR code dimensions for security and performance
 */
export function validateQRCodeDimensions(width?: number): QRCodeValidationResult {
  if (width === undefined) {
    return { isValid: true }; // Width is optional
  }
  
  if (typeof width !== 'number') {
    return { isValid: false, error: 'QR code width must be a number' };
  }
  
  if (!Number.isFinite(width)) {
    return { isValid: false, error: 'QR code width must be finite' };
  }
  
  if (width <= 0) {
    return { isValid: false, error: 'QR code width must be positive' };
  }
  
  if (width > 10000) {
    return { isValid: false, error: 'QR code width too large (memory concern)' };
  }
  
  return { isValid: true };
}

/**
 * Validates QR code logo source for security
 */
export function validateQRCodeLogo(logoSrc?: string): QRCodeValidationResult {
  if (!logoSrc) {
    return { isValid: true }; // Logo is optional
  }
  
  if (typeof logoSrc !== 'string') {
    return { isValid: false, error: 'Logo source must be a string' };
  }
  
  const trimmed = logoSrc.trim();
  
  // For data URLs, validate the format first
  if (/^data:/i.test(trimmed)) {
    return validateDataURL(trimmed);
  }
  
  // Check for dangerous protocols (excluding data: which is handled above)
  if (/^(javascript|vbscript|file):/i.test(trimmed)) {
    return { isValid: false, error: 'Dangerous protocol in logo source' };
  }
  
  // Check for path traversal
  if (trimmed.includes('..') || trimmed.includes('%2e%2e')) {
    return { isValid: false, error: 'Path traversal detected in logo source' };
  }
  
  return { isValid: true };
}

/**
 * Validates data URLs for QR code logos
 */
function validateDataURL(dataURL: string): QRCodeValidationResult {
  const warnings: string[] = [];
  
  // Basic data URL format validation
  const dataURLPattern = /^data:([a-z]+\/[a-z0-9\-\+]+)?(;[a-z\-]+=[a-z0-9\-]+)*;base64,([A-Za-z0-9+/=]+)$/i;
  
  if (!dataURLPattern.test(dataURL)) {
    return { isValid: false, error: 'Invalid data URL format' };
  }
  
  try {
    // Extract and validate the MIME type
    const mimeTypeMatch = dataURL.match(/^data:([^;]+)/);
    if (mimeTypeMatch) {
      const mimeType = mimeTypeMatch[1].toLowerCase();
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
      
      if (!allowedTypes.includes(mimeType)) {
        return { isValid: false, error: 'Unsupported image type in data URL' };
      }
    }
    
    // Check data URL size (to prevent memory issues)
    if (dataURL.length > 1000000) { // 1MB limit
      return { isValid: false, error: 'Data URL too large' };
    }
    
    // Decode base64 to check for validity
    const base64Part = dataURL.split(',')[1];
    if (base64Part) {
      // Basic base64 validation
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Part)) {
        return { isValid: false, error: 'Invalid base64 in data URL' };
      }
      
      // Check decoded size
      const decodedSize = (base64Part.length * 3) / 4;
      if (decodedSize > 5000000) { // 5MB decoded limit
        warnings.push('Large image detected in data URL');
      }
    }
    
  } catch (error) {
    return { isValid: false, error: 'Failed to validate data URL' };
  }
  
  return { 
    isValid: true, 
    warnings: warnings.length > 0 ? warnings : undefined 
  };
}

/**
 * Comprehensive validation of all QR code parameters
 */
export function validateQRCodeParams(
  text: string,
  width?: number,
  logoSrc?: string
): QRCodeValidationResult {
  // Validate text
  const textResult = validateQRCodeText(text);
  if (!textResult.isValid) {
    return textResult;
  }
  
  // Validate dimensions
  const dimensionsResult = validateQRCodeDimensions(width);
  if (!dimensionsResult.isValid) {
    return dimensionsResult;
  }
  
  // Validate logo
  const logoResult = validateQRCodeLogo(logoSrc);
  if (!logoResult.isValid) {
    return logoResult;
  }
  
  // Combine warnings
  const allWarnings = [
    ...(textResult.warnings || []),
    ...(logoResult.warnings || [])
  ];
  
  return {
    isValid: true,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    sanitizedText: textResult.sanitizedText
  };
}

/**
 * Estimates memory usage for QR code generation
 */
export function estimateQRCodeMemory(text: string, width: number = 270): number {
  // Text memory
  const textMemory = text.length * 2; // UTF-16 encoding
  
  // Canvas memory (4 bytes per pixel for RGBA)
  const canvasMemory = width * width * 4;
  
  // QR code matrix memory (approximate)
  const matrixSize = Math.ceil(Math.sqrt(text.length * 8)); // Rough estimate
  const matrixMemory = matrixSize * matrixSize;
  
  // Logo memory (if present, estimate 100KB)
  const logoMemory = 100 * 1024;
  
  // Processing overhead
  const overhead = 50 * 1024; // 50KB overhead
  
  return textMemory + canvasMemory + matrixMemory + logoMemory + overhead;
}

/**
 * Checks if QR code generation might cause performance issues
 */
export function checkQRCodePerformance(
  text: string, 
  width: number = 270
): { hasIssues: boolean; estimatedMemory: number; warnings: string[] } {
  const warnings: string[] = [];
  const estimatedMemory = estimateQRCodeMemory(text, width);
  
  // Memory concerns
  if (estimatedMemory > 50 * 1024 * 1024) { // 50MB
    warnings.push('QR code generation may use excessive memory');
  }
  
  // Size concerns
  if (width > 1000) {
    warnings.push('Large QR code size may impact performance');
  }
  
  // Text length concerns
  if (text.length > 2000) {
    warnings.push('Long text may slow QR code generation');
  }
  
  // Complex patterns
  if (text.match(/[^\x00-\x7F]/g)) {
    const unicodeChars = text.match(/[^\x00-\x7F]/g)?.length || 0;
    if (unicodeChars > 100) {
      warnings.push('Many Unicode characters may impact performance');
    }
  }
  
  return {
    hasIssues: warnings.length > 0,
    estimatedMemory,
    warnings
  };
}