/**
 * Allocation-free double SHA-256 over one fixed-length message whose bytes change between hashes.
 *
 * A ZELD hunt hashes the same unsigned transaction millions of times with only a four-byte nonce
 * moving. A general-purpose hash allocates a fresh state, pads the message and copies the digest
 * on every call; this keeps the padded message, the schedule and the state as typed arrays that
 * live for the whole hunt, and answers the only question the hunt asks — how many leading hex
 * zeros the txid has — straight from the final state words without materialising the digest.
 *
 * The compression function is textbook FIPS 180-4. Its correctness is pinned against the audited
 * `@noble/hashes` implementation in `sha256d.test.ts`; this file must never be used for anything
 * that is not also checked that way.
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const IV = new Int32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

/** One SHA-256 block over `words[offset..offset+16)`, folded into `state`. */
function compress(state: Int32Array, words: Int32Array, offset: number, W: Int32Array): void {
  for (let i = 0; i < 16; i++) W[i] = words[offset + i]!;
  for (let i = 16; i < 64; i++) {
    const w15 = W[i - 15]!;
    const w2 = W[i - 2]!;
    const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
    const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
    W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) | 0;
  }
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  let e = state[4]!;
  let f = state[5]!;
  let g = state[6]!;
  let h = state[7]!;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i]! + W[i]!) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0]! + a) | 0;
  state[1] = (state[1]! + b) | 0;
  state[2] = (state[2]! + c) | 0;
  state[3] = (state[3]! + d) | 0;
  state[4] = (state[4]! + e) | 0;
  state[5] = (state[5]! + f) | 0;
  state[6] = (state[6]! + g) | 0;
  state[7] = (state[7]! + h) | 0;
}

/** The upper 32 bits of a bit length. Messages here are far below 2^32 bits, but padding is exact. */
function highBits(bitLength: number): number {
  return Math.floor(bitLength / 0x1_0000_0000);
}

export class MutableSha256d {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly words: Int32Array;
  private readonly blocks: number;
  private readonly W = new Int32Array(64);
  private readonly state = new Int32Array(8);
  private readonly outer = new Int32Array(16);
  /** Blocks before the nonce window, hashed once into `midstate` at construction. */
  private readonly prefixBlocks: number;
  private readonly midstate = new Int32Array(8);
  readonly messageLength: number;

  /**
   * `nonceOffset` names the four bytes that will change between hashes. Every block wholly
   * before it is hashed once here and reused for every hash, so a nonce at the end of the
   * message (a transaction's nLockTime) costs one block plus the outer hash per attempt rather
   * than the whole message. Without it, or with a nonce in the first block, nothing is reused.
   */
  constructor(message: Uint8Array, nonceOffset?: number) {
    const length = message.length;
    this.messageLength = length;
    this.blocks = Math.ceil((length + 9) / 64);
    if (nonceOffset !== undefined && (nonceOffset < 0 || nonceOffset + 4 > length)) {
      throw new RangeError('nonce window lies outside the message');
    }
    this.prefixBlocks = nonceOffset === undefined ? 0 : Math.floor(nonceOffset / 64);
    this.bytes = new Uint8Array(this.blocks * 64);
    this.bytes.set(message);
    this.bytes[length] = 0x80;
    this.view = new DataView(this.bytes.buffer);
    const bitLength = length * 8;
    this.view.setUint32(this.blocks * 64 - 8, highBits(bitLength));
    this.view.setUint32(this.blocks * 64 - 4, bitLength >>> 0);
    this.words = new Int32Array(this.blocks * 16);
    for (let i = 0; i < this.words.length; i++) this.words[i] = this.view.getInt32(i * 4);
    // The outer hash always covers exactly the 32-byte inner digest: one block, fixed padding.
    this.outer[8] = 0x80000000 | 0;
    this.outer[15] = 256;
    this.midstate.set(IV);
    for (let block = 0; block < this.prefixBlocks; block++) {
      compress(this.midstate, this.words, block * 16, this.W);
    }
  }

  /** Overwrite four message bytes with a little-endian integer, as a transaction stores nSequence. */
  setUint32LE(offset: number, value: number): void {
    if (offset < this.prefixBlocks * 64 || offset + 4 > this.messageLength) {
      throw new RangeError('nonce window lies outside the message, or inside the reused prefix');
    }
    this.view.setUint32(offset, value >>> 0, true);
    const first = offset >> 2;
    const last = (offset + 3) >> 2;
    this.words[first] = this.view.getInt32(first * 4);
    if (last !== first) this.words[last] = this.view.getInt32(last * 4);
  }

  /** Overwrite a run of message bytes, as a signature's `s` value lands inside a legacy scriptSig. */
  setBytes(offset: number, bytes: Uint8Array): void {
    if (offset < this.prefixBlocks * 64 || offset + bytes.length > this.messageLength) {
      throw new RangeError('byte window lies outside the message, or inside the reused prefix');
    }
    this.bytes.set(bytes, offset);
    const first = offset >> 2;
    const last = (offset + bytes.length - 1) >> 2;
    for (let word = first; word <= last; word++) this.words[word] = this.view.getInt32(word * 4);
  }

  /**
   * Hash the current message and report how many leading hex zeros the resulting txid has.
   *
   * A txid is the double SHA-256 digest displayed byte-reversed, so its first hex digit is the
   * high nibble of digest byte 31, which is the low byte of state word 7.
   */
  hashLeadingZeroNibbles(): number {
    const state = this.state;
    state.set(this.midstate);
    for (let block = this.prefixBlocks; block < this.blocks; block++) {
      compress(state, this.words, block * 16, this.W);
    }
    const outer = this.outer;
    for (let i = 0; i < 8; i++) outer[i] = state[i]!;
    state.set(IV);
    compress(state, outer, 0, this.W);

    let zeros = 0;
    for (let word = 7; word >= 0; word--) {
      const value = state[word]!;
      for (let shift = 0; shift < 32; shift += 8) {
        const byte = (value >>> shift) & 0xff;
        if (byte === 0) {
          zeros += 2;
          continue;
        }
        if (byte >> 4 === 0) zeros += 1;
        return zeros;
      }
    }
    return zeros;
  }

  /** The double SHA-256 digest of the message as last hashed, in digest (not txid) byte order. */
  digest(): Uint8Array {
    const out = new Uint8Array(32);
    this.digestInto(out);
    return out;
  }

  /** `digest()` written into a caller's 32-byte buffer, for loops that must not allocate. */
  digestInto(out: Uint8Array): void {
    const view = new DataView(out.buffer, out.byteOffset, 32);
    for (let i = 0; i < 8; i++) view.setInt32(i * 4, this.state[i]!);
  }

  /** The txid of the message as last hashed: the digest, byte-reversed, as lowercase hex. */
  txid(): string {
    const digest = this.digest();
    let hex = '';
    for (let i = 31; i >= 0; i--) hex += digest[i]!.toString(16).padStart(2, '0');
    return hex;
  }
}
