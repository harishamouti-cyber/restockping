import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  BlockStack,
  Text,
  Banner,
  Divider,
  InlineStack,
  Badge,
  Box,
  List,
} from "@shopify/polaris";
import { PlayIcon, MagicIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { triggerFifoRestockDispatch } from "../services/restockDispatcher.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await db.restockSettings.findUnique({ where: { shop } });
  const pendingCount = await db.restockSubscription.count({
    where: { shop, status: "PENDING" },
  });

  // Recent simulated subscriptions
  const sampleSubscriptions = await db.restockSubscription.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return json({
    shop,
    settings,
    pendingCount,
    sampleSubscriptions,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "seed_sample_subscribers") {
    // Seed 5 realistic pending subscribers for simulation testing
    const sampleEmails = [
      "alex.morgan@example.com",
      "sarah.connor@example.com",
      "marcus.wright@example.com",
      "elena.rostova@example.com",
      "david.kim@example.com",
    ];

    const variantId = "48192837492";
    const inventoryItemId = "inv_sample_987";
    const productTitle = "Aerospace Titanium Chronograph";
    const variantTitle = "Matte Black / 42mm";
    const priceSnapshot = 249.0;

    for (let i = 0; i < sampleEmails.length; i++) {
      const email = sampleEmails[i];
      // Offset timestamps slightly to demonstrate FIFO order
      const createdAt = new Date(Date.now() - (sampleEmails.length - i) * 60000);

      await db.restockSubscription.create({
        data: {
          shop,
          customerEmail: email,
          productId: "prod_sample_123",
          variantId,
          inventoryItemId,
          productTitle,
          variantTitle,
          priceSnapshot,
          status: "PENDING",
          createdAt,
        },
      });
    }

    return json({
      success: true,
      seeded: true,
      message: "Seeded 5 simulated pending waitlist subscribers in chronological FIFO order.",
    });
  }

  if (intent === "run_simulation") {
    const inventoryItemId = String(formData.get("inventoryItemId") || "inv_sample_987").trim();
    const availableUnits = parseInt(String(formData.get("availableUnits") || "2"), 10) || 2;

    const dispatchResult = await triggerFifoRestockDispatch({
      shop,
      inventoryItemId,
      availableUnits,
    });

    return json({
      success: true,
      simulationResult: dispatchResult,
    });
  }

  return json({ ok: true });
}

export default function SimulationLabPage() {
  const { settings, pendingCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isRunning = navigation.state === "submitting";

  const [availableUnits, setAvailableUnits] = useState("2");
  const [inventoryItemId, setInventoryItemId] = useState("inv_sample_987");

  function handleSeedSubscribers() {
    submit({ intent: "seed_sample_subscribers" }, { method: "post" });
  }

  function handleRunSimulation() {
    const formData = new FormData();
    formData.append("intent", "run_simulation");
    formData.append("availableUnits", availableUnits);
    formData.append("inventoryItemId", inventoryItemId);
    submit(formData, { method: "post" });
  }

  const multiplier = settings?.dripBatchMultiplier ?? 2.5;
  const calculatedCohort = Math.round(Number(availableUnits || 0) * multiplier);

  const simResult =
    actionData && "simulationResult" in actionData
      ? actionData.simulationResult
      : null;
  const infoMessage =
    actionData && "message" in actionData ? actionData.message : null;

  return (
    <Page
      title="Restock Simulation & FIFO Test Lab"
      subtitle="Safely simulate inventory restocks to verify queue cohort batching and 1-Click checkout links"
      primaryAction={{
        content: "Simulate Inventory Restock",
        icon: PlayIcon,
        loading: isRunning,
        onAction: handleRunSimulation,
      }}
      secondaryActions={[
        {
          content: "Seed 5 Test Subscribers",
          icon: MagicIcon,
          onAction: handleSeedSubscribers,
        },
      ]}
    >
      <BlockStack gap="500">
        {infoMessage && (
          <Banner title={infoMessage} tone="info" />
        )}

        {simResult && (
          <Banner
            title={`FIFO Batch Dispatch Complete: ${simResult.dispatchedCount} Subscribers Notified`}
            tone="success"
          >
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                <b>Formula Execution:</b> Target Alerts = min(round({simResult.availableUnits} units × {simResult.multiplier}), {simResult.targetAlerts + simResult.remainingPending} pending) = <b>{simResult.targetAlerts} alerts</b>.
              </Text>
              <Text as="p" variant="bodyMd">
                <b>Batch Number:</b> #{simResult.batchId} &bull; <b>Remaining in Queue:</b> {simResult.remainingPending} subscribers.
              </Text>
              {simResult.permalinksGenerated.length > 0 && (
                <Box paddingBlockStart="200">
                  <Text as="h4" variant="headingSm">
                    Generated 1-Click Cart Permalinks:
                  </Text>
                  <List type="bullet">
                    {simResult.permalinksGenerated.map((link: string, idx: number) => (
                      <List.Item key={idx}>
                        <a href={link} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>
                          {link}
                        </a>
                      </List.Item>
                    ))}
                  </List>
                </Box>
              )}
            </BlockStack>
          </Banner>
        )}

        <Layout>
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Simulation Parameters
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Test the exact FIFO drip algorithm without modifying real warehouse stock levels.
                </Text>
                <Divider />

                <FormLayout>
                  <TextField
                    label="Restocked Available Units"
                    type="number"
                    value={availableUnits}
                    onChange={setAvailableUnits}
                    helpText="Simulated quantity reported replenished."
                    autoComplete="off"
                  />
                  <TextField
                    label="Inventory Item ID"
                    value={inventoryItemId}
                    onChange={setInventoryItemId}
                    helpText="Target inventory item mapping identifier."
                    autoComplete="off"
                  />
                  <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm">
                        Configured Drip Multiplier:
                      </Text>
                      <Badge tone="info">{`${multiplier}x`}</Badge>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text as="span" variant="bodySm">
                        Calculated Target Batch Size:
                      </Text>
                      <Badge tone="attention">{`${calculatedCohort} subscribers`}</Badge>
                    </InlineStack>
                  </Box>
                </FormLayout>

                <InlineStack gap="300">
                  <Button variant="primary" icon={PlayIcon} onClick={handleRunSimulation} loading={isRunning}>
                    Execute Simulation Run
                  </Button>
                  <Button icon={MagicIcon} onClick={handleSeedSubscribers}>
                    Seed Test Subscribers
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  FIFO Queue Mechanics
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing uses a First-In, First-Out (FIFO) queue with proportional capacity multipliers:
                </Text>
                <List type="number">
                  <List.Item>
                    <b>Chronological Ordering:</b> The customer who registered first receives the alert first.
                  </List.Item>
                  <List.Item>
                    <b>Anti-Burnout Drip:</b> If 4 units arrive and multiplier is 2.5x, RestockPing alerts exactly 10 subscribers—not all 500 on the waitlist.
                  </List.Item>
                  <List.Item>
                    <b>Pacing Window:</b> A configurable cool-down interval ensures the first cohort has adequate time to claim units before the next cohort is notified.
                  </List.Item>
                  <List.Item>
                    <b>1-Click Conversion:</b> Emails bypass product listings and take buyers directly into pre-populated checkouts with auto-applied discount codes.
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
