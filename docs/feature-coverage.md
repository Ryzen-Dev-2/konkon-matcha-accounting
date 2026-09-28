# Feature coverage and parity roadmap

This document prevents planned AutoCount-style modules from being confused with shipped functionality.

## Shipped and tested

- Owner setup, RBAC, team lifecycle, forced password change and session revocation
- Versioned first-use terms plus mandatory managed-instance Trust & Safety for clones: explicit limited deployment-metadata consent, fail-closed enrollment/re-consent, reasoned authority-side consent revocation without erasing history, per-instance encrypted secrets, short signed operating leases, authority-side instance review, buyer reports, human-only reasoned ban/reopen decisions, whole-site and operational-service locking, Owner appeals that remain locked pending review, audit evidence and upstream release notifications. It does not copy tenant business data, silently update a fork, identify a suspicious person, or claim source obfuscation is unremovable.
- Owner transfer cooling period and workspace open/read-only/closed controls
- Multi-currency register opening/closing, operator accountability, X/Z reports and reviewed cash variances
- Explainable exception review for unusual discounts, high refunds, inventory shrinkage, register variances and repeated sign-in failures, with assignment and immutable resolution history
- Members, protected identity lookup, renewable printable member cards and points
- Products, barcode/SKU scanning, stock movements, archive/restore and low-stock indicators
- Physical stocktake with scan-to-count, typed final counts, transactional variance posting and audit history
- Multi-location inventory activation and balances, location-aware sales/refunds/receipts/adjustments/stocktakes, and idempotent dispatch/in-transit/receipt/cancellation transfers
- Product-level batch/lot/expiry activation, supplier-lot receipt provenance, FEFO sales, exact refund/transfer lot restoration, expiry quarantine and optimistic batch counts
- Thirty-day location demand forecasting for FEFO lots, at-risk freshness queues, advisory transfer suggestions, and controlled expiry/damage/recall disposal with inventory write-off journals
- POS, tenders, trusted coupons/manual discounts, tax calculation and transactional posting
- Public online catalogue and order-request intake with address/contact validation, rate limiting, controlled-goods questions, review/accept/reject, counter-style quantity and discount offers, purpose-hashed private customer links, branded bounded two-way chat, workspace-branded responsive acknowledgement/reply/offer/payment/document/shipping Google SMTP notifications, deployment-aware public links, encrypted private-GitHub image/PDF sharing, invoice/verified-receipt linking, custom fulfilment steps and manual/API-reference shipment tracking
- Owner-selectable workspace logo plus Matcha, Professional and Focus workspace themes, and a KONA-led cinematic parallax public index
- Live invoice and receipt component editor with drag/reorder controls, built-in financial blocks, safe uploaded image/text components and portable JSON component import; arbitrary HTML and JavaScript are not accepted
- Custom invoice and receipt templates, print/reprint, refund and historical snapshots
- Invoice register search/status filters, copy-as-new-draft, idempotent draft creation, unpaid-draft editing with optimistic version checks, explicit payment/void confirmation and immutable issued/paid documents
- Controlled recurring invoices with active-customer linkage, weekly/monthly/quarterly/yearly cadence, month-end-safe dates, optional end dates, templates and dimensions, idempotent occurrence generation, visible failure state, pause/resume/end controls and daily Vercel-compatible draft runs
- Manual journals, chart of accounts and core management reports
- Thirteen-week scheduled cash forecast from current posted cash-equivalent balances and open customer/supplier due dates, with overdue exposure, weekly liquidity warnings and CSV/print output; it deliberately excludes speculative sales, purchases, payroll, financing and settlement claims
- Local CSV bank-statement import, confirmed matching to posted ledger lines, zero-difference completion and immutable prior/current uncleared-item working papers
- Month-end integrity/bank checklist, immutable close evidence, direct-ledger drift warning and transactional back-date locks across every journal-posting workflow
- Fixed-asset register, cash/bank acquisition posting, register-only migration evidence, exact straight-line monthly depreciation, disposal gain/loss journals and month-close depreciation blockers
- Versioned annual revenue/expense budgets, monthly account plans, Owner-only approval locks and posted-journal YTD favourable/unfavourable variance
- Cost-centre/project masters, immutable manual and automatic journal-line snapshots, audited POS-location/expense-account/purchase-location rules with exact percentage splits and deterministic minor-unit rounding, customer-account invoice defaults, invoice inherit/override/unassigned controls, product-level POS defaults, per-item discount/tax snapshots, exact partial-refund classification reversal, quotation-conversion snapshots, archive-safe history and posted-ledger profit/coverage reporting with visible unassigned activity
- Employee expense drafts with sequential multi-file evidence, audited pre-submission removal, mandatory active evidence, maker-checker approval/rejection and approved cash/bank payment journals with accounting-period locks
- Owner-only private GitHub evidence repository configuration, encrypted token storage, exact-byte lossless compression/encryption/checksum verification, authenticated image/PDF/text previews with HEIC/HEIF fallback, and server-authorized original downloads
- Reusable staff fuzzy search with renewable non-authenticating QR/NFC lookup credentials for user-selection workflows
- 24-hour token-restricted phone scanner passes compatible with Vercel serverless
- Low-latency auto-connected POS/Inventory scanner bridge with native + ZXing camera decoding
- QR/link-based phone connection and active POS/Inventory routing, including new-product barcode capture
- Cashier-scoped POS browser drafts/history and live member-list refresh without a full POS reload
- Separate 24-hour customer payment-screen passes with Welcome/Thank You states, POS-synchronised DuitNow MYR amount locking, CRC regeneration and mandatory receiving-side settlement confirmation
- Country, locale, IANA time-zone, base/accepted-currency and immutable settings history
- 249-country/region main-country selection, explicit regional Owner setup, currency-lock protection, regional template previews and local-calendar dashboard/manual-journal/invoice dates
- Locked foreign-exchange rates with base/tender sale snapshots and currency-aware rounding
- Provider-verified transfer/wallet foundation with signed callbacks, replay protection, exact payment matching and one-time consumption
- Dual local Android payment-notification adapters for SmsForwarder and notify-me, with USB-only loopback transport, local privacy filtering, deduplication and a MongoDB review queue that cannot auto-settle sales
- Multi-country headquarters, branch, warehouse and franchise hierarchy with cycle/archive safeguards
- Administrator-defined payment methods with reference/provider controls, settlement currencies and ledger-account routing
- Supplier master data with country/currency, commercial terms, archive/restore and protected historical references
- Purchase requisitions with location/date/priority/justification evidence, maker-checker approval, reasoned rejection/cancellation, optimistic versions and one-time transactional purchase-order conversion
- Requisition-linked RFQs with 2–10 invited suppliers, one recorded offer per supplier, cross-currency base-value comparison, delivery-date visibility, reasoned maker-checker award/cancellation and one-time locked purchase-order conversion
- Purchase order draft, maker-checker approval, cancellation, partial receiving, audited outstanding-balance short-close and location/supplier/product/time-zone snapshots
- Transactional goods receipts that update stock, weighted-average cost, AP, input tax, journals and audit history together
- Exact three-way receipt matching with supplier total/tax evidence, versioned maker-checker exception approval, no posting while pending or rejected, one-time consumption and immutable expected/actual variance snapshots
- Freight/duty/insurance/handling landed-cost invoices with supplier currency and tax evidence, value/quantity allocation, currency-minor-unit reconciliation, current inventory versus consumed-goods split, moving-average cost updates, AP bills, period locks and balanced journals
- Controlled partial/full purchase returns against unpaid bills with exact receipt-value/tax allocation, batch and location stock validation, supplier credit-note protection, AP reduction, carrying-value variance journals, period locks and audit history
- Supplier bills, base-currency AP aging buckets, seven-day maturity and supplier-exposure views, safe CSV export, partial/full settlement, duplicate-post protection and realised foreign-exchange gain/loss posting
- Customer accounts with optional credit limits, default terms, explicit holds, server-enforced invoice exposure checks and chronological statements
- Customer quotation drafts, printable snapshots, forward-only customer-decision states and one-time conversion of accepted terms into an invoice draft
- Quote-linked customer delivery orders with destination, canonical GDEX/ABX/Ninja Van carrier identities, official tracking/developer handoffs, forward-only operational states and printable full-delivery snapshots
- Live Ninja Van sandbox/production order creation using stable references, cached encrypted OAuth tokens, one-time cached PDF waybills, HMAC-verified status Webhooks and an ordered signed-event timeline; production still requires Ninja Van account approval and physical operational acceptance
- Owner-only Telegram, Feishu/Lark and Discord notification routes with official-host allow-lists, encrypted secrets, visible connection tests and live online-order/customer-message alerts. Telegram supports an authenticated, replay-deduplicated `/reply ORDER-NO message` route from one configured numeric chat; the current Feishu and Discord incoming-webhook connections remain outbound only.
- Public catalogue images from validated HTTPS links or browser-compressed raster uploads, with responsive storefront cards and customer/staff previews
- Monthly payroll profiles, frozen runs, reasoned bonus/overtime/deduction adjustments, independent maker-checker approval, printable payslips, safe CSV summaries, accrual posting and controlled net-pay journals; Malaysia MYR runs require reviewed EPF/SOCSO/EIS/PCB/Zakat/CP38 values and post separate liabilities
- Owner-managed signed live-bank receiving interfaces with account mapping, one-time encrypted secrets, rotation/disable controls, timestamp/HMAC verification, currency precision and idempotent event inbox; provider onboarding remains external
- Saved financial-report layouts for profit and loss, balance sheet, cash flow, trial balance and AR/AP aging, with controlled headings, sections, zero rows, account codes, accent and print orientation
- Fully controlled entity trial-balance consolidation with closing/average FX translation, CTA balancing, reporting-currency elimination journals and immutable prepared runs
- MyInvois 1.0 preparation for standard types 01–04, self-billed types 11–14, consolidated General Public receipts and adjustment references, plus Owner-controlled sandbox/production submission and authority status refresh for reviewed MYR artifacts
- Smart Replenishment recommendations using stock thresholds, 30-day demand, supplier lead time and open inbound quantities
- Supply Pulse supplier-performance scoring using delivery punctuality and overdue commitments
- Searchable and printable in-app bilingual learning centre plus complete standalone Chinese and English user manuals
- Retention-based personal-data clearing for abandoned/rejected/cancelled online requests plus optional warned completed-order cleanup, request-throttle expiry and orphaned attachment handling in the bounded daily maintenance job

