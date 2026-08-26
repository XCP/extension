import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFromXCPIO, getXCPPrice } from "./price";

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
});

describe("XCP price source preference", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** xcp.io answers slowly; Dex-Trade answers at once. The old Promise.any race
   *  returned whichever landed first, so this ordering is what is under test. */
  const stub = ({
    ticker,
    dexTrade,
    tickerDelayMs = 0,
  }: {
    ticker: () => Response;
    dexTrade: () => Response;
    tickerDelayMs?: number;
  }) =>
    vi.fn(async (url: string) => {
      if (url.startsWith("https://api.xcp.io")) {
        await new Promise((resolve) => setTimeout(resolve, tickerDelayMs));
        return ticker();
      }
      if (url.startsWith("https://api.dex-trade.com")) return dexTrade();
      throw new Error(`unexpected fetch: ${url}`);
    });

  const CHAIN = Response.json({ result: { xcp: { usd: 2.87, change_pct: -1.9 } } });
  // 0.000023 BTC x $79,000 = $1.817 — the exchange print, a third below the chain.
  const EXCHANGE = { status: true, data: { pair: "XCPBTC", last: "0.000023" } };

  it("prefers the canonical ticker even when the exchange answers first", async () => {
    const fetch = stub({
      ticker: () => CHAIN,
      dexTrade: () => Response.json(EXCHANGE),
      tickerDelayMs: 25,
    });
    vi.stubGlobal("fetch", fetch);

    await expect(getXCPPrice(79_000)).resolves.toBe(2.87);
    // And the loser is never even asked for, so a slow exchange cannot delay us.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.xcp.io/v2/price/ticker");
  });

  it("falls back to the exchange only once the canonical ticker fails", async () => {
    vi.stubGlobal(
      "fetch",
      stub({
        ticker: () => new Response("", { status: 503 }),
        dexTrade: () => Response.json(EXCHANGE),
      }),
    );
    await expect(getXCPPrice(79_000)).resolves.toBeCloseTo(1.817, 3);
  });

  it("skips the exchange without a BTC rate to convert through", async () => {
    const fetch = stub({
      ticker: () => new Response("", { status: 503 }),
      dexTrade: () => Response.json(EXCHANGE),
    });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getXCPPrice(null)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null rather than a zero when every source is unusable", async () => {
    vi.stubGlobal(
      "fetch",
      stub({
        ticker: () => Response.json({ result: { xcp: { usd: 0 } } }),
        dexTrade: () => Response.json({ status: true, data: { pair: "XCPBTC", last: "0" } }),
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getXCPPrice(79_000)).resolves.toBeNull();
  });
});
