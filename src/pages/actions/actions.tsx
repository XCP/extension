"use client";

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaChevronRight } from "react-icons/fa";
import { useHeader } from "@/contexts/header-context";
import { useWallet } from "@/contexts/wallet-context";

type Action = {
  id: string;
  name: string;
  description: string;
  path: string;
};

type ActionGroup = {
  title: string;
  actions: Action[];
};

const actionGroups: ActionGroup[] = [
  {
    title: "Basic Actions",
    actions: [
      {
        id: "sign-message",
        name: "Sign Message",
        description: "Sign a message with your private key",
        path: "/actions/sign-message",
      },
      {
        id: "sign-broadcast",
        name: "Sign & Broadcast Transaction",
        description: "Sign and broadcast a raw transaction",
        path: "/actions/sign-broadcast",
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
        name: "Mint Asset",
        description: "Mint new token supply",
        path: "/compose/fairminter",
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
        path: "/compose/close",
      },
    ],
  },
  {
    title: "Address",
    actions: [
      {
        id: "compose-broadcast",
        name: "Make Broadcast",
        description: "Broadcast a message to the network",
        path: "/compose/broadcast",
      },
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
      },
    ],
  },
];

export default function ActionsScreen() {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Set the header.
  useEffect(() => {
    setHeaderProps({
      title: "Actions",
      onBack: () => navigate("/index"),
    });
  }, [setHeaderProps, navigate]);

  const handleActionClick = (action: Action) => {
    navigate(action.path);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto no-scrollbar p-4">
        <div className="space-y-6">
          {actionGroups.map((group) => (
            <div key={group.title} className="space-y-2">
              <h2 className="text-sm font-medium text-gray-500 px-4">
                {group.title}
              </h2>
              {group.actions.map((action) => (
                <div
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  className="relative w-full rounded transition duration-300 p-4 cursor-pointer bg-white hover:bg-gray-50"
                >
                  <div className="flex flex-col">
                    <div className="absolute top-1/2 -translate-y-1/2 right-5">
                      <FaChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      {action.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {action.description}
                    </div>
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
