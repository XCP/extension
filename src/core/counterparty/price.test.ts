import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFromXCPIO, getXcpStats } from "./price";

describe("canonical XCP price", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the reviewed v2 ticker contract", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          result: { xcp: { usd: 1.25, change_pct: 2.5 }, btc: null, as_of: 1 },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(fetchFromXCPIO()).resolves.toEqual({ xcp: { usd: 1.25 } });
    expect(fetch).toHaveBeenCalledWith("https://api.xcp.io/v2/price/ticker");
  });

  it("rejects missing and non-positive quotes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ result: { xcp: { usd: 0 } } })),
    );
    await expect(fetchFromXCPIO()).rejects.toThrow("Invalid XCP price value");
  });

  it("reads the live dispenser ask from the ticker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          result: {
            xcp: {
              usd: 4.56,
              change_pct: null,
              sats: 5700,
              quote: "confirmed_unit_dispenser_ask",
            },
          },
        }),
      ),
    );

    await expect(getXcpStats()).resolves.toEqual({
      price: 4.56,
      change24h: null,
      satsPerXcp: 5700,
    });
  });
});
