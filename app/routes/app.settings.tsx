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
  Checkbox,
  Banner,
  Divider,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { SaveIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await db.restockSettings.upsert({
    where: { shop },
    update: {},
    create: {
      shop,
      senderName: "Fulfillment Center",
      senderEmail: "alerts@restockping.com",
      accentColor: "#008060",
      dripBatchMultiplier: 2.5,
      dripIntervalMinutes: 120,
      minRestockThreshold: 1,
      emailSubjectTemplate: "Back in Stock: {{product_title}} is ready to ship",
    },
  });

  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const senderName = String(formData.get("senderName") || "Fulfillment Center").trim();
  const senderEmail = String(formData.get("senderEmail") || "").trim();
  const replyToEmail = String(formData.get("replyToEmail") || "").trim();
  const accentColor = String(formData.get("accentColor") || "#008060").trim();
  const dripBatchMultiplier = parseFloat(String(formData.get("dripBatchMultiplier") || "2.5")) || 2.5;
  const dripIntervalMinutes = parseInt(String(formData.get("dripIntervalMinutes") || "120"), 10) || 120;
  const minRestockThreshold = parseInt(String(formData.get("minRestockThreshold") || "1"), 10) || 1;
  const incentiveDiscountCode = String(formData.get("incentiveDiscountCode") || "").trim();
  const emailSubjectTemplate = String(
    formData.get("emailSubjectTemplate") || "Back in Stock: {{product_title}} is ready to ship"
  ).trim();
  const enableWebPush = formData.get("enableWebPush") === "true";

  const updatedSettings = await db.restockSettings.upsert({
    where: { shop },
    update: {
      senderName,
      senderEmail,
      replyToEmail,
      accentColor,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      incentiveDiscountCode,
      emailSubjectTemplate,
      enableWebPush,
    },
    create: {
      shop,
      senderName,
      senderEmail,
      replyToEmail,
      accentColor,
      dripBatchMultiplier,
      dripIntervalMinutes,
      minRestockThreshold,
      incentiveDiscountCode,
      emailSubjectTemplate,
      enableWebPush,
    },
  });

  return json({ success: true, settings: updatedSettings });
}

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [senderName, setSenderName] = useState(settings.senderName);
  const [senderEmail, setSenderEmail] = useState(settings.senderEmail || "");
  const [replyToEmail, setReplyToEmail] = useState(settings.replyToEmail || "");
  const [accentColor, setAccentColor] = useState(settings.accentColor);
  const [dripMultiplier, setDripMultiplier] = useState(String(settings.dripBatchMultiplier));
  const [dripInterval, setDripInterval] = useState(String(settings.dripIntervalMinutes));
  const [minThreshold, setMinThreshold] = useState(String(settings.minRestockThreshold));
  const [discountCode, setDiscountCode] = useState(settings.incentiveDiscountCode || "");
  const [subjectTemplate, setSubjectTemplate] = useState(settings.emailSubjectTemplate);
  const [enableWebPush, setEnableWebPush] = useState(settings.enableWebPush);

  function handleSubmit() {
    const formData = new FormData();
    formData.append("senderName", senderName);
    formData.append("senderEmail", senderEmail);
    formData.append("replyToEmail", replyToEmail);
    formData.append("accentColor", accentColor);
    formData.append("dripBatchMultiplier", dripMultiplier);
    formData.append("dripIntervalMinutes", dripInterval);
    formData.append("minRestockThreshold", minThreshold);
    formData.append("incentiveDiscountCode", discountCode);
    formData.append("emailSubjectTemplate", subjectTemplate);
    formData.append("enableWebPush", enableWebPush ? "true" : "false");

    submit(formData, { method: "post" });
  }

  return (
    <Page
      title="RestockPing Dispatch & Branding Settings"
      subtitle="Configure FIFO queue pacing, 1-Click checkout discounts, and notification delivery"
      primaryAction={{
        content: "Save Configuration",
        icon: SaveIcon,
        loading: isSaving,
        onAction: handleSubmit,
      }}
    >
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner title="Settings saved successfully" tone="success" />
        )}

        <Layout>
          {/* FIFO Anti-Burnout Drip Settings */}
          <Layout.AnnotatedSection
            title="FIFO Anti-Burnout Pacing Engine"
            description="Control how many notifications are released relative to restocked inventory to protect conversion rate and eliminate instant re-depletion spikes."
          >
            <Card>
              <FormLayout>
                <TextField
                  label="Drip Batch Multiplier"
                  type="number"
                  value={dripMultiplier}
                  onChange={setDripMultiplier}
                  helpText="Formula: Target Batch = min(round(Restocked Units × Multiplier), Waitlist Count). Default is 2.5."
                  autoComplete="off"
                />
                <TextField
                  label="Drip Cohort Cycle Interval (Minutes)"
                  type="number"
                  value={dripInterval}
                  onChange={setDripInterval}
                  helpText="Delay before evaluating remaining inventory to dispatch to the next subscriber cohort."
                  autoComplete="off"
                />
                <TextField
                  label="Minimum Restock Threshold"
                  type="number"
                  value={minThreshold}
                  onChange={setMinThreshold}
                  helpText="Do not dispatch notifications unless new inventory reaches at least this quantity."
                  autoComplete="off"
                />
              </FormLayout>
            </Card>
          </Layout.AnnotatedSection>

          {/* 1-Click Checkout Permalinks & Dynamic Incentive */}
          <Layout.AnnotatedSection
            title="1-Click Checkout & Dynamic Incentive"
            description="Bypasses product page re-navigation. Automatically adds the restocked variant directly into checkout pre-loaded with customer email and discount."
          >
            <Card>
              <FormLayout>
                <TextField
                  label="Incentive Discount Code (Optional)"
                  value={discountCode}
                  onChange={setDiscountCode}
                  placeholder="e.g. RESTOCK10"
                  helpText="Automatically attached to the 1-click cart permalink URL (?discount=CODE) for immediate application."
                  autoComplete="off"
                />
                <TextField
                  label="Theme Accent Color (HEX)"
                  value={accentColor}
                  onChange={setAccentColor}
                  helpText="Controls the primary button and badge color in the Storefront App Block."
                  autoComplete="off"
                />
              </FormLayout>
            </Card>
          </Layout.AnnotatedSection>

          {/* Email Branding & Templates */}
          <Layout.AnnotatedSection
            title="Notification Branding & Copy"
            description="Customize sender identification and the subject template delivered to prospective buyers."
          >
            <Card>
              <FormLayout>
                <TextField
                  label="Sender Name"
                  value={senderName}
                  onChange={setSenderName}
                  autoComplete="name"
                />
                <TextField
                  label="Sender Email"
                  type="email"
                  value={senderEmail}
                  onChange={setSenderEmail}
                  placeholder="orders@yourstore.com"
                  autoComplete="email"
                />
                <TextField
                  label="Reply-To Email"
                  type="email"
                  value={replyToEmail}
                  onChange={setReplyToEmail}
                  placeholder="support@yourstore.com"
                  autoComplete="email"
                />
                <TextField
                  label="Email Subject Template"
                  value={subjectTemplate}
                  onChange={setSubjectTemplate}
                  helpText="Use {{product_title}} and {{variant_title}} variables for dynamic replacement."
                  autoComplete="off"
                />
                <Checkbox
                  label="Enable Browser Web Push Alerts"
                  checked={enableWebPush}
                  onChange={setEnableWebPush}
                  helpText="Permits zero-SMS-cost native browser push alerts on supported mobile and desktop browsers."
                />
              </FormLayout>
            </Card>
          </Layout.AnnotatedSection>
        </Layout>
      </BlockStack>
    </Page>
  );
}
