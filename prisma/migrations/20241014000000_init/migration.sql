-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockSettings" (
    "shop" TEXT NOT NULL,
    "storeDisplayName" TEXT DEFAULT '',
    "senderName" TEXT NOT NULL DEFAULT 'Fulfillment Center',
    "senderEmail" TEXT,
    "replyToEmail" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#008060',
    "dripBatchMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "dripIntervalMinutes" INTEGER NOT NULL DEFAULT 120,
    "minRestockThreshold" INTEGER NOT NULL DEFAULT 1,
    "enableWebPush" BOOLEAN NOT NULL DEFAULT false,
    "incentiveDiscountCode" TEXT,
    "emailSubjectTemplate" TEXT NOT NULL DEFAULT 'Back in Stock: {{product_title}} is ready to ship',
    "emailHeadline" TEXT NOT NULL DEFAULT 'Your item is back in stock',
    "emailBodyText" TEXT NOT NULL DEFAULT 'Good news! An item you requested is available again. Complete your order now before inventory runs out.',
    "emailButtonText" TEXT NOT NULL DEFAULT 'Claim In-Stock Item →',
    "storefrontButtonText" TEXT NOT NULL DEFAULT 'Notify Me When Available',
    "storefrontSuccessMessage" TEXT NOT NULL DEFAULT 'You''re on the waitlist! We''ll email you the moment stock returns.',
    "storefrontButtonRadius" INTEGER NOT NULL DEFAULT 6,
    "emailDeliveryMode" TEXT NOT NULL DEFAULT 'APP_MANAGED',
    "customSmtpHost" TEXT,
    "customSmtpPort" INTEGER,
    "customSmtpUser" TEXT,
    "customSmtpEncryptedPass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "InventoryItemMapping" (
    "inventoryItemId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItemMapping_pkey" PRIMARY KEY ("inventoryItemId")
);

-- CreateTable
CREATE TABLE "RestockSubscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT NOT NULL,
    "priceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "customerEmail" TEXT,
    "productImageUrl" TEXT,
    "pushEndpoint" TEXT,
    "pushP256dh" TEXT,
    "pushAuth" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dispatchBatch" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "deliveryError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "RestockSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestockJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT,
    "availableQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "batchNumber" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocationState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL DEFAULT 'ALL',
    "lastAvailable" INTEGER NOT NULL DEFAULT 0,
    "lastDispatchedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLocationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitRecord" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "InventoryItemMapping_shop_variantId_idx" ON "InventoryItemMapping"("shop", "variantId");

-- CreateIndex
CREATE INDEX "RestockSubscription_shop_variantId_status_idx" ON "RestockSubscription"("shop", "variantId", "status");

-- CreateIndex
CREATE INDEX "RestockSubscription_shop_inventoryItemId_status_idx" ON "RestockSubscription"("shop", "inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "RestockSubscription_shop_customerEmail_idx" ON "RestockSubscription"("shop", "customerEmail");

-- CreateIndex
CREATE INDEX "WebhookEvent_shop_topic_idx" ON "WebhookEvent"("shop", "topic");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "RestockJob_shop_inventoryItemId_status_idx" ON "RestockJob"("shop", "inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "RestockJob_status_scheduledFor_idx" ON "RestockJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "EmailSuppression_shop_email_idx" ON "EmailSuppression"("shop", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_shop_email_key" ON "EmailSuppression"("shop", "email");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocationState_shop_inventoryItemId_locationId_key" ON "InventoryLocationState"("shop", "inventoryItemId", "locationId");

-- CreateIndex
CREATE INDEX "RateLimitRecord_resetAt_idx" ON "RateLimitRecord"("resetAt");
