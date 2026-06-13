-- V2: Seed the initial admin account.
-- password_hash is a freshly generated BCrypt(strength 10) hash of the plaintext 'Admin@123'.
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@vdt.local', '$2b$10$IcoaIpd/UG3FVpYxAPs.VeMx/DTOV3wArWrpJ1NjNTh7h8qBnbthm', 'ADMIN');
