# LazyHand manual verification: VPS database and app setup

This guide describes the backend needed for the rider/seller manual-review workflow. It is a setup plan for your own VPS—not a live database migration. No app code or database has been changed in this turn.

## Current app state

The checked-out app is a Next.js App Router preview. Rider and seller screens, OTP, role switching, and sample orders are currently frontend/demo flows. They do not authenticate real users or persist applications. Do not use the demo OTP or role switch as an authorization boundary for identity documents or admin decisions.

## Recommended architecture

```text
Browser ──HTTPS──> LazyHand Next.js server ──private network──> PostgreSQL + private file storage
```

Choose a deployment path before configuring the database:

- **App on the VPS:** run Next.js, PostgreSQL, and private file storage on the same VPS or private network. Connect from server-only code; bind Postgres to loopback/private interfaces and firewall port 5432.
- **App on Vercel (the current project setup):** a private VPS hostname is not reachable from Vercel by default. Choose one complete path: (a) use a VPS HTTPS backend that owns authentication, database, and storage operations, with the Next.js server proxying requests to it; validate signed, short-lived user assertions at the backend and never trust forwarded email/user-ID headers. If the browser calls the VPS API directly, restrict CORS to the exact app origin and use secure session handling. Or (b) configure supported private networking/static egress from Vercel to the VPS and allowlist only those fixed egress addresses. Better Auth running in a Vercel function also needs a direct supported route to its Postgres database; a database-only HTTPS API does not automatically make Better Auth work. Do not expose Postgres broadly to the public internet or assume Vercel's egress IPs are stable.

In either option:

- Never connect to Postgres from browser code or use a `NEXT_PUBLIC_` database variable.
- Use HTTPS, firewall rules, automated encrypted backups, OS updates, and a separate least-privilege app DB role. Use parameterized queries.
- Postgres stores application metadata and private storage keys—not document bytes or public file URLs.
- Store documents in a private MinIO bucket or a private directory outside the deployed app's `public/` directory. Serve a document only through a short-lived authenticated admin route after authorization.
- Use real server-verified authentication. Better Auth with email/password is a suitable option for this Next.js app and can use Postgres; create its user/session tables with the Better Auth schema/migration flow. Configure email verification delivery. Bootstrap the first allow-listed admin through a controlled invite/one-time setup, require `emailVerified` for admin access, and disable public admin sign-up afterward. Do not invent password/session tables or trust client-provided roles.
- The admin allow-list is independent of a user's profile/metadata. A successful sign-in alone must never grant admin rights.

## PostgreSQL schema

Use a supported PostgreSQL 15+ release. Run this once against the VPS database with a migration/DB owner account. Back up the database first. The initial admin email below is the address supplied for LazyHand. Keep that address only if it is the intended operational admin.

```sql
BEGIN;

CREATE TABLE verification_admins (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  CHECK (email = lower(email))
);

INSERT INTO verification_admins (email)
VALUES ('anuragkumarb3@gmail.com')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE verification_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_type TEXT NOT NULL CHECK (applicant_type IN ('rider', 'seller')),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'verification_required', 'approved', 'rejected', 'withdrawn')),
  full_name TEXT NOT NULL,
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
  consent_text_version TEXT NOT NULL,
  reviewer_notes TEXT,
  reviewed_by_email TEXT REFERENCES verification_admins(email) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (identity_last_four IS NULL OR identity_last_four ~ '^[0-9]{4}$'),
  CHECK ((applicant_access_token_hash IS NULL) = (applicant_access_token_expires_at IS NULL))
);

CREATE FUNCTION set_verification_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER verification_applications_set_updated_at
BEFORE UPDATE ON verification_applications
FOR EACH ROW EXECUTE FUNCTION set_verification_updated_at();

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
  application_id UUID NOT NULL REFERENCES verification_applications(id) ON DELETE RESTRICT,
  actor_email TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL CHECK (action IN (
    'submitted', 'started_review', 'requested_information', 'resubmitted', 'approved', 'rejected', 'withdrawn', 'check_updated', 'document_accessed'
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

The reviewer email references the allow-list for attribution; the server must additionally require `is_active = true` on every admin request. To revoke an admin, set `is_active = false` rather than deleting the row, preserving foreign-key and audit history. Better Auth must normalize the verified session email to lowercase before the server writes it.

### Runtime database role

Create a separate app login in your VPS database provider. Do not make it the schema owner; choose a strong password outside the SQL file. Run grants as the schema owner after the tables exist (change the database name and role if you use different names):

```sql
-- Run as the schema owner in a dedicated database/schema, after Better Auth's
-- schema has been created. These revokes remove direct/PUBLIC table grants;
-- also inspect and remove unintended role memberships before granting access.
REVOKE ALL PRIVILEGES ON verification_admins, verification_applications,
  verification_documents, verification_activity FROM PUBLIC, lazyhand_app;
