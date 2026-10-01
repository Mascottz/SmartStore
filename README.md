# SmartStore NG

A multi-tenant **POS & store management app for every kind of business**:
supermarkets, boutiques, pharmacies, restaurants, salons and more. You pick
your niche during onboarding and the app adapts (terminology, default
categories, expiry tracking, barcode scanning…).

Built with **React 19 + Vite + Tailwind CSS 4**, backed by **Supabase**
(Postgres + Auth + RLS) with an automatic **local demo mode** when no
backend is configured.

## Features

- 🏪 **Multi-niche onboarding**: Supermarket, Boutique, Pharmacy, Restaurant, Salon/Services, Other
- 🛒 **POS Register**: product grid with category filter tabs and paged results, inline
  help tooltips, cart, camera barcode scanning, payment methods, receipt printing. The
  cart panel is capped to the viewport so a long sale scrolls internally while the total
  and Complete Sale button stay in view
- 📒 **Partial payments & credit**: sell with the customer paying part now (Partial) or
  nothing yet (Credit); the sale keeps who owes what, receipts print the balance due,
  and the **Credit Book** page tracks every open debt with its full repayment history,
  settlement progress and CSV export
- 📦 **Inventory**: SKU, categories, cost/sale price, stock levels, low-stock alerts, expiry
  dates (pharmacy), plus the worth of what is on the shelves: stock at cost, retail value
  and potential profit with margin %, each explained with help tooltips. StoreSense can
  turn rough stock-list text into reviewed inventory rows, and a blank SKU is
  auto-generated from the product name; "Peak Milk 400g" becomes `PEA-MIL-400G-A7F3`
- 📊 **Dashboard & Reports**: daily/monthly revenue, gross & net profit, top sellers, payment breakdown
- 🧾 **Sales History**: searchable receipts, reprint, void with reason (restocks automatically)
- 🚨 **Void audit trail**: who voided what, when and why
- 💸 **Expenses + expense analytics**: category & monthly breakdowns
- 👥 **Team**: staff join with a store code; roles: owner / admin / manager / cashier.
  **Shop Mode (free) teams are capped at the owner plus one cashier and one manager**,
  enforced in the UI, the local demo backend and a Postgres trigger
- 📱 **Two-way owner app (Owner Mode plan)**: owners open SmartStore in
  **Monitoring mode** (a mobile-first app at `/m`: dashboard, inventory cards with
  stock badges, sales, credit book, reports; strictly no POS/checkout) or
  **Transactional mode** (the full app with the register). The device picks the
  default (phones open Monitoring, the counter computer opens Transactional), and the
  owner can switch anytime; the choice is remembered per account. Free-plan owners and
  staff roles always get the standard app, untouched
- ❓ **Contextual help tooltips**: the "?" icons across Dashboard, POS, Inventory,
  Sales History, Reports, Expenses and Team explain each number and control in place
