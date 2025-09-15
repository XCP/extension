/**
 * QR Code generator implementation
 * Based on QR code specification ISO/IEC 18004
 */

// QR Code error correction levels
enum ErrorCorrectionLevel {
  L = 0b01, // ~7% correction capability
  M = 0b00, // ~15% correction capability
  Q = 0b11, // ~25% correction capability
  H = 0b10, // ~30% correction capability
}

// QR Code mode indicators
enum Mode {
  NUMERIC = 0b0001,
  ALPHANUMERIC = 0b0010,
  BYTE = 0b0100,
  KANJI = 0b1000,
}

// Alphanumeric encoding table
const ALPHANUMERIC_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Reed-Solomon error correction
class ReedSolomon {
  private static EXP_TABLE: number[] = new Array(256);
  private static LOG_TABLE: number[] = new Array(256);
  private static initialized = false;

  private static initialize(): void {
    if (ReedSolomon.initialized) return;

    let x = 1;
    for (let i = 0; i < 255; i++) {
      ReedSolomon.EXP_TABLE[i] = x;
      ReedSolomon.LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 0x100) {
        x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
      }
    }
    ReedSolomon.EXP_TABLE[255] = ReedSolomon.EXP_TABLE[0];
    ReedSolomon.initialized = true;
  }

  static multiply(a: number, b: number): number {
    ReedSolomon.initialize();
    if (a === 0 || b === 0) return 0;
    return ReedSolomon.EXP_TABLE[(ReedSolomon.LOG_TABLE[a] + ReedSolomon.LOG_TABLE[b]) % 255];
  }

  static generatePolynomial(degree: number): number[] {
    ReedSolomon.initialize();
    const result = [1];

    for (let i = 0; i < degree; i++) {
      const temp = [...result];
      result.length = temp.length + 1;
      result.fill(0);

      for (let j = 0; j < temp.length; j++) {
        result[j] ^= temp[j];
        if (temp[j] !== 0) {
          result[j + 1] ^= ReedSolomon.EXP_TABLE[(ReedSolomon.LOG_TABLE[temp[j]] + i) % 255];
        }
      }
    }

    return result;
  }

  static calculateECC(data: number[], eccCount: number): number[] {
    ReedSolomon.initialize();
    const generator = ReedSolomon.generatePolynomial(eccCount);
    const remainder = new Array(eccCount).fill(0);
    const dataWithPadding = [...data, ...remainder];

    for (let i = 0; i < data.length; i++) {
      const coef = dataWithPadding[i];
      if (coef !== 0) {
        for (let j = 0; j < generator.length; j++) {
          dataWithPadding[i + j] ^= ReedSolomon.multiply(generator[j], coef);
        }
      }
    }

    return dataWithPadding.slice(data.length);
  }
}

// QR Code capacity table [version][ecLevel] = [totalCodewords, dataCodewords]
const CAPACITY_TABLE: number[][][] = [
  [], // Version 0 (doesn't exist)
  [[26, 19], [26, 16], [26, 13], [26, 9]], // Version 1
  [[44, 34], [44, 28], [44, 22], [44, 16]], // Version 2
  [[70, 55], [70, 44], [70, 34], [70, 26]], // Version 3
  [[100, 80], [100, 64], [100, 48], [100, 36]], // Version 4
  [[134, 108], [134, 86], [134, 62], [134, 46]], // Version 5
  [[172, 136], [172, 108], [172, 76], [172, 60]], // Version 6
  [[196, 156], [196, 124], [196, 88], [196, 66]], // Version 7
  [[242, 194], [242, 154], [242, 110], [242, 86]], // Version 8
  [[292, 232], [292, 182], [292, 132], [292, 100]], // Version 9
  [[346, 274], [346, 216], [346, 154], [346, 122]], // Version 10
];

