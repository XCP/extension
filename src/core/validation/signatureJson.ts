/**
 * Signature JSON Validation
 *
 * Validates JSON files used for importing/exporting message signatures.
 * Ensures strict schema validation to prevent malformed or malicious input.
 */

/**
 * Expected shape of a signature JSON file
 */
export interface SignatureJson {
  address: string;
  message: string;
  signature: string;
  timestamp?: string;
}

/**
 * Validation result with typed data or error
 */
export interface ValidationResult {
  valid: boolean;
  data?: SignatureJson;
  error?: string;
}

/**
 * Maximum allowed lengths for each field
 */
export const SIGNATURE_JSON_LIMITS = {
  /** Maximum Bitcoin address length (bech32m can be up to 90 chars) */
  MAX_ADDRESS_LENGTH: 100,
  /** Maximum message length (10KB should be plenty) */
  MAX_MESSAGE_LENGTH: 10000,
  /** Maximum signature length (base64 signatures are typically ~88 chars) */
  MAX_SIGNATURE_LENGTH: 500,
  /** Maximum timestamp length (ISO format is ~24 chars) */
  MAX_TIMESTAMP_LENGTH: 50,
  /** Maximum total JSON file size (50KB) */
  MAX_FILE_SIZE: 50000,
} as const;

/**
 * Allowed keys in a signature JSON file
 */
const ALLOWED_KEYS = ['address', 'message', 'signature', 'timestamp'] as const;

/**
 * Validates that a value is a non-empty string within length limits
 */
function validateStringField(
  value: unknown,
  fieldName: string,
  maxLength: number,
  required: boolean = true
): string | null {
  if (value === undefined || value === null) {
    if (required) {
      return `Missing required field: ${fieldName}`;
    }
    return null;
  }

  if (typeof value !== 'string') {
    return `Field '${fieldName}' must be a string, got ${typeof value}`;
  }

  if (required && value.trim().length === 0) {
    return `Field '${fieldName}' cannot be empty`;
  }

  if (value.length > maxLength) {
    return `Field '${fieldName}' exceeds maximum length of ${maxLength} characters`;
  }

  return null;
}

/**
 * Validates raw JSON text before parsing
 */
export function validateJsonText(text: string): ValidationResult {
  // Check file size
  if (text.length > SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${SIGNATURE_JSON_LIMITS.MAX_FILE_SIZE} bytes`,
    };
  }

  // Check it's not empty
  if (text.trim().length === 0) {
    return {
      valid: false,
      error: 'File is empty',
    };
  }

  return { valid: true };
}

/**
 * Validates a parsed JSON object as a signature file
 */
export function validateSignatureJson(data: unknown): ValidationResult {
  // Must be an object
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return {
      valid: false,
      error: 'Invalid JSON structure: expected an object',
    };
  }

  const obj = data as Record<string, unknown>;

  // Check for unexpected fields
  const keys = Object.keys(obj);
  const unexpectedKeys = keys.filter(k => !ALLOWED_KEYS.includes(k as typeof ALLOWED_KEYS[number]));
  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      error: `Unexpected fields in JSON: ${unexpectedKeys.join(', ')}`,
    };
  }

  // Validate required fields
  const addressError = validateStringField(
    obj.address,
    'address',
    SIGNATURE_JSON_LIMITS.MAX_ADDRESS_LENGTH
  );
  if (addressError) {
    return { valid: false, error: addressError };
  }

  const messageError = validateStringField(
    obj.message,
    'message',
    SIGNATURE_JSON_LIMITS.MAX_MESSAGE_LENGTH
  );
  if (messageError) {
    return { valid: false, error: messageError };
  }

  const signatureError = validateStringField(
    obj.signature,
    'signature',
    SIGNATURE_JSON_LIMITS.MAX_SIGNATURE_LENGTH
  );
  if (signatureError) {
    return { valid: false, error: signatureError };
  }

  // Validate optional timestamp field
  const timestampError = validateStringField(
    obj.timestamp,
    'timestamp',
    SIGNATURE_JSON_LIMITS.MAX_TIMESTAMP_LENGTH,
    false // not required
  );
  if (timestampError) {
    return { valid: false, error: timestampError };
  }

  // All validation passed
  return {
    valid: true,
    data: {
      address: obj.address as string,
      message: obj.message as string,
      signature: obj.signature as string,
      timestamp: obj.timestamp as string | undefined,
    },
  };
}

/**
 * Parses and validates a JSON string as a signature file
 */
export function parseAndValidateSignatureJson(text: string): ValidationResult {
  // Validate raw text first
  const textValidation = validateJsonText(text);
  if (!textValidation.valid) {
    return textValidation;
  }

  // Try to parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      valid: false,
      error: 'Invalid JSON: ' + (e instanceof Error ? e.message : 'parse error'),
    };
  }

  // Validate the parsed object
  return validateSignatureJson(parsed);
}
