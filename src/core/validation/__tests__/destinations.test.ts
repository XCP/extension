import { describe, expect, it } from 'vitest';
import {
  DESTINATION_WARNING_THRESHOLD,
  getDestinationLimitState,
  MAX_DESTINATIONS,
  validateDestinationCount,
} from '@/core/validation/destinations';

describe('getDestinationLimitState', () => {
  it('reports ok below the warning threshold', () => {
    expect(getDestinationLimitState(0)).toBe('ok');
    expect(getDestinationLimitState(1)).toBe('ok');
    expect(getDestinationLimitState(DESTINATION_WARNING_THRESHOLD - 1)).toBe('ok');
  });

  it('starts warning exactly at the threshold, not after it', () => {
    expect(getDestinationLimitState(DESTINATION_WARNING_THRESHOLD)).toBe('approaching');
    expect(getDestinationLimitState(DESTINATION_WARNING_THRESHOLD + 1)).toBe('approaching');
    expect(getDestinationLimitState(MAX_DESTINATIONS - 1)).toBe('approaching');
  });

  it('reports at-limit exactly at the maximum, and stays there beyond it', () => {
    expect(getDestinationLimitState(MAX_DESTINATIONS)).toBe('at-limit');
    expect(getDestinationLimitState(MAX_DESTINATIONS + 1)).toBe('at-limit');
  });

  it('leaves a warning band between the threshold and the limit', () => {
    // Guards against the two thresholds being collapsed into one, which would
    // mean the user jumps straight from no warning to a hard stop.
    expect(DESTINATION_WARNING_THRESHOLD).toBeLessThan(MAX_DESTINATIONS);
  });
});

describe('validateDestinationCount', () => {
  it('requires at least one destination', () => {
    expect(validateDestinationCount(0).isValid).toBe(false);
    expect(validateDestinationCount(1).isValid).toBe(true);
  });

  it('accepts exactly the maximum and rejects one past it', () => {
    expect(validateDestinationCount(MAX_DESTINATIONS).isValid).toBe(true);

    const overLimit = validateDestinationCount(MAX_DESTINATIONS + 1);
    expect(overLimit.isValid).toBe(false);
    expect(overLimit.error).toBe(`Maximum ${MAX_DESTINATIONS} destinations allowed`);
  });

  it('agrees with getDestinationLimitState at the boundary', () => {
    // The count that blocks the add button must still be a valid count to submit.
    expect(getDestinationLimitState(MAX_DESTINATIONS)).toBe('at-limit');
    expect(validateDestinationCount(MAX_DESTINATIONS).isValid).toBe(true);
  });
});
