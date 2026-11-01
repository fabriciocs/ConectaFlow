-- Repair additive schema drift from the original inbound receipt migration.
ALTER TABLE `InboundEvent`
    ADD COLUMN `messageId` VARCHAR(191) NULL;

CREATE INDEX `inbound_event_message_idx` ON `InboundEvent`(`messageId`);

ALTER TABLE `InboundEvent`
    ADD CONSTRAINT `InboundEvent_messageId_fkey`
    FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
