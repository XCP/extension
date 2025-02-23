import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import { formatAddress } from '@/utils/format';

/**
 * Props for a button in the header.
 */
export interface HeaderButtonProps {
  ariaLabel: string;
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

/**
 * Props for the main header.
 */
export interface HeaderProps {
  useLogoTitle?: boolean;
  title?: string | React.ReactNode;
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
 * State managed by the HeaderContext, including main header and subheading cache.
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
 * Context type for accessing and updating header-related data.
 */
interface HeaderContextType {
  headerProps: HeaderProps;
  setHeaderProps: (props: Partial<HeaderProps> | null) => void;
  subheadings: HeaderState['subheadings'];
  setAddressHeader: (address: string, walletName?: string) => void;
  setAssetHeader: (asset: string, info: AssetInfo) => void;
  setBalanceHeader: (asset: string, balance: TokenBalance) => void;
}

// Default empty props for the main header
const EMPTY_HEADER_PROPS: HeaderProps = {
  title: '',
  useLogoTitle: false,
};

// Initial state for the context
const INITIAL_STATE: HeaderState = {
  mainHeader: EMPTY_HEADER_PROPS,
  subheadings: {
    addresses: {},
    assets: {},
    balances: {},
  },
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

// Action types for the reducer
type HeaderAction =
  | { type: 'SET_MAIN_PROPS'; payload: Partial<HeaderProps> }
  | { type: 'RESET_MAIN' }
  | { type: 'SET_ADDRESS'; payload: { address: string; walletName?: string; formatted: string } }
  | { type: 'SET_ASSET'; payload: AssetInfo }
  | { type: 'SET_BALANCE'; payload: TokenBalance };

/**
 * Compares two HeaderProps objects for equality to avoid unnecessary updates.
 * @param prev Previous header props
 * @param next New header props
 * @returns Boolean indicating if props are equal
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
 * Reducer to manage header state, including main header and subheadings.
 * @param state Current state
 * @param action Action to perform
 * @returns New state
 */
function headerReducer(state: HeaderState, action: HeaderAction): HeaderState {
  switch (action.type) {
    case 'SET_MAIN_PROPS':
      const newMainProps = { ...EMPTY_HEADER_PROPS, ...action.payload };
      return arePropsEqual(state.mainHeader, newMainProps)
        ? state
        : { ...state, mainHeader: newMainProps };
    case 'RESET_MAIN':
      return { ...state, mainHeader: EMPTY_HEADER_PROPS };
    case 'SET_ADDRESS':
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
    case 'SET_ASSET':
      const asset = action.payload.asset;
      if (JSON.stringify(state.subheadings.assets[asset]) === JSON.stringify(action.payload)) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          assets: {
            ...state.subheadings.assets,
            [asset]: action.payload,
          },
        },
      };
    case 'SET_BALANCE':
      const balanceAsset = action.payload.asset;
      if (JSON.stringify(state.subheadings.balances[balanceAsset]) === JSON.stringify(action.payload)) {
        return state;
      }
      return {
        ...state,
        subheadings: {
          ...state.subheadings,
          balances: {
            ...state.subheadings.balances,
            [balanceAsset]: action.payload,
          },
        },
      };
    default:
      return state;
  }
}

/**
 * Props for the HeaderProvider component.
 */
interface HeaderProviderProps {
  children: ReactNode;
}

/**
 * Provides the HeaderContext to the app, managing both main header and subheading data.
 * @param props HeaderProviderProps
 * @returns JSX.Element
 */
export function HeaderProvider({ children }: HeaderProviderProps) {
  const [state, dispatch] = useReducer(headerReducer, INITIAL_STATE);

  // Updates the main header props
  const setHeaderProps = useCallback((props: Partial<HeaderProps> | null) => {
    dispatch(props ? { type: 'SET_MAIN_PROPS', payload: props } : { type: 'RESET_MAIN' });
  }, []);

  // Updates the cached address subheading
  const setAddressHeader = useCallback((address: string, walletName?: string) => {
    const formatted = formatAddress(address, true);
    dispatch({ type: 'SET_ADDRESS', payload: { address, walletName, formatted } });
  }, []);

  // Updates the cached asset subheading
  const setAssetHeader = useCallback((asset: string, info: AssetInfo) => {
    dispatch({ type: 'SET_ASSET', payload: { ...info, asset } });
  }, []);

  // Updates the cached balance subheading
  const setBalanceHeader = useCallback((asset: string, balance: TokenBalance) => {
    dispatch({ type: 'SET_BALANCE', payload: { ...balance, asset } });
  }, []);

  // Memoized context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      headerProps: state.mainHeader,
      setHeaderProps,
      subheadings: state.subheadings,
      setAddressHeader,
      setAssetHeader,
      setBalanceHeader,
    }),
    [state, setHeaderProps, setAddressHeader, setAssetHeader, setBalanceHeader]
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}

/**
 * Hook to access the HeaderContext.
 * @returns HeaderContextType
 * @throws Error if used outside a HeaderProvider
 */
export function useHeader(): HeaderContextType {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader must be used within a HeaderProvider component.');
  }
  return context;
}
