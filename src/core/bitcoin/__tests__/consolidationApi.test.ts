import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/core/api/client";
import { ConsolidationApiService } from "../consolidationApi";

vi.mock("@/core/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const page = {
  address: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  summary: {
    total_outputs: 1,
    total_value_sats: 125_000,
    pages: 1,
    current_page: 1,
    outputs_on_page: 1,
  },
  fee: {
    address: "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
    percent: 9,
    exemption_sats: 10_000,
  },
  pending_attempts: 0,
  outputs: [
    {
      txid: "ab".repeat(32),
      vout: 2,
      value_sats: 125_000,
      script_pubkey_hex: "51",
      layout: "historical",
      recovery_key_position: 0,
    },
  ],
  transactions: { ["ab".repeat(32)]: "deadbeef" },
  missing_transactions: [],
  protection: {
    protected_stamp_outputs: 2,
    protected_stamp_value_sats: 75_000,
    included: false,
  },
};

describe("ConsolidationApiService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("excludes protected Stamps by default and exposes the protection summary", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: page,
      status: 200,
      statusText: "OK",
      headers: {},
    });
    const result = await new ConsolidationApiService().fetchConsolidationBatch(
      page.address,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      `https://api.xcp.io/addresses/${page.address}/recovery`,
      { params: { page: 1, limit: 420 } },
    );
    expect(result.utxos[0]).toMatchObject({
      amount: 125_000,
      prev_tx_hex: "deadbeef",
      position: 0,
    });
    expect(result.summary.total_btc).toBe(0.00125);
    expect(result.stamp_protection).toEqual({
      protected_utxos: 2,
      protected_btc: 0.00075,
      included: false,
    });
  });

  it("only sends the protected Stamp opt-in when explicitly enabled", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { ...page, protection: { ...page.protection, included: true } },
      status: 200,
      statusText: "OK",
      headers: {},
    });
    await new ConsolidationApiService().fetchConsolidationBatch(
      page.address,
      2,
      100,
      true,
    );
    expect(apiClient.get).toHaveBeenCalledWith(
      `https://api.xcp.io/addresses/${page.address}/recovery`,
      {
        params: { page: 2, limit: 100, include_protected_stamps: true },
      },
    );
  });

  it("submits signed transaction evidence to the canonical attempts endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { status: "pending", txid: "cd".repeat(32), inputs: 1 },
      status: 201,
      statusText: "Created",
      headers: {},
    });
    await new ConsolidationApiService().reportConsolidation(page.address, {
      raw_transaction_hex: "01000000",
      network_fee: 100,
      service_fee: 200,
      output_amount: 124_700,
      include_protected_stamps: false,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      `https://api.xcp.io/addresses/${page.address}/recoveries`,
      {
        raw_transaction_hex: "01000000",
        network_fee_sats: 100,
        service_fee_sats: 200,
        output_value_sats: 124_700,
      },
    );
  });

  it("repeats explicit Stamp authorization when reporting a signed recovery", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { status: "pending", txid: "cd".repeat(32), inputs: 1 },
      status: 201,
      statusText: "Created",
      headers: {},
    });
    await new ConsolidationApiService().reportConsolidation(page.address, {
      raw_transaction_hex: "01000000",
      network_fee: 100,
      service_fee: 200,
      output_amount: 124_700,
      include_protected_stamps: true,
    });
    expect(apiClient.post).toHaveBeenCalledWith(
      `https://api.xcp.io/addresses/${page.address}/recoveries`,
      expect.objectContaining({
        include_protected_stamps: true,
      }),
    );
  });

  it("refuses incomplete raw transaction evidence", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        ...page,
        transactions: {},
        missing_transactions: [page.outputs[0]!.txid],
      },
      status: 200,
      statusText: "OK",
      headers: {},
    });
    await expect(
      new ConsolidationApiService().fetchConsolidationBatch(page.address),
    ).rejects.toThrow("Recovery transaction data is still being indexed");
  });
});
