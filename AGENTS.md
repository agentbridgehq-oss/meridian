# Meridian Agency — agent boot file

Read this before you answer. GitHub is source of truth. Chat history, cleared conversations, and temporary workspaces are not.

## Mandatory start (every session, every agent)

You are ChatGPT, Claude, Grok, Codex, or any other agent in this repo. On the first message of a session, and again whenever Kenny asks about status, live, Railway, voice, PR, or next step:

1. Use the GitHub connection. Do not trust memory.
2. Read `MERIDIAN-SESSION-SYNC.md` on branch `meridian-agency-2-0`.
3. Read `SESSION-MEMORY.md` and `GO-LIVE.md` on that same branch.
4. List the latest commits on `meridian-agency-2-0` and confirm PR #2 head SHA.
5. Then answer. If GitHub is unavailable, say so in one line and stop claiming live status.

Working branch: `meridian-agency-2-0`  
Protected branch: `master` — do not merge unless Kenny says merge.  
PR: https://github.com/agentbridgehq-oss/meridian/pull/2

## Mandatory end

Before sending the final response for any Meridian task that changed files or made or confirmed a decision:

1. Save all completed, verified code, docs, configuration, and decisions to `meridian-agency-2-0`.
2. Run the relevant tests and record the exact result. Never describe untested work as verified.
3. Update `MERIDIAN-SESSION-SYNC.md` and `SESSION-MEMORY.md` with the UTC date, completed work, commit or branch, tests, deployment state, blockers, and exact next action.
4. Commit the handoff, re-fetch PR #2, and confirm its new head SHA.
5. Put that commit SHA in the final response to Kenny.

Do not leave work only in chat or wait for the browser window to close. Closing or clearing a chat cannot trigger a later commit, so finish the GitHub handoff before the final response. A new chat must be able to reconstruct the full project state from GitHub alone. If nothing material changed, do not create an empty commit.

## Current production truth

Railway public hosts are **down** (`Application not found`):

- https://meridian-production-2eb0.up.railway.app/
- https://meridian-production-915d.up.railway.app/

Do not call Meridian live. Recreate the service using `GO-LIVE.md`. Project: https://railway.com/project/3325e670-00e8-46e2-8d38-e1e4f77b8e66

## Do not

- Restore push/PR auto CI on `Meridian Tests`
- Commit secrets
- Deploy by inventing a Railway token
- Treat Retell/Vapi docs as the current voice stack (PR #2 is OpenAI Realtime + Twilio SIP)

See [CLAUDE.md](./CLAUDE.md), [DECISION.md](./DECISION.md), [GO-LIVE.md](./GO-LIVE.md).
