# Meridian close-loop (proposal → accept → facts lock → cash → execute)

## Reframe

Fully autonomous with no humans is how you ship a receptionist that invents Saturday hours.

The loop that scales:

```
consent + lead
  → proposal generated
  → accept link emailed / opened
  → customer locks FACTS (hours, services, transfer)
  → customer pays Stripe (or ops approve-money)
  → MERIDIAN_AUTO_EXECUTE=1 drains the job
  → deployAgent + smoke verify
  → fail closed if verify fails
  → customer gets setup wizard
  → HUMAN remains: attach the phone number
```

## Gates that never auto-bypass

| Gate | Why |
|------|-----|
| Money | Agent must not charge cards |
| Facts score | Incomplete / placeholder hours block execute |
| Smoke verify | Unverified agent is not delivered |
| CASL | This module never cold-texts |
| OpenClaw cage | No banks, inboxes, logins |
| Phone attach | Carrier accounts stay with the customer |

## Arm it

```
MERIDIAN_AUTO_EXECUTE=1
```

server.mjs:

```js
import { registerAutoCloseRoutes } from './lib/auto-close-routes.mjs';
registerAutoCloseRoutes(app, { admin });
```

Customer: `GET /accept/:token`
Ops: `POST /api/ops/close/tick` · `GET /api/ops/close/status`
