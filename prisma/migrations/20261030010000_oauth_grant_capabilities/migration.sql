ALTER TABLE `OAuthAuthorizationRequest` ADD COLUMN `operationAllowlist` JSON NULL;
ALTER TABLE `OAuthAuthorizationCode` ADD COLUMN `operationAllowlist` JSON NULL;
ALTER TABLE `OAuthAccessToken` ADD COLUMN `operationAllowlist` JSON NULL;
ALTER TABLE `OAuthRefreshToken` ADD COLUMN `operationAllowlist` JSON NULL;