// Alignment pattern positions for each version
const ALIGNMENT_PATTERN_POSITIONS: number[][] = [
  [], // Version 0
  [], // Version 1
  [6, 18], // Version 2
  [6, 22], // Version 3
  [6, 26], // Version 4
  [6, 30], // Version 5
  [6, 34], // Version 6
  [6, 22, 38], // Version 7
  [6, 24, 42], // Version 8
  [6, 26, 46], // Version 9
  [6, 28, 50], // Version 10
];

// Format information strings (BCH code)
const FORMAT_INFO_MASK = 0x5412;
const FORMAT_INFO_TABLE: number[] = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
  0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b,
  0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
];

class QRCode {
  private modules: (boolean | null)[][];
  private size: number;
  private version: number;
  private ecLevel: ErrorCorrectionLevel;

  constructor(text: string, ecLevel: ErrorCorrectionLevel = ErrorCorrectionLevel.M) {
    this.ecLevel = ecLevel;
    this.version = this.calculateVersion(text);
    this.size = this.version * 4 + 17;
    this.modules = Array(this.size).fill(null).map(() => Array(this.size).fill(null));

    this.setupPositionPatterns();
    this.setupAlignmentPatterns();
    this.setupTimingPatterns();
    this.setupDarkModule();
    this.reserveFormatAreas();

    const data = this.encodeData(text);
    this.placeData(data);

    const maskPattern = this.getBestMaskPattern();
    this.applyMask(maskPattern);
    this.writeFormatInformation(maskPattern);
  }

  private calculateVersion(text: string): number {
    const mode = this.getMode(text);
    const bitLength = this.getDataBitLength(text, mode);

    for (let version = 1; version <= 10; version++) {
      const capacity = this.getDataCapacity(version, this.ecLevel);
      const characterCountBits = this.getCharacterCountBits(mode, version);
      const totalBits = 4 + characterCountBits + bitLength; // mode + count + data

      if (totalBits <= capacity * 8) {
        return version;
      }
    }

    throw new Error('Text too long for QR code');
  }

  private getMode(text: string): Mode {
    if (/^[0-9]+$/.test(text)) {
      return Mode.NUMERIC;
    }
    if (/^[0-9A-Z $%*+\-./:]+$/.test(text)) {
      return Mode.ALPHANUMERIC;
    }
    return Mode.BYTE;
  }

  private getDataBitLength(text: string, mode: Mode): number {
    switch (mode) {
      case Mode.NUMERIC:
        return Math.floor(text.length / 3) * 10 +
               (text.length % 3 === 2 ? 7 : text.length % 3 === 1 ? 4 : 0);
      case Mode.ALPHANUMERIC:
        return Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
      case Mode.BYTE:
        return new TextEncoder().encode(text).length * 8;
      default:
        throw new Error('Unsupported mode');
    }
  }

  private getCharacterCountBits(mode: Mode, version: number): number {
    if (version <= 9) {
      switch (mode) {
        case Mode.NUMERIC: return 10;
        case Mode.ALPHANUMERIC: return 9;
        case Mode.BYTE: return 8;
        default: return 8;
      }
    } else if (version <= 26) {
      switch (mode) {
        case Mode.NUMERIC: return 12;
        case Mode.ALPHANUMERIC: return 11;
        case Mode.BYTE: return 16;
        default: return 16;
      }
    } else {
      switch (mode) {
        case Mode.NUMERIC: return 14;
        case Mode.ALPHANUMERIC: return 13;
        case Mode.BYTE: return 16;
        default: return 16;
      }
    }
  }

  private getDataCapacity(version: number, ecLevel: ErrorCorrectionLevel): number {
    const ecIndex = [ErrorCorrectionLevel.L, ErrorCorrectionLevel.M, ErrorCorrectionLevel.Q, ErrorCorrectionLevel.H].indexOf(ecLevel);
    return CAPACITY_TABLE[version][ecIndex][1];
  }

  private getTotalCapacity(version: number, ecLevel: ErrorCorrectionLevel): number {
    const ecIndex = [ErrorCorrectionLevel.L, ErrorCorrectionLevel.M, ErrorCorrectionLevel.Q, ErrorCorrectionLevel.H].indexOf(ecLevel);
    return CAPACITY_TABLE[version][ecIndex][0];
  }

