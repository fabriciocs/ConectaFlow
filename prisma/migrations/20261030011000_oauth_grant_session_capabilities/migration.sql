-- Additive normalized OAuth grants and per-session READ/WRITE capabilities.
-- operationAllowlist is added by the preceding OAuth capability migration.
ALTER TABLE `OAuthAuthorizationCode` ADD COLUMN `grantId` VARCHAR(191) NULL;
ALTER TABLE `OAuthAccessToken` ADD COLUMN `grantId` VARCHAR(191) NULL;
ALTER TABLE `OAuthRefreshToken` ADD COLUMN `grantId` VARCHAR(191) NULL;

CREATE TABLE `OAuthGrant` (
    `id` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `resource` TEXT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OAuthGrant_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `OAuthGrant_clientId_revokedAt_idx`(`clientId`, `revokedAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OAuthGrant_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `OAuthClient`(`clientId`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `OAuthGrant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OAuthGrantSessionCapability` (
    `id` VARCHAR(191) NOT NULL,
    `grantId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `capability` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `OAuthGrantSessionCapability_grantId_sessionId_key`(`grantId`, `sessionId`),
    INDEX `OAuthGrantSessionCapability_sessionId_capability_idx`(`sessionId`, `capability`),
    PRIMARY KEY (`id`),
    CONSTRAINT `OAuthGrantSessionCapability_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `OAuthGrantSessionCapability_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `OAuthAuthorizationCode_grantId_idx` ON `OAuthAuthorizationCode`(`grantId`);
CREATE INDEX `OAuthAccessToken_grantId_idx` ON `OAuthAccessToken`(`grantId`);
CREATE INDEX `OAuthRefreshToken_grantId_idx` ON `OAuthRefreshToken`(`grantId`);

ALTER TABLE `OAuthAuthorizationCode`
  ADD CONSTRAINT `OAuthAuthorizationCode_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OAuthAccessToken`
  ADD CONSTRAINT `OAuthAccessToken_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OAuthRefreshToken`
  ADD CONSTRAINT `OAuthRefreshToken_grantId_fkey` FOREIGN KEY (`grantId`) REFERENCES `OAuthGrant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
