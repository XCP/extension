import { describe, expect, it } from 'vitest';
import { AddressFormat } from '@/core/bitcoin/address';
import {
  assertProviderPsbtSigningRequest,
  providerPsbtSigningCapabilities,
} from '@/core/providerCapabilities';

describe('providerPsbtSigningCapabilities', () => {
  it('reports the existing selected-input and partial-sighash software contract', () => {
    expect(providerPsbtSigningCapabilities({ type: 'mnemonic', addressFormat: AddressFormat.P2WPKH }))
      .toEqual({
        psbt: {
          supported: true,
          sighashTypes: [0x01, 0x81, 0x83],
          inputScope: 'selected',
          externalInputs: 'any',
        },
        psbtBatch: {
          supported: true,
          sighashTypes: [0x01, 0x83],
          inputScope: 'selected',
          externalInputs: 'any',
          maxRequests: 8,
        },
      });
  });

  it('reports the proved selected-input and pre-signed external Trezor contract', () => {
    expect(providerPsbtSigningCapabilities({ type: 'hardware', addressFormat: AddressFormat.P2WPKH }))
      .toEqual({
        psbt: {
          supported: true,
          sighashTypes: [0x01],
          inputScope: 'selected',
          externalInputs: 'presigned',
        },
        psbtBatch: {
          supported: true,
          sighashTypes: [0x01],
          inputScope: 'selected',
          externalInputs: 'presigned',
          maxRequests: 8,
        },
      });
  });

  it.each([AddressFormat.P2PKH, AddressFormat.P2SH_P2WPKH, AddressFormat.P2TR])(
    'does not advertise unimplemented hardware format %s',
    (addressFormat) => {
      expect(providerPsbtSigningCapabilities({ type: 'hardware', addressFormat }))
        .toEqual({
          psbt: {
            supported: false,
            sighashTypes: [],
            inputScope: 'selected',
            externalInputs: 'presigned',
          },
          psbtBatch: {
            supported: false,
            sighashTypes: [],
            inputScope: 'selected',
            externalInputs: 'presigned',
            maxRequests: 0,
          },
        });
    },
  );
});

describe('assertProviderPsbtSigningRequest', () => {
  it.each([undefined, [0]])('accepts Taproot DEFAULT with input selection %j', requestedInputIndices => {
    const software = providerPsbtSigningCapabilities({ type: 'mnemonic', addressFormat: AddressFormat.P2TR });
    expect(software.psbt.sighashTypes).toContain(0x00);
    expect(() => assertProviderPsbtSigningRequest(software.psbt, {
      inputCount: 1, requestedInputIndices, sighashTypes: [0x00],
    })).not.toThrow();
  });

  const trezor = providerPsbtSigningCapabilities({
    type: 'hardware',
    addressFormat: AddressFormat.P2WPKH,
  });

  it('admits an all-input SIGHASH_ALL request regardless of selection order', () => {
    expect(() => assertProviderPsbtSigningRequest(trezor.psbt, {
      inputCount: 2,
      requestedInputIndices: [1, 0],
      sighashTypes: [0x01, 0x01],
    })).not.toThrow();
  });

  it('admits exact-offer acceptance with a pre-signed SIGHASH_ALL buyer input', () => {
    expect(() => assertProviderPsbtSigningRequest(trezor.psbt, {
      inputCount: 2,
      requestedInputIndices: [1],
      presignedInputIndices: [0],
      sighashTypes: [0x01, 0x01],
    })).not.toThrow();
  });

  it.each([
    ['implicit inputs', { inputCount: 2, sighashTypes: [0x01, 0x01] }],
    ['unsigned external input', { inputCount: 2, requestedInputIndices: [0], sighashTypes: [0x01, 0x01] }],
    ['0x83 external input', {
      inputCount: 2,
      requestedInputIndices: [0],
      presignedInputIndices: [1],
      sighashTypes: [0x01, 0x83],
    }],
    ['duplicate inputs', { inputCount: 2, requestedInputIndices: [0, 0], sighashTypes: [0x01, 0x01] }],
    ['unsupported sighash', { inputCount: 2, requestedInputIndices: [0, 1], sighashTypes: [0x01, 0x83] }],
  ])('rejects hardware %s before signing', (_label, request) => {
    expect(() => assertProviderPsbtSigningRequest(trezor.psbt, request)).toThrow();
  });

  it('permits a selected-input software listing authorization', () => {
    const software = providerPsbtSigningCapabilities({
      type: 'mnemonic',
      addressFormat: AddressFormat.P2WPKH,
    });
    expect(() => assertProviderPsbtSigningRequest(software.psbt, {
      inputCount: 2,
      requestedInputIndices: [1],
      sighashTypes: [0x01, 0x83],
    })).not.toThrow();
  });
});
