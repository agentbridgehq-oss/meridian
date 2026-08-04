# Auto-deploy to Railway

`deploy.yml` deploys Meridian to Railway automatically whenever `main` is
updated, and can also be triggered manually from the Actions tab. This
exists because no automated tool (including Claude sessions working in this
repo) has Railway CLI access or credentials — this is the safe way to let
a merge to `main` result in a real deploy without ever handing a Railway
credential to an agent or pasting one into a chat.

## One-time setup

1. **Create a Railway *project* token** (not an account token):
   Railway dashboard → the `meridian` project → **Settings** → **Tokens** →
   **New Token**. A project token is scoped to just this one project (and,
   if you pick one, one environment) — it cannot see or touch anything else
   on the account, which is why it's the right kind of token for CI rather
   than a personal account token.

2. **Add it as a GitHub secret**: this repo → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret** → name it exactly
   `RAILWAY_TOKEN` → paste the project token → **Add secret**. GitHub never
   shows it again after saving, including to repo admins — only the
   workflow run can read it, and only as a masked value in logs.

3. **Merge a PR to `main`, or push directly** → the workflow runs
   automatically. Watch it under the **Actions** tab. You can also trigger
   it manually anytime with no code change via **Actions → Deploy to
   Railway → Run workflow**.

## If it fails

- **"RAILWAY_TOKEN secret is not set"** — step 2 above wasn't completed, or
  the secret name doesn't match exactly (`RAILWAY_TOKEN`, all caps).
- **Auth error from `railway up`** — the token was revoked/regenerated on
  the Railway side, or it's a token for the wrong project. Generate a fresh
  one and replace the GitHub secret (same "New repository secret" flow
  overwrites the old value).
- **Deploy succeeds but the app doesn't reflect the change** — check
  Railway's own deploy logs for that service; this workflow only confirms
  `railway up` was *accepted*, not that the app booted cleanly on the other
  end.

## Rotating or revoking

Revoke the project token anytime from the same Railway Settings → Tokens
page — the next workflow run will fail closed (see above) rather than
deploying with a stale credential.
