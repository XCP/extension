import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { HeaderProvider, useHeader } from '../header-context';

describe('HeaderContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HeaderProvider', () => {
    it('should provide initial header state', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      expect(result.current.headerProps).toEqual({
        title: '',
        onBack: undefined,
        rightButton: undefined,
        useLogoTitle: false,
        leftButton: undefined
      });
    });

    it('should throw error when useHeader is used outside provider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        renderHook(() => useHeader());
      }).toThrow('useHeader must be used within a HeaderProvider component.');
      
      spy.mockRestore();
    });
  });

  describe('Header Props Management', () => {
    it('should set header props', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const newProps = {
        title: 'Test Page',
        rightButton: {
          icon: 'settings',
          onClick: vi.fn(),
          ariaLabel: 'Settings'
        }
      };

      act(() => {
        result.current.setHeaderProps(newProps);
      });

      expect(result.current.headerProps).toMatchObject(newProps);
    });

    it('should update partial header props', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      // Set initial props
      act(() => {
        result.current.setHeaderProps({
          title: 'Initial Title'
        });
      });

      // Update only title
      act(() => {
        result.current.setHeaderProps({
          title: 'Updated Title'
        });
      });

      expect(result.current.headerProps.title).toBe('Updated Title');
    });

    it('should handle onBack callback', () => {
      const onBackMock = vi.fn();
      
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      act(() => {
        result.current.setHeaderProps({
          title: 'Test',
          onBack: onBackMock
        });
      });

      expect(result.current.headerProps.onBack).toBe(onBackMock);
      
      // Test calling onBack
      if (result.current.headerProps.onBack) {
        result.current.headerProps.onBack();
      }
      
      expect(onBackMock).toHaveBeenCalled();
    });

    it('should handle header with logo title', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      act(() => {
        result.current.setHeaderProps({
          title: 'Test',
          useLogoTitle: true
        });
      });

      expect(result.current.headerProps.useLogoTitle).toBe(true);
    });
  });

  describe('Header Buttons', () => {
    it('should set left button', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const leftButton = {
        icon: 'menu',
        onClick: vi.fn(),
        ariaLabel: 'Menu'
      };

      act(() => {
        result.current.setHeaderProps({
          leftButton
        });
      });

      expect(result.current.headerProps.leftButton).toEqual(leftButton);
    });

    it('should set right button', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const rightButton = {
        icon: 'settings',
        onClick: vi.fn(),
        ariaLabel: 'Settings'
      };

      act(() => {
        result.current.setHeaderProps({
          rightButton
        });
      });

      expect(result.current.headerProps.rightButton).toEqual(rightButton);
    });

    it('should handle button with label', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      act(() => {
        result.current.setHeaderProps({
          rightButton: {
            icon: 'add',
            onClick: vi.fn(),
            ariaLabel: 'Add',
            label: 'New'
          }
        });
      });

      expect(result.current.headerProps.rightButton?.label).toBe('New');
    });

    it('should handle disabled buttons', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      act(() => {
        result.current.setHeaderProps({
          rightButton: {
            onClick: vi.fn(),
            ariaLabel: 'Disabled Button',
            disabled: true
          }
        });
      });

      expect(result.current.headerProps.rightButton?.disabled).toBe(true);
    });
  });

  describe('Header State Management', () => {
    it('should reset header to default state', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      // Set some props
      act(() => {
        result.current.setHeaderProps({
          title: 'Test Page'
        });
      });

      expect(result.current.headerProps.title).toBe('Test Page');

      // Reset header by setting null
      act(() => {
        result.current.setHeaderProps(null);
      });

      expect(result.current.headerProps).toEqual({
        title: '',
        onBack: undefined,
        rightButton: undefined,
        useLogoTitle: false,
        leftButton: undefined
      });
    });

    it('should maintain separate header instances', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const onClick1 = vi.fn();
      const onClick2 = vi.fn();

      // Set first header
      act(() => {
        result.current.setHeaderProps({
          title: 'Page 1',
          rightButton: {
            onClick: onClick1,
            ariaLabel: 'Action 1'
          }
        });
      });

      const firstHeader = result.current.headerProps;

      // Set second header
      act(() => {
        result.current.setHeaderProps({
          title: 'Page 2',
          rightButton: {
            onClick: onClick2,
            ariaLabel: 'Action 2'
          }
        });
      });

      expect(result.current.headerProps).not.toBe(firstHeader);
      expect(result.current.headerProps.title).toBe('Page 2');
      expect(result.current.headerProps.rightButton?.onClick).toBe(onClick2);
    });
  });

  describe('Complex Header Scenarios', () => {
    it('should handle header with multiple buttons', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const leftClick = vi.fn();
      const rightClick = vi.fn();

      act(() => {
        result.current.setHeaderProps({
          title: 'Multi Button',
          leftButton: {
            icon: 'menu',
            onClick: leftClick,
            ariaLabel: 'Menu'
          },
          rightButton: {
            icon: 'settings',
            onClick: rightClick,
            ariaLabel: 'Settings'
          }
        });
      });

      expect(result.current.headerProps.leftButton?.onClick).toBe(leftClick);
      expect(result.current.headerProps.rightButton?.onClick).toBe(rightClick);
    });

    it('should update header props independently', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const initialOnBack = vi.fn();
      const newRightButton = {
        onClick: vi.fn(),
        ariaLabel: 'New Action'
      };

      // Set initial state
      act(() => {
        result.current.setHeaderProps({
          title: 'Initial',
          onBack: initialOnBack
        });
      });

      // Update only rightButton
      act(() => {
        result.current.setHeaderProps({
          title: 'Initial',
          onBack: initialOnBack,
          rightButton: newRightButton
        });
      });

      expect(result.current.headerProps.title).toBe('Initial');
      expect(result.current.headerProps.onBack).toBe(initialOnBack);
      expect(result.current.headerProps.rightButton).toEqual(newRightButton);
    });

    it('should support rightButton with label', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      // Set rightButton with label
      act(() => {
        result.current.setHeaderProps({
          rightButton: {
            ariaLabel: 'Settings',
            label: 'Settings',
            onClick: vi.fn()
          }
        });
      });

      expect(result.current.headerProps.rightButton?.label).toBe('Settings');
    });
  });

  describe('Specialized Header Methods', () => {
    it('should set address header', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      act(() => {
        result.current.setAddressHeader('bc1qtest123', 'My Wallet');
      });

      expect(result.current.subheadings.addresses['bc1qtest123']).toBeDefined();
      expect(result.current.subheadings.addresses['bc1qtest123'].walletName).toBe('My Wallet');
    });

    it('should set asset header', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const assetInfo = {
        asset: 'XCP',
        asset_longname: null,
        divisible: true,
        locked: false,
        issuer: 'test',
        supply: '1000000'
      };

      act(() => {
        result.current.setAssetHeader('XCP', assetInfo);
      });

      expect(result.current.subheadings.assets['XCP']).toEqual(assetInfo);
    });

    it('should set balance header', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      const balance = {
        asset: 'XCP',
        quantity_normalized: '100.5'
      };

      act(() => {
        result.current.setBalanceHeader('XCP', balance);
      });

      expect(result.current.subheadings.balances['XCP']).toEqual(balance);
    });

    it('should clear balances', () => {
      const { result } = renderHook(() => useHeader(), {
        wrapper: HeaderProvider
      });

      // Set some balances
      act(() => {
        result.current.setBalanceHeader('XCP', {
          asset: 'XCP',
          quantity_normalized: '100'
        });
        result.current.setBalanceHeader('TEST', {
          asset: 'TEST',
          quantity_normalized: '50'
        });
      });

      expect(Object.keys(result.current.subheadings.balances).length).toBe(2);

      // Clear balances
      act(() => {
        result.current.clearBalances();
      });

      expect(Object.keys(result.current.subheadings.balances).length).toBe(0);
    });
  });
});