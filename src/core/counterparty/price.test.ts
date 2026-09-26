import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFromXCPIO, getXCPPrice, getXcpStats } from "./price";

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

describe("XCP price source preference", () => {
  // Quotes are shared for a minute. Each case runs on a clock past the previous case's quote.
  let minutesLater = 0;
  beforeEach(() => {
    minutesLater += 2;
    const now = Date.now() + minutesLater * 60_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
      // Dispatch on the exact host. A startsWith on the origin would also match
      // api.xcp.io.example.com, which is both wrong and what CodeQL's
      // incomplete-url-substring-sanitization rule exists to catch.
      const { host } = new URL(url);
      if (host === "api.xcp.io") {
        await new Promise((resolve) => setTimeout(resolve, tickerDelayMs));
        return ticker();
      }
      if (host === "api.dex-trade.com") return dexTrade();
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

  it("fetches the ticker without waiting for the BTC quote, which only the exchange needs", async () => {
    const fetch = stub({ ticker: () => Response.json({ result: { xcp: { usd: 2.87 } } }), dexTrade: () => Response.json(EXCHANGE) });
    vi.stubGlobal("fetch", fetch);
    const neverSettles = new Promise<number | null>(() => {});

    await expect(getXCPPrice(neverSettles)).resolves.toBe(2.87);
  });

  it("reaches the exchange through a pending BTC quote once the ticker fails", async () => {
    vi.stubGlobal("fetch", stub({
      ticker: () => new Response("", { status: 503 }),
      dexTrade: () => Response.json(EXCHANGE),
    }));
    await expect(getXCPPrice(Promise.resolve(79_000))).resolves.toBeCloseTo(1.817, 3);
  });

  it("shares one request among concurrent callers and reuses the quote for a minute", async () => {
    const fetch = stub({ ticker: () => Response.json({ result: { xcp: { usd: 2.87 } } }), dexTrade: () => Response.json(EXCHANGE) });
    vi.stubGlobal("fetch", fetch);

    const [first, second] = await Promise.all([getXCPPrice(), getXCPPrice()]);
    expect([first, second]).toEqual([2.87, 2.87]);
    await expect(getXCPPrice()).resolves.toBe(2.87);
    expect(fetch).toHaveBeenCalledTimes(1);

    const later = Date.now() + 60_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    await expect(getXCPPrice()).resolves.toBe(2.87);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure", async () => {
    const failing = stub({ ticker: () => new Response("", { status: 503 }), dexTrade: () => Response.json(EXCHANGE) });
    vi.stubGlobal("fetch", failing);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(getXCPPrice(null)).resolves.toBeNull();

    vi.stubGlobal("fetch", stub({ ticker: () => Response.json({ result: { xcp: { usd: 3 } } }), dexTrade: () => Response.json(EXCHANGE) }));
    await expect(getXCPPrice(null)).resolves.toBe(3);
  });
});
