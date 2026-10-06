import React from "react";
import { IndexTable, Card, Badge, useIndexResourceState } from "@shopify/polaris";

export interface SubscriberItem {
  id: string;
  customerEmail?: string | null;
  productTitle: string;
  variantTitle: string;
  priceSnapshot: number;
  status: string;
  createdAt: string | Date;
  variantId: string;
  [key: string]: unknown;
}

interface SubscribersIndexTableProps {
  subscribers: SubscriberItem[];
  shop: string;
  onDispatchSingle: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onCopyPermalink: (sub: SubscriberItem) => void;
}

export function SubscribersIndexTable({
  subscribers,
  shop,
  onDispatchSingle,
  onBulkDelete,
  onCopyPermalink,
}: SubscribersIndexTableProps) {
  const resourceName = { singular: "customer", plural: "customers" };
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(subscribers);

  const handleBulkAction = () => {
    onBulkDelete(selectedResources);
    clearSelection();
  };

  const promotedActions = [
    {
      content: `Remove Selected (${selectedResources.length})`,
      destructive: true,
      onAction: handleBulkAction,
    },
  ];

  const getStatusMarkup = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge tone="attention">Waiting to Notify</Badge>;
      case "DISPATCHED":
        return <Badge tone="info">Alert Sent</Badge>;
      case "CONVERTED":
        return <Badge tone="success">Order Placed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const rowMarkup = subscribers.map((sub, index) => (
    <IndexTable.Row
      id={sub.id}
      key={sub.id}
      position={index}
      selected={selectedResources.includes(sub.id)}
    >
      <IndexTable.Cell>
        <span className="font-mono text-xs font-medium text-zinc-900">
          {sub.customerEmail || "Anonymous"}
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="text-xs">
          <div className="font-medium text-zinc-900">{sub.productTitle}</div>
          <div className="text-zinc-500 font-mono">
            {sub.variantTitle} · ${Number(sub.priceSnapshot).toFixed(2)}
          </div>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getStatusMarkup(sub.status)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <span className="font-mono text-xs text-zinc-500">
          {new Date(sub.createdAt).toLocaleDateString()}
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="flex items-center gap-1.5 justify-end">
          {sub.status === "PENDING" && (
            <button
              onClick={() => onDispatchSingle(sub.id)}
              className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200/80 transition-colors cursor-pointer"
            >
              Send Alert Now
            </button>
          )}
          <button
            onClick={() => onCopyPermalink(sub)}
            className="px-2.5 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 rounded-lg border border-zinc-200 shadow-2xs transition-colors cursor-pointer"
          >
            Copy Checkout Link
          </button>
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={subscribers.length}
        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
        onSelectionChange={handleSelectionChange}
        promotedBulkActions={promotedActions}
        headings={[
          { title: "Customer Email" },
          { title: "Product / Variant" },
          { title: "Status" },
          { title: "Date Signed Up" },
          { title: "Actions", alignment: "end" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}
