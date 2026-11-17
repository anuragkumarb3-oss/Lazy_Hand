# LazyHand VPS agent setup and production handoff

## Purpose and current status

Use this as the operating brief for an authorized VPS operator. The owner has approved moving the Next.js application onto the existing VPS and using its PostgreSQL database. This is an approved target architecture, not evidence that the live server has been inspected or changed.

**Production cutover is still blocked.** The owner reports PostgreSQL is running on the VPS at `localhost:5432`, with `appdb` owned by `appuser`; use the same-host connection URL in `deploy/lazyhand.env.example` and keep PostgreSQL private. The v0 workspace itself is not the VPS (a read-only `sudo -u postgres psql` check failed because the `postgres` OS user is unavailable here), so this does not verify the live schema, credentials, backups, restore, or deployment. Rotate any credential previously shared in chat before use. Do not run migrations or change firewall/DNS until the VPS schema and a restorable backup are confirmed. Keep Vercel as the rollback target.

The project contains a Next.js App Router app and Expo code. Supabase Auth remains in use for this first migration stage so phone OTP is not silently changed; profile, catalog, seller application, operating hours, onboarding acceptance, and orders are being moved behind server-side PostgreSQL APIs. Catalog media uploads and Supabase Auth remain external dependencies. Seeded home/partner/dashboard behavior still needs product-level review and must not be represented as live marketplace data. No Baileys bridge is documented or enabled.

## Approved target architecture

```text
Web/mobile clients -> Next.js app on the owner's VPS
                  -> Supabase Auth (temporary, retained for OTP)
                  -> private PostgreSQL on loopback/private network
                  -> Supabase Storage for existing catalog media (temporary)

Internet -> HTTPS reverse proxy -> Next.js bound to loopback
PostgreSQL -> loopback/private interface only; never public
Vercel deployment -> retained until VPS acceptance checks pass
```

The app must use server-only PostgreSQL connections (`DATABASE_URL`); browser code must never receive database credentials. The current code includes a versioned migration runner and a fresh-install schema, but those migrations have not been run against the owner's VPS. Inspect and back up the actual database first; do not run the fresh-install migrations against a non-empty database without a reviewed reconciliation/migration plan.

## VPS deployment files and sequence

Templates are under `deploy/`: a systemd service, Nginx HTTPS reverse proxy, an environment-variable name template, and an encrypted `pg_dump` backup script. They are examples, not installed services. Replace hostname/path placeholders and verify the actual Node, pnpm, Nginx, PostgreSQL, and `age` executable paths for the VPS before use.

1. Rotate the exposed database password on the VPS. Create a distinct least-privilege runtime role; keep the migration owner separate. Put the replacement URL in a root-owned `/etc/lazyhand/lazyhand.env` (mode `0600`) using the VPS secret manager. Do not provide secrets in chat or source control.
2. Keep PostgreSQL on loopback. For a same-host loopback connection only, the environment template uses `PG_SSL=disable`; the app refuses this setting for a non-loopback hostname. For a private-network/remote database, leave TLS enabled and configure a trusted CA with `PG_CA_CERT`.
3. Build from a reviewed release directory with the required `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` available at build time. Install with the lockfile, typecheck, build, and test in staging before switching the `/opt/lazyhand/current` release path. Keep the current Vercel deployment untouched.
4. Review and apply migrations only after the database is confirmed fresh or a reconciliation plan is reviewed. Run `pnpm db:migrate` from the release directory with the migration-owner credentials in a protected environment. Do not run this against the database until the existing schema and backup have been inspected.
5. Install the service and proxy templates only after review; expose HTTPS and the SSH allowlist, never port 5432 or Next.js port 3000. Verify TLS, cookies, OTP callback/origin, health, and private API behavior before DNS cutover.
6. Configure a scheduled `deploy/backup-postgres.sh` invocation with non-secret PostgreSQL connection fields, a mode-`0600` `PGPASSFILE`, `BACKUP_AGE_RECIPIENT`, and `BACKUP_DIR` provided through a protected environment. Keep the age identity separately and test decryption/restore to a disposable database. Do not put a database URL/password on a command line or treat successful backup creation as proof of recoverability.
7. Roll back by restoring the previous release path/service and leaving DNS on the prior Vercel target until the owner approves cutover. Do not reverse schema changes by deleting user data; use a separately reviewed forward fix or restore plan.

### WhatsApp provider decision

