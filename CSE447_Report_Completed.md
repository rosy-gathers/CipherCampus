# Department of Computer Science and Engineering

**Course:** CSE447: Cryptography and Cryptanalysis
**Semester:** Spring 2026
**Project Report**

**Title:** CipherCampus — A Secure Academic Collaboration and Anonymous Reporting Platform

**Submitted To:** [Instructor Name]
**Group No:** [Group Number]
**Section:** [Section]
**Submission Date:** [DD Month YYYY]

## Group Members

| No. | Full Name | Student ID |
|---|---|---|
| 1 | [Member 1 Full Name] | [Member 1 Student ID] |
| 2 | [Member 2 Full Name] | [Member 2 Student ID] |
| 3 | [Member 3 Full Name] | [Member 3 Student ID] |

---

## Table of Contents

1. Introduction and System Overview
2. Login and Registration Module
3. User Data Encryption and Decryption
4. Password Hashing and Salting
5. Two-Factor Authentication (2FA)
6. Key Management Module
7. Post and Profile Management
8. Data Storage Security
9. Message Authentication Code (MAC)
10. Role-Based Access Control (RBAC)
11. Secure Session Management
12. GitHub Repository and Project Structure
13. Conclusion

---

## 1. Introduction and System Overview

This report documents the design, implementation, and security analysis of **CipherCampus**, the CSE447 Lab Project. CipherCampus is a secure web application that integrates multiple cryptographic protocols required by the course specification. **All encryption algorithms (RSA, ECC, HMAC-SHA-256, password hashing) are implemented from scratch in JavaScript inside the `backend/crypto/` folder.** No built-in framework cryptographic primitive (`jsonwebtoken`, `bcrypt`, `crypto.createHash`, `crypto.createCipheriv`, etc.) is used in any source file; the only `crypto`/auth dependencies the project relies on are transitive ones inside `nodemailer` and the MySQL driver, neither of which is invoked for application-level encryption.

### 1.1 Project Overview

CipherCampus is targeted at students and administrators in a university environment. The platform provides:

- **Secure registration and two-step (2FA) login** for every account.
- **Encrypted public feed**, where every post is encrypted at rest and integrity-protected with HMAC.
- **End-to-end style private messaging** between two users via Elliptic-Curve cryptography.
- **Encrypted document vault**: users can upload files that are encrypted on the server before persistence and only decrypted on download for the owner.
- **Anonymous reporting** to administrators with HMAC integrity protection.
- **Administrator dashboard** for user management, key rotation, key fingerprint inspection, and report triage.
- **Self-service key rotation** that re-encrypts the user's email, documents, and messages with the new key pair inside a single database transaction.

### 1.2 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, React Router, Axios |
| Backend | Node.js (Express 4) |
| Database | MySQL (via `mysql2`) |
| Email transport (2FA) | `nodemailer` (Gmail) |
| File upload | `multer` (disk storage, then encrypted in place) |
| Misc. | `cors`, `cookie-parser`, `dotenv` |
| **Custom cryptography (from scratch)** | RSA, ECC (ECIES-style), SHA-256, HMAC-SHA-256, salted password hash, signed-token module, password-derived private-key wrapping, system key persistence |

`bcrypt`, `jsonwebtoken`, and any other built-in cryptographic helper have been deliberately removed from `package.json` so the dependency tree itself reflects the "no built-in crypto" rule.

### 1.3 System Architecture

```
┌────────────────────────┐                ┌─────────────────────────────────────┐
│  React frontend (3000) │  ───── HTTPS/JSON ─────▶  Express API (port 5000)   │
│  Axios with credentials│  ◀────  cookie/JWT ────                              │
└────────────────────────┘                │   ┌────────────────────────────┐    │
                                          │   │  authMiddleware + RBAC     │    │
                                          │   └────────────────────────────┘    │
                                          │   ┌────────────────────────────┐    │
                                          │   │  Controllers               │    │
                                          │   │  auth / post / message /   │    │
                                          │   │  document / report / admin │    │
                                          │   └────────────────────────────┘    │
                                          │   ┌────────────────────────────┐    │
                                          │   │  Crypto modules            │    │
                                          │   │  rsa.js  ecc.js  hmac.js   │    │
                                          │   │  hash.js keyManager.js     │    │
                                          │   │  token.js sessionVault.js  │    │
                                          │   │  systemKeys.js             │    │
                                          │   └────────────────────────────┘    │
                                          │            │                        │
                                          │            ▼                        │
                                          │   ┌────────────────────────────┐    │
                                          │   │ MySQL  (encrypted columns) │    │
                                          │   │ uploads/ (enc_*.enc files) │    │
                                          │   └────────────────────────────┘    │
                                          └─────────────────────────────────────┘
```

