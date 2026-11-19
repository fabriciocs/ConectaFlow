-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPERADMIN', 'STAFF', 'USER') NOT NULL DEFAULT 'USER',
    `apiKey` VARCHAR(191) NULL,
    `apiKeyHash` VARCHAR(191) NULL,
    `apiKeyPrefix` VARCHAR(191) NULL,
    `apiKeyCreatedAt` DATETIME(3) NULL,
    `apiKeyLastUsedAt` DATETIME(3) NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_apiKey_key`(`apiKey`),
    UNIQUE INDEX `User_apiKeyHash_key`(`apiKeyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PENDING_DELETION') NOT NULL DEFAULT 'ACTIVE',
    `suspendedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Tenant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantMembership` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
    `status` ENUM('ACTIVE', 'REVOKED', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `membershipVersion` INTEGER NOT NULL DEFAULT 1,

    INDEX `TenantMembership_tenantId_status_idx`(`tenantId`, `status`),
    INDEX `TenantMembership_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `TenantMembership_tenantId_userId_key`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER') NOT NULL DEFAULT 'MEMBER',
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TenantInvitation_tokenHash_key`(`tokenHash`),
    INDEX `TenantInvitation_tenantId_email_idx`(`tenantId`, `email`),
    INDEX `TenantInvitation_tenantId_expiresAt_revokedAt_idx`(`tenantId`, `expiresAt`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TenantSettings` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NULL,
    `locale` VARCHAR(191) NULL,
    `branding` JSON NULL,
    `registrationPolicy` JSON NULL,
    `retentionPolicy` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TenantSettings_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceGrant` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `resourceType` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NOT NULL,
    `principalUserId` VARCHAR(191) NULL,
    `capabilities` JSON NOT NULL,
    `grantedBy` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ResourceGrant_tenantId_resourceType_resourceId_idx`(`tenantId`, `resourceType`, `resourceId`),
    INDEX `ResourceGrant_tenantId_principalUserId_idx`(`tenantId`, `principalUserId`),
    INDEX `ResourceGrant_tenantId_revokedAt_expiresAt_idx`(`tenantId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiCredential` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `keyPrefix` VARCHAR(191) NOT NULL,
    `scopes` JSON NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiCredential_keyHash_key`(`keyHash`),
    INDEX `ApiCredential_tenantId_userId_idx`(`tenantId`, `userId`),
    INDEX `ApiCredential_tenantId_revokedAt_expiresAt_idx`(`tenantId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `tenantId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `resourceType` VARCHAR(191) NULL,
    `resourceId` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AuditEvent_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditEvent_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAccessEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `resourceType` VARCHAR(191) NULL,
    `resourceId` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAccessEvent_tenantId_createdAt_idx`(`tenantId`, `createdAt`),
    INDEX `AdminAccessEvent_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AdminAccessEvent_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailVerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `EmailVerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `EmailVerificationToken_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `EmailVerificationToken_expiresAt_consumedAt_idx`(`expiresAt`, `consumedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DISCONNECTED',
    `qr` TEXT NULL,
    `config` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionId_key`(`sessionId`),
    INDEX `Session_tenantId_userId_idx`(`tenantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Contact` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(191) NOT NULL,
    `lid` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `notify` VARCHAR(191) NULL,
    `verifiedName` VARCHAR(191) NULL,
    `remoteJidAlt` VARCHAR(191) NULL,
    `profilePic` TEXT NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Contact_tenantId_sessionId_jid_idx`(`tenantId`, `sessionId`, `jid`),
    UNIQUE INDEX `Contact_sessionId_jid_key`(`sessionId`, `jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `remoteJid` VARCHAR(191) NOT NULL,
    `senderJid` VARCHAR(191) NULL,
    `fromMe` BOOLEAN NOT NULL,
    `keyId` VARCHAR(191) NOT NULL,
    `pushName` VARCHAR(191) NULL,
    `type` ENUM('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACT') NOT NULL DEFAULT 'TEXT',
    `content` TEXT NULL,
    `mediaUrl` TEXT NULL,
    `status` ENUM('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quoteId` VARCHAR(191) NULL,
    `contactId` VARCHAR(191) NULL,

    INDEX `Message_tenantId_sessionId_remoteJid_idx`(`tenantId`, `sessionId`, `remoteJid`),
    INDEX `Message_tenantId_sessionId_remoteJid_timestamp_idx`(`tenantId`, `sessionId`, `remoteJid`, `timestamp`),
    INDEX `Message_sessionId_remoteJid_idx`(`sessionId`, `remoteJid`),
    INDEX `Message_sessionId_remoteJid_timestamp_idx`(`sessionId`, `remoteJid`, `timestamp`),
    UNIQUE INDEX `Message_sessionId_keyId_key`(`sessionId`, `keyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Group` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `ownerJid` VARCHAR(191) NULL,
    `participants` JSON NULL,
    `creation` DATETIME(3) NULL,
    `restrict` BOOLEAN NULL,
    `announce` BOOLEAN NULL,
    `metadata` JSON NULL,
    `inviteCode` VARCHAR(191) NULL,
    `isCommunity` BOOLEAN NOT NULL DEFAULT false,
    `linkedParentJid` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Group_tenantId_sessionId_jid_idx`(`tenantId`, `sessionId`, `jid`),
    UNIQUE INDEX `Group_sessionId_jid_key`(`sessionId`, `jid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AutoReply` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `matchType` VARCHAR(191) NOT NULL,
    `response` TEXT NULL,
    `isMedia` BOOLEAN NOT NULL DEFAULT false,
    `mediaUrl` VARCHAR(191) NULL,
    `mediaType` VARCHAR(191) NULL,
    `triggerType` VARCHAR(191) NOT NULL DEFAULT 'ALL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AutoReply_tenantId_sessionId_keyword_idx`(`tenantId`, `sessionId`, `keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Story` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `mediaUrl` TEXT NULL,
    `type` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `viewed` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Story_tenantId_sessionId_timestamp_idx`(`tenantId`, `sessionId`, `timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduledMessage` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `mediaUrl` VARCHAR(191) NULL,
    `mediaType` VARCHAR(191) NULL,
    `sendAt` DATETIME(3) NOT NULL,
    `cronExpression` VARCHAR(191) NULL,
    `recurrenceRule` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `claimToken` VARCHAR(191) NULL,
    `claimedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ScheduledMessage_tenantId_status_sendAt_idx`(`tenantId`, `status`, `sendAt`),
    INDEX `ScheduledMessage_tenantId_status_claimedAt_idx`(`tenantId`, `status`, `claimedAt`),
    INDEX `ScheduledMessage_status_sendAt_idx`(`status`, `sendAt`),
    INDEX `ScheduledMessage_status_claimedAt_idx`(`status`, `claimedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthState` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,

    INDEX `AuthState_tenantId_sessionId_key_idx`(`tenantId`, `sessionId`, `key`),
    UNIQUE INDEX `AuthState_sessionId_key_key`(`sessionId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Webhook` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `allowLocal` BOOLEAN NOT NULL DEFAULT false,
    `requestHeaders` TEXT NULL,
    `secret` VARCHAR(191) NULL,
    `events` JSON NOT NULL,
    `filters` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Webhook_tenantId_userId_idx`(`tenantId`, `userId`),
    INDEX `Webhook_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `webhookId` VARCHAR(191) NOT NULL,
    `event` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `requestUrl` TEXT NOT NULL,
    `requestHeaders` JSON NULL,
    `requestBody` JSON NULL,
    `responseStatusCode` INTEGER NULL,
    `responseBody` TEXT NULL,
    `responseTimeMs` INTEGER NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebhookLog_tenantId_webhookId_createdAt_idx`(`tenantId`, `webhookId`, `createdAt`),
    INDEX `WebhookLog_webhookId_idx`(`webhookId`),
    INDEX `WebhookLog_webhookId_createdAt_idx`(`webhookId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InboundEvent` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(64) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `originalMessageId` VARCHAR(191) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimToken` VARCHAR(191) NULL,
    `claimExpiresAt` DATETIME(3) NULL,
    `jobId` VARCHAR(191) NULL,
    `resultId` VARCHAR(191) NULL,
    `messageId` VARCHAR(191) NULL,
    `mediaRef` TEXT NULL,
    `lastError` TEXT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InboundEvent_eventId_key`(`eventId`),
    INDEX `InboundEvent_tenantId_sessionId_receivedAt_idx`(`tenantId`, `sessionId`, `receivedAt`),
    INDEX `inbound_event_queue_idx`(`status`, `availableAt`),
    INDEX `inbound_event_session_idx`(`sessionId`, `receivedAt`),
    INDEX `inbound_event_job_idx`(`jobId`),
    INDEX `inbound_event_result_idx`(`resultId`),
    INDEX `inbound_event_message_idx`(`messageId`),
    UNIQUE INDEX `inbound_event_source_uq`(`sessionId`, `eventType`, `originalMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProcessingResult` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `resultId` VARCHAR(191) NOT NULL,
    `contractVersion` VARCHAR(64) NOT NULL,
    `eventId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `correlationId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `sessionPublicId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NULL,
    `modality` VARCHAR(32) NOT NULL,
    `processorVersion` VARCHAR(128) NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `language` VARCHAR(32) NULL,
    `text` TEXT NULL,
    `evidence` JSON NOT NULL,
    `confidence` DOUBLE NULL,
    `sourceReferences` JSON NOT NULL,
    `artifacts` JSON NOT NULL,
    `accessScope` JSON NOT NULL,
    `failureReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProcessingResult_resultId_key`(`resultId`),
    INDEX `ProcessingResult_tenantId_sessionId_status_createdAt_idx`(`tenantId`, `sessionId`, `status`, `createdAt`),
    INDEX `ProcessingResult_tenantId_sessionPublicId_createdAt_idx`(`tenantId`, `sessionPublicId`, `createdAt`),
    INDEX `processing_result_session_status_idx`(`sessionId`, `status`, `createdAt`),
    INDEX `processing_result_session_modality_idx`(`sessionId`, `modality`, `createdAt`),
    INDEX `processing_result_public_session_idx`(`sessionPublicId`, `createdAt`),
    UNIQUE INDEX `processing_result_event_job_uq`(`eventId`, `jobId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BotConfig` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `botName` VARCHAR(191) NOT NULL DEFAULT 'WA-AKG Bot',
    `botMode` ENUM('ALL', 'OWNER', 'SPECIFIC', 'BLACKLIST') NOT NULL DEFAULT 'OWNER',
    `botAllowedJids` JSON NULL,
    `botBlockedJids` JSON NULL,
    `autoReplyMode` ENUM('ALL', 'OWNER', 'SPECIFIC', 'BLACKLIST') NOT NULL DEFAULT 'ALL',
    `autoReplyAllowedJids` JSON NULL,
    `autoReplyBlockedJids` JSON NULL,
    `enableSticker` BOOLEAN NOT NULL DEFAULT true,
    `enableVideoSticker` BOOLEAN NOT NULL DEFAULT true,
    `maxStickerDuration` INTEGER NOT NULL DEFAULT 10,
    `enablePing` BOOLEAN NOT NULL DEFAULT true,
    `enableUptime` BOOLEAN NOT NULL DEFAULT true,
    `removeBgApiKey` VARCHAR(191) NULL,
    `prefix` VARCHAR(191) NOT NULL DEFAULT '#',
    `antiSpamEnabled` BOOLEAN NOT NULL DEFAULT false,
    `spamLimit` INTEGER NOT NULL DEFAULT 5,
    `spamInterval` INTEGER NOT NULL DEFAULT 10,
    `spamDelayMin` INTEGER NOT NULL DEFAULT 1000,
    `spamDelayMax` INTEGER NOT NULL DEFAULT 3000,
    `welcomeMessage` TEXT NULL,
    `autoRead` BOOLEAN NOT NULL DEFAULT false,
    `alwaysOnline` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BotConfig_sessionId_key`(`sessionId`),
    INDEX `BotConfig_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemConfig` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `appName` VARCHAR(191) NOT NULL DEFAULT 'WA-AKG',
    `logoUrl` VARCHAR(191) NULL,
    `faviconUrl` VARCHAR(191) NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Jakarta',
    `enableRegistration` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Label` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` INTEGER NOT NULL DEFAULT 0,
    `colorHex` VARCHAR(191) NOT NULL DEFAULT '#FF0000',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Label_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    INDEX `Label_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `Label_sessionId_name_key`(`sessionId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatLabel` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `labelId` VARCHAR(191) NOT NULL,
    `chatJid` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatLabel_tenantId_labelId_chatJid_idx`(`tenantId`, `labelId`, `chatJid`),
    INDEX `ChatLabel_chatJid_idx`(`chatJid`),
    INDEX `ChatLabel_labelId_idx`(`labelId`),
    UNIQUE INDEX `ChatLabel_labelId_chatJid_key`(`labelId`, `chatJid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'INFO',
    `read` BOOLEAN NOT NULL DEFAULT false,
    `href` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_tenantId_userId_createdAt_idx`(`tenantId`, `userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SessionAccess` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SessionAccess_tenantId_sessionId_userId_idx`(`tenantId`, `sessionId`, `userId`),
    INDEX `SessionAccess_userId_idx`(`userId`),
    INDEX `SessionAccess_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `SessionAccess_sessionId_userId_key`(`sessionId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthClient` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `clientSecretHash` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `redirectUris` JSON NOT NULL,
    `allowedScopes` JSON NOT NULL,
    `grantTypes` JSON NOT NULL,
    `isConfidential` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OAuthClient_clientId_key`(`clientId`),
    INDEX `OAuthClient_createdById_idx`(`createdById`),
    INDEX `OAuthClient_tenantId_createdById_idx`(`tenantId`, `createdById`),
    INDEX `OAuthClient_tenantId_isActive_idx`(`tenantId`, `isActive`),
    INDEX `OAuthClient_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthAuthorizationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `redirectUri` TEXT NOT NULL,
    `responseType` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `state` TEXT NULL,
    `codeChallenge` VARCHAR(191) NOT NULL,
    `codeChallengeMethod` VARCHAR(191) NOT NULL DEFAULT 'S256',
    `resource` TEXT NULL,
    `sessionScope` JSON NULL,
    `operationAllowlist` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OAuthAuthorizationRequest_requestId_key`(`requestId`),
    INDEX `OAuthAuthorizationRequest_clientId_expiresAt_idx`(`clientId`, `expiresAt`),
    INDEX `OAuthAuthorizationRequest_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `OAuthAuthorizationRequest_tenantId_clientId_expiresAt_idx`(`tenantId`, `clientId`, `expiresAt`),
    INDEX `OAuthAuthorizationRequest_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthAuthorizationCode` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `redirectUri` TEXT NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `codeChallenge` VARCHAR(191) NOT NULL,
    `codeChallengeMethod` VARCHAR(191) NOT NULL DEFAULT 'S256',
    `resource` TEXT NULL,
    `grantId` VARCHAR(191) NULL,
    `sessionScope` JSON NULL,
    `operationAllowlist` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OAuthAuthorizationCode_codeHash_key`(`codeHash`),
    INDEX `OAuthAuthorizationCode_clientId_expiresAt_idx`(`clientId`, `expiresAt`),
    INDEX `OAuthAuthorizationCode_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `OAuthAuthorizationCode_grantId_idx`(`grantId`),
    INDEX `OAuthAuthorizationCode_tenantId_clientId_expiresAt_idx`(`tenantId`, `clientId`, `expiresAt`),
    INDEX `OAuthAuthorizationCode_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `OAuthAuthorizationCode_tenantId_grantId_idx`(`tenantId`, `grantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthAccessToken` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL,
    `grantType` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NULL,
    `sessionScope` JSON NULL,
    `operationAllowlist` JSON NULL,
    `resource` TEXT NULL,
    `grantId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `OAuthAccessToken_tokenHash_key`(`tokenHash`),
    INDEX `OAuthAccessToken_clientId_expiresAt_idx`(`clientId`, `expiresAt`),
    INDEX `OAuthAccessToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `OAuthAccessToken_grantId_idx`(`grantId`),
    INDEX `OAuthAccessToken_familyId_idx`(`familyId`),
    INDEX `OAuthAccessToken_revokedAt_idx`(`revokedAt`),
    INDEX `OAuthAccessToken_tenantId_clientId_expiresAt_idx`(`tenantId`, `clientId`, `expiresAt`),
    INDEX `OAuthAccessToken_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `OAuthAccessToken_tenantId_grantId_idx`(`tenantId`, `grantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthRefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NOT NULL,
    `grantType` VARCHAR(191) NOT NULL,
    `sessionScope` JSON NULL,
    `operationAllowlist` JSON NULL,
    `resource` TEXT NULL,
    `grantId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `rotatedAt` DATETIME(3) NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `OAuthRefreshToken_tokenHash_key`(`tokenHash`),
    INDEX `OAuthRefreshToken_clientId_expiresAt_idx`(`clientId`, `expiresAt`),
    INDEX `OAuthRefreshToken_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `OAuthRefreshToken_grantId_idx`(`grantId`),
    INDEX `OAuthRefreshToken_familyId_idx`(`familyId`),
    INDEX `OAuthRefreshToken_revokedAt_idx`(`revokedAt`),
    INDEX `OAuthRefreshToken_tenantId_clientId_expiresAt_idx`(`tenantId`, `clientId`, `expiresAt`),
    INDEX `OAuthRefreshToken_tenantId_userId_expiresAt_idx`(`tenantId`, `userId`, `expiresAt`),
    INDEX `OAuthRefreshToken_tenantId_grantId_idx`(`tenantId`, `grantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthRateLimitBucket` (
    `key` VARCHAR(255) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `resetAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OAuthRateLimitBucket_resetAt_idx`(`resetAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthGrant` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `resource` TEXT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OAuthGrant_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `OAuthGrant_clientId_revokedAt_idx`(`clientId`, `revokedAt`),
    INDEX `OAuthGrant_tenantId_userId_revokedAt_idx`(`tenantId`, `userId`, `revokedAt`),
    INDEX `OAuthGrant_tenantId_clientId_revokedAt_idx`(`tenantId`, `clientId`, `revokedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OAuthGrantSessionCapability` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OAuthGrantSessionCapability_tenantId_grantId_sessionId_idx`(`tenantId`, `grantId`, `sessionId`),
    INDEX `OAuthGrantSessionCapability_sessionId_capability_idx`(`sessionId`, `capability`),
    UNIQUE INDEX `OAuthGrantSessionCapability_grantId_sessionId_key`(`grantId`, `sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OIDCIdentity` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OIDCIdentity_userId_idx`(`userId`),
    UNIQUE INDEX `OIDCIdentity_provider_subject_key`(`provider`, `subject`),
    UNIQUE INDEX `OIDCIdentity_provider_userId_key`(`provider`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BroadcastLog` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `total` INTEGER NOT NULL,
    `sent` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `delay` INTEGER NOT NULL DEFAULT 2000,
    `claimToken` VARCHAR(191) NULL,
    `claimedAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `BroadcastLog_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    INDEX `BroadcastLog_tenantId_sessionId_startedAt_idx`(`tenantId`, `sessionId`, `startedAt`),
    INDEX `BroadcastLog_sessionId_idx`(`sessionId`),
    INDEX `BroadcastLog_sessionId_startedAt_idx`(`sessionId`, `startedAt`),
    INDEX `BroadcastLog_status_claimedAt_idx`(`status`, `claimedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BroadcastRecipient` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `broadcastLogId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `claimToken` VARCHAR(191) NULL,
    `claimedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NULL,

    INDEX `BroadcastRecipient_tenantId_broadcastLogId_status_idx`(`tenantId`, `broadcastLogId`, `status`),
    INDEX `BroadcastRecipient_tenantId_status_claimedAt_idx`(`tenantId`, `status`, `claimedAt`),
    INDEX `BroadcastRecipient_tenantId_status_nextAttemptAt_idx`(`tenantId`, `status`, `nextAttemptAt`),
    INDEX `BroadcastRecipient_broadcastLogId_status_idx`(`broadcastLogId`, `status`),
    INDEX `BroadcastRecipient_status_claimedAt_idx`(`status`, `claimedAt`),
    INDEX `BroadcastRecipient_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppSendThrottle` (
    `sessionId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `nextAllowedAt` DATETIME(3) NULL,
    `leaseToken` VARCHAR(191) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WhatsAppSendThrottle_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    INDEX `WhatsAppSendThrottle_leaseUntil_idx`(`leaseUntil`),
    PRIMARY KEY (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhatsAppSessionLease` (
    `sessionId` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `leaseToken` VARCHAR(191) NOT NULL,
    `fencingToken` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WhatsAppSessionLease_tenantId_sessionId_idx`(`tenantId`, `sessionId`),
    INDEX `WhatsAppSessionLease_leaseUntil_idx`(`leaseUntil`),
    INDEX `WhatsAppSessionLease_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboundMessageOperation` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionDbId` VARCHAR(191) NOT NULL,
    `whatsappSessionId` VARCHAR(191) NOT NULL,
    `jid` VARCHAR(255) NOT NULL,
    `idempotencyKeyHash` CHAR(64) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `claimToken` VARCHAR(191) NULL,
    `claimedAt` DATETIME(3) NULL,
    `claimExpiresAt` DATETIME(3) NULL,
    `resultMessageKey` VARCHAR(191) NULL,
    `failureCode` VARCHAR(128) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `outbound_op_queue_idx`(`status`, `availableAt`),
    INDEX `outbound_op_tenant_session_idx`(`tenantId`, `sessionDbId`, `createdAt`),
    INDEX `outbound_op_tenant_user_session_idx`(`tenantId`, `userId`, `sessionDbId`, `createdAt`),
    INDEX `outbound_op_session_idx`(`sessionDbId`, `createdAt`),
    INDEX `outbound_op_user_session_idx`(`userId`, `sessionDbId`, `createdAt`),
    UNIQUE INDEX `outbound_op_idempotency_uq`(`userId`, `sessionDbId`, `idempotencyKeyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TenantMembership` ADD CONSTRAINT `TenantMembership_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantMembership` ADD CONSTRAINT `TenantMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantInvitation` ADD CONSTRAINT `TenantInvitation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TenantSettings` ADD CONSTRAINT `TenantSettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceGrant` ADD CONSTRAINT `ResourceGrant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceGrant` ADD CONSTRAINT `ResourceGrant_principalUserId_fkey` FOREIGN KEY (`principalUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceGrant` ADD CONSTRAINT `ResourceGrant_grantedBy_fkey` FOREIGN KEY (`grantedBy`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiCredential` ADD CONSTRAINT `ApiCredential_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiCredential` ADD CONSTRAINT `ApiCredential_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAccessEvent` ADD CONSTRAINT `AdminAccessEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAccessEvent` ADD CONSTRAINT `AdminAccessEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailVerificationToken` ADD CONSTRAINT `EmailVerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Group` ADD CONSTRAINT `Group_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Group` ADD CONSTRAINT `Group_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoReply` ADD CONSTRAINT `AutoReply_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AutoReply` ADD CONSTRAINT `AutoReply_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Story` ADD CONSTRAINT `Story_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Story` ADD CONSTRAINT `Story_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScheduledMessage` ADD CONSTRAINT `ScheduledMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthState` ADD CONSTRAINT `AuthState_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Webhook` ADD CONSTRAINT `Webhook_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Webhook` ADD CONSTRAINT `Webhook_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Webhook` ADD CONSTRAINT `Webhook_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookLog` ADD CONSTRAINT `WebhookLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookLog` ADD CONSTRAINT `WebhookLog_webhookId_fkey` FOREIGN KEY (`webhookId`) REFERENCES `Webhook`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InboundEvent` ADD CONSTRAINT `InboundEvent_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InboundEvent` ADD CONSTRAINT `InboundEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InboundEvent` ADD CONSTRAINT `InboundEvent_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InboundEvent` ADD CONSTRAINT `InboundEvent_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `ProcessingResult`(`resultId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessingResult` ADD CONSTRAINT `ProcessingResult_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessingResult` ADD CONSTRAINT `ProcessingResult_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessingResult` ADD CONSTRAINT `ProcessingResult_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotConfig` ADD CONSTRAINT `BotConfig_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BotConfig` ADD CONSTRAINT `BotConfig_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Label` ADD CONSTRAINT `Label_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatLabel` ADD CONSTRAINT `ChatLabel_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatLabel` ADD CONSTRAINT `ChatLabel_labelId_fkey` FOREIGN KEY (`labelId`) REFERENCES `Label`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionAccess` ADD CONSTRAINT `SessionAccess_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionAccess` ADD CONSTRAINT `SessionAccess_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SessionAccess` ADD CONSTRAINT `SessionAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthClient` ADD CONSTRAINT `OAuthClient_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthClient` ADD CONSTRAINT `OAuthClient_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationRequest` ADD CONSTRAINT `OAuthAuthorizationRequest_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationRequest` ADD CONSTRAINT `OAuthAuthorizationRequest_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationRequest` ADD CONSTRAINT `OAuthAuthorizationRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAuthorizationCode` ADD CONSTRAINT `OAuthAuthorizationCode_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthAccessToken` ADD CONSTRAINT `OAuthAccessToken_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthRefreshToken` ADD CONSTRAINT `OAuthRefreshToken_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrant` ADD CONSTRAINT `OAuthGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrantSessionCapability` ADD CONSTRAINT `OAuthGrantSessionCapability_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrantSessionCapability` ADD CONSTRAINT `OAuthGrantSessionCapability_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OAuthGrantSessionCapability` ADD CONSTRAINT `OAuthGrantSessionCapability_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OIDCIdentity` ADD CONSTRAINT `OIDCIdentity_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BroadcastLog` ADD CONSTRAINT `BroadcastLog_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BroadcastRecipient` ADD CONSTRAINT `BroadcastRecipient_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BroadcastRecipient` ADD CONSTRAINT `BroadcastRecipient_broadcastLogId_fkey` FOREIGN KEY (`broadcastLogId`) REFERENCES `BroadcastLog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WhatsAppSendThrottle` ADD CONSTRAINT `WhatsAppSendThrottle_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WhatsAppSessionLease` ADD CONSTRAINT `WhatsAppSessionLease_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OutboundMessageOperation` ADD CONSTRAINT `OutboundMessageOperation_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
