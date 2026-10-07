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
  onBulkDispatch?: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  onCopyPermalink: (sub: SubscriberItem) => void;
}

export function SubscribersIndexTable({
  subscribers,
  shop,
  onDispatchSingle,
  onBulkDispatch,
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

  const handleBulkDispatchAction = () => {
    if (onBulkDispatch) {
      onBulkDispatch(selectedResources);
      clearSelection();
    }
  };

  const promotedActions = [
    ...(onBulkDispatch
      ? [
          {
            content: `Dispatch alert (${selectedResources.length})`,
            onAction: handleBulkDispatchAction,
          },
        ]
      : []),
    {
      content: `Remove Selected (${selectedResources.length})`,
      destructive: true,
      onAction: handleBulkAction,
    },
  ];

  const getStatusMarkup = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge tone="attention">Waiting to notify</Badge>;
      case "DISPATCHED":
        return <Badge tone="info">Alert sent</Badge>;
      case "CONVERTED":
        return <Badge tone="success">Order placed</Badge>;
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
        <span className="text-xs font-medium text-[#202223] font-sans">
          {sub.customerEmail || "Anonymous"}
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="text-xs font-sans">
          <div className="font-medium text-[#202223]">{sub.productTitle}</div>
          <div className="text-[#616161] text-[11px]">
            {sub.variantTitle} · ${Number(sub.priceSnapshot).toFixed(2)}
          </div>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getStatusMarkup(sub.status)}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <span className="text-xs text-[#616161] font-sans">
          {new Date(sub.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="flex items-center gap-1.5 justify-end">
          {sub.status === "PENDING" && (
            <button
              onClick={() => onDispatchSingle(sub.id)}
              className="px-2.5 py-1 text-xs font-medium text-[#008060] bg-[#e3f1df] hover:bg-[#c1e5ba] rounded-md transition-colors cursor-pointer"
            >
              Dispatch alert
            </button>
          )}
          <button
            onClick={() => onCopyPermalink(sub)}
            className="px-2.5 py-1 text-xs font-medium text-[#202223] bg-white hover:bg-[#f6f6f7] border border-[#d2d5d8] rounded-md shadow-[0_1px_0_rgba(0,0,0,0.05)] transition-colors cursor-pointer"
          >
            Copy checkout link
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
          { title: "Customer" },
          { title: "Product / Variant" },
          { title: "Status" },
          { title: "Date registered" },
          { title: "Actions", alignment: "end" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}