[Insert generated architecture/flow diagram here.]

---

## 2. Login and Registration Module

The system provides secure registration and login flows. New users supply credentials which are validated, encrypted, and persisted. During login, stored encrypted data is retrieved and decrypted for verification. A second authentication factor is enforced **before** the session token is issued.

### 2.1 Registration Flow

1. The user submits `username`, `email`, `password`, and optional profile fields (`fullName`, `phone`, `department`, `bio`) via `POST /api/auth/register`.
2. The backend computes deterministic `simpleHash(username)` and `simpleHash(email)` and uses them as uniqueness keys in the `users` table (so the **plaintext** username/email is never stored, even in the index columns).
3. The password is **salted with a 16-character random alphanumeric salt** and hashed using the project's from-scratch hash function (`SecureHash.hashPassword`).
4. Two asymmetric key pairs are generated:
   - **RSA** key pair (for at-rest data such as email, profile fields, posts, documents, reports).
   - **ECC** key pair (for messaging).
5. Each private key is wrapped with `KeyManager.encryptPrivateKey(privateKey, password)`, a password-derived stream cipher (XOR with `simpleHash(password)`). The wrapped private keys are stored in `rsa_private_key_encrypted` and `ecc_private_key_encrypted`.
6. Identity and profile fields are RSA-encrypted before insert:
   - `username` is encrypted with the **system RSA public key** (so the server feed can show display names without unlocking each user's key).
   - `email`, `fullName`, `phone`, `department`, `bio` are encrypted with the **user's own RSA public key** (so only the owner's session can read them).
7. The completed row is inserted into `users`.

### 2.2 Login Flow

1. The user submits username/email + password to `POST /api/auth/login`.
2. The user row is fetched by hashed identity (`simpleHash` of normalized input).
3. Password is verified with `SecureHash.verifyPassword(stored_salt, input)`.
4. The login password is used to **decrypt the wrapped RSA and ECC private keys**. If decryption fails, the login is rejected with the same generic error as a wrong password (so the password failure and the key failure look identical to a bystander).
5. The user's RSA private key is used in-memory to decrypt the email field, which is required for the OTP delivery.
6. A 6-digit OTP is generated, stored in an in-memory map keyed by user ID with a 10-minute expiry, and emailed via `nodemailer`. The unlocked private keys are also placed in this map so the second-factor step can promote them into the session vault.
7. The user submits `userId + otp` to `POST /api/auth/verify-2fa`. On success:
   - A signed token is generated by the from-scratch `crypto/token.js` module.
   - The SHA-256 hash of the token (computed by the from-scratch `HMAC.sha256`) is stored in the `sessions` table together with `ip_address`, `user_agent`, and `expires_at`.
   - The unlocked private keys are stored in the in-memory `sessionVault` keyed by `userId`.
   - The token is set both in an `httpOnly` cookie and in the JSON response so the frontend can store it.

### 2.3 Implementation Details

| Requirement | Implementation Details |
|---|---|
| Login Module | Two-step: password verification + email OTP. Tokens are issued only after both factors pass. Tokens are signed with **HMAC-SHA-256 using the project's own HMAC class**, not `jsonwebtoken`. |
| Registration Module | `POST /api/auth/register`. Validates duplicate username/email by deterministic hash, salts and hashes the password, generates RSA + ECC key pairs, wraps private keys with the password, encrypts identity/profile fields, inserts into `users`. |
| Data Encrypted Before Storage | `users.encrypted_username` (system RSA), `users.encrypted_email` / `_full_name` / `_phone` / `_department` / `_bio` (user RSA); `users.rsa_private_key_encrypted`, `users.ecc_private_key_encrypted` (password-wrapped); `posts.encrypted_content` (system RSA); `messages.encrypted_message` (ECC ECIES); `documents` payload (user RSA, on disk under `uploads/enc_*.enc`); `reports.encrypted_report` (system RSA). |
| Data Decrypted on Retrieval | Server-side at every read endpoint, using either the system RSA private key (feed/posts/reports/admin user listing) or the requester's session-cached private key (`sessionVault`) for personally-encrypted fields. Plaintext is never persisted, never sent over the wire to other users, and is purged from the vault on logout. |