REVOKE ALL PRIVILEGES ON SEQUENCE verification_activity_id_seq FROM PUBLIC, lazyhand_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, lazyhand_app;

GRANT CONNECT ON DATABASE lazyhand TO lazyhand_app;
GRANT USAGE ON SCHEMA public TO lazyhand_app;
GRANT SELECT ON verification_admins TO lazyhand_app;
GRANT SELECT, INSERT, UPDATE ON verification_applications TO lazyhand_app;
GRANT SELECT, INSERT ON verification_documents TO lazyhand_app;
GRANT SELECT, INSERT ON verification_activity TO lazyhand_app;
GRANT USAGE, SELECT ON SEQUENCE verification_activity_id_seq TO lazyhand_app;
```

Do not grant the runtime role `DELETE` on the activity log or permission to change the admin allow-list. Better Auth also needs narrowly scoped CRUD permissions on the exact user/session/account/verification tables its migration created; inspect those names first and grant only the operations the installed Better Auth version uses. Do not grant broad privileges on every table in `public`. Remove unintended inherited role memberships as well as direct grants. Document deletion should be a separate, audited retention job run by a restricted maintenance role.

## Access rules and review transactions

Self-hosted PostgreSQL does not automatically provide Supabase-style RLS. The application server must enforce authorization on every admin route:

1. Verify the Better Auth session on the server and require `emailVerified === true` before admin access.
2. Normalize the verified session email to lowercase.
3. Require a matching row in `verification_admins` with `is_active = true` before listing applications, downloading any document, changing checks/status, or reading reviewer notes/history. Create the first Better Auth account through a verified-email sign-up flow for the allow-listed address; the SQL seed alone does not create a login.
4. Ignore any `role`, `reviewer_email`, or admin flag sent by the browser. Derive the actor from the verified session.
5. Use a SQL transaction for each review action: update the application and insert its `verification_activity` event together. Require notes for `verification_required` and `rejected`; validate status/check values against the allowed lists.
6. Enforce a status-transition matrix in server code: allow review to start from `submitted`; allow requests for information and decisions from `under_review`; allow a resubmitted `verification_required` case back to review; treat `approved`, `rejected`, and `withdrawn` as final. Require a reason for rejection, information requests, and admin-initiated withdrawal.
7. Enforce approval gates in server code: riders need phone, identity, selfie, address, and bank checks passed; sellers need phone, identity, address, shop/business, and bank checks passed. A food seller also needs a passed food-license check. Only use `not_applicable` for checks that truly do not apply. Never approve an application with a failed or incomplete required check.
8. Grant the web app DB role only the permissions it needs. It must not own the database or schema. Do not grant the browser database credentials.

For stronger defense-in-depth, add Postgres RLS policies as well, but only if the app uses a trusted server-set identity context. A client-settable session variable is not an authorization boundary.

## Application endpoints to build

These are the intended server-side boundaries; the current app does not implement them yet.

| Endpoint | Access | Responsibility |
| --- | --- | --- |
| `POST /api/verification/applications` | Public, rate-limited | Validate required fields and consent, set `consented_at` and a server-controlled `consent_text_version`, create a `submitted` application and `submitted` activity event in one transaction, and return a random 256-bit, short-lived applicant token once. Keep it out of URLs and logs; send it in an authorization header. Store only its SHA-256 hash and expiry in the application row; never return the hash. |
| `POST /api/verification/applications/:id/documents` | Applicant token; size/type limited | Hash the presented token and compare it in constant time to the unexpired stored hash for that application. Accept PDF/JPEG/PNG/WebP only, max 10 MiB per file; enforce request limits at the proxy and server, inspect file signatures (not just browser MIME types), scan uploads for malware, generate a random storage key, write to private storage, then insert metadata. Never trust a browser-supplied storage path. |
| `POST /api/verification/applications/:id/resubmit` | Applicant token | After all requested evidence is uploaded, move `verification_required` back to `under_review` and append a `resubmitted` activity event in one transaction. |
| `POST /api/verification/applications/:id/withdraw` | Applicant token | Allow withdrawal before a final decision; set status to `withdrawn` and append an activity event transactionally. Expire/revoke the applicant token afterward. |
| `GET /api/admin/verification/applications` | Admin allow-list | Return queue/list data with pagination and filters. Do not include file bytes, full bank numbers, or unnecessary personal data. |
| `GET /api/admin/verification/applications/:id` | Admin allow-list | Return application details, checks, and audit history. |
| `GET /api/admin/verification/applications/:id/documents/:documentId` | Admin allow-list | Verify the document belongs to that application, then stream it from private storage with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` (or render it in a deliberately sandboxed viewer). Do not expose a permanent/public URL. Record document access with `document_accessed`. |
| `PATCH /api/admin/verification/applications/:id` | Admin allow-list | Validate allowed status transitions and role-specific approval gates, then update the application and append an audit event in one transaction. Require a reason for rejection/requested information; derive the reviewer from the verified session. |

