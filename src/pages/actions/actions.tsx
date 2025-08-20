"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";
import { AddressType } from "@/utils/blockchain/bitcoin";
import type { ReactElement } from "react";

/**
 * Interface for an action item.
 */
interface Action {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * Interface for an action group.
 */
interface ActionGroup {
  title: string;
  actions: Action[];
}

/**
 * Constants for navigation paths and action groups.
 */
const PATHS = {
  BACK: "/index",
} as const;

const getActionGroups = (isTaprootWallet: boolean): ActionGroup[] => {
  const addressActions: Action[] = [
    {
      id: "compose-broadcast",
      name: "Broadcast Text",
      description: "Broadcast plain-text message on Bitcoin",
      path: "/compose/broadcast",
    },
  ];
  
  // Add Broadcast Inscription option for Taproot wallets
  if (isTaprootWallet) {
    addressActions.push({
      id: "compose-broadcast-inscription",
      name: "Broadcast Inscription",
      description: "Broadcast inscribed media file on Bitcoin",
      path: "/compose/broadcast/inscription",
    });
  }
  
  addressActions.push(
    {
      id: "compose-sweep",
      name: "Sweep Address",
      description: "Transfer all funds from an address",
      path: "/compose/sweep",
    },
    {
      id: "compose-broadcast-address-options",
      name: "Update Options",
      description: "Set address options like requiring memos",
      path: "/compose/broadcast/address-options",
    },
    {
      id: "consolidate",
      name: "Recover Bitcoin",
      description: "Find and consolidate bare multisig UTXOs",
      path: "/consolidate",
    }
  );

  return [
    {
      title: "Basic Actions",
      actions: [
        {
          id: "sign-message",
          name: "Sign Message",
          description: "Sign a message with your address",
          path: "/actions/sign-message",
        },
        {
          id: "verify-message",
          name: "Verify Message",
          description: "Verify a signed message",
          path: "/actions/verify-message",
        },
      ],
    },
    {
      title: "Assets",
      actions: [
        {
          id: "issue-asset",
          name: "Issue Asset",
          description: "Create a new token",
          path: "/compose/issuance",
        },
        {
          id: "mint-supply",
          name: "Start Mint",
          description: "Mint new token supply",
          path: "/compose/fairminter",
        },
        {
          id: "fairmint",
          name: "Fairmint",
          description: "Start a fair distribution mint",
          path: "/compose/fairmint",
        },
      ],
    },
    {
      title: "DEX",
      actions: [
        {
          id: "cancel-order",
          name: "Cancel Order",
          description: "Cancel an existing order",
          path: "/compose/cancel",
        },
        {
          id: "close-dispenser",
          name: "Close Dispenser",
          description: "Close an existing dispenser",
          path: "/compose/dispenser/close",
        },
        {
          id: "close-dispenser-by-hash",
          name: "Close Dispenser by Hash",
          description: "Close a dispenser using its transaction hash",
          path: "/compose/dispenser/close-by-hash",
        },
      ],
    },
    {
      title: "Address",
      actions: addressActions,
    },
    {
      title: "Betting",
      actions: [
        {
          id: "place-bet",
          name: "Place Bet",
          description: "Create a new bet on the network",
          path: "/compose/bet",
        },
      ],
    },
  ];
};

/**
 * ActionsScreen component displays a list of actionable wallet operations.
 *
 * Features:
 * - Groups actions into categories (Basic, Assets, DEX, etc.)
 * - Navigates to specific action paths on click
 *
 * @returns {ReactElement} The rendered actions screen UI.
 * @example
 * ```tsx
 * <ActionsScreen />
 * ```
 */
export default function ActionsScreen(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();
  const { activeWallet } = useWallet();
  
  // Check if active wallet uses taproot addresses
  const isTaprootWallet = activeWallet?.addressType === AddressType.P2TR;

  // Get dynamic action groups based on wallet type
  const actionGroups = getActionGroups(isTaprootWallet);

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "Actions",
      onBack: () => navigate(PATHS.BACK),
    });
  }, [setHeaderProps, navigate]);

  /**
   * Navigates to the selected action's path.
   * @param action - The action to navigate to.
   */
  const handleActionClick = (action: Action) => {
    navigate(action.path);
  };

  return (
    <div className="flex flex-col h-full" role="main" aria-labelledby="actions-title">
      <h2 id="actions-title" className="sr-only">
        Wallet Actions
      </h2>
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <div className="space-y-6">
          {actionGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className="text-sm font-medium text-gray-500 px-4">{group.title}</h2>
              {group.actions.map((action) => (
                <div
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  className="relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50"
                  role="button"
                  tabIndex={0}
                  aria-label={action.name}
                >
                  <div className="flex flex-col">
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                    </div>
                    <div className="text-sm font-medium text-gray-900 mb-1">{action.name}</div>
                    <div className="text-xs text-gray-500">{action.description}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
