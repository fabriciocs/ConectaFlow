-- Additive durable receipt for idempotent inbound WhatsApp events.
CREATE TABLE `ProcessingResult` (
    `id` VARCHAR(191) NOT NULL,
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
    UNIQUE INDEX `processing_result_event_job_uq`(`eventId`, `jobId`),
    INDEX `processing_result_session_status_idx`(`sessionId`, `status`, `createdAt`),
    INDEX `processing_result_session_modality_idx`(`sessionId`, `modality`, `createdAt`),
    INDEX `processing_result_public_session_idx`(`sessionPublicId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `InboundEvent` (
    `id` VARCHAR(191) NOT NULL,
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
    UNIQUE INDEX `inbound_event_source_uq`(`sessionId`, `eventType`, `originalMessageId`),
    INDEX `inbound_event_queue_idx`(`status`, `availableAt`),
    INDEX `inbound_event_session_idx`(`sessionId`, `receivedAt`),
    INDEX `inbound_event_job_idx`(`jobId`),
    INDEX `inbound_event_result_idx`(`resultId`),
    INDEX `inbound_event_message_idx`(`messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `InboundEvent`
    ADD CONSTRAINT `InboundEvent_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `InboundEvent`
    ADD CONSTRAINT `InboundEvent_messageId_fkey`
    FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ProcessingResult`
    ADD CONSTRAINT `ProcessingResult_sessionId_fkey`
    FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProcessingResult`
    ADD CONSTRAINT `ProcessingResult_messageId_fkey`
    FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `InboundEvent`
    ADD CONSTRAINT `InboundEvent_resultId_fkey`
    FOREIGN KEY (`resultId`) REFERENCES `ProcessingResult`(`resultId`) ON DELETE SET NULL ON UPDATE CASCADE;
