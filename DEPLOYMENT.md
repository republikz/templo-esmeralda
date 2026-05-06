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

## How it works

- The browser keeps using `/api/state`.
- On Cloudflare Pages, that route is served by [`functions/api/state.js`](./functions/api/state.js).
- The function stores the shared campaign in Supabase and uploads any newly added data-URL images into Supabase Storage.
- All players then read the same campaign state from the same URL.

## Notes

- You do not need to configure a second backend endpoint.
- The current local server can keep working for development.
- Images are converted automatically to public Supabase Storage URLs during save.
