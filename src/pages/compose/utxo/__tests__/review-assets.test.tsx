import { Transaction } from "@scure/btc-signer";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUtxoBalances } from "@/core/counterparty/api";
import { ReviewUtxoDetach } from "../detach/review";
import { ReviewUtxoMove } from "../move/review";

vi.mock("@/core/counterparty/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/counterparty/api")>()),
  fetchUtxoBalances: vi.fn(),
}));

vi.mock("@/components/screens/review-screen", () => ({
  ReviewScreen: ({ customFields }: { customFields: Array<{ label: string; value: unknown }> }) => (
    <>
      {customFields.map((field) => (
        <div key={field.label} data-testid={field.label}>
          {String(field.value)}
        </div>
      ))}
    </>
  ),
}));

const SOURCE_TXID = "a1".repeat(32);
const FUNDING_TXID = "b2".repeat(32);
const SOURCE_UTXO = `${SOURCE_TXID}:0`;
const FUNDING_UTXO = `${FUNDING_TXID}:1`;
const DESTINATION = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

/** An unsigned transaction spending the attached UTXO and one funding input, as Core composes it. */
function rawTransaction(): string {
  const tx = new Transaction({ allowUnknownOutputs: true });
  tx.addInput({ txid: SOURCE_TXID, index: 0 });
  tx.addInput({ txid: FUNDING_TXID, index: 1 });
  tx.addOutputAddress(DESTINATION, 546n);
  return tx.hex;
}

const balances: Record<string, unknown[]> = {
  [SOURCE_UTXO]: [
    { asset: "XCP", quantity: 50_000_000, quantity_normalized: "0.50000000", asset_info: { asset_longname: null, divisible: true } },
    { asset: "A95428956661682177", quantity: 3, quantity_normalized: "3", asset_info: { asset_longname: "PEPE.RARE", divisible: false } },
  ],
  [FUNDING_UTXO]: [],
};

function renderPage(page: "detach" | "move", rawtransaction: unknown = rawTransaction()) {
  const props = {
    apiResponse: { result: { rawtransaction, params: { source: DESTINATION, sourceUtxo: SOURCE_UTXO, destination: DESTINATION } } },
    onSign: vi.fn(),
    onBack: vi.fn(),
    error: null,
    isSigning: false,
  };
  render(page === "detach" ? <ReviewUtxoDetach {...props} /> : <ReviewUtxoMove {...props} />);
}

describe.each([
  ["detach", "Detached"],
  ["move", "Assets Moving"],
] as const)("%s review: the assets that leave with the UTXO", (page, label) => {
  beforeEach(() => {
    vi.mocked(fetchUtxoBalances).mockReset();
    vi.mocked(fetchUtxoBalances).mockImplementation(async (utxo) => ({ result: balances[utxo] ?? [] }) as any);
  });

  it("lists every asset on the UTXOs the transaction spends, at the ledger's divisibility, by long name", async () => {
    renderPage(page);
    expect(screen.getByTestId(label)).toHaveTextContent("Loading…");
    await waitFor(() => expect(screen.getByTestId(label)).toHaveTextContent("0.50000000 XCP 3 PEPE.RARE"));
    // Read from the transaction's own inputs, not the form's echo of which UTXO was chosen.
    expect(vi.mocked(fetchUtxoBalances).mock.calls.map(([utxo]) => utxo)).toEqual([SOURCE_UTXO, FUNDING_UTXO]);
  });

  it("says the lookup failed rather than showing nothing", async () => {
    vi.mocked(fetchUtxoBalances).mockRejectedValue(new Error("offline"));
    renderPage(page);
    await waitFor(() => expect(screen.getByTestId(label)).toHaveTextContent("Could not load the assets on this UTXO."));
  });

  it("says when the ledger holds nothing on the spent UTXOs", async () => {
    vi.mocked(fetchUtxoBalances).mockResolvedValue({ result: [] } as any);
    renderPage(page);
    await waitFor(() => expect(screen.getByTestId(label)).toHaveTextContent("No assets attached"));
  });

  it("treats bytes it cannot parse as a failed lookup, not an empty UTXO", async () => {
    renderPage(page, "not a transaction");
    await waitFor(() => expect(screen.getByTestId(label)).toHaveTextContent("Could not load the assets on this UTXO."));
    expect(fetchUtxoBalances).not.toHaveBeenCalled();
  });
});

describe("move review", () => {
  it("names the UTXO it moves from", async () => {
    vi.mocked(fetchUtxoBalances).mockResolvedValue({ result: [] } as any);
    renderPage("move");
    expect(screen.getByTestId("From UTXO")).toHaveTextContent(SOURCE_UTXO);
    await waitFor(() => expect(screen.getByTestId("Assets Moving")).toHaveTextContent("No assets attached"));
  });
});
