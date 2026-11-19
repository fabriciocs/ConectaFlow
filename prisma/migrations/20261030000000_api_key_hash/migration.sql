-- Additive API credential hardening.
-- Existing plaintext User.apiKey values remain temporarily for lazy migration by
-- the application on their next successful header-authenticated use. The API
-- never returns those values; new credentials are stored only as SHA-256 hashes.
ALTER TABLE `User`
    ADD COLUMN `apiKeyHash` VARCHAR(191) NULL,
    ADD COLUMN `apiKeyPrefix` VARCHAR(191) NULL,
    ADD COLUMN `apiKeyCreatedAt` DATETIME(3) NULL,
    ADD COLUMN `apiKeyLastUsedAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `User_apiKeyHash_key` ON `User`(`apiKeyHash`);
