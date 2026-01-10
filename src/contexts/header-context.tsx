import {
  createContext,
  useCallback,
  useMemo,
  useReducer,
  use,
  type ReactElement,
  type ReactNode,
} from "react";
import { formatAddress } from "@/utils/format";
import type { AssetInfo, TokenBalance } from "@/utils/blockchain/counterparty/api";

/**
 * Props for a button in the header.
 */
export interface HeaderButtonProps {
  ariaLabel: string;
  label?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Props for the main header.
 */
export interface HeaderProps {
  useLogoTitle?: boolean;
  title?: string | ReactNode;
  leftButton?: HeaderButtonProps;
  rightButton?: HeaderButtonProps;
  onBack?: () => void;
}

/**
 * Cached data for an address subheading.
 */
interface AddressData {
  address: string;
  walletName?: string;
  formatted: string;
}

/**
 * Cached data for an owned asset (from asset list).
 */
export interface OwnedAssetCache {
  asset: string;
  asset_longname: string | null;
  supply_normalized: string;
  description: string;
  locked: boolean;
}

/**
 * State managed by the HeaderContext.
 */
interface HeaderState {
  mainHeader: HeaderProps;
  subheadings: {
    addresses: Record<string, AddressData>;
    assets: Record<string, AssetInfo>;
    balances: Record<string, TokenBalance>;
    ownedAssets: Record<string, OwnedAssetCache>;
  };
}

/**
 * Context type for header management.
 */
interface HeaderContextType {
  headerProps: HeaderProps;
  setHeaderProps: (props: Partial<HeaderProps> | null) => void;
  subheadings: HeaderState["subheadings"];
  setAddressHeader: (address: string, walletName?: string) => void;
  setAssetHeader: (asset: string, info: AssetInfo) => void;
  setBalanceHeader: (asset: string, balance: TokenBalance) => void;
  setOwnedAsset: (asset: OwnedAssetCache) => void;
  cacheBalances: (balances: TokenBalance[]) => void;
  cacheOwnedAssets: (assets: OwnedAssetCache[]) => void;
  getCachedBalance: (asset: string) => TokenBalance | undefined;
  getCachedOwnedAsset: (asset: string) => OwnedAssetCache | undefined;
  clearBalances: () => void;
  clearAllCaches: () => void;
}

const EMPTY_HEADER_PROPS: HeaderProps = { title: "", useLogoTitle: false };
const INITIAL_STATE: HeaderState = {
  mainHeader: EMPTY_HEADER_PROPS,
  subheadings: { addresses: {}, assets: {}, balances: {}, ownedAssets: {} },
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

type HeaderAction =
  | { type: "SET_MAIN_PROPS"; payload: Partial<HeaderProps> }
  | { type: "RESET_MAIN" }
  | { type: "SET_ADDRESS"; payload: { address: string; walletName?: string; formatted: string } }
  | { type: "SET_ASSET"; payload: AssetInfo }
  | { type: "SET_BALANCE"; payload: TokenBalance }
  | { type: "SET_OWNED_ASSET"; payload: OwnedAssetCache }
  | { type: "CACHE_BALANCES"; payload: TokenBalance[] }
  | { type: "CACHE_OWNED_ASSETS"; payload: OwnedAssetCache[] }
  | { type: "CLEAR_BALANCES" }
  | { type: "CLEAR_ALL_CACHES" };

/**
 * Compares two HeaderProps objects for equality.
 * @param {HeaderProps} prev - Previous props
 * @param {HeaderProps} next - Next props
 * @returns {boolean} Whether props are equal
 */
function arePropsEqual(prev: HeaderProps, next: HeaderProps): boolean {
  if (prev === next) return true;
  return (
    prev.useLogoTitle === next.useLogoTitle &&
    prev.title === next.title &&
    prev.onBack === next.onBack &&
    prev.leftButton?.onClick === next.leftButton?.onClick &&
    prev.leftButton?.ariaLabel === next.leftButton?.ariaLabel &&
    prev.rightButton?.onClick === next.rightButton?.onClick &&
    prev.rightButton?.ariaLabel === next.rightButton?.ariaLabel
  );
}

/**
 * Compares two AssetInfo objects for equality.
 */
function areAssetsEqual(prev: AssetInfo | undefined, next: AssetInfo): boolean {
  if (!prev) return false;
  return (
    prev.asset === next.asset &&
    prev.asset_longname === next.asset_longname &&
    prev.description === next.description &&
    prev.issuer === next.issuer &&
    prev.divisible === next.divisible &&
    prev.locked === next.locked &&
    prev.supply === next.supply
  );
}

/**
 * Compares two TokenBalance objects for equality.
 */
function areBalancesEqual(prev: TokenBalance | undefined, next: TokenBalance): boolean {
  if (!prev) return false;
  return (
    prev.asset === next.asset &&
    prev.quantity_normalized === next.quantity_normalized &&
    prev.asset_info?.asset_longname === next.asset_info?.asset_longname &&
    prev.asset_info?.description === next.asset_info?.description &&
    prev.asset_info?.issuer === next.asset_info?.issuer &&
    prev.asset_info?.divisible === next.asset_info?.divisible &&
    prev.asset_info?.locked === next.asset_info?.locked &&
    prev.asset_info?.supply === next.asset_info?.supply
  );
}

/**
 * Compares two OwnedAssetCache objects for equality.
 */
function areOwnedAssetsEqual(prev: OwnedAssetCache | undefined, next: OwnedAssetCache): boolean {
  if (!prev) return false;
  return (
    prev.asset === next.asset &&
    prev.asset_longname === next.asset_longname &&
    prev.supply_normalized === next.supply_normalized &&
    prev.description === next.description &&
    prev.locked === next.locked
  );
}

/**
 * Reducer for header state management.
 * @param {HeaderState} state - Current state
 * @param {HeaderAction} action - Action to perform
 * @returns {HeaderState} New state
 */
function headerReducer(state: HeaderState, action: HeaderAction): HeaderState {
  switch (action.type) {
    case "SET_MAIN_PROPS":
      const newMainProps = { ...EMPTY_HEADER_PROPS, ...action.payload };
      return arePropsEqual(state.mainHeader, newMainProps)
        ? state
        : { ...state, mainHeader: newMainProps };
    case "RESET_MAIN":
      return { ...state, mainHeader: EMPTY_HEADER_PROPS };
    case "SET_ADDRESS":
      const { address, walletName, formatted } = action.payload;
      const existingAddress = state.subheadings.addresses[address];
      if (
        existingAddress &&
        existingAddress.walletName === walletName &&
        existingAddress.formatted === formatted
      ) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          addresses: {
            ...state.subheadings.addresses,
            [address]: { address, walletName, formatted },
          },
        },
      };
    case "SET_ASSET":
      const asset = action.payload.asset;
      if (areAssetsEqual(state.subheadings.assets[asset], action.payload)) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          assets: { ...state.subheadings.assets, [asset]: action.payload },
        },
      };
    case "SET_BALANCE":
      const balanceAsset = action.payload.asset;
      if (areBalancesEqual(state.subheadings.balances[balanceAsset], action.payload)) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          balances: { ...state.subheadings.balances, [balanceAsset]: action.payload },
        },
      };
    case "SET_OWNED_ASSET":
      const ownedAsset = action.payload.asset;
      if (areOwnedAssetsEqual(state.subheadings.ownedAssets[ownedAsset], action.payload)) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          ownedAssets: { ...state.subheadings.ownedAssets, [ownedAsset]: action.payload },
        },
      };
    case "CACHE_BALANCES": {
      const newBalances = { ...state.subheadings.balances };
      let hasChanges = false;
      for (const balance of action.payload) {
        if (!areBalancesEqual(newBalances[balance.asset], balance)) {
          newBalances[balance.asset] = balance;
          hasChanges = true;
        }
      }
      if (!hasChanges) return state;
      return {
        ...state,
        subheadings: { ...state.subheadings, balances: newBalances },
      };
    }
    case "CACHE_OWNED_ASSETS": {
      const newOwnedAssets = { ...state.subheadings.ownedAssets };
      let hasChanges = false;
      for (const asset of action.payload) {
        if (!areOwnedAssetsEqual(newOwnedAssets[asset.asset], asset)) {
          newOwnedAssets[asset.asset] = asset;
          hasChanges = true;
        }
      }
      if (!hasChanges) return state;
      return {
        ...state,
        subheadings: { ...state.subheadings, ownedAssets: newOwnedAssets },
      };
    }
    case "CLEAR_BALANCES":
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          balances: {},
        },
      };
    case "CLEAR_ALL_CACHES":
      return {
        ...state,
        subheadings: {
          addresses: {},
          assets: {},
          balances: {},
          ownedAssets: {},
        },
      };
    default:
      return state;
  }
}

