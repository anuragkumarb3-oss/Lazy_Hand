# LazyHand manual verification: VPS database and app setup

This guide describes the backend needed for the rider/seller manual-review workflow. It is a setup plan for your own VPS—not a live database migration. No app code or database has been changed in this turn.

## Current app state

The checked-out app is a Next.js App Router preview. Rider and seller screens, OTP, role switching, and sample orders are currently frontend/demo flows. They do not authenticate real users or persist applications. Do not use the demo OTP or role switch as an authorization boundary for identity documents or admin decisions.

## Recommended architecture

```text
Applicant/admin browser
        │ HTTPS
        ▼
LazyHand Next.js server routes ─── private PostgreSQL on VPS
        │                              (metadata, status, audit)
        └─────────────────────────── private file storage
                                       (MinIO or disk outside web root)
```

- Keep PostgreSQL and file storage private to the app server/VPS network. Do not connect to Postgres from browser code and never use a `NEXT_PUBLIC_` database variable.
- Use HTTPS, firewall rules, automated encrypted backups, OS updates, and a separate least-privilege app DB role. Use parameterized queries.
- Postgres stores application metadata and private storage keys—not document bytes or public file URLs.
- Store documents in a private MinIO bucket or a private directory outside the deployed app's `public/` directory. Serve a document only through a short-lived authenticated admin route after authorization.
- Use real server-verified authentication. Better Auth with email/password is a suitable option for this Next.js app and can use Postgres; its own user/session tables should be created by the Better Auth schema/migration flow. The exact table names depend on the Better Auth configuration. Do not invent password/session tables or trust client-provided roles.
- The admin allow-list is independent of a user's profile/metadata. A successful sign-in alone must never grant admin rights.

## PostgreSQL schema

Run this once against the VPS database with a migration/DB owner account. Back up the database first. The initial admin email below is the address supplied for LazyHand. Keep that address only if it is the intended operational admin.

```sql
BEGIN;

CREATE TABLE verification_admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email = lower(email))
);

INSERT INTO verification_admins (email)
VALUES ('anuragkumarb3@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE verification_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_type TEXT NOT NULL CHECK (applicant_type IN ('rider', 'seller')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'verification_required', 'approved', 'rejected')),
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT NOT NULL,
  locality TEXT,
  identity_document_type TEXT,
  identity_last_four CHAR(4),
  shop_name TEXT,
  gstin TEXT,
  fssai_reference TEXT,
  -- These store review outcomes only; never store bank account or Aadhaar numbers here.
  phone_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (phone_check IN ('not_checked', 'passed', 'failed', 'not_applicable')),
  identity_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (identity_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  selfie_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (selfie_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  address_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (address_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  business_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (business_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  food_license_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (food_license_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  bank_check TEXT NOT NULL DEFAULT 'not_checked'
    CHECK (bank_check IN ('not_checked', 'passed', 'failed', 'needs_more_info', 'not_applicable')),
  -- Store a payment provider's reference/result, never the full bank account number.
  bank_verification_reference TEXT,
  -- Hash a random one-time upload token; never store the token itself.
  applicant_access_token_hash BYTEA UNIQUE,
  applicant_access_token_expires_at TIMESTAMPTZ,
  consented_at TIMESTAMPTZ NOT NULL,
  reviewer_notes TEXT,
  reviewed_by_email TEXT REFERENCES verification_admins(email) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (identity_last_four IS NULL OR identity_last_four ~ '^[0-9]{4}$')
);

CREATE INDEX verification_applications_queue_idx
  ON verification_applications (status, created_at DESC);
CREATE INDEX verification_applications_type_idx
  ON verification_applications (applicant_type, created_at DESC);

CREATE TABLE verification_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES verification_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'government_id', 'selfie', 'address_proof', 'shop_exterior', 'shop_interior',
    'business_registration', 'food_license', 'other'
  )),
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verification_documents_application_idx
  ON verification_documents (application_id, uploaded_at DESC);

CREATE TABLE verification_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES verification_applications(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL CHECK (action IN (
    'submitted', 'started_review', 'requested_information', 'approved', 'rejected', 'check_updated'
  )),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (actor_email = lower(actor_email))
);
CREATE INDEX verification_activity_application_idx
  ON verification_activity (application_id, created_at DESC);

COMMIT;
```

The reviewer's email references the allow-list, so a reviewer cannot be recorded unless that email is authorized. Better Auth must normalize the signed-in email to lowercase before the server writes it.

### Runtime database role

Create a separate app login in your VPS database provider. Do not make it the schema owner; choose a strong password outside the SQL file. Run grants as the schema owner after the tables exist (change the database name and role if you use different names):

```sql
GRANT CONNECT ON DATABASE lazyhand TO lazyhand_app;
GRANT USAGE ON SCHEMA public TO lazyhand_app;
GRANT SELECT ON verification_admins TO lazyhand_app;
GRANT SELECT, INSERT, UPDATE ON verification_applications TO lazyhand_app;
GRANT SELECT, INSERT ON verification_documents TO lazyhand_app;
GRANT SELECT, INSERT ON verification_activity TO lazyhand_app;
GRANT USAGE, SELECT ON SEQUENCE verification_activity_id_seq TO lazyhand_app;
```

Do not grant the runtime role `DELETE` on the activity log or permission to change the admin allow-list. Document deletion should be a separate, audited retention job run by a restricted maintenance role.

## Access rules and review transactions

Self-hosted PostgreSQL does not automatically provide Supabase-style RLS. The application server must enforce authorization on every admin route:

