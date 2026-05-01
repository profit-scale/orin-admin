# Orin Admin

Internal staff portal for the Orin platform. Deployed at **admin.orinsuite.com**.

This is a separate Vite + React app from the customer-facing Orin app at
`profit-scale-erp/` (which deploys to **app.orinsuite.com**), but it shares
the **same Supabase project**.

Access is restricted to users present in the `super_admins` table — verified
on every load via the `is_super_admin()` RPC.

## Stack

- Vite 8 + React 19
- Tailwind CSS v4 (`@tailwindcss/vite`)
- React Router 7
- Supabase JS v2

## Setup

```bash
cd /Users/macbook/Documents/orin-admin
npm install
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same values as the main app)
npm run dev
```

Dev server runs on **port 5174** (the main app uses 5173).

## Required environment variables

| Variable                  | Description                                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`       | Supabase project URL — same as the main Orin app                    |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon key — same as the main Orin app                       |

## Prerequisites — Supabase migrations

Before this app is functional, the corresponding admin migrations must be
applied to the shared Supabase project. These live in
`profit-scale-erp/supabase/migrations/` (numbers 067-077):

- `super_admins` table
- `is_super_admin()` RPC
- `admin_orgs_list(p_limit, p_offset)` RPC
- `admin_platform_overview()` RPC

If the migrations are not yet applied, the Dashboard and Companies pages
gracefully fall back to a "Migrations not yet applied" message.

## Seeding the first super admin

After migrations are applied, insert yourself into `super_admins`:

```sql
INSERT INTO super_admins (user_id, role)
SELECT id, 'owner'
FROM auth.users
WHERE email = 'adam@nctmediagroup.com';
```

Once inserted, sign in to `admin.orinsuite.com` with the same email and
password you use for the main app.

## Project structure

```
src/
  main.jsx
  App.jsx                       — router + auth wiring
  index.css                     — Tailwind import + dark indigo theme
  services/
    supabase.js                 — supabase client (separate auth storageKey)
  hooks/
    useAuth.js                  — session + is_super_admin() check
  components/
    layout/
      AdminShell.jsx             — sidebar + header wrapper
      AdminSidebar.jsx           — nav (Dashboard, Companies, Staff)
      AdminHeader.jsx            — top bar with current admin
    auth/
      AdminLoginPage.jsx         — email/password sign-in (no signup)
      AdminGate.jsx              — route guard with access-denied state
  pages/
    Dashboard.jsx                — calls admin_platform_overview RPC
    Companies.jsx                — calls admin_orgs_list RPC
    CompanyDetail.jsx            — placeholder for per-org view
    Staff.jsx                    — placeholder for super_admins management
```

## Deployment

This app is intended to deploy to **admin.orinsuite.com** via Netlify:

1. Push this repo to GitHub (suggested name: `profit-scale/orin-admin` or
   `orinsuite/orin-admin` — see notes below).
2. Create a new Netlify site, connect the repo.
3. Build command: `npm run build` — Publish directory: `dist`
4. Set env vars on Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Add `admin.orinsuite.com` as a custom domain.
6. Configure SPA fallback (Netlify auto-detects Vite, but verify
   `_redirects` or a `netlify.toml` rewrites `/*` to `/index.html`).

## GitHub repo

Not yet created. Suggested location: `profit-scale/orin-admin`
(or `orinsuite/orin-admin`). Once created, push with:

```bash
git remote add origin git@github.com:profit-scale/orin-admin.git
git push -u origin main
```

> Reminder: per project conventions, ask Adam which `gh` account to use
> (`adam-nctmedia` vs `revopsceo`) before pushing.

## Relationship to the main app

| App           | Repo                       | Domain                | Port (dev) |
| ------------- | -------------------------- | --------------------- | ---------- |
| Customer app  | `profit-scale/orin`        | app.orinsuite.com     | 5173       |
| Admin portal  | `profit-scale/orin-admin`  | admin.orinsuite.com   | 5174       |

Both apps use the same Supabase project. The admin app uses a separate
`storageKey` (`orin-admin-auth`) for `supabase-js` so a session in one
won't collide with the other if you happen to be logged into both in the
same browser.
