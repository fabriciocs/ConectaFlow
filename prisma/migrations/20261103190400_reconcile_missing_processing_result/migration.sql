-- Additive repair for a legacy database whose recorded 20261031000000 migration
-- lacks ProcessingResult physically. Existing tables and rows are not replaced.
CREATE TABLE IF NOT EXISTS `ProcessingResult` (
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
    PRIMARY KEY (`id`),
    CONSTRAINT `ProcessingResult_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ProcessingResult_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Restore the child reference only if it is missing. On databases already
-- migrated correctly, the statement is a no-op.
SET @wa_akg_result_fk_sql = (
    SELECT IF(
        COUNT(*) = 0,
        'ALTER TABLE `InboundEvent` ADD CONSTRAINT `InboundEvent_resultId_fkey` FOREIGN KEY (`resultId`) REFERENCES `ProcessingResult`(`resultId`) ON DELETE SET NULL ON UPDATE CASCADE',
        'SELECT 1'
    )
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'inboundevent'
      AND LOWER(COLUMN_NAME) = 'resultid'
      AND LOWER(REFERENCED_TABLE_NAME) = 'processingresult'
);
PREPARE wa_akg_result_fk_stmt FROM @wa_akg_result_fk_sql;
EXECUTE wa_akg_result_fk_stmt;
DEALLOCATE PREPARE wa_akg_result_fk_stmt;
