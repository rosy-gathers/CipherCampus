# CipherCampus (CSE447 Lab Project)

CipherCampus is a secure academic collaboration platform built for the CSE447 lab project.  
It demonstrates practical application-layer security with custom cryptographic modules and secure backend/frontend integration.

## Project Scope

The system includes:

- User registration and login
- Two-step authentication (password + OTP verification)
- Encrypted profile management
- Encrypted academic feed (create, view, edit posts)
- Encrypted messaging and document handling
- RBAC for administrator and regular users
- Key management and key rotation support
- Integrity verification with HMAC
- Session validation with token binding checks

## Security Design Mapping (CSE447 Requirements)

- **Registration, login, account management**: Implemented with dedicated auth routes and controllers.
- **Encrypt user information before storage**: User profile fields are encrypted before DB write and decrypted on retrieval.
- **Hash + salt passwords**: Passwords are stored as salted hashes (never plaintext).
- **Two-step verification**: OTP flow enforced before issuing authenticated session access.
- **Key management module**: User key generation, storage, and rotation logic implemented in crypto/key-management modules.
- **Encrypted posts and profile data**: Posts and profile fields are encrypted before persistence and decrypted for authorized views.
- **Encrypted critical data at rest**: User fields, posts, documents, and message payloads are stored in encrypted/hashed form.
- **MAC integrity validation**: HMAC checks are used to detect unauthorized modifications.
- **Asymmetric-only encryption policy**: RSA and ECC are used in separate system parts (no symmetric algorithm used for data protection flow).
- **At least two asymmetric algorithms**: RSA and ECC both implemented and used.
- **RBAC**: Separate admin/user privilege checks in middleware and routes.
- **Secure sessions**: Token verification plus DB-backed session checks and binding validation.
- **From-scratch cryptographic implementation**: Cryptographic modules are implemented in project code (`backend/crypto/*`).

## Tech Stack

- **Frontend**: React, React Router, Axios
- **Backend**: Node.js, Express
- **Database**: MySQL (XAMPP supported)
- **Auth & Session**: JWT-style token flow + session table validation

## Repository Structure

```text
CSE447_CipherCampus/
  backend/
    config/
    controllers/
    crypto/
    middleware/
    routes/
    server.js
    init_db.js
  frontend/
    src/
      components/
      services/
      utils/
  database/
    schema.sql
```

## Prerequisites

- Node.js LTS
- npm
- XAMPP (or local MySQL server)

## Local Setup

### 1) Clone and enter project

```bash
git clone <your-repo-url>
cd CSE447_CipherCampus
```

### 2) Configure backend environment

Create `backend/.env` from template:

```bash
cp backend/.env.example backend/.env
```

Then update values for your machine/email sender.

### 3) Start MySQL

Start MySQL (XAMPP recommended for this project setup).

### 4) Install dependencies

```bash
cd backend
npm install
cd ../frontend
npm install
```

### 5) Initialize database schema

From `backend/`:

```bash
node init_db.js
```

### 6) Run backend

From `backend/`:

```bash
npm run dev
```

### 7) Run frontend

From `frontend/`:

```bash
npm start
```

### 8) Open application

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`

## Recommended Demo Flow (for evaluation)

1. Register a user account.
2. Complete login and OTP verification.
3. Update profile and verify encrypted DB storage.
4. Create/edit posts and verify encrypted content + HMAC fields.
5. Send messages between two accounts to demonstrate ECC flow.
6. Use admin account to show RBAC-protected actions.


Suggested screenshot paths:

- `docs/screenshots/login.png`
- `docs/screenshots/register.png`
- `docs/screenshots/dashboard.png`
- `docs/screenshots/profile.png`
- `docs/screenshots/admin.png`

## Team / Credits



## License

academic-only use
