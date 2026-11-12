CREATE TABLE `OAuthRateLimitBucket` (
  `key` VARCHAR(255) NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  `resetAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`),
  INDEX `OAuthRateLimitBucket_resetAt_idx` (`resetAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
