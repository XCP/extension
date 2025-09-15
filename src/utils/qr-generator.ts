/**
 * Minimal QR Code generator implementation
 * Based on QR code specification - optimized for wallet addresses and URIs
 */

// QR Code error correction levels
enum ErrorCorrectionLevel {
  L = 1, // ~7% correction capability
  M = 0, // ~15% correction capability
  Q = 3, // ~25% correction capability
  H = 2, // ~30% correction capability
}

// QR Code mode indicators
enum Mode {
  NUMERIC = 0b0001,
  ALPHANUMERIC = 0b0010,
  BYTE = 0b0100,
}

// Alphanumeric encoding table
const ALPHANUMERIC_TABLE: { [key: string]: number } = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18,
  'J': 19, 'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24, 'P': 25, 'Q': 26, 'R': 27,
  'S': 28, 'T': 29, 'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34, 'Z': 35,
  ' ': 36, '$': 37, '%': 38, '*': 39, '+': 40, '-': 41, '.': 42, '/': 43, ':': 44,
};

// Reed-Solomon error correction polynomials
const RS_BLOCK_TABLE = [
  // Version 1
  [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
  // Version 2
  [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
  // Version 3
  [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
  // Version 4
  [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
  // Version 5
  [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
];

// Galois field arithmetic for Reed-Solomon
class GF256 {
  private static EXP_TABLE = new Array(256);
  private static LOG_TABLE = new Array(256);

  static {
    let x = 1;
    for (let i = 0; i < 256; i++) {
      GF256.EXP_TABLE[i] = x;
      GF256.LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 0x100) {
        x ^= 0x11d;
      }
    }
  }

  static multiply(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF256.EXP_TABLE[(GF256.LOG_TABLE[a] + GF256.LOG_TABLE[b]) % 255];
  }

  static exp(a: number): number {
    return GF256.EXP_TABLE[a % 255];
  }
}

// Polynomial operations for error correction
class Polynomial {
  constructor(public coefficients: number[], shift = 0) {
    let offset = 0;
    while (offset < coefficients.length && coefficients[offset] === 0) {
      offset++;
    }

    this.coefficients = new Array(coefficients.length - offset + shift);
    for (let i = 0; i < coefficients.length - offset; i++) {
      this.coefficients[i] = coefficients[offset + i];
    }
  }

  multiply(other: Polynomial): Polynomial {
    const coefficients = new Array(this.coefficients.length + other.coefficients.length - 1).fill(0);

    for (let i = 0; i < this.coefficients.length; i++) {
      for (let j = 0; j < other.coefficients.length; j++) {
        coefficients[i + j] ^= GF256.multiply(this.coefficients[i], other.coefficients[j]);
      }
    }

    return new Polynomial(coefficients);
  }

  mod(other: Polynomial): Polynomial {
    const result = [...this.coefficients];

    for (let i = 0; i < this.coefficients.length - other.coefficients.length + 1; i++) {
      const ratio = result[i];
      if (ratio !== 0) {
        for (let j = 0; j < other.coefficients.length; j++) {
          result[i + j] ^= GF256.multiply(other.coefficients[j], ratio);
        }
      }
    }

    return new Polynomial(result, other.coefficients.length - 1);
  }
}

// Generate error correction codewords
function generateECCodewords(dataCodewords: number[], ecCodewordCount: number): number[] {
  const coefficients = [1];
  for (let i = 0; i < ecCodewordCount; i++) {
    const poly = new Polynomial([1, GF256.exp(i)]);
    const current = new Polynomial(coefficients);
    coefficients.length = 0;
    coefficients.push(...current.multiply(poly).coefficients);
  }

  const messagePoly = new Polynomial(dataCodewords, ecCodewordCount);
  const generatorPoly = new Polynomial(coefficients);
  const remainder = messagePoly.mod(generatorPoly);

  const ecCodewords = new Array(ecCodewordCount).fill(0);
  const offset = ecCodewordCount - remainder.coefficients.length;
  for (let i = 0; i < remainder.coefficients.length; i++) {
    ecCodewords[offset + i] = remainder.coefficients[i];
  }

  return ecCodewords;
}

// Determine the best mode for encoding
function getBestMode(text: string): Mode {
  if (/^[0-9]+$/.test(text)) {
    return Mode.NUMERIC;
  }
  if (/^[0-9A-Z $%*+\-./:]+$/.test(text)) {
    return Mode.ALPHANUMERIC;
  }
  return Mode.BYTE;
}

// Encode data based on mode
function encodeData(text: string, mode: Mode): number[] {
  const bits: number[] = [];

  switch (mode) {
    case Mode.NUMERIC: {
      for (let i = 0; i < text.length; i += 3) {
        const chunk = text.substr(i, 3);
        const value = parseInt(chunk, 10);
        const bitLength = chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4;
        for (let j = bitLength - 1; j >= 0; j--) {
          bits.push((value >> j) & 1);
        }
      }
      break;
    }
    case Mode.ALPHANUMERIC: {
      for (let i = 0; i < text.length; i += 2) {
        if (i + 1 < text.length) {
          const value = ALPHANUMERIC_TABLE[text[i]] * 45 + ALPHANUMERIC_TABLE[text[i + 1]];
          for (let j = 10; j >= 0; j--) {
            bits.push((value >> j) & 1);
          }
        } else {
          const value = ALPHANUMERIC_TABLE[text[i]];
          for (let j = 5; j >= 0; j--) {
            bits.push((value >> j) & 1);
          }
        }
      }
      break;
    }
    case Mode.BYTE: {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      for (const byte of bytes) {
        for (let j = 7; j >= 0; j--) {
          bits.push((byte >> j) & 1);
        }
      }
      break;
    }
  }

  return bits;
}

// Calculate optimal QR code version
function getOptimalVersion(text: string, errorCorrection: ErrorCorrectionLevel): number {
  const mode = getBestMode(text);
  const dataBits = encodeData(text, mode);

  // For simplicity, we'll use version 3-7 which handles most wallet addresses
  const dataLength = dataBits.length / 8;
  if (dataLength <= 53) return 3;
  if (dataLength <= 78) return 4;
  if (dataLength <= 106) return 5;
  if (dataLength <= 134) return 6;
  return 7;
}

// Generate QR code matrix
export function generateQRMatrix(
  text: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): boolean[][] {
  const ecLevel = ErrorCorrectionLevel[errorCorrectionLevel];
  const version = getOptimalVersion(text, ecLevel);
  const size = version * 4 + 17;

  // Initialize matrix
  const matrix: (boolean | null)[][] = Array(size).fill(null).map(() => Array(size).fill(null));

  // Add finder patterns
  const addFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (row + r >= 0 && row + r < size && col + c >= 0 && col + c < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[row + r][col + c] =
              (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          } else {
            matrix[row + r][col + c] = false;
          }
        }
      }
    }
  };

  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);

  // Add alignment patterns (simplified for versions 2-7)
  if (version >= 2) {
    const alignmentPositions = [
      [], [], [18], [22], [26], [30], [34],
    ][version];

    for (const pos of alignmentPositions) {
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const row = pos + r;
          const col = size - 7 + c;
          if (matrix[row][col] === null) {
            matrix[row][col] = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
          }
        }
      }
    }
  }

  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = matrix[i][6] = i % 2 === 0;
  }

  // Add dark module
  matrix[4 * version + 9][8] = true;

  // Add format information (simplified - using mask pattern 0)
  const formatBits = 0x5412; // Pre-calculated for M correction level, mask 0
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1;
    if (i < 6) {
      matrix[8][i] = bit;
    } else if (i < 8) {
      matrix[8][i + 1] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }

    if (i < 8) {
      matrix[size - i - 1][8] = bit;
    } else {
      matrix[size - 15 + i][8] = bit;
    }
  }

  // Encode and place data (simplified)
  const mode = getBestMode(text);
  const dataBits = encodeData(text, mode);

  // Place data in zigzag pattern (simplified)
  let bitIndex = 0;
  let direction = -1;

  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip timing column

    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const currentCol = col - c;
        const currentRow = direction === -1 ? size - 1 - row : row;

        if (matrix[currentRow][currentCol] === null) {
          matrix[currentRow][currentCol] = bitIndex < dataBits.length && dataBits[bitIndex++] === 1;
        }
      }
    }
    direction = -direction;
  }

  // Apply mask pattern 0 (simplified)
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col] === null) {
        matrix[row][col] = false;
      }
      // Apply mask pattern 0: (row + column) mod 2 == 0
      if ((row + col) % 2 === 0 && typeof matrix[row][col] === 'boolean') {
        matrix[row][col] = !matrix[row][col];
      }
    }
  }

  return matrix as boolean[][];
}

// Helper to get QR code size for a given version
export function getQRCodeSize(version: number): number {
  return version * 4 + 17;
}