import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Divider,
  AppProvider,
  List,
} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";

export default function PrivacyPolicy() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page title="RestockPing Privacy Policy" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Effective Date: October 2024
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing (&quot;we&quot;, &quot;our&quot;, or &quot;the App&quot;) is committed to protecting the privacy of merchants and their customers. This Privacy Policy details how data is collected, stored, and processed in accordance with Shopify Partner Program guidelines and global privacy standards (GDPR / CCPA).
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  1. Information We Collect
                </Text>
                <Text as="p" variant="bodyMd">
                  To provide automated restock notifications, conversion attribution, and supplier inventory planning, RestockPing processes only the minimum data required:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <b>Customer Notification Information:</b> Shopper email addresses voluntarily submitted via the storefront &quot;Notify Me When Available&quot; theme app block, along with the selected product and variant IDs.
                  </List.Item>
                  <List.Item>
                    <b>Store Catalog &amp; Inventory Data:</b> Product titles, variant titles, prices, image URLs, inventory item IDs, and inventory quantities fetched through the Shopify Admin API.
                  </List.Item>
                  <List.Item>
                    <b>Conversion Attribution:</b> Order IDs and timestamps for purchases originating from restock email checkout permalinks, enabling merchants to track restock conversion performance.
                  </List.Item>
                  <List.Item>
                    <b>Merchant Account Configuration:</b> Store domain, sender display name, pacing preferences, and optional merchant-managed SMTP credentials (stored with AES-256-GCM encryption).
                  </List.Item>
                </List>
                <Divider />

                <Text as="h3" variant="headingSm">
                  2. Minimal Scopes &amp; Non-Intrusive Access
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing strictly enforces least-privilege OAuth scopes:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <code>read_products</code>: To look up titles, variant attributes, and photography for customer alert emails.
                  </List.Item>
                  <List.Item>
                    <code>read_inventory</code>: To receive inventory update webhooks and identify when restocked items become available.
                  </List.Item>
                  <List.Item>
                    <code>read_themes</code>: To detect Theme App Extension activation status and verify merchant onboarding health.
                  </List.Item>
                  <List.Item>
                    <code>read_orders</code>: To correlate restock notifications with successful checkout completions.
                  </List.Item>
                </List>
                <Text as="p" variant="bodySm" tone="subdued">
                  Notice: RestockPing never requests <code>write_products</code> or <code>write_inventory</code>. We never modify your catalog or manipulate store inventory levels.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  3. Sub-Processors &amp; Message Delivery
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing delivers transactional back-in-stock notifications via high-reputation transactional delivery providers (e.g., Resend, SendGrid) over encrypted TLS channels, or directly through merchant-supplied custom SMTP servers. We do not sell, rent, or monetize merchant or customer data with third parties.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  4. Data Retention, Unsubscribe &amp; Deletion
                </Text>
                <List type="bullet">
                  <List.Item>
                    <b>One-Click Unsubscribe:</b> Every restock email contains a secure, HMAC-signed one-click unsubscribe link. When unsubscribed, the customer&apos;s email is permanently placed on an suppression list to prevent future dispatches.
                  </List.Item>
                  <List.Item>
                    <b>Mandatory Compliance Webhooks:</b> We support all required Shopify GDPR endpoints. <code>customers/data_request</code> returns all waitlist subscriptions; <code>customers/redact</code> purges customer subscriptions; and <code>shop/redact</code> or <code>app/uninstalled</code> immediately removes store sessions and cleanses all associated store data.
                  </List.Item>
                  <List.Item>
                    <b>Data Retention:</b> Active waitlist records are retained until fulfilled, unsubscribed, or requested for deletion. Converted subscriptions are preserved in an anonymized state for merchant analytics.
                  </List.Item>
                </List>
                <Divider />

                <Text as="h3" variant="headingSm">
                  5. Contact &amp; Inquiries
                </Text>
                <Text as="p" variant="bodyMd">
                  For privacy inquiries or data subject requests, please contact our Data Protection Officer at <b>privacy@restockping.com</b>.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