1. Verify the Better Auth session on the server.
2. Normalize the session email to lowercase.
3. Require a matching row in `verification_admins` before listing applications, downloading any document, changing checks/status, or reading reviewer notes/history.
4. Ignore any `role`, `reviewer_email`, or admin flag sent by the browser. Derive the actor from the verified session.
5. Use a SQL transaction for each review action: update the application and insert its `verification_activity` event together. Require notes for `verification_required` and `rejected`; validate status/check values against the allowed lists.
6. Grant the web app DB role only the permissions it needs. It must not own the database or schema. Do not grant the browser database credentials.

For stronger defense-in-depth, add Postgres RLS policies as well, but only if the app uses a trusted server-set identity context. A client-settable session variable is not an authorization boundary.

## Application endpoints to build

These are the intended server-side boundaries; the current app does not implement them yet.

| Endpoint | Access | Responsibility |
| --- | --- | --- |
| `POST /api/verification/applications` | Public, rate-limited | Validate required fields and consent, create a `submitted` application, and return a random 256-bit one-time upload token. Store only its SHA-256 hash and expiry in the application row; never return the hash. |
| `POST /api/verification/applications/:id/documents` | Applicant token; size/type limited | Hash the presented token and compare it in constant time to the unexpired stored hash for that application. Accept PDF/JPEG/PNG/WebP only, max 10 MiB per file; generate a random storage key; write to private storage; insert metadata. Never trust a browser-supplied storage path. |
| `GET /api/admin/verification/applications` | Admin allow-list | Return queue/list data with pagination and filters. Do not include file bytes, full bank numbers, or unnecessary DOB data. |
| `GET /api/admin/verification/applications/:id` | Admin allow-list | Return application details, checks, and audit history. |
| `GET /api/admin/verification/applications/:id/documents/:documentId` | Admin allow-list | Verify the document belongs to that application, then stream it from private storage. Do not expose a permanent/public URL. Record document access if required by policy. |
| `PATCH /api/admin/verification/applications/:id` | Admin allow-list | Validate requested status/checks/notes, then update the application and append an audit event in one transaction. |

Use CSRF protections for cookie-authenticated mutations, rate limits on public submission/upload endpoints, and generic public errors that do not disclose whether an account or application exists. Sanitize/escape text rendered in the dashboard.

## Server-side PostgreSQL connection example

Install a Node PostgreSQL driver (`pg`) in the Next.js project. Create a server-only pool in a file such as `lib/db.ts`; import it only from Route Handlers/server code. Keep `DATABASE_URL` in `.env.development.local` for local preview and in the deployment's server-side environment variables for production.

```ts
import 'server-only'
import { Pool } from 'pg'

const globalForDb = globalThis as typeof globalThis & { lazyHandPool?: Pool }

export const pool = globalForDb.lazyHandPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
})

if (process.env.NODE_ENV !== 'production') globalForDb.lazyHandPool = pool
```

Use bound parameters; never interpolate request data into SQL:

```ts
const result = await pool.query(
  `SELECT id, applicant_type, status, full_name, phone, locality, created_at
   FROM verification_applications
   WHERE status = $1
   ORDER BY created_at DESC
   LIMIT $2 OFFSET $3`,
  [status, pageSize, offset],
)
```

Set up TLS for the DB connection with a trusted CA certificate. Do not set `rejectUnauthorized: false` in production. If your VPS database has no public TLS endpoint, keep it on a private network between the app and DB hosts rather than opening port 5432 to the internet.

## Environment variables

```dotenv
# Server-only. Never prefix this with NEXT_PUBLIC_.
DATABASE_URL=postgresql://lazyhand_app:...@<private-vps-host>:5432/lazyhand?sslmode=verify-full

# Better Auth server-side configuration (use the names required by the version/config you install).
BETTER_AUTH_SECRET=<long-random-secret>
BETTER_AUTH_URL=https://<your-app-domain>

# Private file storage. Exact names depend on MinIO/S3 adapter or your file service.
# Example: STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
```

Do not commit `.env.development.local`, database passwords, storage credentials, private document keys, or backups to Git. Never expose the DB password or storage credentials to browser code.

## Applicant fields and manual-review checklist

- **Both roles:** name, phone, contact email if available, address/locality, consent timestamp, identity document type, and required private supporting files.
- **Rider checks:** phone OTP, identity document visual review, selfie review, address review, payout account-holder match via a payment provider, final admin decision.
- **Seller checks:** owner identity, shop exterior/interior evidence, address, GSTIN check when applicable, FSSAI check for food businesses, payout account-holder match, final admin decision.
- **Optional Aadhaar offline QR:** only with informed consent and applicable compliance review. Prefer official QR signature verification; store no full Aadhaar number/QR payload. If retained, the described workflow needs at most the last four digits. Offer a non-Aadhaar alternative.
- Do not claim this manual workflow is government-verified identity authentication or bank-grade KYC.

## Retention and launch checklist

- Decide a retention/deletion period for rejected, withdrawn, and approved applications before accepting real documents.
- Encrypt storage and backups; restrict SSH/admin access; audit reviewer actions and document downloads.
- Never log document contents, passwords, session cookies, Aadhaar data, or bank account numbers.
- Test that an unauthenticated request cannot list applications, fetch documents, change a status, or read audit history; test that a signed-in non-admin is denied too.
- Test approve/reject/request-information actions for transaction rollback and audit-event creation.
- Replace the current preview-only OTP/role switching before using this workflow for real people. A production launch also needs a privacy notice/consent copy, deletion process, adult/legal representative review, and applicable India privacy/compliance advice.
