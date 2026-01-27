import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "@/contexts/header-context";
import type { ReactElement } from "react";

/**
 * OrderManagement component for managing user's open orders.
 *
 * TODO: Implement order management features:
 * - List user's open orders
 * - Filter by status (open, filled, cancelled)
 * - Cancel orders
 * - View order details
 */
export default function OrderManagementPage(): ReactElement {
  const navigate = useNavigate();
  const { setHeaderProps } = useHeader();

  // Configure header
  useEffect(() => {
    setHeaderProps({
      title: "My Orders",
      onBack: () => navigate("/market"),
    });
    return () => setHeaderProps(null);
  }, [setHeaderProps, navigate]);

  return (
    <div className="flex flex-col h-full p-4" role="main">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium mb-2">Order Management</p>
          <p className="text-sm">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