Use CSRF protections for cookie-authenticated mutations, rate limits on public submission/upload endpoints, and generic public errors that do not disclose whether an account or application exists. Send applicant tokens only in authorization headers and redact them from access logs. PostgreSQL and object storage do not share a transaction: stage each upload, write the object, insert metadata, and delete the staged object if the DB insert fails; run a sweeper for orphaned staged objects. Sanitize/escape text rendered in the dashboard.

## Server-side PostgreSQL connection example

Install a Node PostgreSQL driver (`pg`) in the Next.js project. Create a server-only pool in a file such as `lib/db.ts`; import it only from Route Handlers/server code. Keep `DATABASE_URL` in `.env.development.local` for local preview and in the deployment's server-side environment variables for production.

This direct `pg` connection example is for an app on the VPS/private network, or for Vercel only when supported private networking/static egress is configured. If the app stays on Vercel without that connectivity, call the VPS HTTPS backend instead; do not point a Vercel function at a private VPS address and assume it will route there. Serverless deployments should use a connection pooler and set `PG_POOL_MAX=1` (or another capacity-tested low value) so concurrent function instances cannot exhaust PostgreSQL connections. The example defaults to five connections for a long-lived VPS process.

```ts
import 'server-only'
import { Pool } from 'pg'

const globalForDb = globalThis as typeof globalThis & { lazyHandPool?: Pool }
const databaseUrl = process.env.DATABASE_URL
const ca = process.env.PG_CA_CERT?.replace(/\\n/g, '\n')

if (!databaseUrl) throw new Error('DATABASE_URL is required')

export const pool = globalForDb.lazyHandPool ?? new Pool({
  connectionString: databaseUrl,
  max: Number(process.env.PG_POOL_MAX ?? 5),
  ssl: process.env.NODE_ENV === 'production'
    ? { ...(ca ? { ca } : {}), rejectUnauthorized: true }
    : undefined,
})

if (process.env.NODE_ENV !== 'production') globalForDb.lazyHandPool = pool
```

Keep TLS verification enabled. Use a certificate whose hostname matches the DB host. For trusted public certificates, use the platform trust store; for a private CA, supply its PEM certificate through `PG_CA_CERT`. Do not also put conflicting `sslmode`, `sslrootcert`, or other SSL options in `DATABASE_URL`, since the `pg` connection-string parser can override the `ssl` object.

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

Set up TLS with a trusted CA certificate on every network hop. Do not set `rejectUnauthorized: false` in production. In the VPS-backend option, keep Postgres private between the API and database; expose only the HTTPS API. Never open port 5432 broadly to the internet.

## Environment variables

