import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetInfo } from '@/core/counterparty/api';
import { asDisplayUnits } from '@/core/numeric';
import type { AssetDetails } from '@/hooks/useAssetDetails';

const OWNER = 'bc1qownerownerownerownerownerownerownerow';

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ asset: 'MYASSET' }),
}));

vi.mock('@/components/domain/asset/asset-header', () => ({
  AssetHeader: (): ReactElement => <div data-testid="asset-header" />,
}));

vi.mock('@/contexts/header-context', () => ({
  useHeader: () => ({ setHeaderProps: vi.fn(), getCachedOwnedAsset: () => undefined }),
}));

vi.mock('@/contexts/wallet-context', () => ({
  useWallet: () => ({ activeAddress: { address: OWNER } }),
}));

vi.mock('@/core/counterparty/api', () => ({
  fetchDividendsByAsset: vi.fn().mockResolvedValue({ result: [] }),
}));

const mockUseAssetDetails = vi.fn();
vi.mock('@/hooks/useAssetDetails', () => ({
  useAssetDetails: () => mockUseAssetDetails(),
}));

const mockUseLatestIssuance = vi.fn();
vi.mock('@/hooks/useAssetLatestIssuance', () => ({
  useAssetLatestIssuance: () => mockUseLatestIssuance(),
}));

/** The shape of the latest-issuance row, which is where core reads `fair_minting`. */
function issuanceRow(fairMinting: boolean) {
  return { isLoading: false, error: null, data: { fair_minting: fairMinting } };
}

import AssetPage from '../index';

/**
 * A divisible asset with a supply of 1,000 whole units. `supply` is base units and
 * `supply_normalized` is display units — the 1e8 gap between them is the point of these tests.
 */
function assetInfo(overrides: Partial<AssetInfo> = {}): AssetInfo {
  return {
    asset: 'MYASSET',
    asset_longname: null,
    description: 'test asset',
    issuer: OWNER,
    divisible: true,
    locked: false,
    owner: OWNER,
    supply: '100000000000',
    supply_normalized: asDisplayUnits('1000'),
    ...overrides,
  } as AssetInfo;
}

function details(info: AssetInfo, availableBalance: string): { isLoading: false; error: null; data: AssetDetails } {
  return {
    isLoading: false,
    error: null,
    data: {
      isDivisible: info.divisible,
      assetInfo: info,
      availableBalance: asDisplayUnits(availableBalance),
      spendableBalance: asDisplayUnits(availableBalance),
      pendingOutgoing: asDisplayUnits('0'),
      pendingIncoming: asDisplayUnits('0'),
      unknownPending: false,
      utxoBalances: undefined,
    },
  };
}

const resetAction = () => screen.queryByText('Reset Supply');

describe('AssetPage — Reset Supply gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLatestIssuance.mockReturnValue(issuanceRow(false));
  });

  afterEach(() => {
    cleanup();
  });

  it('offers Reset Supply when the issuer holds the whole supply of a divisible asset', () => {
    // The regression this pins: the gate used to compare `availableBalance` ("1000", display
    // units) against `supply` ("100000000000", base units). Those are the same supply, so the
    // action must appear — the old strict-equality check hid it from every divisible asset.
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));

    render(<AssetPage />);

    expect(resetAction()).toBeInTheDocument();
  });

  it('offers Reset Supply when the balance carries trailing zeros the supply does not', () => {
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000.00000000'));

    render(<AssetPage />);

    expect(resetAction()).toBeInTheDocument();
  });

  it('offers Reset Supply for an asset with no supply at all', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ supply: '0', supply_normalized: asDisplayUnits('0') }), '0')
    );

    render(<AssetPage />);

    expect(resetAction()).toBeInTheDocument();
  });

  it('withholds Reset Supply when someone other than the issuer holds part of the supply', () => {
    // core: "Cannot reset an asset with many holders".
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '999'));

    render(<AssetPage />);

    expect(resetAction()).not.toBeInTheDocument();
  });

  it('withholds Reset Supply from a non-issuer holding the whole supply', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ issuer: 'bc1qsomeoneelse', owner: 'bc1qsomeoneelse' }), '1000')
    );

    render(<AssetPage />);

    expect(resetAction()).not.toBeInTheDocument();
  });

  it('withholds Reset Supply from a locked asset', () => {
    // core: "cannot reset a locked asset".
    mockUseAssetDetails.mockReturnValue(details(assetInfo({ locked: true }), '1000'));

    render(<AssetPage />);

    expect(resetAction()).not.toBeInTheDocument();
  });

  it('withholds Reset Supply when the description is locked', () => {
    // core: "Cannot reset issuance with locked description".
    mockUseAssetDetails.mockReturnValue(details(assetInfo({ description_locked: true }), '1000'));

    render(<AssetPage />);

    expect(resetAction()).not.toBeInTheDocument();
  });

  it('withholds Reset Supply while a fairminter is running', () => {
    // core: "cannot issue during fair minting".
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));
    mockUseLatestIssuance.mockReturnValue(issuanceRow(true));

    render(<AssetPage />);

    expect(resetAction()).not.toBeInTheDocument();
  });

  it('navigates to the reset-supply composer when the action is taken', () => {
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));

    render(<AssetPage />);
    screen.getByText('Reset Supply').click();

    expect(mockNavigate).toHaveBeenCalledWith('/compose/issuance/reset-supply/MYASSET');
  });
});