The owner has selected Baileys QR pairing and says an existing VPS bridge is available. However, no bridge endpoint, repository/process location, API contract, or authenticated pairing route is documented or wired into this repository. The app currently only stores WhatsApp preferences; it does not send WhatsApp messages. Supabase OTP calls request SMS (`signInWithOtp` with a phone number and `verifyOtp` with `type: 'sms'`). Do not silently switch OTP delivery to WhatsApp, and do not assume the existing bridge is safe or reachable until it is inspected.

Baileys is an unofficial WhatsApp Web client, can break without notice, and may cause the linked account to be restricted. The owner's selection authorizes investigating the existing Baileys bridge, not exposing a new public pairing interface, changing production auth delivery, or pairing an account before the existing service, account authorization, access controls, consent, and rollback are verified. Prefer the official WhatsApp Business Platform / Cloud API for production authentication and business notifications. Never use a personal number or send unsolicited messages.

## Ask the owner before setup

Ask only for what is missing; do not ask for passwords, private keys, API secrets, Supabase service-role keys, OTPs, QR screenshots, or session files in chat.

1. **VPS access:** hostname/IP, OS/version, SSH port, and the approved secure way for an authorized operator to access it. Require a named non-root account with narrowly scoped `sudo`; do not request a root password or a private SSH key in chat.
2. **Domains and hosting:** confirm the production app hostname and who can update DNS. Confirm the VPS can accept only required inbound ports (normally SSH from an allowlist and HTTPS through a reverse proxy; never expose Postgres or an admin/debug port publicly). Keep Vercel available as rollback until acceptance.
3. **WhatsApp purpose:** is WhatsApp needed for (a) login OTP, (b) order/status notifications, (c) both, or (d) neither? Confirm the sender/account owner, country, consent/opt-in wording, expected volume, and recovery contact. Explain the Baileys risk before asking the owner to approve it; recommend the official API for production OTP.
4. **Existing bridge:** ask where the existing bridge repository/process is, if one exists, and whether the agent may inspect it. If no bridge exists, ask the owner to choose the official API or explicitly approve a Baileys prototype. Do not invent a URL or overwrite an unknown process.
5. **Authentication and media:** confirm the Supabase project still used for phone OTP and catalog media, verify its allowed production origin, and retain its required client environment variable names for the VPS build. Do not move Supabase service-role keys to the VPS.
6. **Admin access:** identify the intended admin account(s) by email/user ID and confirm who can grant the trusted Supabase `app_metadata.role = 'admin'`. Do not grant admin through `user_metadata`, a client field, profile form, or public signup.
7. **Business rules:** confirm launch location/coverage, seller/rider approval process, COD/payment plan, delivery pricing, cancellation/refund rules, and whether the seeded shops/products are to be removed or replaced with real catalog records. For payment tracking, confirm whether receipts arrive in a dedicated Gmail inbox, the trusted sender(s), how amount/reference/order are matched, and who owns seller payouts and the promised settlement schedule. Do not treat an email or customer screenshot alone as proof of payment.
8. **Operations:** confirm backup retention, monitoring/alert destination, maintenance window, rollback owner, log retention, and who responds if OTP/WhatsApp delivery fails.
9. **Legal/privacy review:** confirm approved privacy notice and consent text, data-retention/deletion policy, and business approval for handling phone numbers and location. Do not collect identity/bank documents until the storage, access, consent, retention, and incident-response design is approved.

If a required answer or secure access method is unavailable, report the blocker and stop before making a production change. Never guess at a value or put secrets in source control.

## Safe execution sequence

### Phase 1 — Inspect and report

- Confirm the target host and deployment; capture OS, disk, memory, firewall, reverse proxy, running services, DNS, TLS, and backup status without printing secret files.
- Inspect existing bridge services and their documented API before starting, replacing, or pairing anything.
- Confirm the target VPS, systemd, PostgreSQL version and bind address, reverse proxy, DNS/TLS, firewall, Supabase Auth settings, and existing database schema/migration history without echoing environment files or credentials.
- Take and verify an encrypted backup and test restore to a disposable database before schema or service changes. Record a rollback plan and exact files/services to be changed.
- Return a concise before-state report. Production DDL, service replacement, firewall changes, and DNS cutover still require the owner's explicit approval of the concrete operation.

### Phase 2 — Database and application readiness

