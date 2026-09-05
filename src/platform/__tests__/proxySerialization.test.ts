import { describe, expect, it } from 'vitest';
import { decodeProxyResult, encodeProxyResult } from '../proxySerialization';

describe('lossless RPC result encoding', () => {
  it('keeps a literal __proto__ property without assigning the prototype', () => {
    const value: unknown = JSON.parse('{"__proto__":{"polluted":true},"constructor":"ordinary"}');
    const decoded = decodeProxyResult(JSON.parse(JSON.stringify(encodeProxyResult(value))));
    expect(decoded).toEqual(value);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded as object, '__proto__')).toBe(true);
    expect(Reflect.get({}, 'polluted')).toBeUndefined();
  });

  it.each([
    ['bigint', '1.5'], ['bigint', '01'], ['bigint', '-0'], ['bigint', 1],
    ['bigint', '2', 'extra'], ['value', {}], ['unknown'],
    ['object', [['duplicate', ['value', 1]], ['duplicate', ['value', 2]]]],
    ['object', [[1, ['value', 1]]]], ['bytes', [256]], ['bytes', [1.5]],
  ])('rejects malformed or ambiguous encoded data: %j', (...value) => {
    expect(() => decodeProxyResult(value)).toThrow('Invalid RPC result encoding');
  });

  it('rejects cyclic results with a bounded error', () => {
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => encodeProxyResult(cyclic)).toThrow('nested too deeply');
  });
});