/**
 * Props for HeaderProvider.
 */
interface HeaderProviderProps {
  children: ReactNode;
}

/**
 * Provides header context to the application using React 19's <Context>.
 * @param {HeaderProviderProps} props - Component props
 * @returns {ReactElement} Context provider
 */
export function HeaderProvider({ children }: HeaderProviderProps): ReactElement {
  const [state, dispatch] = useReducer(headerReducer, INITIAL_STATE);

  const setHeaderProps = useCallback(
    (props: Partial<HeaderProps> | null) =>
      dispatch(props ? { type: "SET_MAIN_PROPS", payload: props } : { type: "RESET_MAIN" }),
    []
  );

  const setAddressHeader = useCallback((address: string, walletName?: string) => {
    const formatted = formatAddress(address, true);
    dispatch({ type: "SET_ADDRESS", payload: { address, walletName, formatted } });
  }, []);

  const setAssetHeader = useCallback((asset: string, info: AssetInfo) => {
    dispatch({ type: "SET_ASSET", payload: { ...info, asset } });
  }, []);

  const setBalanceHeader = useCallback((asset: string, balance: TokenBalance) => {
    dispatch({ type: "SET_BALANCE", payload: { ...balance, asset } });
  }, []);

  const setOwnedAsset = useCallback((asset: OwnedAssetCache) => {
    dispatch({ type: "SET_OWNED_ASSET", payload: asset });
  }, []);

  const cacheBalances = useCallback((balances: TokenBalance[]) => {
    dispatch({ type: "CACHE_BALANCES", payload: balances });
  }, []);

  const cacheOwnedAssets = useCallback((assets: OwnedAssetCache[]) => {
    dispatch({ type: "CACHE_OWNED_ASSETS", payload: assets });
  }, []);

  const getCachedBalance = useCallback((asset: string): TokenBalance | undefined => {
    return state.subheadings.balances[asset];
  }, [state.subheadings.balances]);

  const getCachedOwnedAsset = useCallback((asset: string): OwnedAssetCache | undefined => {
    return state.subheadings.ownedAssets[asset];
  }, [state.subheadings.ownedAssets]);

  const clearBalances = useCallback(() => {
    dispatch({ type: "CLEAR_BALANCES" });
  }, []);

  const clearAllCaches = useCallback(() => {
    dispatch({ type: "CLEAR_ALL_CACHES" });
  }, []);

  const value = useMemo(
    () => ({
      headerProps: state.mainHeader,
      setHeaderProps,
      subheadings: state.subheadings,
      setAddressHeader,
      setAssetHeader,
      setBalanceHeader,
      setOwnedAsset,
      cacheBalances,
      cacheOwnedAssets,
      getCachedBalance,
      getCachedOwnedAsset,
      clearBalances,
      clearAllCaches,
    }),
    [state, setHeaderProps, setAddressHeader, setAssetHeader, setBalanceHeader, setOwnedAsset, cacheBalances, cacheOwnedAssets, getCachedBalance, getCachedOwnedAsset, clearBalances, clearAllCaches]
  );

  return <HeaderContext value={value}>{children}</HeaderContext>;
}

/**
 * Hook to access header context using React 19's `use`.
 * @returns {HeaderContextType} Header context value
 * @throws {Error} If used outside HeaderProvider
 */
export function useHeader(): HeaderContextType {
  const context = use(HeaderContext);
  if (!context) {
    throw new Error("useHeader must be used within a HeaderProvider component.");
  }
  return context;
}
