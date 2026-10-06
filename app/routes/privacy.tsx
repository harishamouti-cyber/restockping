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
                  1. Information Collected
                </Text>
                <Text as="p" variant="bodyMd">
                  To provide automated back-in-stock alerts and inventory forecasting, RestockPing processes:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <b>Customer Contact Details:</b> Customer email addresses entered voluntarily via the storefront restock waitlist form.
                  </List.Item>
                  <List.Item>
                    <b>Catalog & Inventory Data:</b> Product ID, variant ID, inventory item ID, and current inventory levels via the Shopify Admin API.
                  </List.Item>
                  <List.Item>
                    <b>Store Information:</b> Shop domain and merchant email for billing and account management.
                  </List.Item>
                </List>
                <Divider />

                <Text as="h3" variant="headingSm">
                  2. Minimal Scope & Zero Unmanaged Data
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing practices data minimization: we request only the exact OAuth scopes required (<code>read_products</code>, <code>write_products</code>, <code>read_inventory</code>, <code>write_inventory</code>, <code>read_themes</code>). We do not collect payment details, customer addresses, or unneeded demographic information.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  3. GDPR & CCPA Compliance
                </Text>
                <Text as="p" variant="bodyMd">
                  We maintain full compliance with mandatory Shopify GDPR webhooks:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <b>customers/data_request:</b> Customer data requests return all waitlist entries associated with the requesting email.
                  </List.Item>
                  <List.Item>
                    <b>customers/redact:</b> Customer deletion requests purge all corresponding waitlist records within 24 hours.
                  </List.Item>
                  <List.Item>
                    <b>shop/redact:</b> Store uninstallation requests purge all merchant settings, mappings, and waitlists.
                  </List.Item>
                </List>
                <Divider />

                <Text as="h3" variant="headingSm">
                  4. Contact & Inquiries
                </Text>
                <Text as="p" variant="bodyMd">
                  For privacy inquiries, please contact our Data Protection Officer at <b>privacy@restockping.com</b>.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