- Review `db/migrations/` against the actual VPS schema before applying. The included migrations are fresh-install schema only, not a data reconciliation. Back up, restore-test, then apply with `pnpm db:migrate` using a separate migration owner; configure the runtime role with only required table/sequence privileges.
- All database reads/writes must go through server-only APIs using parameterized PostgreSQL queries. Route authorization verifies the Supabase Auth session server-side, then enforces customer ownership, seller ownership, or trusted `app_metadata.role = 'admin'`. PostgreSQL itself is private and no browser receives `DATABASE_URL`.
- The app has public catalog reads, authenticated profile/order reads, seller-owned product/hours changes, admin category/seller-review operations, and onboarding records routed through PostgreSQL APIs. Before launch, test every permission path as anonymous, customer, non-owner seller, owner seller, and admin.
- Remove remaining seeded shops/products/orders and simulated partner actions before enabling real orders. Order prices and fees are computed server-side, stock is locked/decremented in a transaction, and an idempotency key prevents checkout retries from duplicating orders. Test all of this against an isolated PostgreSQL instance before production.
- Add rate limits and abuse controls for OTP/signup/order endpoints; verify phone provider configuration, OTP expiry, resend limits, and recovery. Keep payment and fulfillment status changes server-authoritative.
- Before enabling QR/UPI checkout, approve a payment verification design. If using Gmail receipts, authorize a dedicated inbox with least-privilege read access; validate trusted sender and receipt identifiers, exact amount, order association, duplicate/replayed messages, and refunds. A Gmail notification is not a settlement guarantee; never mark an order paid from a customer claim alone. Define the seller payout provider and schedule separately, and do not promise an 8 PM credit until it is actually supported and tested.
- Keep user-specific API responses non-cacheable. Require a same-origin/CSRF strategy for cookie-authenticated writes and validate inputs on the server.

The application database role should not own the database/schema and should not be used for migrations. After reviewing the actual schema, grant only the operations required by the application routes, for example:

```sql
GRANT CONNECT ON DATABASE appdb TO <runtime_role>;
GRANT USAGE ON SCHEMA public TO <runtime_role>;
GRANT SELECT, INSERT, UPDATE ON profiles, catalog_products, seller_applications,
  shop_operating_hours TO <runtime_role>;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalog_categories TO <runtime_role>;
GRANT SELECT, INSERT ON orders, legal_policy_acceptances, checkout_idempotency TO <runtime_role>;
GRANT USAGE, SELECT ON SEQUENCE legal_policy_acceptances_id_seq TO <runtime_role>;
```

Replace `<runtime_role>` only with the newly created role name. Verify default/public grants and memberships; never grant `CREATE` on `public` or schema ownership to the runtime role. Keep the separate migration owner credentials out of the Next.js service environment.

### Phase 3 — VPS WhatsApp adapter (only if approved)

- Install on a dedicated non-root account. Pin supported Node/runtime and dependency versions; run as a systemd service or a reviewed container with restart limits and health checks. Keep auth/session state in a private persistent directory with strict filesystem permissions and encrypted backups. Exclude it from Git and ordinary logs.
- Expose only HTTPS through the reverse proxy. Add firewall rules, request-size limits, rate limits, timeouts, and monitoring. Do not expose the raw Node port, QR endpoint, filesystem, shell, or Postgres.
- Require authenticated admin authorization for pairing/status/QR actions. QR codes are bearer credentials: show them only to the authorized operator, make them short-lived, never log/cache them, and redact them from proxy/access logs. Do not make pairing routes public.
- For server-to-server sends, use a long random shared secret or preferably HMAC request signing with timestamp, request ID, body hash, replay protection, and constant-time comparison. Store secrets in the VPS secret store and Vercel server environment only; rotate them. Never accept a secret from the browser.
- Minimum proposed API contract (the owner must approve and the implementer must document the actual deployed paths):
  - `GET /health` — liveness only; no secrets, account identifiers, or session state.
  - `GET /v1/status` — authenticated operator status (`connected`, `pairing`, `disconnected`, last successful send).
  - `POST /v1/pairing` and `GET /v1/pairing/qr` — admin-authenticated, short-lived pairing flow; QR is never logged or publicly cached.
  - `POST /v1/messages` — signed server-to-server request; strict allowlisted message purpose, E.164 recipient validation, opt-in enforcement, idempotency key, payload limits, rate limit, and sanitized response. Never provide an arbitrary-message relay.
- Test disconnect/reconnect, process restart/session persistence, revoked pairing, invalid signatures, stale/replayed requests, rate limits, opt-out, delivery failure, and secret rotation before enabling real sends.

### Phase 4 — OTP and notification integration

