import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Filters,
  InlineStack,
  BlockStack,
  Button,
  EmptyState,
  Box,
  Banner,
} from "@shopify/polaris";
import { SendIcon, DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { generateCartPermalink } from "../utils/permalink";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const queryParam = url.searchParams.get("query") || "";

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { shop };
  if (statusParam && statusParam !== "ALL") {
    where.status = statusParam;
  }
  if (queryParam.trim()) {
    where.OR = [
      { customerEmail: { contains: queryParam.trim() } },
      { productTitle: { contains: queryParam.trim() } },
    ];
  }

  const subscribers = await db.restockSubscription.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const settings = await db.restockSettings.findUnique({
    where: { shop },
  });

  const totalCount = await db.restockSubscription.count({ where: { shop } });
  const pendingCount = await db.restockSubscription.count({
    where: { shop, status: "PENDING" },
  });

  return json({
    subscribers,
    totalCount,
    pendingCount,
    discountCode: settings?.incentiveDiscountCode,
    shop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const subscriberId = String(formData.get("id") || "");

  if (intent === "dispatch_manual" && subscriberId) {
    await db.restockSubscription.updateMany({
      where: { id: subscriberId, shop: session.shop },
      data: {
        status: "DISPATCHED",
        dispatchedAt: new Date(),
        dispatchBatch: 999, // manual batch tag
      },
    });
    return json({ ok: true, message: "Subscriber marked as dispatched" });
  }

  if (intent === "delete" && subscriberId) {
    await db.restockSubscription.deleteMany({
      where: { id: subscriberId, shop: session.shop },
    });
    return json({ ok: true, message: "Subscriber record deleted" });
  }

  return json({ ok: true });
}

export default function SubscribersPage() {
  const { subscribers, totalCount, pendingCount, discountCode, shop } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [queryValue, setQueryValue] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  function handleStatusChange(status: string) {
    setSelectedStatus(status);
    submit(
      { status, query: queryValue },
      { method: "get" }
    );
  }

  function handleQueryChange(value: string) {
    setQueryValue(value);
    submit(
      { status: selectedStatus, query: value },
      { method: "get" }
    );
  }

  function handleQueryClear() {
    setQueryValue("");
    submit({ status: selectedStatus, query: "" }, { method: "get" });
  }

  function handleManualDispatch(id: string) {
    submit({ intent: "dispatch_manual", id }, { method: "post" });
  }

  function handleDelete(id: string) {
    submit({ intent: "delete", id }, { method: "post" });
  }

  function getStatusBadgeTone(status: string): "attention" | "info" | "success" | undefined {
    switch (status) {
      case "PENDING":
        return "attention";
      case "QUEUED":
        return "info";
      case "DISPATCHED":
        return "success";
      case "CONVERTED":
        return "success";
      case "CANCELLED":
      default:
        return undefined;
    }
  }

  return (
    <Page
      title="Restock Waitlist Subscribers"
      subtitle={`Total Subscribers: ${totalCount} | Pending In FIFO Queue: ${pendingCount}`}
      compactTitle
    >
      <BlockStack gap="400">
        <Card padding="0">
          <Box padding="300">
            <Filters
              queryValue={queryValue}
              filters={[
                {
                  key: "status",
                  label: "Status",
                  filter: (
                    <InlineStack gap="200">
                      {["ALL", "PENDING", "DISPATCHED", "CONVERTED"].map((st) => (
                        <Button
                          key={st}
                          size="micro"
                          variant={selectedStatus === st ? "primary" : "secondary"}
                          onClick={() => handleStatusChange(st)}
                        >
                          {st}
                        </Button>
                      ))}
                    </InlineStack>
                  ),
                  shortcut: true,
                },
              ]}
              appliedFilters={[]}
              onClearAll={handleQueryClear}
              onQueryChange={handleQueryChange}
              onQueryClear={handleQueryClear}
            />
          </Box>

          {subscribers.length === 0 ? (
            <EmptyState
              heading="No Subscribers in this View"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>
                No waitlist records match the selected query or status filter.
              </p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{
                singular: "subscriber",
                plural: "subscribers",
              }}
              itemCount={subscribers.length}
              headings={[
                { title: "Customer Email" },
                { title: "Product / Variant" },
                { title: "Status" },
                { title: "Batch" },
                { title: "Subscribed Date" },
                { title: "Actions", alignment: "end" },
              ]}
              selectable={false}
            >
              {subscribers.map((sub, index) => {
                const permalink = generateCartPermalink({
                  shop,
                  variantId: sub.variantId,
                  customerEmail: sub.customerEmail,
                  discountCode,
                });

                return (
                  <IndexTable.Row id={sub.id} key={sub.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {sub.customerEmail || "Anonymous"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd">
                          {sub.productTitle}
                        </Text>
                        <Text as="span" variant="bodyXs" tone="subdued">
                          {sub.variantTitle} &bull; ${sub.priceSnapshot.toFixed(2)}
                        </Text>
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={getStatusBadgeTone(sub.status)}>
                        {sub.status}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">
                        {sub.dispatchBatch > 0 ? `#${sub.dispatchBatch}` : "—"}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack align="end" gap="200">
                        {sub.status === "PENDING" && (
                          <Button
                            size="micro"
                            icon={SendIcon}
                            loading={isSubmitting}
                            onClick={() => handleManualDispatch(sub.id)}
                            accessibilityLabel="Manually dispatch notification"
                          >
                            Dispatch
                          </Button>
                        )}
                        <Button
                          size="micro"
                          variant="plain"
                          url={permalink}
                          target="_blank"
                        >
                          Permalink
                        </Button>
                        <Button
                          size="micro"
                          tone="critical"
                          variant="plain"
                          icon={DeleteIcon}
                          onClick={() => handleDelete(sub.id)}
                        />
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                );
              })}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