## AutoCount comparison baseline (reviewed 22 August 2026)

AutoCount does not publish one honest, edition-independent “total feature count.” Its official Accounting pages state that there are up to 15 document-entry types and more than 1,000 report combinations, while editions, POS and add-ons provide different sets. Treating those report combinations as 1,000 separate software functions would be misleading.

For a reproducible comparison, this project counts the 72 individual entries in AutoCount's official POS “Features Summary” once each. Against that fixed POS list, the current Kōn-Kōn web application has:

- 38 fully covered entries
- 4 partially covered entries
- 30 not yet covered entries
- 42 of 72 entries with at least partial coverage (58.3%)

Breakdown by the official POS headings:

- Receipt printing: 5 full, 1 partial, 1 missing
- Transactions: 3 full, 0 partial, 7 missing
- Data entry: 3 full, 2 partial, 6 missing
- Multiple payment methods: 1 full, 0 partial, 0 missing
- Routine operation: 2 full, 0 partial, 3 missing
- Back-end maintenance: 11 full, 1 partial, 3 missing
- POS reports: 9 full, 0 partial, 5 missing
- Stock reports: 4 full, 0 partial, 5 missing

“Partial” is used when the safe web workflow covers only part of the named desktop feature—for example quantity changes without per-line price override, or scanner-pass terminal control without full multi-outlet terminal maintenance. The comparison source is AutoCount's [official POS feature summary](https://member.autocountsoft.com/products/ac_pos/helpfile/pos_introduction.htm). The wider roadmap is also checked against the [official AutoCount Cloud Accounting feature and plan page](https://www.autocountsoft.com/pro-cloud-acc.html) and the [official Accounting feature pages](https://member.autocountsoft.com/products/ac_accounting/info/features1.aspx).

