# Keep Meridian always accessible

## Status — 2026-09-05

Railway production is **down**. Both historic domains return `Application not found`:

- https://meridian-production-915d.up.railway.app/
- https://meridian-production-2eb0.up.railway.app/

Do not tell anyone Meridian is live until `node scripts/go-live.mjs --url <domain>` reports health 200.

Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

Recreate steps: `GO-LIVE.md`.

## What is already in code

| Layer | Status | Depends on laptop? |
|-------|--------|--------------------|
| GitHub `meridian-agency-2-0` / PR #2 | Built, not production | No |
| Railway public process | Missing | No — must recreate service |
| Local `:8891` | Optional | Yes |

Closing this chat does not bring Railway back. Only creating the service does.

## What you must do

1. Keep the Railway workspace billed.
2. Do not delete project `meridian` if it still exists.
3. Connect GitHub source to branch `meridian-agency-2-0` for staging. Keep `master` frozen until a real call works.
4. Secrets live in Railway Variables and GitHub `RAILWAY_TOKEN` only.
5. After a new domain exists, bookmark that URL and update `PUBLIC_BASE_URL`.