- Preserve current SMS OTP until an approved alternative is configured and end-to-end tested. Supabase Auth phone sign-in requires its phone provider/SMS setup; a VPS service existing by itself does not make Supabase send OTP over WhatsApp.
- If using WhatsApp OTP, verify that Supabase's currently supported Auth hook/provider flow can securely invoke the approved sender. Validate the hook signature on the server, keep the code only in memory for delivery, and never log OTPs. Add replay/rate controls and a supported recovery path. Do not write a custom public OTP endpoint that bypasses Supabase Auth verification.
- For order notifications, require explicit opt-in, store notification preferences safely, provide opt-out, and send only transactional templates/content allowed by the selected provider. A user's WhatsApp number or checkbox alone is not proof of consent.

## Required environment handling

Configure these values on the VPS only; the populated environment file is not committed. The Supabase URL and publishable/anon key are public client configuration, but must be present at build time so phone OTP continues to use the selected Supabase Auth project. The database URL and PostgreSQL CA remain server-only.

- `DATABASE_URL` — rotated connection URL for the least-privilege PostgreSQL runtime role; never `NEXT_PUBLIC_*`.
- `PG_SSL` — set to `disable` only for loopback PostgreSQL on the same host; otherwise omit and use verified TLS.
- `PG_CA_CERT` — optional trusted CA PEM for private-CA PostgreSQL connections.
- `PG_POOL_MAX` — bounded connection pool size; default 5 for a long-lived VPS process.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — available at build time for existing Supabase Auth and Storage integration.
- `BACKUP_AGE_RECIPIENT`, `BACKUP_DIR` — backup encryption recipient and protected destination for the scheduled backup job.

Do not use the project Vercel `POSTGRES_*` variables as a substitute for the VPS database URL. For any chosen bridge integration, define only the server-side values actually required, for example:

- `WHATSAPP_BRIDGE_URL` — HTTPS base URL, server-only.
- `WHATSAPP_BRIDGE_HMAC_SECRET` — signing secret, server-only; never `NEXT_PUBLIC_*`.
- Provider-specific credentials only if the owner chooses an official provider; keep them in the provider/Vercel secret manager.

Use separate credentials for development, preview, and production. Never print secrets, write them to Git, expose them in logs, embed them in QR links, or paste them into chat. The VPS should not receive Supabase service-role credentials unless a narrowly scoped, reviewed server task truly requires them; the bridge should not access the database.

## Production acceptance checklist

Do not report “ready” until all applicable items pass and evidence is recorded:

- [ ] VPS host, production hostname, Supabase Auth project/origin, DNS, and TLS are confirmed; Vercel remains available for rollback.
- [ ] VPS PostgreSQL schema is inspected; migrations are reviewed, backup/restore is verified, and only then are migrations applied to the correct database.
- [ ] PostgreSQL is not publicly reachable; the runtime role is least-privilege, and API tests prove anonymous users, other customers, non-owner sellers, and non-admins cannot read/change protected data.
- [ ] Supabase OTP provider delivers and verifies real codes; resend limits, failures, and recovery are tested.
- [ ] Profile, catalog, seller-application, order create/read/status, inventory, and admin workflows use real persistence and authoritative server-side permissions—not demo-only controls.
- [ ] Order prices/fees are server-calculated; stock and status transitions are safe under concurrent requests; retries are idempotent.
- [ ] If digital payments are enabled: payment confirmation comes from a trusted, server-verified source with exact amount/order matching and replay protection; refunds and seller settlement schedule are defined and tested. Gmail receipts alone must not be described as guaranteed settlement.
- [ ] Cookie-authenticated mutations have CSRF/origin protection; private responses are not cached; rate limits are enabled.
- [ ] `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm build` pass with no ignored TypeScript/build errors.
- [ ] Backups are encrypted and a restore has been tested; monitoring, alerting, log redaction, and rollback are documented.
- [ ] If WhatsApp is enabled: approved provider/account, consent and opt-out, secured pairing, HTTPS, request signing, rate limits, persistence, restart behavior, failure handling, and secret rotation are verified.
- [ ] Privacy notice, retention/deletion, support contact, and applicable legal review are complete.

## Agent handoff report

After work, report: what was inspected; exact files/services changed; migrations and environment variable *names* (never values); commands/checks and their results; backup/restore evidence; remaining blockers; rollback steps; and any owner action still required. Clearly label each item **done**, **blocked**, or **not tested**. Do not claim a production setup was completed if no authorized VPS access, production migration approval, or provider credentials were supplied.
