# Kōn-Kōn Matchā Ledger

A connected commerce, accounting, inventory, membership and point-of-sale workspace built for Kōn-Kōn Matchā. The public index uses a KONA-led cinematic parallax journey; signed-in Owners can upload a workspace logo and choose Matcha, Professional or Focus workspace themes. The production application is a Next.js App Router project backed by MongoDB Atlas and designed for Vercel serverless deployment.

**Author:** [Ryzen Hub Dev](https://github.com/Ryzen-hub-dev) · **Built for:** Kōn-Kōn Matchā · **Version:** 1.0.0

User training: [完整中文使用手册](docs/user-manual-zh.md) · [Complete English user manual](docs/user-manual-en.md). The signed-in workspace also includes a searchable, printable bilingual **Help & manual** centre.

> This is an actively developed accounting platform, not yet a drop-in replacement for every AutoCount module. The repository clearly separates shipped, tested workflows from planned country-compliance modules so unfinished tax functionality is never presented as filing-ready.

## Shipped workflows

### Owner, team and security

- First-run Owner setup; Owner is the highest role.
- [Private Owner replacement](docs/owner-recovery.md): operator-issued, 24-hour, single-use registration link; preserves the team and all business records, without reopening public setup.
- Owner, Admin, Manager, Accountant and Cashier server-enforced permissions.
- One shared role-policy catalogue drives both API authorization and the visible workspace menu; Team shows the exact Manage/Use/View/Locked matrix for every role.
- Staff account generation with temporary passwords and mandatory password change.
- Renewable staff lookup credentials for reusable fuzzy-search pickers. QR/NFC lookup selects an eligible account but is never accepted as login or authorization.
- Self-service password change and administrator password reset.
- Versioned sessions: password, role, disable and archive changes revoke existing sessions.
- Reversible account disable, plus transactional deletion that removes login/contact details and revokes linked devices. Deleted staff disappear from Team; usernames/emails can be reused while stable IDs preserve historical evidence.
- Owner-only 24-hour ownership-transfer cooling period with cancel/complete steps.
- Open, read-only and closed workspace modes with an optional automatic reopen time.
- Audit records for security, ownership, inventory, member, sale and configuration changes.
- Optional managed-instance Trust & Safety programme: a clone Owner reviews the current terms and an explicit metadata disclosure, applies for supervision, and receives signed status policies from the platform authority. The authority sees the deployment origin, display name, provider, release identifier, observed server connection address and check-in state; it does not receive customers, members, orders, documents, accounts, payroll, inventory, passwords or session cookies through this programme.
- Public buyer conduct reports use bounded evidence links, encrypted optional contact email and one-way connection fingerprints for abuse prevention. Heuristics only prioritise a case; a recorded human decision with a visible reason is required to substantiate/dismiss a report or ban/reopen an enrolled instance. A ban locks the public site, shop, customer links, operational webhooks, scheduled invoice generation and every workspace operation except the Owner sign-in/password-recovery and appeal path. Public traffic and active workspaces check for signed policy changes without accepting an unsigned fallback; an appeal stays locked until a human reviewer reopens the instance.
- Release notices link to the upstream change history for review. The application deliberately does not mutate a fork or deploy from the browser without a separately authorised GitHub App/deploy integration. JavaScript/source obfuscation is not treated as an unremovable security boundary; per-instance secrets, authenticated policy signatures, server-side enforcement and audit evidence are the actual controls.
- Central exception-review queue for unusual manual discounts, high cumulative refunds, material inventory shrinkage, register variances and repeated failed sign-ins. Manager acknowledgement, resolution and reopening use optimistic versions and append-only review history; a rule match is evidence for review, not an automatic accusation.

### Online orders and customer fulfilment

- Owner-controlled public catalogue publishes selected active products with live availability. Customers submit product quantities, email, phone, delivery address, a note and configured controlled-goods answers; submission is an order request, not a reservation or charge.
- Manager/Admin/Owner review the request, accept or reject it, adjust quantities, apply per-line discounts and publish a final offer. Submission acknowledgement, staff replies, review decisions, offers, payment requests, invoices, receipts and shipment updates use one responsive transactional-email design with the current workspace name/logo and an Owner-verified Google SMTP App Password.
- The branded private order page keeps customer/staff chat, protected image/PDF evidence, payment instructions, linked invoice or verified POS receipt, custom fulfilment steps and manual/API carrier tracking in one route. A payment request never marks settlement; only a matching completed POS receipt currently confirms payment.
- Order files use the existing Owner-configured private GitHub evidence repository, 4 MB Vercel-safe uploads, lossless adaptive compression, authenticated encryption and integrity verification. A 10 GiB managed-evidence guard warns at 8 GiB and pauses new uploads at 9.5 GiB, retaining a 512 MiB concurrency reserve so normal uploads cannot fill the configured allowance. Google SMTP credentials are verified before save and encrypted at rest.
- Abandoned, rejected and cancelled requests have Owner-configurable 30–365 day retention. Completed-order cleanup is independently optional with a 30–365 day policy and a required 1–30 day customer email warning before private data is cleared. Daily maintenance clears contact, address, controlled-item answers, chat and access tokens while preserving document, item/value and audit evidence; temporary throttles expire in bounded batches. Orphaned attachment metadata is retained so the storage meter does not pretend that a still-retained Git blob was reclaimed.

### POS, receipts and promotions

- Multi-counter operation with a protected Main counter, custom counters, location attribution and optional Manager bindings. Every new sale, stock movement, journal and receipt snapshots its counter/location; a bound counter rejects other Managers while unbound counters remain shared.
- Controlled register shifts with multi-currency opening floats, operator ownership, blind closing counts, Manager-reviewed cash variances, live X reports and immutable Z reports. Shift control activates per counter on its first opening so existing deployments can migrate without an abrupt sales lock.
- Product cart, member selection, administrator-defined payment methods and optional/required payment references.
- Payment-method routing to an active cash/bank asset account, revalidated by the API and snapshotted on each sale for accurate refunds.
- Server-calculated prices, coupon discounts, tax, cash received and change due.
- Cash and non-cash settlement in configured ISO currencies using administrator-locked exchange rates, with base/tender amounts snapshotted on the receipt.
- Provider-verified transfer/wallet foundations with signed callbacks, replay protection, exact amount/currency matching and one-time confirmation consumption.
- Optional downloadable USB-local SmsForwarder + notify-me payment evidence listener: signed/token-authenticated ingress, OTP and outgoing-message rejection, raw-text disposal, dual-delivery deduplication and a review-only MongoDB queue. It never marks a sale paid by itself.
- Separate customer-facing phone display passes with Welcome/Thank You states. TNG/DuitNow recipient QRs are validated, locked to the exact POS MYR amount and issued with a recalculated CRC; a display state or payer animation never replaces receiving-side confirmation.
- Cashier-scoped browser order recovery and bounded draft history across refreshes and page changes; sensitive payment references and verification codes are not cached.
- Idempotent checkout requests prevent a network retry from creating a second receipt or double-deducting stock.
- Manager-only manual discounts; Cashiers cannot submit arbitrary discount values.
- Percentage and fixed coupons with start/end time, minimum spend, total-use limit and per-member limit.
- Transactional stock deductions, member points, coupon redemption and double-entry posting.
- Custom 58mm/80mm receipt and invoice templates with a live drag-to-reorder component canvas, safe text/image component imports, safe raster logos, privacy-first address-hidden defaults, print/reprint and refund workflow. Required financial blocks cannot be removed and external JavaScript is never executed.
- Historical receipt/template/business snapshots so reprints do not change later.
- Receipt-number/QR lookup, signed customer receipt links, PDF printing, CSV and accounting JSON export; customer views show current refund totals without exposing member identity, staff names, costs or private payment references.
- Click a cart quantity to enter an integer directly; both cart and checkout enforce available stock and the 999-unit line limit.

### Barcode and mobile scanning

- Optional unique barcode on each product; products without manufacturer codes remain supported.
- USB/Bluetooth keyboard-wedge scanner input in Inventory and POS.
- Receipt and member screens also accept scans. A receipt QR scanned at POS opens that receipt for review; a member QR/NFC credential selects its active member.
- A shared live scanner bridge recognises a product barcode/SKU, member card/member number or coupon code in POS.
- Inventory scans open an existing product editor or open a new product form with the new barcode already populated.
- Up to five active mobile-scanner passes per operator.
- Mobile pass contains a 256-bit random bearer token; MongoDB stores only its SHA-256 hash.
- Pass expires after 24 hours, can be revoked immediately and is invalidated whenever the Owner changes system mode.
- The public mobile page can only send codes. It cannot read the catalogue, member data, pricing or reports.
- Three-second bounded long polling lowers average delivery latency to roughly one polling slice (250 ms) without a persistent WebSocket server, remaining compatible with Vercel Hobby/serverless execution.
- Mobile camera decoding uses native multi-format detection where available and dynamically loads ZXing 1D/2D fallback support elsewhere; previously granted camera permission starts automatically.

### Members and data protection

- Member profile, phone/email, points, lifetime spend and service history.
- Printable Code 39 member card with a renewable random card code.
- Exact National ID/passport/business-ID search without storing or returning the full identifier.
- Identity values are normalized and protected with an `IDENTITY_LOOKUP_SECRET`-keyed HMAC; only the hash and last four characters are stored. `AUTH_SECRET` is a local-development fallback only.
- Protected identity lookup is rate-limited and audit logged.
- Member deletion clears profile contacts, identity lookup keys and the printable card code; issued credentials are revoked. Phone/identity details can be registered again with a new member ID, while old receipts, points and accounting references remain separate and intact.
- Independently issued QR/NFC member cards with editable label, membership title and colour; suspend, reactivate, permanently void and audit-preserving delete controls.
- Existing-card NFC binding is integrated into **Tap-to-read NFC**: reuse a connected POS/Members phone or link a new one, and confirm the target member before binding. A temporary member lock and per-binding reservation ID prevent other screens or delayed events from assigning the wrong member. Confirmation/Finish binding returns shared passes to lookup without restarting NFC. Same-device reading also requires confirmation. Existing dedicated legacy passes retain their original revoke-on-finish behavior. Bound cards retain suspend/reactivate/void/delete controls.
- Orphaned NFC cleanup: Members shows only existing-card bindings whose member was archived or removed. Authorized staff can review the card metadata and clear that binding; the physical card can then be bound to another member without changing sale, refund, points or accounting history. POS and the keyboard-wedge/linked-phone scanner can scan the bound code and open the same guarded clear action.
- Random card credentials, SHA-256 lookup hashes and AES-256-GCM encrypted storage. No name, phone or identity number is written to an NFC tag. Consumed scanner payloads are removed immediately on acknowledgement, with the remaining event metadata expiring within one minute (subject to MongoDB's TTL sweep).
- [Bounded data maintenance](docs/data-retention.md): daily temporary-record cleanup, legacy deleted-profile scrubbing, 90-day operational-log retention and lossless compression before encryption for electronic-invoice files. Financial records and mutation audit evidence are not automatically deleted.
- Phone-based NDEF reading/writing on supported Android Chrome devices, with QR fallback elsewhere. Static tags are copyable identification credentials, not payment authorization or clone-resistant smart cards. See [receipt and NFC guide](docs/receipts-and-nfc.md).
- The linked-phone pass keeps barcode camera/USB/Bluetooth scanning in its own lane and exposes NFC as a separate reader. NFC attempts to start automatically when the pass opens (one browser permission gesture may still be required), then stays live while the page is foregrounded.
- POS and Members also mount the same NFC reader directly: tap an issued or bound card to select/lookup the member without opening the barcode scanner. A linked phone follows the active counter page without reopening its pass. Normal reading stays active after each tap, suppresses duplicate/in-flight events and permits retries after failed delivery. Web NFC suspends in the background and resumes the same subscription in the foreground; supported phones request a screen wake lock. First use may require one permission tap, and the phone must remain unlocked. Pass expiry, revocation and the one-card binding confirmation step still apply.
- Staff selectors use one shared fuzzy-search component across counter responsibility and Owner transfer. Owner/Admin can renew a non-authenticating staff lookup credential and write it to NDEF NFC; the server resolves only its SHA-256 hash and rechecks active status and selection eligibility.
- Active NFC is displayed as a live status, not a disabled button. Leaving an unfinished shared binding releases its reservation; the next POS/Members screen reconnects after release, without restarting the phone reader. Shared dialogs use the browser's top layer, with visible form-error notices, focus containment, Escape/close support and background scroll locking. The isolated acceptance suite exercises actual touch/mouse interactions at 390, 768, 1024 and 1360 pixels, including a simulated save failure that must remain visible above the dialog.

### Inventory and accounting

- Product create/edit, optional barcode, SKU, category, unit, retail price, cost and reorder level.
- Stock adjustment journal with mandatory reason.
- Physical stocktake with typed or scan-to-count quantities, variance posting and auditable stock movements.
- Gradual multi-location inventory activation: existing company stock is allocated once across active locations, then sales, refunds, purchase receipts, adjustments and physical counts maintain both the location balance and company total. Controlled transfers separate dispatch, in-transit, destination receipt and cancellation without creating a false purchase or accounting journal.
- Gradual [batch and expiry control](docs/inventory-batches.md): opening lots reconcile to location stock, purchase receipts capture supplier provenance, POS consumes unexpired lots by FEFO, receipts retain exact allocations, and refunds/transfers restore or move those same lots. Expired stock stays visible for controlled count or disposal but is excluded from sale.
- Freshness action queue using 30-day net location demand: FEFO sell-through forecasts identify units at risk before expiry, suggest higher-demand transfer destinations without moving stock automatically, and post authorised expiry/damage/recall disposal to Inventory write-off with immutable lot evidence.
- Product archive/restore preserving stock and transaction history.
- Manual balanced journals and a seeded chart of accounts.
- Controlled bank reconciliation from local CSV statements: strict statement arithmetic, exact-amount/date suggestions that require staff confirmation, one-use ledger matches, prior/current uncleared-item working papers, zero-difference completion and immutable reviewed snapshots.
- Provider-neutral live-bank interface: the Owner can map a signed push feed to one cash-equivalent ledger account, rotate its one-time secret, disable it immediately and inspect the latest normalized transactions. HMAC, a five-minute replay window, currency precision and event-id idempotency are enforced. Creating an interface does not contact a bank; a bank, aggregator or private middleware must still be configured to send events.
- Thirteen-week scheduled cash forecast starting from the current posted cash-equivalent balance and applying open customer invoices and supplier bills by due date. It highlights overdue exposure, the lowest projected balance and the first negative week, exports to CSV and prints with the report desk. It is a management scenario, not a prediction of new sales, purchases, payroll, financing or bank settlement.
- Month-end close register with journal-integrity and bank-coverage checks, immutable close snapshots, out-of-band ledger drift detection and transaction-level back-date enforcement across every journal-posting workflow. Accounting staff can close completed months; only the Owner can reopen them, in reverse order with a recorded reason.
- Fixed-asset register with cash/bank acquisition journals or explicit register-only migration, exact minor-unit straight-line depreciation, sequential monthly runs, ledger-linked asset history and controlled disposal gain/loss journals. Month-end close blocks while an in-service asset has depreciation due; book depreciation is not presented as a tax capital-allowance calculation.
- Monthly payroll profiles and frozen pay-run snapshots with country, base pay, allowances, reviewed employee deductions and employer contributions. Malaysia MYR runs now require a per-employee EPF, SOCSO, EIS, PCB, Zakat and CP38 review before approval, retain the calculation source, invalidate the review after pay changes and post each statutory liability separately. Owner/Admin approval, balanced accrual journals, payment-account posting, detailed printable payslips, safe CSV summaries and period locks are implemented. Automatic authority calculators and government payroll submission remain unconnected rather than guessed.
- Fully controlled entity consolidation from the current posted ledger plus reviewed imported trial balances. Closing/average FX rates, currency-translation reserve, balanced elimination journals, immutable run evidence and consolidated trial balance are included. Minority interests, goodwill and automatic intercompany matching remain accountant adjustments.
- Controlled annual operating budgets for revenue and expense accounts: Accountants maintain twelve monthly values, Managers can read plans, and only the Owner can approve and lock a revision. Later changes clone the approved plan into a new draft while older revisions remain read-only. YTD budget-versus-actual uses posted journal normal balances with currency precision and labels favourable revenue/expense performance explicitly; it is a management plan, not a guaranteed forecast.
- Cost-centre and project management accounting with permanent codes, archive/restore controls, optimistic edits and immutable line snapshots on manual journals. Audited exact-match allocation rules can classify POS by location, expense payments by expense account and purchase receipts by location, either to one dimension combination or across as many as ten percentage splits. Customer accounts can supply invoice defaults, and products can override the POS location rule for their own sales, cost-of-goods and inventory lines. Each sale freezes per-product classification and exact discount/tax values so repeated partial refunds reverse the original cents and dimensions even after master-data changes. Editable invoices may inherit customer defaults, override them or explicitly remain unassigned; the saved snapshot reaches payment journals and quotation conversion. Period reports calculate posted revenue, expense and profit by dimension while keeping unassigned P&L activity visible as an explicit coverage percentage. Tagging and splitting never change double-entry totals or the statutory ledger.
- Searchable main-country settings for 249 countries/regions, editable date/number format and time zone, and explicit country selection during Owner setup.
- Local-day/month dashboard statistics, calendar-safe invoice due dates and manual journals, and currency-specific precision for product prices, coupons, POS and refunds.
- Draft/sent/paid/void invoices with custom uploadable JSON templates and printable documents.
- Controlled weekly, monthly, quarterly and yearly invoice schedules with linked active customers, template and management-dimension choices, month-end-safe calendar recurrence, deterministic duplicate protection and Vercel Hobby-compatible daily draft generation. Scheduled runs never email, post, charge or consume customer credit automatically.
- Country report desk for all 249 selectable countries/regions: financial-statement CSV/JSON exports, tax-ledger evidence and explicit working-paper adapters for SG/MY/AU/GB. No automatic conversion or certified filing claims.
- E-invoice preparation from invoices, receipts and supplier bills: UBL 2.1 XML, accounting JSON and MyInvois 1.0 JSON for document types 01–04 and self-billed types 11–14, including consolidated-receipt General Public handling and original-document references for adjustments. Encrypted immutable history, checksum verification, request idempotency and source reconciliation remain in place. Generated files start as not submitted. An Owner may separately connect official MyInvois sandbox/production ERP credentials, submit one reviewed MYR document, retain authority submission/UUID evidence and refresh validation status. Other countries remain working-paper exports, not filings. See [country documents and remote NFC guide](docs/country-documents.md).
- Invoice register search and status filters, explicit sent/paid/void confirmations, safe copy-as-new-draft, and optimistic-concurrency editing for unpaid drafts. Retried creates carry an idempotency key; issued and paid documents remain immutable.
- Customer-account credit limits, default terms and explicit credit holds. Invoices can be linked to a member account; the server rechecks live exposure when the draft is sent, serialises concurrent sends for the same customer, snapshots the decision and produces a chronological customer statement from issued invoices and recorded payments.
- Controlled customer quotations with calendar-safe validity, immutable sent/accepted/rejected/void states, recorded acceptance evidence, printable snapshots and an idempotent accepted-quote conversion into one invoice draft. Recording “sent” does not email the customer, and recording “accepted” is not an electronic signature.
- Quote-linked customer delivery orders with scheduled dates, destination/carrier/tracking details, printable item snapshots and forward-only draft/dispatched/delivered/cancelled evidence. Each accepted quotation produces at most one complete delivery order; dispatch does not deduct stock and delivered status is not independent proof of receipt.
- Verified courier compatibility registry for GDEX, ABX Express (including legacy KEX aliases) and Ninja Van. Ninja Van uses the official fixed OAuth/order/waybill endpoints, encrypted cached access tokens, stable retry-safe references, bounded cached PDF waybills and raw-body HMAC-verified status Webhooks. The delivery detail shows the latest 100 retained signed carrier events as an ordered timeline without presenting them as customer proof of receipt. GDEX/ABX retain official tracking handoffs but live booking stays disabled until an approved account supplies the current private contract.
- Owner-only Telegram Bot API, Feishu/Lark custom bot and Discord webhook connections. Official hosts are allow-listed, credentials/signing secrets are encrypted, connection tests send a visible message and Discord mentions are disabled. New orders and customer messages broadcast to every connected route. Telegram additionally registers a secret-header webhook for one numeric authorized chat and accepts audited `/reply ORDER-NO message` responses; Feishu and Discord incoming webhooks remain notification-only and link back to the staff workspace.
- Image-led public shop with Owner/Admin catalogue controls. A product may use a validated HTTPS image or a browser-compressed JPEG/PNG/WebP upload capped at 240 KB in MongoDB, with customer and staff previews, lazy loading and no-referrer external image requests.
- Sales, margin, tender, inventory-value and receivable reports.

### Purchasing and accounts payable

- Auditable supplier master records with country, currency, tax/registration details, terms, lead time and archive/restore controls.
- Internal purchase requisitions with required-date/priority evidence, maker-checker approval or reasoned rejection, optimistic versions and one-time transactional conversion into a purchase-order draft. Conversion locks the approved destination, products and quantities while supplier pricing remains a purchasing decision.
- Controlled RFQs from approved requisitions: invite 2–10 active suppliers, record one offer per supplier, compare frozen base-currency subtotals and promised dates, document the award reason, then convert the winning supplier, unit prices and delivery date into one purchase-order draft. Cancelling restores the source requisition without deleting sourcing history.
- Draft, maker-checker approve, cancel and partially receive purchase orders with immutable supplier, product, location, time-zone, tax and exchange-rate snapshots. A controlled short-close records why an outstanding balance will not be delivered without altering receipts already posted.
- Atomic goods receipt posting: stock, weighted-average cost, stock movement, supplier bill, input tax, accounts payable, journal and audit event succeed or roll back together.
- Three-way invoice matching at receipt: exact matches post normally; supplier total or tax differences create a versioned maker-checker exception without changing stock, payables or journals. Approval is bound to the exact invoice number, date, quantities, total and tax and is consumed by one successful posting.
- Landed-cost allocation for freight, customs duty, cargo insurance, handling and other direct import costs. Each supplier invoice can allocate by received value or quantity; remaining units update moving-average inventory cost, consumed/returned units flow to cost of goods sold, recoverable tax remains separate and a payable bill plus balanced journal post atomically.
- Controlled purchase returns from unpaid bills: exact receipt-value and tax slices, current inventory carrying-value reversal, batch/location stock checks, supplier credit-note uniqueness, variance posting, period locks and audit evidence commit in one transaction.
- Duplicate-request and duplicate-supplier-invoice protection prevents double receipts, duplicate inventory and repeated payables.
- Partial/full supplier settlement from approved cash/bank accounts with unique bank-reference protection, payment-time FX rates and automatic exchange-gain/loss journals.
- Base-currency AP aging across Current, 1–30, 31–60, 61–90 and 90+ day buckets, with seven-day maturity visibility, supplier exposure and safe CSV export.
- Smart Replenishment combines reorder thresholds, trailing 30-day unit demand and supplier lead time, then deducts quantities already inbound on open purchase orders.
- Supply Pulse scores suppliers from actual on-time receipts, average lateness and overdue commitments.

### Staff expenses and protected evidence

- Every role can create its own expense draft, attach up to ten receipts or supporting documents in sequential 4 MB uploads, review/remove mistakes while still in draft, and submit only after at least one active evidence file is stored. Removing evidence keeps the encrypted repository copy and an immutable audit event instead of erasing history. Managers review submitted claims; Accountants post approved payments; Owner/Admin retain the combined authority. Non-Owners cannot review their own claim; the sole Owner retains the same explicitly audited override used by purchasing so a one-person company is not deadlocked.
- Approved payment atomically changes the claim, records the reimbursement, enforces the accounting-period lock, posts Expense/Input tax against the chosen cash or bank account, and writes audit evidence. A payment request key prevents duplicate posting.
- The Owner alone configures a dedicated private GitHub repository and fine-grained token. The token is AES-256-GCM encrypted in MongoDB, never returned to the browser, and the server rejects public repositories or tokens without write access.
- Owner settings show the protected file count and logical bytes managed by this application. This meter does not include unrelated repository files or Git history. Git commits are append-only, so a fixed 10 GiB store cannot provide unlimited attachment retention; when the safe ceiling is reached, accounting continues but new evidence uploads stop until an approved archive/storage migration is completed.
- Evidence is adaptively compressed with maximum-quality Brotli only when that saves space, then encrypted and checksummed before the GitHub upload. JPEG/PNG/PDF bytes are never resized or recompressed; previews and downloads verify and reproduce the exact original bytes. The authenticated in-app viewer handles common images, PDFs and plain text, falls back to original download when a browser cannot decode HEIC/HEIF, and records viewing separately from downloading in the audit trail. Already-compressed content is encrypted without artificial expansion from a second codec.
- Repository paths and GitHub download links remain server-side. Claimants can read their own evidence; authorised reviewers and payers can read evidence in their queue. Files are append-only through the expense workflow and are not silently deleted when a claim changes state.

## API contract

Every application endpoint returns JSON in one of these forms:

```json
{ "ok": true, "data": {} }
```

```json
{
  "ok": false,
  "error": "Safe public message",
  "issues": { "field": ["Validation detail"] }
}
```

Core endpoints:

- `/api/setup`, `/api/auth/login`, `/api/auth/logout`, `/api/profile`
- `/api/users`, `/api/staff-lookup`, `/api/system-control`, `/api/ownership-transfer`, `/api/attachment-storage`
- `/api/products`, `/api/stocktakes`, `/api/inventory-batches`, `/api/stock-transfers`, `/api/members`, `/api/coupons`, `/api/payment-methods`, `/api/exchange-rates`
- `/api/scanner-sessions`, `/api/mobile-scans`, `/api/payment-display-sessions`, `/api/payment-display`
- `/api/sales`, `/api/refunds`, `/api/receipt-templates`, `/api/payment-intents`, `/api/payment-confirmations`, `/api/local-payment-events`
- `/api/receipt-lookup`, `/api/public-receipts`, `/api/member-cards`, `/api/member-cards/lookup`
- `/api/invoices`, `/api/invoice-templates`, `/api/customer-accounts`, `/api/recurring-invoices`, `/api/quotations`, `/api/delivery-orders`, `/api/journals`, `/api/bank-reconciliations`, `/api/bank-connections`, `/api/webhooks/bank-feed`, `/api/accounting-periods`, `/api/fixed-assets`, `/api/payroll`, `/api/reports`, `/api/report-templates`, `/api/e-invoices`
- `/api/shipping/providers`, `/api/shipping/tracking-links`
- `/api/storefront`, `/api/storefront/[token]`, `/api/storefront/[token]/attachments`, `/api/online-orders`, `/api/online-orders/attachments`, `/api/order-attachments/[id]`, `/api/commerce-settings`
- `/api/suppliers`, `/api/purchase-requisitions`, `/api/request-for-quotations`, `/api/purchase-orders`, `/api/purchase-match-exceptions`, `/api/landed-costs`, `/api/purchase-returns`, `/api/accounts-payable`, `/api/expense-claims`, `/api/expense-attachments`, `/api/budgets`, `/api/accounting-dimensions`, `/api/dimension-rules`
- `/api/settings`, `/api/settings/history`, `/api/locations`, `/api/counters`, `/api/register-shifts`, `/api/maintenance`

Workspace writes require a same-origin browser request and authenticated role permission. Initial setup, private owner recovery and token-restricted phone scan submission have their own authorization rules. Customer receipt retrieval is a read-only POST requiring the signed receipt token; it never authorizes refunds. Public errors do not include stack traces, secrets or database internals.

## Local development

Requirements: Node.js 20.9 or newer and MongoDB Atlas (or a compatible MongoDB replica set for transactions).

1. Run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Supply a new MongoDB URI, a random `AUTH_SECRET`, and different stable `IDENTITY_LOOKUP_SECRET` and `PAYMENT_WEBHOOK_SECRET` values, each at least 32 characters.
4. Run `npm run dev`.
5. Open `http://localhost:3000/setup` once to create the Owner.

Never commit `.env.local`. Any credential pasted into chat, screenshots, tickets or logs must be considered exposed and rotated.

## Quality checks

```text
npm run typecheck
npm test
npm run build
```

`scripts/app-bug-crawler.cjs` performs a bounded, read-only authenticated crawl of the workspace and reports route failures, unexpected logouts, page exceptions and same-origin server errors. The disposable full smoke suite runs it after creating its own isolated test data.

The current suite covers authentication errors, origin protection, RBAC, MongoDB namespace isolation, invoice/receipt template validation, currency precision, tax math, coupon bounds, scanner token/routing, provider webhook signatures and exact amounts, local-listener signatures/privacy filtering, POS draft recovery, franchise hierarchy safety, protected identity lookup normalization, procurement validation, smart replenishment, supplier risk scoring, weighted inventory costing, exact three-way-match evidence, landed-cost minor-unit allocation, exact repeated purchase-return allocation, AP foreign-exchange settlement and system write-mode classification.

Invoice acceptance also covers impossible calendar dates, currency-safe line calculations, idempotent draft creation, unpaid-draft editing, template snapshot retention, optimistic version conflicts, immutable sent/paid transitions, payment journal posting and mobile invoice-register controls.

Deletion/storage regression checks are included in `scripts/receipt-membership-smoke.cjs`, which uses a disposable local MongoDB replica and production build. They cover member/staff identifier reuse, old-session/card invalidation, concurrent card issuance/deletion, old orphan-card visibility, maintenance authorization/dry-run/retries, retained financial evidence and legacy encrypted-document migration. `scripts/team-browser-smoke.cjs` renders the actual Team component with HTTP fixtures and tests create/reset/role/disable/delete at 320, 390, 768, 1024 and 1360 pixels. Both browser scripts take the directory containing Playwright as their first argument.

## Vercel Hobby design

- Node.js routes are short-lived and stateless; MongoDB owns durable scanner and transaction state.
- MongoDB client reuse is global per warm function instance with `maxPoolSize: 5`, `minPoolSize: 0` and idle cleanup.
- POS, Inventory, Receipts and Members automatically route a live phone pass to the active workflow. Every phone already routed to that workflow listens independently at the same time, so a barcode/camera phone and a Tap-to-read NFC phone can remain online together. Arriving scans are processed in order; each event snapshots its destination so simultaneous pages cannot consume the wrong scan. A bounded three-second wait returns scans in 250 ms slices, aborts when the page unmounts and pauses while the tab is hidden.
- TTL indexes automatically remove expired scanner sessions/events, authentication throttles and sensitive lookup events.
- One daily authenticated maintenance job at 19:00 UTC, bounded to small batches and a 20-second work budget inside a 30-second function. Configure a private random `CRON_SECRET` (at least 32 characters); see the [retention policy](docs/data-retention.md).
- No long-running server, filesystem persistence, WebSocket server or background worker is required.
- `vercel.json` pins functions to Singapore and enables Fluid Compute.

Vercel Hobby is intended for personal, non-commercial projects and pauses service after included usage is exhausted. Use it for development/testing; a live Kōn-Kōn commercial deployment should move to an appropriate paid plan and add production monitoring, backup validation and incident response.

See [docs/deployment-vercel.md](docs/deployment-vercel.md) and [SECURITY.md](SECURITY.md).

## Windows and Android client

`clients/KonkonMatcha.Client` is the shared .NET MAUI client for Windows and Android. It hosts the responsive web workspace rather than duplicating accounting logic, so the website, desktop app and Android app use the same server-enforced permissions and features. On first launch, the user may choose the production service or any compatible self-hosted HTTPS service that returns the documented `/api/setup` contract.

The client stores only the selected service address in the operating system's secure storage. Database credentials and private API keys must stay on the server and are never compiled into the EXE or APK. Android backup and cleartext traffic are disabled; cross-origin pages cannot open inside the accounting WebView. Authentication remains in the platform WebView's protected cookie store.

Windows unpackaged builds are produced with:

```text
dotnet publish clients/KonkonMatcha.Client/KonkonMatcha.Client.csproj -f net10.0-windows10.0.19041.0 -c Release -p:RuntimeIdentifier=win-x64 -p:WindowsPackageType=None
```

Android Release distribution requires a private signing keystore supplied at publish time. Windows public distribution should likewise be signed with the business's code-signing identity. Never commit signing keys, passwords or generated packages. Signing verifies publisher/package integrity; it does not make client code impossible to inspect. The authoritative security boundary remains HTTPS plus server-side authentication, permission checks, validation and audit trails.

## Country tax/reporting boundary

The main country is configurable and new workspaces choose their country and accounting currency during setup. Existing workspaces can change the main country, locale and time zone without relabelling their fixed ledger currency or rewriting historical documents. Tax rate and tax-inclusive/exclusive pricing remain explicit settings. Generated reports are management reports; they are **not** automatically certified tax returns. See [regional settings](docs/regional-settings.md) for the currency-protection rules and offline data sources.

The country report desk and electronic-invoice workflows are described in [country documents](docs/country-documents.md). Malaysia has an explicit Owner-controlled MyInvois submission/status connector; this does not make the generic 249-country working papers certified returns. A signed live-bank receiving interface and Malaysia statutory payroll review desk are available, while named-bank onboarding, automatic authority calculators, complete statutory forms, Singapore InvoiceNow/Peppol, tax capital-allowance schedules and other jurisdiction filing networks remain separate reviewed modules. Each country pack must be versioned, sourced from the relevant authority and signed off by a qualified local accountant before the UI can label it filing-ready. See [docs/feature-coverage.md](docs/feature-coverage.md).

## Legacy prototype

The preserved `MatchaAccounting/`, `api/`, `deploy/` and `sql/` folders contain the earlier WPF/PHP prototype. The deployed web application uses the root `app/`, `components/` and `lib/` folders.
