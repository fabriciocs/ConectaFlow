-- Additive distributed ownership lease for one Baileys worker per session.
CREATE TABLE `WhatsAppSessionLease` (
    `sessionId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `leaseToken` VARCHAR(191) NOT NULL,
    `fencingToken` INTEGER NOT NULL DEFAULT 0,
    `leaseUntil` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WhatsAppSessionLease_leaseUntil_idx`(`leaseUntil`),
    INDEX `WhatsAppSessionLease_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`sessionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
