import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

export interface HeaderButtonProps {
  ariaLabel: string;
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface HeaderProps {
  useLogoTitle?: boolean;
  title?: string | React.ReactNode;
  leftButton?: HeaderButtonProps;
  rightButton?: HeaderButtonProps;
  onBack?: () => void;
}

interface HeaderContextType {
  headerProps: HeaderProps;
  setHeaderProps: (props: Partial<HeaderProps> | null) => void;
}

const EMPTY_HEADER_PROPS: HeaderProps = {
  title: '',
  useLogoTitle: false,
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

interface HeaderProviderProps {
  children: ReactNode;
}

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

type HeaderAction = 
  | { type: 'SET_PROPS'; payload: Partial<HeaderProps> }
  | { type: 'RESET' };

function headerReducer(state: HeaderProps, action: HeaderAction): HeaderProps {
  switch (action.type) {
    case 'SET_PROPS':
      const newProps = { ...EMPTY_HEADER_PROPS, ...action.payload };
      return arePropsEqual(state, newProps) ? state : newProps;
    case 'RESET':
      return EMPTY_HEADER_PROPS;
    default:
      return state;
  }
}

export function HeaderProvider({ children }: HeaderProviderProps) {
  const [headerProps, dispatch] = useReducer(headerReducer, EMPTY_HEADER_PROPS);

  const setHeaderProps = useCallback((props: Partial<HeaderProps> | null) => {
    dispatch(props ? { type: 'SET_PROPS', payload: props } : { type: 'RESET' });
  }, []);

  const value = useMemo(() => ({
    headerProps,
    setHeaderProps,
  }), [headerProps]);

  return (
    <HeaderContext.Provider value={value}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader(): HeaderContextType {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader must be used within a HeaderProvider component.');
  }
  return context;
}
