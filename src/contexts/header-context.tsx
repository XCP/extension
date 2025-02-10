import React, {
  createContext,
  useState,
  useContext,
  useCallback,
  useMemo,
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
  setHeaderProps: (props: Partial<HeaderProps>) => void;
}

const defaultHeaderProps: HeaderProps = {
  title: '',
  useLogoTitle: false,
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

interface HeaderProviderProps {
  children: ReactNode;
}

export function HeaderProvider({ children }: HeaderProviderProps) {
  const [headerProps, setHeaderPropsState] = useState<HeaderProps>(defaultHeaderProps);

  const setHeaderProps = useCallback((props: Partial<HeaderProps>) => {
    setHeaderPropsState(() => ({
      ...defaultHeaderProps,
      ...props,
    }));
  }, []);

  const contextValue = useMemo<HeaderContextType>(
    () => ({ headerProps, setHeaderProps }),
    [headerProps, setHeaderProps]
  );

  return (
    <HeaderContext value={contextValue}>
      {children}
    </HeaderContext>
  );
}

export function useHeader(): HeaderContextType {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error('useHeader must be used within a HeaderProvider component.');
  }
  return context;
}
