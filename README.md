# SmartStore NG

A multi-tenant **POS & store management app for every kind of business** —
supermarkets, boutiques, pharmacies, restaurants, salons and more. You pick
your niche during onboarding and the app adapts (terminology, default
categories, expiry tracking, barcode scanning…).

Built with **React 19 + Vite + Tailwind CSS 4**, backed by **Supabase**
(Postgres + Auth + RLS) with an automatic **local demo mode** when no
backend is configured.

## Features

- 🏪 **Multi-niche onboarding** — Supermarket, Boutique, Pharmacy, Restaurant, Salon/Services, Other
- 🛒 **POS Register** — product grid, cart, camera barcode scanning, payment methods, receipt printing
- 📦 **Inventory** — SKU, categories, cost/sale price, stock levels, low-stock alerts, expiry dates (pharmacy)
- 📊 **Dashboard & Reports** — daily/monthly revenue, gross & net profit, top sellers, payment breakdown
- 🧾 **Sales History** — searchable receipts, reprint, void with reason (restocks automatically)
- 🚨 **Void audit trail** — who voided what, when and why
- 💸 **Expenses + expense analytics** — category & monthly breakdowns
- 👥 **Team** — staff join with a store code; roles: owner / admin / manager / cashier
- ✅ **Access approvals** — new staff wait for owner approval before tenant data is available
- 🛡️ **System admin dashboard** — platform metrics, stores, users and global approval controls
- 👑 **Owner Mode plan gating**, 🌙 light/dark theme

## Running locally (demo mode)

```bash
npm install
npm run dev
```

With no env vars set, the app runs entirely on localStorage — click
**“Try the demo store”** on the login screen for a pre-seeded store.

## Going live with Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL files in `supabase/migrations/` in numeric order in the SQL editor
3. Create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. `npm run dev` — the app automatically switches to the Supabase backend
   (multi-tenant with row-level security; checkout and voiding run as
   transactional Postgres functions).

For production Super Admin access, assign `app_metadata.role = "super_admin"`
to the appropriate Supabase Auth user using the Supabase Admin API. The hidden
login-screen entry only reveals the console; all system-wide RPCs enforce this
server-side role.

## Roles

| Role | Access |
|---|---|
| Owner | Everything + settings, team, billing |
| Admin | Everything except owner settings |
| Manager | Inventory, reports, expenses, voids |
| Cashier | POS + sales history |
