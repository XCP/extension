/**
 * Does the receive QR code actually scan?
 *
 * The component draws the code, then a white disc and the app logo over its centre. That hides
 * modules, and the code only survives if its error correction can absorb them. This renders the
 * real component, replays exactly what it drew on its canvas into a pixel buffer (with the real
 * logo artwork), adds the white padding the component wraps it in, and decodes the result with
 * jsQR — for a spread of every address type the receive page shows.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32, bech32m, createBase58check } from '@scure/base';
import { act, render } from '@testing-library/react';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { QRCode } from './qr-code';

// ---------------------------------------------------------------------------------------------
// Canvas recording
// ---------------------------------------------------------------------------------------------

interface Circle { cx: number; cy: number; r: number }

type Op =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; color: string }
  | { kind: 'disc'; circle: Circle; color: string }
  | { kind: 'clip'; circle: Circle }
  | { kind: 'image'; x: number; y: number; w: number; h: number }
  | { kind: 'restore' };

class RecordingContext {
  ops: Op[] = [];
  fillStyle = '#000000';
  private path: Circle[] = [];

  fillRect(x: number, y: number, w: number, h: number) {
    this.ops.push({ kind: 'rect', x, y, w, h, color: this.fillStyle });
  }
  beginPath() { this.path = []; }
  arc(cx: number, cy: number, r: number) { this.path.push({ cx, cy, r }); }
  fill() {
    for (const circle of this.path) this.ops.push({ kind: 'disc', circle, color: this.fillStyle });
  }
  save() {}
  clip() {
    expect(this.path).toHaveLength(1);
    this.ops.push({ kind: 'clip', circle: this.path[0]! });
  }
  drawImage(_img: unknown, x: number, y: number, w: number, h: number) {
    this.ops.push({ kind: 'image', x, y, w, h });
  }
  restore() { this.ops.push({ kind: 'restore' }); }
}

const contexts = new WeakMap<HTMLCanvasElement, RecordingContext>();

class ImmediateImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = '';
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

// ---------------------------------------------------------------------------------------------
// Rasterizing what was drawn (a pixel is painted when its centre falls inside the shape)
// ---------------------------------------------------------------------------------------------

const logoPng = PNG.sync.read(readFileSync(resolve(__dirname, '../../assets/qr-code.png')));

function parseColor(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function rasterize(ops: Op[], size: number, padding: number): Uint8ClampedArray {
  const full = size + padding * 2;
  const data = new Uint8ClampedArray(full * full * 4).fill(255);
  const put = (px: number, py: number, rgb: [number, number, number], alpha = 1) => {
    const i = ((py + padding) * full + (px + padding)) * 4;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(rgb[c]! * alpha + data[i + c]! * (1 - alpha));
  };
  const inside = (circle: Circle, px: number, py: number) =>
    (px + 0.5 - circle.cx) ** 2 + (py + 0.5 - circle.cy) ** 2 < circle.r ** 2;
  const span = (start: number, length: number) => [
    Math.max(0, Math.ceil(start - 0.5)),
    Math.min(size - 1, Math.ceil(start + length - 0.5) - 1),
  ];

  let clip: Circle | null = null;
  for (const op of ops) {
    if (op.kind === 'rect') {
      const [x0, x1] = span(op.x, op.w);
      const [y0, y1] = span(op.y, op.h);
      const rgb = parseColor(op.color);
      for (let py = y0!; py <= y1!; py++) for (let px = x0!; px <= x1!; px++) put(px, py, rgb);
    } else if (op.kind === 'disc') {
      const rgb = parseColor(op.color);
      for (let py = 0; py < size; py++)
        for (let px = 0; px < size; px++) if (inside(op.circle, px, py)) put(px, py, rgb);
    } else if (op.kind === 'clip') {
      clip = op.circle;
    } else if (op.kind === 'restore') {
      clip = null;
    } else {
      const [x0, x1] = span(op.x, op.w);
      const [y0, y1] = span(op.y, op.h);
      for (let py = y0!; py <= y1!; py++) {
        for (let px = x0!; px <= x1!; px++) {
          if (clip && !inside(clip, px, py)) continue;
          const sx = Math.min(logoPng.width - 1, Math.floor(((px + 0.5 - op.x) / op.w) * logoPng.width));
          const sy = Math.min(logoPng.height - 1, Math.floor(((py + 0.5 - op.y) / op.h) * logoPng.height));
          const si = (sy * logoPng.width + sx) * 4;
          const src = logoPng.data;
          put(px, py, [src[si]!, src[si + 1]!, src[si + 2]!], src[si + 3]! / 255);
        }
      }
    }
  }
  return data;
}

/** Render the component, replay its canvas, and decode it. */
async function scan(text: string): Promise<string | null> {
  const { container, unmount } = render(<QRCode text={text} />);
  // Let the logo's onload run.
  await act(async () => { await Promise.resolve(); });

  const canvas = container.querySelector('canvas')!;
  const ctx = contexts.get(canvas)!;
  expect(ctx.ops.some((op) => op.kind === 'image')).toBe(true);

  // The component wraps the canvas in a white p-4 (16 px) box, which a scanner also sees.
  const padding = 16;
  const size = canvas.width;
  const pixels = rasterize(ctx.ops, size, padding);
  unmount();

  return jsQR(pixels, size + padding * 2, size + padding * 2)?.data ?? null;
}

// ---------------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------------

function seededBytes(seed: number) {
  let state = seed >>> 0;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      // mulberry32
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
    }
    return out;
  };
}

const base58check = createBase58check(sha256);
const withVersion = (version: number, hash: Uint8Array) => {
  const payload = new Uint8Array(hash.length + 1);
  payload[0] = version;
  payload.set(hash, 1);
  return payload;
};

const ADDRESS_TYPES: Record<string, (bytes: (n: number) => Uint8Array) => string> = {
  P2PKH: (bytes) => base58check.encode(withVersion(0x00, bytes(20))),
  P2SH: (bytes) => base58check.encode(withVersion(0x05, bytes(20))),
  P2WPKH: (bytes) => bech32.encode('bc', [0, ...bech32.toWords(bytes(20))]),
  P2TR: (bytes) => bech32m.encode('bc', [1, ...bech32m.toWords(bytes(32))]),
};

const PER_TYPE = Number(process.env.QR_PER_TYPE ?? 60);

// ---------------------------------------------------------------------------------------------

describe('receive QR code scans with the logo drawn over it', () => {
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      const ctx = new RecordingContext();
      contexts.set(this, ctx);
      return ctx as unknown as CanvasRenderingContext2D;
    } as unknown as HTMLCanvasElement['getContext']);
    vi.stubGlobal('Image', ImmediateImage);
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const [type, make] of Object.entries(ADDRESS_TYPES)) {
    it(`decodes ${PER_TYPE} ${type} addresses`, async () => {
      const bytes = seededBytes(Array.from(type).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7));
      const failures: string[] = [];
      for (let i = 0; i < PER_TYPE; i++) {
        const address = make(bytes);
        if ((await scan(address)) !== address) failures.push(address);
      }
      expect(failures).toEqual([]);
    }, 60_000);
  }

  it('decodes BIP21 payment URIs', async () => {
    const bytes = seededBytes(21);
    const failures: string[] = [];
    for (const make of Object.values(ADDRESS_TYPES)) {
      for (const query of ['', '?amount=0.001', '?amount=0.5&label=Test%20Payment']) {
        const uri = `bitcoin:${make(bytes)}${query}`;
        if ((await scan(uri)) !== uri) failures.push(uri);
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