---

## 3. User Data Encryption and Decryption

All sensitive user information is encrypted with from-scratch asymmetric algorithms before storage and decrypted on retrieval.

### 3.1 Fields Encrypted

| Database column | Algorithm | Key used |
|---|---|---|
| `users.encrypted_username` | RSA | System RSA key pair |
| `users.encrypted_email` | RSA | User's RSA key pair |
| `users.encrypted_full_name` | RSA | User's RSA key pair |
| `users.encrypted_phone` | RSA | User's RSA key pair |
| `users.encrypted_department` | RSA | User's RSA key pair |
| `users.encrypted_bio` | RSA | User's RSA key pair |
| `users.rsa_private_key_encrypted` | Password-derived stream cipher (KeyManager) | `simpleHash(password)` |
| `users.ecc_private_key_encrypted` | Password-derived stream cipher (KeyManager) | `simpleHash(password)` |
| `posts.encrypted_content` | RSA | System RSA key pair (so anyone in the feed can read it server-side without unlocking each author's key) |
| `messages.encrypted_message` | ECC (ECIES with ephemeral key + XOR stream over shared secret) | Receiver's ECC public key + sender's copy under sender's ECC public key |
| `documents` (file content on disk) | RSA | Owner's RSA key pair |
| `reports.encrypted_report` | RSA | System RSA key pair (admin-only API) |

### 3.2 Encryption Algorithm — RSA (from scratch)

File: `backend/crypto/rsa.js`.

- **Key generation:** two distinct primes `p`, `q` are generated via deterministic primality testing; `n = p·q`, `φ(n) = (p-1)(q-1)`. Public exponent `e` is fixed to `65537` and incremented if it is not coprime with `φ(n)`. The private exponent `d` is computed via the Extended Euclidean Algorithm (`modInverse`).
- **Encryption / Decryption:** classic textbook RSA: `c = m^e mod n` and `m = c^d mod n`, computed with our own square-and-multiply `modPow` over `BigInt`.
- **Encoding:** the plaintext is encrypted character-by-character (`charCodeAt`) and the resulting integers are joined with commas. This simple ECB-of-characters scheme is intentionally pedagogical and is documented as such — production systems would use OAEP padding and a much larger modulus.
- **Where it is used:** see the table in §3.1. Both the **system RSA key pair** (persisted in `backend/config/system_rsa_*.json` by `systemKeys.js`) and **per-user RSA key pairs** (stored in `users.rsa_public_key` and `users.rsa_private_key_encrypted`) are RSA pairs produced by this module.

### 3.3 Encryption Algorithm — ECC (from scratch)

File: `backend/crypto/ecc.js`.

- **Curve:** small Weierstrass curve `y² = x³ + a·x + b mod p` with `p = 23, a = 1, b = 1`, base point `G = (5, 7)`. The choice of toy parameters is deliberate so that the math is human-checkable in the code review; a real deployment would substitute a NIST curve such as P-256.
- **Operations:** `inverseMod`, `pointAdd`, double-and-add `scalarMult`, `generateKeyPair`, `generateSharedSecret`.
- **Encryption scheme (ECIES-style):**
  1. Generate an ephemeral key pair `(ek, eK)`.
  2. Compute the shared secret `S = ek · receiverPub` (and use `S.x` as the symmetric key material).
  3. XOR each character of the plaintext with the digits of `S.x` to produce the ciphertext.
  4. Output `{ ciphertext, ephemeralPublicKey: eK }`.
- **Decryption:** receiver computes the same `S` via `S = receiverPriv · eK` and XORs the ciphertext back to plaintext.
- **Why this is asymmetric:** the data-confidentiality guarantee comes from ECDH (an asymmetric key-agreement primitive), not from the XOR step. This is the same construction used by ECIES in real cryptosystems; the XOR step is the standard hybrid component on top of the asymmetric handshake.

### 3.4 How Both Algorithms Are Used Differently

| Module | Algorithm | Reason |
|---|---|---|
| User profile fields, posts, documents, reports | **RSA** | The data is encrypted to a **single recipient** (the owner, or "the system" for public posts). RSA's recipient-key model is the most natural fit. |
| Direct messages between two users | **ECC** | Each chat message has **two recipients** (sender and receiver, so both can re-read history). ECIES's ephemeral-key construction is much smaller per-message than two RSA encryptions and demonstrates a second asymmetric primitive. |

This satisfies the requirement that **at least two different asymmetric algorithms** must be used, and that **a single algorithm is not used for all encryption operations**.

---

## 4. Password Hashing and Salting

Passwords are never stored in plaintext. A salted hash is computed before storage, and the verification path re-derives the same hash to compare.

### 4.1 Hashing Algorithm Used

- File: `backend/crypto/hash.js`.
- The project uses a custom hash function (`SecureHash.simpleHash`) implemented from scratch. It does not invoke `crypto.createHash`, `bcrypt`, `argon2`, or any other framework helper.
- The same module also exposes a from-scratch SHA-256 implementation through `crypto/hmac.js → HMAC.sha256(...)`, which has been validated against the official NIST SHA-256 test vectors:
  - `sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` ✓
  - `sha256("")   = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` ✓

### 4.2 Salt Generation

- Salt is generated by `SecureHash.generateSalt(length)` from the alphanumeric set `[a–zA–Z0–9]`.
- Default length is **16 characters** (`saltLength = 16`).
- The salt is stored in its own column (`users.password_salt`) alongside the hash (`users.password_hash`). This means each user has a **unique salt**, defeating rainbow tables and ensuring identical passwords produce different hashes.

### 4.3 Verification Process

1. On login, fetch `password_salt` and `password_hash` for the user.
2. Compute `hash = simpleHash(salt || inputPassword)`.
3. Compare with stored `password_hash`. Equal → password is correct; otherwise reject with a generic "Invalid credentials" message (no oracle on whether the user exists).
4. If verification succeeds, the same password is fed to `KeyManager.decryptPrivateKey(...)` to unlock the wrapped private keys. A failure here also returns the generic error message — there is no separate "wrong password / corrupted keys" branch exposed to the client.

---

## 5. Two-Factor Authentication (2FA)

The system enforces **two-step verification**: the user must pass both primary credential validation **and** a second authentication factor before any session token is issued. The `verify2FA` controller is the verification function required by the spec.

### 5.1 2FA Method

- **Method:** Email OTP (One-Time Password).
- **Issuance:** After password + key-unlock succeed, a 6-digit decimal OTP is generated and stored in an in-memory map (`otpStore`) keyed by `user.id`. Each entry holds:
  - the OTP itself,
  - an `expires` timestamp set 10 minutes in the future,
  - the unlocked RSA + ECC private keys,
  - the user's actual email,
  - a `lastSentAt` timestamp used to enforce a 30-second resend cooldown.
- **Delivery:** `nodemailer` (Gmail transporter, credentials from `.env`). If email delivery fails, the OTP is logged to the server console as a controlled fallback for development only.
- **Resend:** `POST /api/auth/resend-otp` regenerates the OTP and resets the timer, but only after the cooldown.
- **Verification:** `POST /api/auth/verify-2fa` checks expiry, compares the OTP, and only then issues the session token and stores keys in the session vault. A correct password by itself is **never** enough to access any protected route.

### 5.2 Code Snippet

Authoritative path (server-side):

```javascript
// backend/controllers/authController.js (excerpt)
const verify2FA = async (req, res) => {
    const { userId, otp } = req.body;
    const stored = otpStore.get(parseInt(userId));
    if (!stored)               return res.status(401).json({ error: '2FA session expired. Please login again.' });
    if (Date.now() > stored.expires) return res.status(401).json({ error: 'OTP expired. Please login again.' });
    if (stored.otp !== otp)    return res.status(401).json({ error: 'Invalid OTP.' });

    const token     = generateToken(parseInt(userId), { jti: generateJti() });
    const tokenHash = hashToken(token);
    sessionVault.storeKeys(userId, stored.keys);

    await db.query(
        'INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)',
        [userId, tokenHash, getClientIp(req), getUserAgentSignature(req), new Date(Date.now() + SESSION_DURATION_MS)]
    );
    otpStore.delete(parseInt(userId));
    res.cookie('accessToken', token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DURATION_MS });
    res.json({ message: 'Login successful.', token, user: { /* ... decrypted fields ... */ } });
};
```

---

## 6. Key Management Module

A dedicated **Key Management Module** (`backend/crypto/keyManager.js` + `backend/crypto/systemKeys.js` + `backend/crypto/sessionVault.js` + `backend/controllers/keyController.js`) handles the full lifecycle of cryptographic keys: generation, distribution, storage, and rotation.

### 6.1 Key Storage Security

There are **three** distinct key stores in the system:

1. **Per-user keys (`users` table).**
   - Public keys (`rsa_public_key`, `ecc_public_key`) are stored as JSON strings in the clear (public keys do not need confidentiality).
   - Private keys (`rsa_private_key_encrypted`, `ecc_private_key_encrypted`) are wrapped with `KeyManager.encryptPrivateKey(privateKey, password)`. The wrapping key is derived from the user's password via `simpleHash(password)`, so the database alone cannot decrypt them.
2. **System keys (`backend/config/system_rsa_*.json`).**
   - A single RSA key pair is generated on first server start by `systemKeys.js` and persisted to disk.
   - This key pair encrypts the public feed (`posts.encrypted_content`), the system-readable display names (`users.encrypted_username`), and the anonymous-report channel (`reports.encrypted_report`).
3. **Live session vault (in-memory).**
   - On successful 2FA, the unlocked RSA and ECC private keys are placed in a singleton `Map` inside `sessionVault.js` and **never** sent to the frontend.
   - Frontend never sees a private key in any form.
   - Vault entries are purged on logout, on password reset, and automatically after 24 hours of inactivity (a `setInterval` cleanup runs hourly).

### 6.2 Key Distribution

`backend/controllers/keyController.js` exposes three endpoints:

- `GET /api/keys/me` — returns the requester's own public keys, key fingerprints, and rotation status.
- `GET /api/keys/users/:userId` — returns another user's public keys for use as a recipient (e.g., when computing message ciphertexts).
- `GET /api/keys/admin/overview` — admin-only listing of every user's public key fingerprints and rotation lifecycle.

Public-key fingerprints are computed with the from-scratch SHA-256 (`HMAC.sha256(...)`) so administrators can compare keys without reading their full content.

### 6.3 Key Rotation Policy

- `KeyManager.keyRotationDays = 30` defines the rotation policy. `KeyManager.needsRotation(date)` returns `true` whenever the last rotation (or, for never-rotated users, the account creation date) is older than 30 days.
- The endpoint `POST /api/admin/rotate-keys/:userId` performs an **end-to-end transactional re-key**:
  1. Verifies the requester is rotating **their own** account (administrators do not know other users' passwords).
  2. Verifies the supplied current password.
  3. Decrypts the existing wrapped RSA + ECC private keys with the current password.
  4. Generates a new RSA + ECC key pair.
  5. **Re-encrypts all data the user can read with the new keys**, inside a single MySQL transaction:
      - `users.encrypted_email`,
      - every owned document file under `uploads/enc_*.enc`,
      - every chat message where the user is sender (`sx` blob) or receiver (`rx` blob).
  6. Writes two rows to `key_rotation_log` (one for `rsa`, one for `ecc`) with the SHA-256 fingerprint (from-scratch) of the old and new private keys.
  7. Commits the transaction. If any step fails, the entire rotation is rolled back and no data is left in an inconsistent state.

The rotation flow proves that **key rotation is implemented end-to-end**, including re-encryption of historical data.

---

## 7. Post and Profile Management

### 7.1 Post Module

- **Endpoints:**
  - `POST /api/posts` — create a post.
  - `GET /api/posts` — public feed.
  - `PUT /api/posts/:id` — edit own post (admins can also only edit their own posts; this is enforced explicitly by the controller).
  - `DELETE /api/posts/:id` — delete own post; admins may delete any post.
- **Encryption:** plaintext content is encrypted with the **system RSA public key** and stored in `posts.encrypted_content`. This allows the public feed view to decrypt every post server-side without having to unlock individual user vaults, while still preventing plaintext access from a raw database dump.
- **Integrity:** a from-scratch HMAC-SHA-256 over the plaintext is stored in `posts.content_hmac`. On read, the HMAC is recomputed and exposed as `validIntegrity` in the API response so the UI can mark tampered rows.

### 7.2 Profile Module

- **Endpoints:**
  - `GET /api/auth/profile` — returns the decrypted profile.
  - `PUT /api/auth/profile` — updates and re-encrypts the profile.
  - `PUT /api/auth/reset-password` — re-wraps the user's private keys under a new password.
  - `DELETE /api/auth/account` — destroys the account and all owned encrypted artefacts.
- **Encrypted profile fields:** `encrypted_username`, `encrypted_email`, `encrypted_full_name`, `encrypted_phone`, `encrypted_department`, `encrypted_bio`. Any field set during registration or profile edit is RSA-encrypted before the row is written; reading the profile uses the session vault's RSA private key for the personal fields and the system RSA private key for the username display.
- **Identity hashes:** `users.username` and `users.email` columns store deterministic hashes (`simpleHash`) so `username/email` uniqueness can be enforced without storing the plaintext.

### 7.3 Screenshots

[Insert screenshots from the running system showing: (a) the post creation page, (b) the post feed/list page, (c) the profile view/update page.]

---

## 8. Data Storage Security

All critical data — user information, posts, messages, documents, reports, and private keys — is stored in encrypted form. A read of the database alone (without access to either the system key file or each individual user's password) will not yield any sensitive plaintext.

### 8.1 Evidence of Encrypted Storage

Encrypted columns / files in production rows include:

- `users.encrypted_username`, `users.encrypted_email`, `users.encrypted_full_name`, `users.encrypted_phone`, `users.encrypted_department`, `users.encrypted_bio`
- `users.rsa_private_key_encrypted`, `users.ecc_private_key_encrypted`
- `posts.encrypted_content` + `posts.content_hmac`
- `messages.encrypted_message` + `messages.message_hmac`
- `documents.encrypted_file_path` (pointing to an `uploads/enc_*.enc` file whose contents are RSA-encrypted Base64)
- `reports.encrypted_report` (Base64-wrapped to survive MySQL TEXT round-trips)
- `key_rotation_log.old_key_hash`, `key_rotation_log.new_key_hash`

[Insert screenshots of `SELECT * FROM users LIMIT 3`, `SELECT * FROM posts LIMIT 3`, and `SELECT * FROM messages LIMIT 3` to demonstrate that every sensitive column contains ciphertext rather than plaintext.]

---

## 9. Message Authentication Code (MAC)

### 9.1 MAC Algorithm Used

- **Algorithm:** **HMAC-SHA-256**, implemented entirely from scratch in `backend/crypto/hmac.js`.
- The module includes:
  - A full SHA-256 round (constants `K[0..63]`, initial hash values `H[0..7]`, message scheduling, `Σ0/Σ1/σ0/σ1`, choice and majority functions, and 64 compression rounds).
  - The standard HMAC inner/outer-pad construction: `HMAC(K, M) = SHA256( (K ⊕ opad) || SHA256( (K ⊕ ipad) || M ) )`, with a block size of 64 bytes.
- **Why HMAC, not CBC-MAC?** HMAC composes naturally with our hash function (which we already implement from scratch), is provably secure under the standard random-oracle / weak-collision-resistance assumption on SHA-256, and avoids the length-extension and message-length issues of plain CBC-MAC.
- Each integrity-protected resource uses its own HMAC key string (`'ciphercampus_secret_key_for_hmac'`, `'ciphercampus_document_secret'`, `'ciphercampus_report_secret'`), so a forgery against one resource cannot trivially be replayed against another.

### 9.2 Integrity Verification Flow

| Resource | Verification point | What the API exposes |
|---|---|---|
| Posts (`posts.content_hmac`) | When the public feed is read | Each post in the JSON response includes `validIntegrity: true/false` |
| Messages (`messages.message_hmac`) | After ECC decryption per message | Each message in the chat history includes `validIntegrity` |
| Documents (`documents.file_hmac`) | Before serving a download | If the recomputed HMAC does not match the stored one, the API responds `400 — Integrity check failed. File may have been tampered with.` and refuses to send the file |
| Reports (`reports.report_hmac`) | When admin reads the report queue | Each report includes `validIntegrity` |

This gives administrators and users an **end-to-end tamper indicator**: any unauthorized DB-level modification will flip the `validIntegrity` flag from `true` to `false`, while an accidental file-system corruption of an encrypted document will block the download entirely.

---

## 10. Role-Based Access Control (RBAC)

RBAC is enforced through the `users.role` column (`ENUM('admin', 'user')`) plus the `backend/middleware/rbac.js` middleware.

### 10.1 Roles Defined

- **Admin** — supervises the platform: views all users, all reports, system stats, and key fingerprints; can rotate own keys and delete users; can also delete posts/documents that belong to other users (moderation power).
- **Regular User** — manages only their own data: creates/edits/deletes own posts, sends/reads own messages, uploads/downloads own documents, submits reports.

The `adminOnly` middleware is mounted at the router level (`app.use('/api/admin', authMiddleware, adminOnly, adminRoutes);`), so an unauthenticated or non-admin request never reaches an admin controller. Resource-level checks use `checkOwnership(req, ownerId)` inside individual controllers.

### 10.2 Permission Matrix

| Operation / Resource | Admin | Regular User |
|---|---|---|
| Register & log in (with 2FA) | ✓ | ✓ |
| View own profile | ✓ | ✓ |
| Edit own profile | ✓ | ✓ |
| Reset own password | ✓ | ✓ |
| Delete own account | ✓ | ✓ |
| Create / edit own posts | ✓ | ✓ |
| Edit other users' posts | ✗ (explicitly blocked, even for admins) | ✗ |
| Delete own post | ✓ | ✓ |
| Delete other users' posts | ✓ | ✗ |
| Send / read own messages | ✓ | ✓ |
| Upload / download / delete own documents | ✓ | ✓ |
| Delete other users' documents | ✓ | ✗ |
| Submit a report (anonymous or attributed) | ✓ | ✓ |
| View report queue | ✓ | ✗ |
| Update report status | ✓ | ✗ |
| View all user accounts | ✓ | ✗ |
| Delete a user account | ✓ | ✗ |
| View system statistics | ✓ | ✗ |
| View admin key-overview / fingerprints | ✓ | ✗ |
| Rotate own keys | ✓ | ✓ |
| Rotate **another** user's keys | ✗ (forbidden by design — admins do not know other users' passwords) | ✗ |

---

## 11. Secure Session Management

Authentication tokens and session identifiers are managed to defend against hijacking, fixation, and replay.

### 11.1 Token Issuance and Verification

- **Token generator:** `backend/crypto/token.js` (project-implemented; replaces `jsonwebtoken`).
- **Format:** `base64url(JSON-payload) || "." || HMAC-SHA-256(payload, server_secret)`. Payload contains `userId`, `iat`, `exp` (5 minutes after issuance), and a unique `jti`.
- **Signing:** uses the from-scratch HMAC class (`crypto/hmac.js`). The server secret is read from `process.env.JWT_SECRET` (with a non-secret development fallback constant).
- **Verification (`tokenLib.verifyToken`):**
  1. Splits the token; rejects malformed input.
  2. Recomputes the HMAC and compares against the supplied signature; mismatch → reject.
  3. Decodes the payload and rejects if `Date.now() > payload.exp`.

### 11.2 Server-Side Session Binding

- Every successful 2FA inserts a row into `sessions` with `(user_id, sha256(token), ip_address, user_agent, expires_at)`.
- The token sent to the client is the **plaintext** signed token; the **hash** is what is stored, so a database leak does not yield usable session tokens.
- `authMiddleware` for every protected request:
  1. Reads the token from the `Authorization` header or the `httpOnly` `accessToken` cookie.
  2. Verifies the signature (`tokenLib.verifyToken`).
  3. Looks up the `sha256(token)` in the `sessions` table; rejects if missing or expired.
  4. Compares the session's bound `ip_address` and `user_agent` against the current request; mismatch → row is deleted and the request is rejected (basic anti-hijack defence).
  5. Attaches the user record (`req.user`) and the session token + hash for downstream controllers.
- Logout (`POST /api/auth/logout`) deletes the session row, purges the `sessionVault`, and clears the `accessToken` cookie.
- Password reset and account deletion both purge the vault and remove the active session row, forcing a fresh login with the new credentials.

### 11.3 Cookie Hardening

The `accessToken` cookie is set with `httpOnly: true`, `sameSite: 'lax'`, and `secure: true` when `NODE_ENV === 'production'`, so client-side JavaScript cannot read the token and cross-site scripts cannot exfiltrate it.

---

## 12. GitHub Repository and Project Structure

| Field | Details |
|---|---|
| GitHub Repository URL | [https://github.com/your-username/CSE447_CipherCampus] |

### 12.1 Repository Structure

```
CSE447_CipherCampus/
├── backend/
│   ├── config/
│   │   ├── database.js                    # MySQL connection pool
│   │   ├── system_rsa_public.json         # Persisted system RSA public key
│   │   └── system_rsa_private.json        # Persisted system RSA private key
│   ├── controllers/
│   │   ├── authController.js              # register / login / 2FA / profile / reset / delete
│   │   ├── postController.js              # encrypted feed CRUD
│   │   ├── messageController.js           # ECC encrypted private chat
│   │   ├── documentController.js          # encrypted document vault
│   │   ├── reportController.js            # anonymous reporting
│   │   ├── adminController.js             # users, stats, key rotation
│   │   └── keyController.js               # key info / distribution / admin overview
│   ├── crypto/
│   │   ├── rsa.js                         # from-scratch RSA
│   │   ├── ecc.js                         # from-scratch ECC + ECIES
│   │   ├── hmac.js                        # from-scratch SHA-256 + HMAC
│   │   ├── hash.js                        # from-scratch salted password hash
│   │   ├── keyManager.js                  # key generation / wrapping / fingerprinting / rotation
│   │   ├── sessionVault.js                # in-memory unlocked-key cache
│   │   ├── systemKeys.js                  # persistent system RSA keys
│   │   └── token.js                       # from-scratch HMAC-signed session token
│   ├── middleware/
│   │   ├── auth.js                        # token + DB session + IP/UA binding
│   │   └── rbac.js                        # adminOnly, userOnly, checkOwnership
│   ├── routes/                            # one file per resource
│   ├── uploads/                           # enc_*.enc encrypted documents
│   ├── server.js                          # Express bootstrap
│   ├── init_db.js / test_db.js            # bootstrap helpers
│   └── package.json                       # express, mysql2, cors, multer, nodemailer, dotenv, cookie-parser
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/                    # Login, Register, Dashboard, Feed, Messages,
│       │                                  # Documents, Reports, Profile, AdminPanel, AppLayout
│       ├── services/                      # axios API client
│       ├── utils/
│       ├── App.js / index.js / index.css / aesthetic-theme.css
│       └── package.json
├── database/
│   └── schema.sql                         # full DDL with encrypted columns
├── CSE447 Lab Project Requirement [Spring-2026].pdf
├── CSE447.pdf                             # concept document
├── app_features.pdf                       # feature planning
└── CSE447_Report_Completed.md             # this report (md)
```

### 12.2 README Overview

The README at the project root summarises:

- **Project description** — what CipherCampus is and which CSE447 requirements it covers.
- **Setup instructions** — Node.js + MySQL + XAMPP prerequisites.
- **Environment variables** — `.env` keys needed (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASS`).
- **Database initialization** — `mysql -u root -p < database/schema.sql` (or run `node backend/init_db.js`).
- **Run instructions:**
  - Backend: `cd backend && npm install && npm start` (listens on `:5000`).
  - Frontend: `cd frontend && npm install && npm start` (listens on `:3000`).
- **Default admin account creation** and how to promote a user via the `users.role` column.

---

## 13. Conclusion

CipherCampus implements every functional requirement in the CSE447 specification: secure registration and login, encrypted user information, salted password hashing, two-factor authentication, a full key-management lifecycle, encrypted post and profile management, encrypted at-rest storage, MAC-based integrity, two distinct asymmetric algorithms (RSA and ECC) used in different parts of the system, role-based access control, and hardened session management. Every cryptographic primitive used by the application — RSA key generation and modular exponentiation, ECC point arithmetic and ECIES, SHA-256, HMAC, salted password hashing, signed session tokens, and password-derived private-key wrapping — is implemented from scratch under `backend/crypto/`. No built-in framework crypto helpers (`bcrypt`, `jsonwebtoken`, `crypto.createHash`, `crypto.createCipheriv`, …) are invoked anywhere in the source code.

The most valuable lessons from the project were (1) understanding why hybrid constructions like ECIES are necessary in practice — pure asymmetric encryption is impractical for arbitrary-length payloads — and (2) designing a key-rotation flow that re-encrypts all historical data inside a single transaction, which forced us to think carefully about partial-failure recovery. The toy-sized parameters used for RSA (16-bit primes) and ECC (curve over Z₂₃) are deliberate pedagogical choices so that the math is human-verifiable; replacing them with NIST-strength parameters would be the obvious next production step. Future work would also include OAEP padding for RSA, scrypt or Argon2 for password derivation, and a proper Diffie–Hellman ratchet for forward-secret messaging.

---
