# COD Merchant API (Backend)

API server for platform + merchant administration. Built with Express + MySQL, JWT cookies, and role-based permissions.

## Requirements
- Node.js 18+
- MySQL 8+ (or compatible)

## Quick start
1) Install dependencies:
```bash
npm install
```

2) Create a MySQL database (example name: `cod-merchant`).

3) Create `.env` (or edit the existing one):
```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=cod-merchant
CORS_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=access-secret-please-change
JWT_REFRESH_SECRET=refresh-secret-please-change
```

4) Apply schema changes needed for roles:
```sql
ALTER TABLE platform_admins
  ADD COLUMN platform_role_id INT NULL AFTER id;

ALTER TABLE users
  ADD COLUMN merchant_role_id INT NULL AFTER branch_id;
```
You can run `src/seed/alter_tables.sql` from your DB client.

5) Seed baseline data:
```bash
npm run seed
```

6) Start the API:
```bash
npm start
```

Server runs at `http://localhost:3001`.

## Auth
Platform auth uses JWT access + refresh tokens stored in httpOnly cookies.

Endpoints:
- `POST /api/v1/platform/auth/login`
- `POST /api/v1/platform/auth/refresh`
- `POST /api/v1/platform/auth/logout`
- `GET /api/v1/platform/auth/me`

Seeded admin (change immediately):
- Email: `admin@cod-merchant.local`
- Password: `change-me`

## Permissions
Permissions are stored in `platform_permissions` and linked via `platform_role_permissions`.
Each CRUD route checks for the corresponding permission key.

Example permission keys:
- `view-platform-admin`
- `create-merchant`
- `update-branch`

The seed grants **all** permissions to the `Super Admin` role.

## Render deployment (free tier)
Render offers free Web Services but **they spin down after ~15 minutes of idle** and have monthly limits.
Docs: `https://render.com/docs/free`

Recommended setup:
1) Create a **Web Service** for this repo.
2) Build command: `npm install`
3) Start command: `npm start`
4) Set environment variables in Render (same as `.env`).

Database note:
- Render free tier does **not** include MySQL. Use an external MySQL provider and set `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME`.

## Scripts
- `npm start` - Start the API
- `npm run seed` - Seed roles, permissions, and sample data
