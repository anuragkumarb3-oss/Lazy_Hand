# LazyHand VPS agent setup and production handoff

## Purpose and current status

Use this as the operating brief for an authorized VPS agent. It defines the safe target architecture, the questions to ask before making changes, and the acceptance checks. It is not proof that production is configured.

**Production is not ready yet.** During the latest audit, the connected Supabase project's `public` schema returned no tables. The application expects `profiles`, `orders`, `catalog_categories`, `catalog_products`, and `seller_applications`; authentication/profile/order/catalog flows that depend on those tables will not work until the intended schema, migrations, and RLS policies are created and verified. The customer catalog and partner dashboards also contain seeded/demo behavior. The VPS has not been inspected from this repository, and no Baileys bridge URL, pairing/status routes, or send-message API is documented here.

The project currently contains a Next.js web app and Expo app code, uses Supabase Auth from the browser, and has an order Route Handler. Do not mistake the preview screens for a complete marketplace. Do not claim launch readiness until all blocking items in this file pass against the actual production environment.

## Recommended target architecture

Keep the existing application stack unless the owner explicitly approves a change:

```text
Web/mobile clients -> Next.js app (currently connected to Vercel)
                  -> Supabase Auth + Postgres + Storage
                  -> private server-to-server WhatsApp notification adapter (only if approved)

VPS -> WhatsApp adapter process only, if the owner explicitly chooses to host it there
```

Do not move the Next.js app, database, or uploads onto the VPS as an assumption. This project already has a connected Supabase integration and is linked to a Vercel project. A VPS PostgreSQL database is not currently part of the application architecture. If the owner wants the app itself self-hosted, stop and get an explicit architecture decision first; the existing Vercel/Supabase setup and the VPS then need a separate network, backup, migration, and rollback plan.

### WhatsApp provider decision

There is no bridge endpoint documented or wired into this repository. The existing app only stores WhatsApp preferences; it does not send WhatsApp messages. Supabase OTP calls currently request SMS (`signInWithOtp` with a phone number and `verifyOtp` with `type: 'sms'`). Do not silently switch OTP delivery to WhatsApp.

For production authentication and business notifications, prefer the official WhatsApp Business Platform / Cloud API or a supported provider. Baileys is an unofficial WhatsApp Web client, can break without notice, and may cause the linked account to be restricted. Use Baileys only after the owner explicitly accepts that operational/platform risk and confirms the account is authorized for this use. Never use a personal number or send unsolicited messages.

## Ask the owner before setup

Ask only for what is missing; do not ask for passwords, private keys, API secrets, Supabase service-role keys, OTPs, QR screenshots, or session files in chat.

1. **VPS access:** hostname/IP, OS/version, SSH port, and the approved secure way to grant the agent access. Require a named non-root account with narrowly scoped `sudo`; do not request a root password or a private SSH key in chat.
2. **Domains and hosting:** confirm the production app hostname, whether it remains on Vercel, who can update DNS, and the desired hostname for any public HTTPS bridge. Confirm the VPS can accept only the required inbound ports (normally SSH from an allowlist and HTTPS through a reverse proxy; never expose Postgres or an admin/debug port publicly).
3. **WhatsApp purpose:** is WhatsApp needed for (a) login OTP, (b) order/status notifications, (c) both, or (d) neither? Confirm the sender/account owner, country, consent/opt-in wording, expected volume, and recovery contact. Explain the Baileys risk before asking the owner to approve it; recommend the official API for production OTP.
4. **Existing bridge:** ask where the existing bridge repository/process is, if one exists, and whether the agent may inspect it. If no bridge exists, ask the owner to choose the official API or explicitly approve a Baileys prototype. Do not invent a URL or overwrite an unknown process.
5. **Supabase production project:** confirm which project is production, whether the empty public schema seen in this audit is the intended project, and whether the agent is authorized to prepare/apply reviewed schema migrations. Confirm a recent restorable backup exists before any production DDL or data changes.
6. **Admin access:** identify the intended admin account(s) by email/user ID and confirm who can grant the trusted Supabase `app_metadata.role = 'admin'`. Do not grant admin through `user_metadata`, a client field, profile form, or public signup.
7. **Business rules:** confirm launch location/coverage, seller/rider approval process, COD/payment plan, delivery pricing, cancellation/refund rules, and whether the seeded shops/products are to be removed or replaced with real catalog records.
8. **Operations:** confirm backup retention, monitoring/alert destination, maintenance window, rollback owner, log retention, and who responds if OTP/WhatsApp delivery fails.
9. **Legal/privacy review:** confirm approved privacy notice and consent text, data-retention/deletion policy, and business approval for handling phone numbers and location. Do not collect identity/bank documents until the storage, access, consent, retention, and incident-response design is approved.

