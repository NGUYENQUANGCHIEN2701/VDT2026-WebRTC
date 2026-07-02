-- V6: Track wrong-guess attempts against email verification OTPs.

ALTER TABLE email_verification_tokens
    ADD COLUMN attempts INT NOT NULL DEFAULT 0;
