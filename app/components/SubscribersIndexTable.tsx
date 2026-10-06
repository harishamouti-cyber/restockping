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
  const resourceName = { singular: "subscriber", plural: "subscribers" };
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(subscribers);

  const handleBulkAction = () => {
    onBulkDelete(selectedResources);
    clearSelection();
  };

  const promotedActions = [
    {
      content: `Delete Selected (${selectedResources.length})`,
      destructive: true,
      onAction: handleBulkAction,
    },
  ];

  const rowMarkup = subscribers.map((sub, index) => (
    <IndexTable.Row
      id={sub.id}
      key={sub.id}
      position={index}
      selected={selectedResources.includes(sub.id)}
    >
      <IndexTable.Cell>
        <span className="font-mono text-xs font-medium text-zinc-900">
          {sub.customerEmail}
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
        <Badge
          tone={
            sub.status === "PENDING"
              ? "attention"
              : sub.status === "DISPATCHED"
              ? "info"
              : "success"
          }
        >
          {sub.status}
        </Badge>
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
              className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors cursor-pointer"
            >
              Dispatch
            </button>
          )}
          <button
            onClick={() => onCopyPermalink(sub)}
            className="px-2 py-1 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 rounded border border-zinc-200 transition-colors cursor-pointer"
          >
            Copy Link
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
          { title: "Date Subscribed" },
          { title: "Actions", alignment: "end" },
        ]}
      >
        {rowMarkup}
      </IndexTable>
    </Card>
  );
}
