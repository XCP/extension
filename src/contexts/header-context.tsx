import React, {
  createContext,
  useCallback,
  useMemo,
  useReducer,
  type ReactElement,
  type ReactNode,
} from "react";
import { formatAddress } from "@/utils/format";

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
 * Information about an asset.
 */
export interface AssetInfo {
  asset: string;
  asset_longname: string | null;
  description?: string;
  issuer?: string;
  divisible: boolean;
  locked: boolean;
  supply?: string | number;
}

/**
 * Represents a token balance.
 */
interface TokenBalance {
  asset: string;
  asset_info?: {
    asset_longname: string | null;
    description?: string;
    issuer?: string;
    divisible?: boolean;
    locked?: boolean;
    supply?: string | number;
  };
  quantity_normalized?: string;
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
 * State managed by the HeaderContext.
 */
interface HeaderState {
  mainHeader: HeaderProps;
  subheadings: {
    addresses: Record<string, AddressData>;
    assets: Record<string, AssetInfo>;
    balances: Record<string, TokenBalance>;
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
  clearBalances: () => void;
  clearAllCaches: () => void;
}

const EMPTY_HEADER_PROPS: HeaderProps = { title: "", useLogoTitle: false };
const INITIAL_STATE: HeaderState = {
  mainHeader: EMPTY_HEADER_PROPS,
  subheadings: { addresses: {}, assets: {}, balances: {} },
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

type HeaderAction =
  | { type: "SET_MAIN_PROPS"; payload: Partial<HeaderProps> }
  | { type: "RESET_MAIN" }
  | { type: "SET_ADDRESS"; payload: { address: string; walletName?: string; formatted: string } }
  | { type: "SET_ASSET"; payload: AssetInfo }
  | { type: "SET_BALANCE"; payload: TokenBalance }
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
      clearBalances,
      clearAllCaches,
    }),
    [state, setHeaderProps, setAddressHeader, setAssetHeader, setBalanceHeader, clearBalances, clearAllCaches]
  );

  return <HeaderContext value={value}>{children}</HeaderContext>;
}

/**
 * Hook to access header context using React 19's `use`.
 * @returns {HeaderContextType} Header context value
 * @throws {Error} If used outside HeaderProvider
 */
export function useHeader(): HeaderContextType {
  const context = React.use(HeaderContext);
  if (!context) {
    throw new Error("useHeader must be used within a HeaderProvider component.");
  }
  return context;
}