const ALL_ACTIONS = [
  'Start Mint',
  'Issue Supply',
  'Lock Supply',
  'Reset Supply',
  'Issue Subasset',
  'Pay Dividend',
  'Lock Description',
  'Update Description',
  'Transfer Ownership',
];

/** The action titles currently on screen. */
function visibleActions(): string[] {
  return ALL_ACTIONS.filter((title) => screen.queryByText(title) !== null);
}

describe('AssetPage - ownership follows owner, not issuer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLatestIssuance.mockReturnValue(issuanceRow(false));
  });

  afterEach(() => {
    cleanup();
  });

  it('offers owner actions to the current owner of a transferred asset', () => {
    // core rewrites owner on ASSET_TRANSFER and leaves issuer at the original creator, so an asset
    // received by transfer reads issuer=<someone else>, owner=<us>. Gating on issuer left the new
    // owner with nothing to do.
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ issuer: 'bc1qoriginalcreator', owner: OWNER }), '1000')
    );

    render(<AssetPage />);

    expect(visibleActions()).toEqual(ALL_ACTIONS);
  });

  it('offers nothing to the original issuer once the asset has been transferred away', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ issuer: OWNER, owner: 'bc1qnewowner' }), '1000')
    );

    render(<AssetPage />);

    expect(visibleActions()).toEqual([]);
  });

  it('offers nothing on an asset with neither issuer nor owner, as XCP reads', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ issuer: undefined, owner: undefined, locked: true }), '1000')
    );

    render(<AssetPage />);

    expect(visibleActions()).toEqual([]);
  });
});

describe('AssetPage - actions hidden by asset state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLatestIssuance.mockReturnValue(issuanceRow(false));
  });

  afterEach(() => {
    cleanup();
  });

  it('lists every action for an unlocked, unminted asset the owner fully holds', () => {
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));

    render(<AssetPage />);

    expect(visibleActions()).toEqual(ALL_ACTIONS);
  });

  it('drops supply-changing actions once the supply is locked', () => {
    // core: "locked asset and non-zero quantity" / "cannot reset a locked asset", and
    // fairminter.validate refuses a mint on a locked asset.
    mockUseAssetDetails.mockReturnValue(details(assetInfo({ locked: true }), '1000'));

    render(<AssetPage />);

    expect(visibleActions()).toEqual([
      'Issue Subasset',
      'Pay Dividend',
      'Lock Description',
      'Update Description',
      'Transfer Ownership',
    ]);
  });

  it('drops both description actions once the description is locked', () => {
    // core: "Cannot update a locked description".
    mockUseAssetDetails.mockReturnValue(details(assetInfo({ description_locked: true }), '1000'));

    render(<AssetPage />);

    expect(visibleActions()).toEqual([
      'Start Mint',
      'Issue Supply',
      'Lock Supply',
      'Issue Subasset',
      'Pay Dividend',
      'Transfer Ownership',
    ]);
  });

  it('drops every issuance action while a fairminter is live', () => {
    // Each of those is a reissuance of this asset, which core refuses outright: "cannot issue
    // during fair minting". One survives: Issue Subasset creates a *new* asset with its own empty
    // issuance history, so the parent's fairminter never enters the check. Start Mint goes because
    // one is already open ("Fair minter already opened"). Pay Dividend goes on our own judgement,
    // not core's — the node would accept it, but until a soft cap settles the minted supply is
    // held at `config.UNSPENDABLE`, which `supplies.holders` pays like any other address, so the
    // payout is burned.
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));
    mockUseLatestIssuance.mockReturnValue(issuanceRow(true));

    render(<AssetPage />);

    expect(visibleActions()).toEqual(['Issue Subasset']);
  });

  it('offers nothing until the fairminter state is known, rather than a list that shrinks', () => {
    // The summary answers from cache while the issuance lookup is still out, and reading that gap
    // as "not minting" drew all nine actions and then pulled eight back out.
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));
    mockUseLatestIssuance.mockReturnValue({ isLoading: true, error: null, data: null });

    render(<AssetPage />);

    expect(visibleActions()).toEqual([]);
  });

  it('keeps every action when the issuance lookup fails and the state is unknown', () => {
    // An unreachable node must not silently strip the page of everything the owner can do.
    mockUseAssetDetails.mockReturnValue(details(assetInfo(), '1000'));
    mockUseLatestIssuance.mockReturnValue({ isLoading: false, error: null, data: null });

    render(<AssetPage />);

    expect(visibleActions()).toEqual(ALL_ACTIONS);
  });

  it('drops Issue Subasset on a subasset, which cannot nest', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ asset_longname: 'PARENT.child' }), '1000')
    );

    render(<AssetPage />);

    expect(screen.queryByText('Issue Subasset')).not.toBeInTheDocument();
  });

  it('drops Pay Dividend when there is no supply to pay out on', () => {
    mockUseAssetDetails.mockReturnValue(
      details(assetInfo({ supply: '0', supply_normalized: asDisplayUnits('0') }), '0')
    );

    render(<AssetPage />);

    expect(screen.queryByText('Pay Dividend')).not.toBeInTheDocument();
    // Reset is still on offer: no supply means no holders to strand.
    expect(screen.getByText('Reset Supply')).toBeInTheDocument();
  });
});