```dotenv
# Server-only. Never prefix this with NEXT_PUBLIC_.
# Only for a Next.js server on the VPS/private network. Omit SSL query params;
# configure certificate verification in the pg Pool options above.
DATABASE_URL=postgresql://lazyhand_app:...@<private-vps-host>:5432/lazyhand

# Trusted database CA PEM, when using a private CA. Keep server-only.
PG_CA_CERT=<trusted-CA-PEM>
# Set to 1 for serverless; tune against DB/proxy capacity.
PG_POOL_MAX=1

# Better Auth server-side configuration (use the names required by the version/config you install).
BETTER_AUTH_SECRET=<long-random-secret>
BETTER_AUTH_URL=https://<your-app-domain>

# Private file storage. Exact names depend on MinIO/S3 adapter or your file service.
# Example: STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY
```

Do not commit `.env.development.local`, database passwords, storage credentials, private document keys, or backups to Git. Never expose the DB password or storage credentials to browser code.

## Applicant-centered workflow and reviewer consistency

Use behavioral design to reduce uncertainty and make the process feel fair—not to pressure applicants:

- Explain why each requested field/document is needed, who can view it, and how long it is retained before the applicant submits it.
- Show a short step-by-step progress indicator, accepted file types/size, and a realistic review-time range only when the team can honor it.
- Let applicants correct mistakes and re-upload requested evidence. Give a plain-language reason and a concrete next step when information is missing or rejected.
- Offer an equivalent identity-document path; do not make Aadhaar or biometric capture the only route unless a reviewed legal requirement makes it necessary. Never use shame, fake urgency, preselected consent, or hidden conditions.
- Keep each step focused, mobile-friendly, keyboard accessible, and tolerant of low bandwidth. Preserve progress only through a secure, expiring applicant token.
- Give reviewers the same role-specific checklist and evidence standards. Separate observable findings from subjective impressions, avoid demographic assumptions, and record overrides/reasons in the append-only activity log.

## Applicant fields and manual-review checklist

- **Both roles:** name, phone, contact email if available, address/locality, consent timestamp, identity document type, and required private supporting files.
- **Rider checks:** phone OTP, identity document visual review, selfie review, address review, payout account-holder match via a payment provider, final admin decision.
- **Seller checks:** owner identity, shop exterior/interior evidence, address, GSTIN check when applicable, FSSAI check for food businesses, payout account-holder match, final admin decision.
- **Optional Aadhaar offline QR:** only with informed consent and applicable compliance review. Prefer official QR signature verification; store no full Aadhaar number/QR payload. If retained, the described workflow needs at most the last four digits. Offer a non-Aadhaar alternative.
- Do not claim this manual workflow is government-verified identity authentication or bank-grade KYC.

## Retention and launch checklist

- Decide a retention period for rejected, withdrawn, and approved applications before accepting real documents. `verification_activity` uses `ON DELETE RESTRICT` to avoid silently erasing its audit trail. Prefer redacting personal fields and deleting document objects after the retention window; if full application/audit deletion is legally required, implement an explicit, authorized erasure process.
- Deleting a `verification_documents` row does not remove its MinIO/disk object. The retention worker must delete the object first and retry failures; only then remove metadata. For application deletion, clean up every associated object before deleting rows. Never expose a public storage URL.
- Encrypt storage and backups; restrict SSH/admin access; audit reviewer actions and document downloads using the `document_accessed` event. Keep consent-text versions immutable and retrievable by their stored version identifier.
- Treat names, phone numbers, addresses, and tax/license identifiers as sensitive personal/business data; minimize collection, restrict access, and apply a defined retention/redaction policy. Do not persist DOB by default.
- Never put document contents, full identity/bank numbers, passwords, or session cookies in logs, `reviewer_notes`, or activity notes. Record concise reason codes or minimal decision explanations.
- Test that an unauthenticated request cannot list applications, fetch documents, change a status, or read audit history; test that a signed-in non-admin is denied too.
- Test approve/reject/request-information actions for transaction rollback and audit-event creation.
- Replace the current preview-only OTP/role switching before using this workflow for real people. A production launch also needs a privacy notice/consent copy, deletion process, adult/legal representative review, and applicable India privacy/compliance advice.