  private setupPositionPatterns(): void {
    // Top-left
    this.drawPositionPattern(0, 0);
    // Top-right
    this.drawPositionPattern(0, this.size - 7);
    // Bottom-left
    this.drawPositionPattern(this.size - 7, 0);
  }

  private drawPositionPattern(row: number, col: number): void {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const actualRow = row + r;
        const actualCol = col + c;

        if (actualRow >= 0 && actualRow < this.size && actualCol >= 0 && actualCol < this.size) {
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            // White border
            this.modules[actualRow][actualCol] = false;
          } else if ((r === 0 || r === 6 || c === 0 || c === 6) ||
                     (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
            // Black pattern
            this.modules[actualRow][actualCol] = true;
          } else {
            // White
            this.modules[actualRow][actualCol] = false;
          }
        }
      }
    }
  }

  private setupAlignmentPatterns(): void {
    if (this.version < 2) return;

    const positions = ALIGNMENT_PATTERN_POSITIONS[this.version];

    for (const row of positions) {
      for (const col of positions) {
        // Skip if position overlaps with position detection patterns
        if ((row === 6 && col === 6) ||
            (row === 6 && col === positions[positions.length - 1]) ||
            (row === positions[positions.length - 1] && col === 6)) {
          continue;
        }

        this.drawAlignmentPattern(row, col);
      }
    }
  }

  private drawAlignmentPattern(centerRow: number, centerCol: number): void {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const row = centerRow + r;
        const col = centerCol + c;

        if (row >= 0 && row < this.size && col >= 0 && col < this.size) {
          this.modules[row][col] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
        }
      }
    }
  }

  private setupTimingPatterns(): void {
    for (let i = 8; i < this.size - 8; i++) {
      const bit = i % 2 === 0;
      if (this.modules[6][i] === null) {
        this.modules[6][i] = bit;
      }
      if (this.modules[i][6] === null) {
        this.modules[i][6] = bit;
      }
    }
  }

  private setupDarkModule(): void {
    this.modules[(this.version * 4) + 9][8] = true;
  }

  private reserveFormatAreas(): void {
    // Reserve format information areas
    for (let i = 0; i < 9; i++) {
      if (i !== 6) {
        this.modules[8][i] = false; // Placeholder
        this.modules[i][8] = false; // Placeholder
      }
    }
    for (let i = 0; i < 8; i++) {
      this.modules[8][this.size - 1 - i] = false; // Placeholder
      this.modules[this.size - 1 - i][8] = false; // Placeholder
    }
  }

  private encodeData(text: string): number[] {
    const mode = this.getMode(text);
    const bits: number[] = [];

    // Add mode indicator
    this.addBits(bits, mode, 4);

    // Add character count
    const countBits = this.getCharacterCountBits(mode, this.version);
    const charCount = mode === Mode.BYTE ? new TextEncoder().encode(text).length : text.length;
    this.addBits(bits, charCount, countBits);

    // Encode data
    switch (mode) {
      case Mode.NUMERIC:
        this.encodeNumeric(bits, text);
        break;
      case Mode.ALPHANUMERIC:
        this.encodeAlphanumeric(bits, text);
        break;
      case Mode.BYTE:
        this.encodeByte(bits, text);
        break;
    }

    // Add terminator
    const dataCapacity = this.getDataCapacity(this.version, this.ecLevel) * 8;
    const terminatorLength = Math.min(4, dataCapacity - bits.length);
    if (terminatorLength > 0) {
      this.addBits(bits, 0, terminatorLength);
    }

    // Pad to byte boundary
    while (bits.length % 8 !== 0) {
      bits.push(0);
    }

    // Convert bits to bytes
    const bytes: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (bits[i + j] || 0);
      }
      bytes.push(byte);
    }

    // Add padding bytes
    const dataBytes = this.getDataCapacity(this.version, this.ecLevel);
    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (bytes.length < dataBytes) {
      bytes.push(padBytes[padIndex]);
      padIndex = (padIndex + 1) % 2;
    }

    // Generate error correction
    const totalBytes = this.getTotalCapacity(this.version, this.ecLevel);
    const eccBytes = totalBytes - dataBytes;
    const eccData = ReedSolomon.calculateECC(bytes, eccBytes);

    return [...bytes, ...eccData];
  }

  private addBits(bits: number[], value: number, count: number): void {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((value >> i) & 1);
    }
  }

  private encodeNumeric(bits: number[], text: string): void {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.substr(i, Math.min(3, text.length - i));
      const value = parseInt(chunk, 10);
      const bitCount = chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4;
      this.addBits(bits, value, bitCount);
    }
  }

  private encodeAlphanumeric(bits: number[], text: string): void {
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) {
        const val1 = ALPHANUMERIC_CHARSET.indexOf(text[i]);
        const val2 = ALPHANUMERIC_CHARSET.indexOf(text[i + 1]);
        this.addBits(bits, val1 * 45 + val2, 11);
      } else {
        const val = ALPHANUMERIC_CHARSET.indexOf(text[i]);
        this.addBits(bits, val, 6);
      }
    }
  }

  private encodeByte(bits: number[], text: string): void {
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
      this.addBits(bits, byte, 8);
    }
  }

  private placeData(data: number[]): void {
    let bitIndex = 0;
    const totalBits = data.length * 8;

    // Convert bytes to bits
    const dataBits: boolean[] = [];
    for (const byte of data) {
      for (let i = 7; i >= 0; i--) {
        dataBits.push((byte >> i) & 1 ? true : false);
      }
    }

    // Place data in zigzag pattern
    for (let col = this.size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // Skip timing column

      for (let vert = 0; vert < this.size; vert++) {
        for (let c = 0; c < 2; c++) {
          const x = col - c;
          const upward = ((col + 1) >> 1) & 1;
          const y = upward ? this.size - 1 - vert : vert;

          if (this.modules[y][x] === null) {
            this.modules[y][x] = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
            bitIndex++;
          }
        }
      }
    }
  }

  private getBestMaskPattern(): number {
    let minPenalty = Infinity;
    let bestPattern = 0;

    for (let pattern = 0; pattern < 8; pattern++) {
      this.applyMask(pattern);
      const penalty = this.calculatePenalty();
      if (penalty < minPenalty) {
        minPenalty = penalty;
        bestPattern = pattern;
      }
      this.applyMask(pattern); // Unmask
    }

    return bestPattern;
  }

  private applyMask(pattern: number): void {
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (this.modules[row][col] !== null && !this.isFunctionModule(row, col)) {
          const mask = this.getMask(pattern, row, col);
          this.modules[row][col] = this.modules[row][col] !== mask;
        }
      }
    }
  }

  private getMask(pattern: number, row: number, col: number): boolean {
    switch (pattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return (row * col) % 2 + (row * col) % 3 === 0;
      case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
      case 7: return ((row + col) % 2 + (row * col) % 3) % 2 === 0;
      default: return false;
    }
  }

  private isFunctionModule(row: number, col: number): boolean {
    // Position detection patterns
    if ((row < 9 && col < 9) || // Top-left
        (row < 9 && col >= this.size - 8) || // Top-right
        (row >= this.size - 8 && col < 9)) { // Bottom-left
      return true;
    }

    // Timing patterns
    if (row === 6 || col === 6) {
      return true;
    }

    // Dark module
    if (row === (this.version * 4) + 9 && col === 8) {
      return true;
    }

    // Format information
    if ((row === 8 && (col < 9 || col >= this.size - 8)) ||
        (col === 8 && (row < 9 || row >= this.size - 7))) {
      return true;
    }

    return false;
  }

  private calculatePenalty(): number {
    let penalty = 0;

    // Rule 1: Adjacent modules in row/column with same color
    for (let row = 0; row < this.size; row++) {
      let prevRow = false;
      let prevCol = false;
      let runRow = 1;
      let runCol = 1;

      for (let col = 0; col < this.size; col++) {
        const currentRow = this.modules[row][col];
        const currentCol = this.modules[col][row];

        if (col > 0) {
          if (currentRow === prevRow) {
            runRow++;
          } else {
            if (runRow >= 5) penalty += runRow - 2;
            runRow = 1;
          }

          if (currentCol === prevCol) {
            runCol++;
          } else {
            if (runCol >= 5) penalty += runCol - 2;
            runCol = 1;
          }
        }

        prevRow = currentRow as boolean;
        prevCol = currentCol as boolean;
      }

      if (runRow >= 5) penalty += runRow - 2;
      if (runCol >= 5) penalty += runCol - 2;
    }

    // Rule 2: 2x2 blocks of same color
    for (let row = 0; row < this.size - 1; row++) {
      for (let col = 0; col < this.size - 1; col++) {
        const color = this.modules[row][col];
        if (color === this.modules[row][col + 1] &&
            color === this.modules[row + 1][col] &&
            color === this.modules[row + 1][col + 1]) {
          penalty += 3;
        }
      }
    }

    // Rule 3: Patterns similar to finder patterns
    const pattern1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pattern2 = [false, false, false, false, true, false, true, true, true, false, true];

    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col <= this.size - pattern1.length; col++) {
        if (this.matchesPattern(row, col, pattern1, true) ||
            this.matchesPattern(row, col, pattern2, true)) {
          penalty += 40;
        }
      }
    }

    for (let col = 0; col < this.size; col++) {
      for (let row = 0; row <= this.size - pattern1.length; row++) {
        if (this.matchesPattern(row, col, pattern1, false) ||
            this.matchesPattern(row, col, pattern2, false)) {
          penalty += 40;
        }
      }
    }

    // Rule 4: Proportion of dark modules
    let darkCount = 0;
    for (let row = 0; row < this.size; row++) {
      for (let col = 0; col < this.size; col++) {
        if (this.modules[row][col]) darkCount++;
      }
    }

    const ratio = darkCount / (this.size * this.size);
    const percent = Math.floor(ratio * 100);
    const prev5 = Math.floor(percent / 5) * 5;
    const next5 = prev5 + 5;
    penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

    return penalty;
  }

  private matchesPattern(startRow: number, startCol: number, pattern: boolean[], horizontal: boolean): boolean {
    for (let i = 0; i < pattern.length; i++) {
      const row = horizontal ? startRow : startRow + i;
      const col = horizontal ? startCol + i : startCol;
      if (this.modules[row][col] !== pattern[i]) {
        return false;
      }
    }
    return true;
  }

  private writeFormatInformation(maskPattern: number): void {
    const ecBits = this.ecLevel;
    const formatInfo = (ecBits << 3) | maskPattern;
    const bchCode = FORMAT_INFO_TABLE[formatInfo];

    // Write to top-left
    for (let i = 0; i < 15; i++) {
      const bit = ((bchCode >> i) & 1) === 1;

      if (i < 6) {
        this.modules[8][i] = bit;
      } else if (i === 6) {
        this.modules[8][7] = bit;
      } else if (i < 8) {
        this.modules[8][14 - i + 1] = bit;
      } else {
        this.modules[7 - (i - 8)][8] = bit;
      }
    }

    // Write to bottom-left and top-right
    for (let i = 0; i < 15; i++) {
      const bit = ((bchCode >> i) & 1) === 1;

      if (i < 8) {
        this.modules[this.size - 1 - i][8] = bit;
      } else {
        this.modules[8][this.size - 15 + i] = bit;
      }
    }
  }

  getMatrix(): boolean[][] {
    return this.modules.map(row => row.map(cell => cell === true));
  }
}

// Export main function
export function generateQRMatrix(
  text: string,
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): boolean[][] {
  const ecLevel = ErrorCorrectionLevel[errorCorrectionLevel];
  const qr = new QRCode(text, ecLevel);
  return qr.getMatrix();
}

// Helper to get QR code size for a given version
export function getQRCodeSize(version: number): number {
  return version * 4 + 17;
}