import { describe, expect, it } from 'vitest';
import { describePsbtFlexibility } from './psbt-flexibility';

describe('describePsbtFlexibility', () => {
  it('is silent when the requested signatures are not ANYONECANPAY', () => {
    expect(describePsbtFlexibility([{ index: 0, sighashType: 0x01 }], 0)).toBeNull();
  });

  it('explains that ALL|ANYONECANPAY fixes every current output', () => {
    expect(describePsbtFlexibility([{ index: 0, sighashType: 0x81 }], 0)).toMatchObject({
      kind: 'inputs-only',
      severity: 'info',
      title: 'Other funding inputs may be added',
    });
  });

  it('treats a surviving SINGLE|ANYONECANPAY authorization as output-flexible', () => {
    expect(describePsbtFlexibility([
      { index: 0, sighashType: 0x81 },
      { index: 1, sighashType: 0x83 },
    ], 0)).toMatchObject({
      kind: 'outputs-flexible',
      severity: 'warning',
      title: 'Only paired outputs are fixed',
    });
  });

  it('escalates funds that can be redirected to danger', () => {
    expect(describePsbtFlexibility([{ index: 1, sighashType: 0x83 }], 50_000)).toMatchObject({
      kind: 'outputs-flexible',
      severity: 'danger',
      title: 'Some of your funds can be redirected',
    });
  });
});