This count is a delivery benchmark, not a claim of AutoCount parity. Accounting, country compliance and optional plug-ins are tracked below and must pass their own acceptance tests before being counted as shipped.

## Next accounting modules

- Named-bank/aggregator onboarding, reusable bank matching rules and controlled voucher creation
- Batched expense payment runs, mileage/per-diem policies and corporate-card feeds
- Serial-number tracking
- Automated intercompany matching, minority interests, goodwill and purchase-price allocation
- Leave, automatic country statutory payroll formula packs, government payroll submission and employee self-service
- Overrides on additional non-invoice document types and balance-sheet tracking reports
- Year-end adjustment workflow, retained-earnings transfer and accountant close pack

## Country packs

Delivered preparation tools: the country report desk exports financial statements and reviewed working figures for all 249 selectable countries, with SG/MY/AU/GB working-paper layouts and saved presentation designs. Invoices, receipts and supplier bills generate encrypted, immutable general UBL XML / accounting JSON and MyInvois 1.0 document structures for types 01–04 and 11–14. Malaysia alone has an official sandbox/production submission and validation-status connector; authority acceptance is shown only from MyInvois responses. No other national filing network, signed v1.1 document or completed statutory return is claimed. Details: [country documents](country-documents.md).

A filing-ready country pack must include versioned tax codes/rates, chart templates, fiscal-calendar rules, rounding, statutory report layouts, e-invoice schemas, export validation and official-source metadata. It must also include regression fixtures and a qualified local-accountant sign-off date.

Until that lifecycle exists, the UI must call outputs “management reports,” never “certified tax returns.” Singapore is the first planned pack; other countries must be installed as separately versioned packages rather than hard-coded conditionals.

## Independent features planned

- Brew recipe costing and margin simulation
- Member taste profile and consent-controlled recommendations
