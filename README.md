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
  and potential profit with margin %, each explained with help tooltips. A blank SKU is
  auto-generated from the product name; "Peak Milk 400g" becomes `PEA-MIL-400G-A7F3`
- 📊 **Dashboard & Reports**: daily/monthly revenue, gross & net profit, top sellers, payment breakdown
- 🧾 **Sales History**: searchable receipts, reprint, void with reason (restocks automatically)
- 🚨 **Void audit trail**: who voided what, when and why
- 💸 **Expenses + expense analytics**: category & monthly breakdowns
- 👥 **Team**: staff join with a store code; roles: owner / admin / manager / cashier.
  **Shop Mode (free) teams are capped at the owner plus one cashier and one manager** —
  enforced in the UI, the local demo backend and a Postgres trigger
- 📱 **Two-way owner app (Owner Mode plan)**: owners open SmartStore in
  **Monitoring mode** (a mobile-first app at `/m` — dashboard, inventory cards with
  stock badges, sales, credit book, reports; strictly no POS/checkout) or
  **Transactional mode** (the full app with the register). The device picks the
  default — phones open Monitoring, the counter computer opens Transactional — and the
  owner can switch anytime; the choice is remembered per account. Free-plan owners and
  staff roles always get the standard app, untouched
- ❓ **Contextual help tooltips**: the "?" icons across Dashboard, POS, Inventory,
  Sales History, Reports, Expenses and Team explain each number and control in place
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
  the marketing page and opens on `/login` first — never `/onboarding` — or straight to
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
            # mobile inventory page, and Shop Mode team limits
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
| Admin | Everything except owner settings (Owner Mode plan only — Shop Mode teams stop at one cashier and one manager) |
| Manager | Inventory, reports, expenses, voids |
| Cashier | POS + sales history |

**Plans at a glance** — Shop Mode (free): POS, inventory, sales history, team
of three (owner + 1 cashier + 1 manager), no full reports. Owner Mode
(₦5,000/month or ₦50,000/year): everything, unlimited team, and the two-way
owner app with device detection. The demo store behaves as a yearly Owner Mode
subscriber so both modes can be tried.

Going live with Supabase: run migrations `001`–`009` in order. `008` adds the
`stores.billing_cycle` column and the database trigger that enforces the
Shop Mode team limits server-side. `009` adds `admin_delete_user_account`,
which the Super Admin console's "Delete user" button now uses so it fully
removes the Supabase Auth account (not just the store membership) — run it
on any project provisioned before this change, or deleted accounts can keep
signing back in.
