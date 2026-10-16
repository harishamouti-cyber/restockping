import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

export interface ThemeActivationStatus {
  isActivated: boolean;
  themeName: string | null;
  themeId: string | null;
  verified: boolean;
  error?: string | null;
}

/**
 * Checks whether the RestockPing theme app block is installed on the store's
 * active published theme by querying the Shopify Admin GraphQL API.
 * 
 * Verifies templates/product.json, sections/main-product.json, and config/settings_data.json
 * for the presence of the restock_button or restock_trigger blocks.
 */
export async function checkThemeAppBlockActivation(
  admin: AdminApiContext | any
): Promise<ThemeActivationStatus> {
  if (!admin) {
    return {
      isActivated: false,
      themeName: null,
      themeId: null,
      verified: false,
      error: "Admin API context not available",
    };
  }

  const query = `#graphql
    query getActiveThemeFiles {
      themes(first: 5, roles: [MAIN]) {
        nodes {
          id
          name
          role
          files(filenames: [
            "templates/product.json",
            "sections/main-product.json",
            "config/settings_data.json"
          ]) {
            nodes {
              filename
              body {
                ... on OnlineStoreThemeFileBodyText {
                  content
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await admin.graphql(query);
    if (!response.ok) {
      return {
        isActivated: false,
        themeName: null,
        themeId: null,
        verified: false,
        error: `GraphQL HTTP ${response.status}`,
      };
    }

    const json = await response.json();
    const activeTheme = json.data?.themes?.nodes?.[0];
    if (!activeTheme) {
      return {
        isActivated: false,
        themeName: null,
        themeId: null,
        verified: false,
        error: "No active published theme found",
      };
    }

    const files = activeTheme.files?.nodes || [];
    let isBlockPresent = false;

    for (const file of files) {
      const content = file?.body?.content || "";
      if (
        content.includes("restock_button") ||
        content.includes("restock_trigger") ||
        content.includes("restockping")
      ) {
        isBlockPresent = true;
        break;
      }
    }

    return {
      isActivated: isBlockPresent,
      themeName: activeTheme.name || "Published Theme",
      themeId: activeTheme.id || null,
      verified: true,
      error: null,
    };
  } catch (err: any) {
    console.warn("[Theme Inspection Notice]:", err?.message || err);
    return {
      isActivated: false,
      themeName: null,
      themeId: null,
      verified: false,
      error: err?.message || String(err),
    };
  }
}