If a required answer or secure access method is unavailable, report the blocker and stop before making a production change. Never guess at a value or put secrets in source control.

## Safe execution sequence

### Phase 1 — Inspect and report

- Confirm the target host and deployment; capture OS, disk, memory, firewall, reverse proxy, running services, DNS, TLS, and backup status without printing secret files.
- Inspect existing bridge services and their documented API before starting, replacing, or pairing anything.
- Confirm the Vercel project, Supabase project reference, current migration history, schema, RLS policies, Storage buckets/policies, Auth providers, and rate limits. Do not echo `.env` contents or access tokens.
- Take and verify a backup before schema or service changes. Record a rollback plan and the exact files/services to be changed.
- Return a concise before-state report and ask for approval for any production mutation not already explicitly authorized.

### Phase 2 — Database and application readiness

- Create reviewed, versioned migrations for every table the app uses. At minimum reconcile profiles, catalog categories/products, seller applications, and orders with the current TypeScript models and Route Handlers. Add foreign keys, constraints, indexes, timestamps, and idempotent migration tracking.
- Enable RLS on every table exposed through the Supabase Data API. Add and test policies for: a user reading/updating only their profile; users reading only their own orders; public/active catalog reads only; sellers managing only their own allowed listings; and admin-only category/seller review actions using a server-controlled trusted claim. Never rely on hiding a button or client-side role checks as authorization.
- Keep service-role credentials server-only. Prefer the user's authenticated Supabase session plus RLS for normal operations. Do not put service-role keys in `NEXT_PUBLIC_*` variables or ship them in the client bundle.
- Replace seeded shop/product/order data with approved real data before opening orders. Ensure the server computes prices and order totals from the authoritative catalog, validates stock and shop status transactionally, prevents overselling, and records order state changes server-side.
- Add rate limits and abuse controls for OTP/signup/order endpoints; verify phone provider configuration, OTP expiry, resend limits, and recovery. Keep payment and fulfillment status changes server-authoritative.
- Keep user-specific API responses non-cacheable. Require a same-origin/CSRF strategy for cookie-authenticated writes and validate inputs on the server.

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

The project already has Supabase variables managed by the integration. Verify names/target environment in Vercel; do not copy their values into this file. For any chosen bridge integration, define only the server-side values actually required, for example:

- `WHATSAPP_BRIDGE_URL` — HTTPS base URL, server-only.
- `WHATSAPP_BRIDGE_HMAC_SECRET` — signing secret, server-only; never `NEXT_PUBLIC_*`.
- Provider-specific credentials only if the owner chooses an official provider; keep them in the provider/Vercel secret manager.

Use separate credentials for development, preview, and production. Never print secrets, write them to Git, expose them in logs, embed them in QR links, or paste them into chat. The VPS should not receive Supabase service-role credentials unless a narrowly scoped, reviewed server task truly requires them; the bridge should not access the database.

## Production acceptance checklist

Do not report “ready” until all applicable items pass and evidence is recorded:

- [ ] Intended production Vercel and Supabase projects/domains are confirmed; DNS and TLS are valid.
- [ ] Database migration set exists in source control, has been reviewed/backed up, and is applied to the correct environment.
- [ ] Every Data API table has RLS enabled and tests prove anonymous users and non-admin users cannot read/change protected data.
- [ ] Supabase OTP provider delivers and verifies real codes; resend limits, failures, and recovery are tested.
- [ ] Profile, catalog, seller-application, order create/read/status, inventory, and admin workflows use real persistence and authoritative server-side permissions—not demo-only controls.
- [ ] Order prices/fees are server-calculated; stock and status transitions are safe under concurrent requests; retries are idempotent.
- [ ] Cookie-authenticated mutations have CSRF/origin protection; private responses are not cached; rate limits are enabled.
- [ ] `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm build` pass with no ignored TypeScript/build errors.
- [ ] Backups are encrypted and a restore has been tested; monitoring, alerting, log redaction, and rollback are documented.
- [ ] If WhatsApp is enabled: approved provider/account, consent and opt-out, secured pairing, HTTPS, request signing, rate limits, persistence, restart behavior, failure handling, and secret rotation are verified.
- [ ] Privacy notice, retention/deletion, support contact, and applicable legal review are complete.

## Agent handoff report

After work, report: what was inspected; exact files/services changed; migrations and environment variable *names* (never values); commands/checks and their results; backup/restore evidence; remaining blockers; rollback steps; and any owner action still required. Clearly label each item **done**, **blocked**, or **not tested**. Do not claim a production setup was completed if no authorized VPS access, production migration approval, or provider credentials were supplied.
