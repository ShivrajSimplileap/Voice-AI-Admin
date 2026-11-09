# Voice AI Admin Portal

The platform owner's portal: separate from the customer Voice CRM, with its own sign-in (email + password, no Keycloak). It talks only to the backend's `/api/admin/*` routes. See `backend/docs/features/19-admin-portal.md` for what it does.

Stack: React 19, Vite 8, Tailwind 4, lucide-react. In production a Caddy server serves the build and forwards `/api/admin/*` (nothing else) to the backend.

## Run locally

```bash
docker start voice-pg voice-mail                 # Postgres + Mailpit
cd ../backend && npm run dev:local               # backend on :4000
cd ../Admin-Portal && npm install && npm run dev # portal on http://localhost:3100
```

First super admin (local database):

```bash
cd ../backend && npm run admin:create:local -- --email you@example.com --name "Your Name"
```

Invitation and reset emails land in Mailpit (http://localhost:8025).

## Railway (its own service)

| Setting | Value |
|---|---|
| Source | this folder / repository; `railway.json` builds the `Dockerfile` |
| `BACKEND_URL` | the backend's private URL, e.g. `http://voice-ai-api.railway.internal:4000` |
| Domain | e.g. `admin.<your domain>` |

On the backend service set `ADMIN_APP_URL` to this portal's public URL (it goes in invitation and reset emails), then create the first super admin from the backend service's shell: `npm run admin:create:prod -- --email … --name …` (after the `0023_admin_portal` migration is applied).

## Scripts

`npm run dev` · `npm run build` (type check + build) · `npm run preview` · `npm run lint` (type check)
