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

export default function TermsOfService() {
  return (
    <AppProvider i18n={enTranslations}>
      <Page title="RestockPing Terms of Service" narrowWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Terms of Service Agreement
                </Text>
                <Text as="p" variant="bodyMd">
                  By installing and utilizing the RestockPing application (&quot;Service&quot;), you agree to be bound by the following terms and conditions as well as Shopify&apos;s Partner and App Store policies.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  1. Service Provision & Performance
                </Text>
                <Text as="p" variant="bodyMd">
                  RestockPing provides automated back-in-stock alerts, customer waitlist capture, FIFO drip delivery, and inventory forecasting tools for Shopify Online Store 2.0 merchants.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  2. Billing & Subscription Terms
                </Text>
                <List type="bullet">
                  <List.Item>
                    All billing is conducted through Shopify Managed Billing. Charges will appear directly on your regular Shopify store invoice.
                  </List.Item>
                  <List.Item>
                    A 7-day free trial is provided upon installation. You may cancel at any time prior to the trial conclusion without being billed.
                  </List.Item>
                  <List.Item>
                    No hidden overage fees: all features and unlimited alerts are included in the predictable monthly subscription.
                  </List.Item>
                </List>
                <Divider />

                <Text as="h3" variant="headingSm">
                  3. Merchant Responsibilities
                </Text>
                <Text as="p" variant="bodyMd">
                  Merchants are responsible for ensuring that all notification emails and SMS comply with applicable commercial communications laws (CAN-SPAM, CASL, TCPA, and GDPR). RestockPing automatically includes one-click unsubscribe links and sender identification in all dispatches.
                </Text>
                <Divider />

                <Text as="h3" variant="headingSm">
                  4. Support & Service Inquiries
                </Text>
                <Text as="p" variant="bodyMd">
                  For technical assistance, feature requests, or questions regarding our SLA, reach our team at <b>support@restockping.com</b>.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </AppProvider>
  );
}