- ✨ **StoreSense assistant (Owner Mode)**: an in-app co-pilot for stores on
  the Owner Mode plan. Once a store subscribes, every approved member of that
  store can use it (owner, admin, manager, cashier), and each role's existing
  permissions still apply. It answers questions across POS, inventory, sales,
  credit, expenses, reports, team and settings using the current store data,
  can guide raw inventory entry with SKU generation, and links into the
  relevant screen. It works offline with local
  insights and can use an optional server-side Gemini endpoint when
  `GOOGLE_API_KEY` is configured.
  **Spoken replies**: a speaker button in the StoreSense header makes it read
  each answer aloud, and every answer keeps a "Listen" button so a number can
  be replayed. This is output only — there is no microphone, no permission
  prompt and no extra cost: it uses the browser's built-in on-device speech,
  so it works offline and in demo mode exactly like the text answers do.
  The spoken replies are **store aware**. StoreSense knows whose shop it is
  reporting on: switching spoken replies on says *"Spoken replies are on for
  Crown Jewel Supermarket"*, and the name is pronounced the way its owner
  says it. A plain name like "Crown Jewel Supermarket" is read exactly as
  typed, while the shapes speech engines get wrong are fixed — initials are
  spelled ("KM Supermart" → "K M Supermart"), "&" is read "and" ("J&J
  Minimart" → "J and J Minimart"), and "Ltd"/"PLC"/"Nig." are expanded. An
  all-caps name is treated as shouting, not initials, so "ADA STORES" is
  left alone. The store's live catalogue is used too: shelf units are said
  in full ("Peak Milk 400g" → "Peak Milk 400 grams", "Coca-Cola 50cl" → "50
  centilitres") and the store's own product codes are spelled so they can be
  written down ("PK-400" → "P K, 4 0 0"). Only codes that really exist in
  the catalogue are spelled, so "COVID-19" is left alone. Amounts and app
  terms are re-phrased too ("₦12,400" → "12400 naira", "POS" → "P O S").
  None of this changes what an answer *says* — the screen stays the source
  of truth and the two never disagree on a number. The opening greeting
  is never read aloud, and the choice is remembered per account per device.
  Shop Mode (free) stores see a locked "StoreSense"
  button that explains the feature and links to the upgrade; the gate is
  enforced in the UI **and** server-side in `api/assistant.js`, which reads the
  caller's plan from the database instead of trusting the request
- ✅ **Access approvals**: new staff wait for owner approval; their join code is remembered and re-sent automatically on the next sign-in if the request was ever interrupted
- 🛡️ **System admin dashboard**: platform metrics, stores, users and global approval controls
- 👑 **Owner Mode plan gating**: upgrade monthly (₦5,000) or yearly (₦50,000, two months
  free) via Paystack, with plan-tagged checkout references and the paid billing cycle
  stored on the store
- 🎬 **Public demo & marketing site**: a landing page with a Point of Sale showcase, an
  Owner Modes section (benefits & restrictions of free vs Owner Mode) and a one-click
  `/demo` page that seeds a fully populated store (as a yearly Owner Mode subscriber),
  no sign-up needed
- 🚀 **Launch routing**: a fresh open in a browser tab always shows the landing page
  (signed-in visitors get an "Open App" call to action); an installed-PWA launch skips
  the marketing page and opens on `/login` first, never `/onboarding`, or straight to
  the dashboard for a signed-in owner whose store is ready
- 🌙 light/dark theme

## Running locally (demo mode)

```bash
npm install
npm run dev
```

Checks:

```bash
npm test    # vitest + jsdom: POS category/pagination behaviour, POS partial &
            # credit checkout, credit-sale validation + repayment ledger,
            # inventory worth summary + auto-SKU, help tooltips, monthly/yearly
            # pricing plans + Paystack references, public demo page flow, staff
            # join-on-login flow, join-code storage, receipt popup
            # close/timeout, onboarding duplicate-store screen, launch routing
            # (landing page in browsers, login-first in the installed app), the
            # two-way owner modes (monitoring/transactional + device detection
            # + free plan untouched, end-to-end through the real app), the
            # mobile inventory page, Shop Mode team limits, StoreSense inventory
            # intake, the StoreSense Owner Mode gate (locked upgrade prompt
            # on Shop Mode, the real assistant for every role on Owner Mode and
            # in the demo store), and StoreSense spoken replies (store-name
            # pronunciation, catalogue units & product codes, naira phrasing,
            # silence unless asked, per-account recall)
npm run lint
npm run build
```

With no env vars set, the app runs entirely on localStorage. For a pre-seeded
store, click **“Try the demo store”** on the login screen, or open the public
**`/demo`** page and choose **“Enter the demo store”**.

## Going live with Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL files in `supabase/migrations/` in numeric order in the SQL editor
   (the `004`+ fixes are written to be idempotent, `drop policy if exists` /
   `create or replace`, so they can be re-run on a database that only
   half-applied an earlier migration)
3. Create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The StoreSense assistant is an Owner Mode feature, available in both transactional
and monitoring modes to any approved member of a subscribed store (demo stores
count as subscribers). Without another setting it uses a small, offline-safe
insight engine in the browser. To enable Gemini-generated answers on Vercel,
add `GOOGLE_API_KEY` as a **server-only** project environment variable and
optionally set `GOOGLE_AI_MODEL` (default: `gemini-2.5-flash`).
`GEMINI_API_KEY` is also supported. The bundled `api/assistant.js` endpoint
keeps that key out of the browser; it validates the signed-in Supabase user,
re-checks the store's plan through `get_my_membership()` (so a Shop Mode store
cannot call the paid endpoint directly) and receives only aggregate store
metrics, never raw customer names, emails or receipts. If the endpoint is
unavailable, the local insight fallback continues to work.

4. `npm run dev`; the app automatically switches to the Supabase backend
   (multi-tenant with row-level security; checkout and voiding run as
   transactional Postgres functions).

For production Super Admin access, assign `app_metadata.role = "super_admin"`
to the appropriate Supabase Auth user using the Supabase Admin API. The hidden
login-screen entry only reveals the console; all system-wide RPCs enforce this
server-side role.

## Roles

| Role | Access |
|---|---|
| Owner | Everything + settings, team, billing. On the Owner Mode plan: two-way app (Monitoring ⬌ Transactional); on Shop Mode: the standard app |
| Admin | Everything except owner settings (Owner Mode plan only; Shop Mode teams stop at one cashier and one manager) |
| Manager | Inventory, reports, expenses, voids |
| Cashier | POS + sales history |

**StoreSense access**: the assistant ships with Owner Mode. The gate is the
store's *plan*, not the staff role, so once a store subscribes every approved
member of that store can ask it questions (owner, admin, manager, cashier)
while each role's existing permissions still apply. Shop Mode (free) stores get
a locked prompt that links to the upgrade, and the serverless endpoint refuses
their requests as well.

**Plans at a glance**: Shop Mode (free): POS, inventory, sales history, team
of three (owner + 1 cashier + 1 manager), no StoreSense, no full reports.
Owner Mode (₦5,000/month or ₦50,000/year): everything, StoreSense,
unlimited team, and the two-way owner app with device detection. The demo store
behaves as a yearly Owner Mode subscriber so both modes, and the assistant, can
be tried.

Going live with Supabase: run migrations `001` to `009` in order. `008` adds the
`stores.billing_cycle` column and the database trigger that enforces the
Shop Mode team limits server-side. `009` adds `admin_delete_user_account`,
which the Super Admin console's "Delete user" button now uses so it fully
removes the Supabase Auth account (not just the store membership); run it
on any project provisioned before this change, or deleted accounts can keep
signing back in.
