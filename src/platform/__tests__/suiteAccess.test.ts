import { beforeEach, describe, expect, it, type vi } from 'vitest';
import { HardwareWalletError } from '@/core/hardware/types';
import { assertTrezorSuiteAccess, hasTrezorSuiteAccess, requestTrezorSuiteAccess, TREZOR_SUITE_ORIGINS } from '@/platform/suiteAccess';

const permissions = () => chrome.permissions as unknown as {
  contains: ReturnType<typeof vi.fn>; request: ReturnType<typeof vi.fn>;
};

describe('Trezor Suite access', () => {
  beforeEach(() => {
    permissions().contains.mockResolvedValue(false);
    permissions().request.mockResolvedValue(false);
  });

  it('asks Chrome about exactly the Suite origin', async () => {
    expect(TREZOR_SUITE_ORIGINS).toEqual(['https://suite.trezor.io/*']);
    await hasTrezorSuiteAccess();
    await requestTrezorSuiteAccess();
    expect(permissions().contains).toHaveBeenCalledWith({ origins: TREZOR_SUITE_ORIGINS });
    expect(permissions().request).toHaveBeenCalledWith({ origins: TREZOR_SUITE_ORIGINS });
  });

  it('refuses a Trezor call with a coded error until access is granted', async () => {
    const refusal = await assertTrezorSuiteAccess().catch(error => error);
    expect(refusal).toBeInstanceOf(HardwareWalletError);
    expect(refusal).toMatchObject({ code: 'SUITE_ACCESS_REQUIRED', vendor: 'trezor' });
    permissions().contains.mockResolvedValue(true);
    await expect(assertTrezorSuiteAccess()).resolves.toBeUndefined();
  });

  it('reports what Chrome answered', async () => {
    expect(await requestTrezorSuiteAccess()).toBe(false);
    permissions().request.mockResolvedValue(true);
    expect(await requestTrezorSuiteAccess()).toBe(true);
  });
});
