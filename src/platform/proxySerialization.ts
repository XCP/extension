/**
 * Chrome ports use JSON, while local Counterparty decoders retain exact bigint quantities.
 * Tag every container so a site's ordinary object or array can never impersonate a scalar tag.
 */
type EncodedValue =
  | ['value', null | boolean | string | number]
  | ['undefined']
  | ['bigint', string]
  | ['bytes', number[]]
  | ['array', EncodedValue[]]
  | ['object', Array<[string, EncodedValue]>];

const MAX_DEPTH = 100;

export function encodeProxyResult(value: unknown, depth = 0): EncodedValue {
  if (depth > MAX_DEPTH) throw new Error('RPC result is nested too deeply');
  if (value === undefined) return ['undefined'];
  if (typeof value === 'bigint') return ['bigint', value.toString()];
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return ['value', value];
  if (typeof value === 'number' && Number.isFinite(value)) return ['value', value];
  if (value instanceof Uint8Array) return ['bytes', Array.from(value)];
  if (Array.isArray(value)) return ['array', value.map(item => encodeProxyResult(item, depth + 1))];
  if (value && typeof value === 'object') {
    return ['object', Object.entries(value).map(([key, item]) => [key, encodeProxyResult(item, depth + 1)])];
  }
  throw new Error('RPC result contains an unsupported value');
}

export function decodeProxyResult(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || !Array.isArray(value)) throw new Error('Invalid RPC result encoding');
  const [tag, contents] = value as unknown[];
  if (tag === 'undefined' && value.length === 1) return undefined;
  if (value.length !== 2) throw new Error('Invalid RPC result encoding');
  switch (tag) {
    case 'value':
      if (contents === null || typeof contents === 'boolean' || typeof contents === 'string'
        || (typeof contents === 'number' && Number.isFinite(contents))) return contents;
      break;
    case 'bigint':
      if (typeof contents === 'string' && /^(?:0|-?[1-9][0-9]*)$/.test(contents)) return BigInt(contents);
      break;
    case 'bytes':
      if (Array.isArray(contents) && contents.every(item =>
        typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255)) {
        return Uint8Array.from(contents as number[]);
      }
      break;
    case 'array':
      if (Array.isArray(contents)) return contents.map(item => decodeProxyResult(item, depth + 1));
      break;
    case 'object': {
      if (!Array.isArray(contents)) break;
      const keys = new Set<string>();
      const entries: Array<[string, unknown]> = contents.map((entry: unknown) => {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string'
          || keys.has(entry[0])) throw new Error('Invalid RPC result encoding');
        keys.add(entry[0]);
        return [entry[0], decodeProxyResult(entry[1], depth + 1)];
      });
      // Defining own properties preserves a literal __proto__ key without changing the prototype.
      return Object.fromEntries(entries);
    }
  }
  throw new Error('Invalid RPC result encoding');
}
