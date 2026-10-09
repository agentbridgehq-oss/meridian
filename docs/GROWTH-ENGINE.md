# Meridian website analysis and growth operations

## Customer flow

`/meridian-analysis.html` accepts the customer's website, name, business, email and specific permission for the requested analysis/proposal. `/api/opportunities/analyze` fetches one public HTTPS HTML page using pinned validated DNS, redirect checks, time/size limits and an IP rate limit. It never executes website scripts or passes page instructions to an agent.

Evidence covers title, description, viewport, H1 structure, canonical, image alt attributes, indexing hints and obvious enquiry paths. Missing HTML signals are review findings, not measured lost revenue or rankings. JavaScript-rendered sites can hide these signals; the report states that limitation. Fetch time is server request time, not Core Web Vitals.

A private project is saved to the existing agency lead store. It includes a draft scope, Foundation/Growth/Scale options and a queued requested-report email. Existing email addresses are not silently overwritten. The private token is sent in the fragment and API Authorization header; never put it in query strings, logs or analytics.

## Final offers and approval

Operators use `/meridian-growth.html` with the existing OPS_TOKEN, held only in browser memory. Enter approved scope, CAD setup/monthly fees, delivery timing and provider costs. Quotes have revisions. A customer can approve only the currently offered revision and must enter an approval owner and check explicit permission. Approved scopes cannot be overwritten using the offer route.

An enabled owner-approved template can issue a final offer automatically for the diagnosed service. Matching Foundation templates apply to new scans; matching selected tier templates apply to offer requests. No prices are invented and no template is enabled by default. Broad or custom scopes need a reviewed offer. Taxes, service terms and commercial/legal details still need the owner's finalized agreements; this UI is not legal validation.

Approval opens intake and queues a delivery work plan. Completed intake, verified scoped access and customer-approved design evidence let the operator queue deployment preparation. The existing deployment core then records required integrations, QA, client acceptance and rollback blockers. It does not call a CMS or activate production merely because a proposal was approved. Actual website edits, campaign publishing and client system work require their scoped connectors, credentials, implementation and acceptance. There is no universal automatic website fix/deploy connector in this release.

## Research and recurring work

Create campaigns by niche and location. Each starts paused. Start/pause controls, 1–50 daily result limits, hourly searches, duplicate filtering, source/query timestamps and bounded retained results are included. Search candidates are not claimed to be verified businesses or contactable buyers. Up to two candidate websites are checked per cycle; observed mailto/tel links retain source evidence. Business fit and permission to contact remain unverified. Outreach is disabled: there is no cold-message sender in this worker.

Use BRAVE_API_KEY or SERPER_API_KEY for business web discovery. The existing DuckDuckGo instant-answer fallback has limited business-search coverage and may return no useful candidates. These are provider-dependent results, not guaranteed lead volume.

A project in `operate` with an approved scope and an existing live deployment can enable daily website reviews. Reviews recheck HTML, record new/resolved findings and create recommendations. They do not silently publish SEO edits, articles or change the client's systems. Scope must be recorded, and reviews can be paused.

## Runtime

Existing Node service, **one replica**, persistent DATA_DIR and existing OPS_TOKEN. Set `MERIDIAN_GROWTH_WORKER=1` only when ready to run the queue. Worker checks once per minute; campaigns run hourly and website reviews daily. No separate ChatGPT automation is created. The flag is off by default. Campaigns independently require start authorization.

Requested report/offer email requires RESEND_API_KEY, a verified EMAIL_FROM and HTTPS PUBLIC_BASE_URL. Provider API acceptance is recorded, not inbox delivery. Missing/failed email blocks a job visibly; retry is an operator action. Interrupted running jobs are blocked on restart and must be reviewed before retry to avoid duplicate email/provider work. Completed jobs are not automatically rerun. Queue writes are atomic and corruption fails closed. This local JSON implementation is designed for one worker process/replica, not a distributed scheduler.

Operations API paths:

- GET `/api/ops/growth`: queue, campaigns, templates, provider/worker readiness
- POST `/api/ops/growth/run`: bounded cycle
- POST `/api/ops/growth/templates`: reviewed commercial template
- POST `/api/ops/growth/projects/:id/offer`: current written quote
- POST `/api/ops/growth/projects/:id/design`: record verified access/design and queue deployment preparation
- POST `/api/ops/growth/projects/:id/operations`: enable/pause approved daily review
- POST `/api/ops/growth/campaigns`: paused niche campaign
- PATCH `/api/ops/growth/campaigns/:id`: start/pause
- POST `/api/ops/growth/campaigns/:id/candidates/:candidateId/verify`: bounded website check
- POST `/api/ops/growth/jobs/:id/retry`: retry blocked job after review

Deployment must include frontend and Node API together. Netlify already proxies `/api/*` to Railway. A static Sites preview does not run this backend. Do not point forms at old production APIs or call this fully operational until the matching backend is deployed and real website fetch, requested email acceptance, customer approval, intake, queue, search-provider and scoped client-delivery checks succeed.
