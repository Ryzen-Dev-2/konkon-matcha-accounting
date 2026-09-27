# Deletion, storage and bounded maintenance

## Delete is different from disable

Team **Disable** is reversible. **Delete** is not: the account disappears from the directory, password/contact fields are erased, its existing sessions fail authorization, and its phone scanner/customer-display passes expire. The username and email can be reused by a new account. Owner deletion remains prohibited by the Team endpoint; use the separate guarded ownership/recovery workflow.

Member deletion erases the profile name, phone, email, identity lookup hash/last four digits/type and printable card credential. Issued QR/NFC tokens are revoked and erased. Registration may reuse the phone/identity details, but creates a new member ID and does not inherit the old points or spend. Card creation and deletion share a transactional member write to prevent a concurrently issued credential surviving deletion.

Minimal archived records retain stable IDs, member numbers and accounting aggregates for historical references. Existing receipts, invoices, refunds and mutation audits remain unchanged; their original names and financial snapshots are not a disposable address book. This is not a claim of complete legal erasure from all historical records or backups.

Existing physical-card bindings remain as non-reversible keyed fingerprints for the restricted **orphaned NFC registration** workflow. They cannot identify an active member after deletion. Clear the orphan registration before rebinding the physical card. Deleted/cleared card rows disappear from the normal card list immediately and become eligible for physical deletion after 90 days. An archived member's uncleared bound card is not silently erased.

## What expires

- Acknowledged scan events: encrypted/plain scan payload erased on ACK; remaining delivery metadata expires no later than 60 seconds after ACK.
- Scanner passes, unread scan events and display passes: their existing expiry, normally at most 24 hours. Revocation/owner session checks enforce access even before physical cleanup.
- Authentication throttles, protected-identity lookup throttles and local payment notification queues: their existing `expiresAt`/`expireAt` dates. Payment webhook delivery-deduplication records retain the existing 30-day policy; durable payment confirmations are separate and retained.
- Only this explicit audit allow-list expires after 90 days: `auth.login`, `member.identity_lookup`, `member_card.reveal`, `einvoice.download`, `scanner.issue`, `scanner.route`, `scanner.revoke`, `scanner.binding_start`, `scanner.binding_finish`, `payment-display.issue`, `payment-display.revoke`.
- Deleted/cleared card metadata: 90 days after `deletedAt`, and only when status is `DELETED`.
- Online-order rate-limit rows expire at their recorded `expiresAt`. Online-order attachment metadata is retained even after it becomes orphaned because its private-GitHub blob remains in Git history; retaining the size record keeps quota reporting conservative and honest.
- Requested, rejected or cancelled online orders without a linked invoice/receipt become eligible for personal-data clearing after the Owner's 30–365 day policy. Clearing removes customer contact/address, notes, controlled-goods answers, conversation and private access credentials while retaining product/value/status evidence for operational counts. Related active file metadata is marked orphaned. The encrypted private-GitHub blob remains until repository retention removes it; clearing MongoDB metadata is not described as deleting that remote commit.
- Completed online orders are covered only when the Owner enables their separate 30–365 day policy. The job must successfully email the customer 1–30 days before scheduling cleanup. It then removes private contact/chat/access data on or after the later of the policy date and promised warning period, while retaining item/value, linked document and audit evidence. Turning the setting off stops new reminders and completed-order cleanup.

Ledger journals, sales, refunds, invoices, payment confirmations, stock movements, coupon redemption evidence, settings history, ownership events and business/account/card mutation audit logs have **no automatic purge added by this release**. Repeated unchanged settings saves and scanner routing do not create new writes/audit events.

MongoDB TTL cleanup is asynchronous, typically sweeping in about 60-second cycles and potentially lagging under load; expiry is not an exact deletion timestamp. The application must still enforce expiry itself. See [MongoDB TTL behavior](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Daily job and manual controls

`vercel.json` calls `/api/maintenance` once daily at 19:00 UTC (approximately 03:00 Singapore time). Hobby supports daily jobs with hour-level precision; execution consumes the normal function allowance. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Configure `CRON_SECRET` as a separate random value with at least 32 characters, Sensitive and Production-scoped. Vercel sends it as a Bearer token. No default token is accepted. See [Vercel cron protection](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

- Authenticated Owner `GET /api/maintenance` always previews without applying changes.
- Authenticated Owner, same-origin `POST /api/maintenance` applies one bounded batch.
- Cron Bearer `GET /api/maintenance?dryRun=1` previews; without that query it applies.
- Other roles and unauthenticated callers cannot run or inspect maintenance. Public URLs alone grant no maintenance access.

Each run selects at most 100 expired records per listed temporary collection, 25 legacy archived profiles per profile collection, 25 old online-order requests for personal-data clearing, three completed-order reminders, 25 warned completed orders due for cleanup, 100 legacy operational logs lacking expiry, and 25 uncompressed legacy electronic invoices. Reminder sends run concurrently within the serverless budget. It checks a 20-second work budget and returns `budgetReached` if a later batch must wait. Conditional updates/deletes make retries safe. Large backlogs drain gradually; this is not a promise to clear an entire database in one invocation. Native TTL handles normal ongoing expiry.

The response contains counts and document bytes saved, not personal data or document content. `dryRun` reports bounded candidates, not total database usage. No maintenance-run log is written to MongoDB; use Vercel execution logs. A failed job can be rerun by the Owner after resolving the cause. Inspect `invalidDocuments` and restore a verified backup for corrupt/unreadable artifacts; those artifacts are left untouched.

## Managed evidence capacity

Owner settings report logical protected bytes for expense evidence and online-order files recorded by the application. The fixed guard has a 10 GiB maximum, warns at 8 GiB and rejects a new evidence upload with HTTP `507` when it would cross the 9.5 GiB upload ceiling. The remaining 512 MiB is a safety reserve for concurrent in-flight requests; it is not additional advertised capacity. Existing accounting, POS, reports and downloads remain available when uploads are paused.

This is a preventive quota, not a claim of unlimited storage. Git keeps prior blobs in commit history, so removing a current path or its MongoDB metadata does not reliably reclaim repository storage. Financial evidence is never silently deleted to make room. Continuous cyclic storage requires a lifecycle-capable object store plus an approved retention/archive policy; destructive Git-history rewriting is deliberately not automated. The meter also excludes unrelated repository files, Git overhead and Atlas data, so the evidence repository should remain dedicated to this application.

## Compression and protection

New electronic-invoice text files and online-order/expense evidence use adaptive Brotli only when the protected payload is smaller, followed by document-bound authenticated encryption. Legacy gzip and uncompressed electronic invoices remain readable and are migrated gradually after a verified round-trip. Downloads authenticate encryption, bound decompression and verify the exact original size/SHA-256 digest. Generation idempotency, immutable source history and public/private access rules are unchanged. This does not make an e-invoice tax-authority submitted or certified.

Compression saves repetitive document payloads; it is not encryption, deduplication of legitimate transactions or a substitute for backups. Atlas Free counts logical uncompressed BSON plus indexes, so database-engine disk compression alone does not remove the quota. No measured production-space reduction should be claimed without actual before/after evidence. See [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

Do not rotate `AUTH_SECRET` or `IDENTITY_LOOKUP_SECRET` casually: existing encrypted documents/card data and keyed identity lookups depend on them. Secure backups, a key migration plan, access controls and restore testing remain necessary. Automatically erased contacts/credentials cannot be recovered in-app; retained financial documents are not deleted by maintenance.
