# Public Deployment

This app can be published for everyone through Cloudflare Pages with Supabase as the shared data store.

## What to create

1. A free Supabase project.
2. A free Cloudflare Pages site connected to this folder/repository.

## Supabase setup

Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor.

Then add these secrets to Cloudflare Pages environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STATE_TABLE` = `campaign_state`
- `SUPABASE_STATE_ROW_ID` = `main`
- `SUPABASE_STORAGE_BUCKET` = `campaign-assets`
- `SESSION_SECRET` = a unique random value with at least 32 characters. Never place it in a file or commit it.

## Cloudflare Pages build configuration

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** this repository root

Only `dist` is served as static content. Cloudflare Pages Functions remain in the repository's `functions/` directory.

## How it works

- The browser signs in through `/api/auth/login`; PIN validation happens only in a Cloudflare Function.
- `/api/state` requires a signed session token. It never returns PINs, hashes, salts, or server credentials.
- On Cloudflare Pages, that route is served by [`functions/api/state.js`](./functions/api/state.js).
- The function stores the shared campaign in Supabase and uploads any newly added data-URL images into Supabase Storage.
- All players then read the same campaign state from the same URL.

## Notes

- The first successful login after this security release migrates existing plaintext PINs in Supabase to PBKDF2 hashes. Existing PIN values continue to work, but should be changed because old releases exposed them.
- Purge the Cloudflare Pages cache after deployment and remove historical campaign dumps, screenshots, and backups from the repository. Removing a file from the latest commit does not remove it from public Git history.
- You do not need to configure a second backend endpoint.
- The current local server can keep working for development.
- The local server now listens only on `127.0.0.1` by default. For a deliberate LAN-only test, restart it with `-AllowLan`; this development route still reads the local test state and must never be exposed to the public internet.
- Images are converted automatically to public Supabase Storage URLs during save.
