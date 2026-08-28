# Meridian close-loop — default STOP

Ken finalize phrase (exact):

```
yes lets go ahead with this
```

Anything else, including silence and “looks good,” is STOP.

```
consent → proposal → customer locks facts → Stripe/money
  → AWAITING KEN
  → Ken phrase recorded
  → then deploy + smoke verify
  → fail closed if verify fails
```

## Gates that never auto-bypass

| Gate | Default |
|------|---------|
| Money | STOP until Stripe or ops approve |
| Facts | STOP if hours/services thin or invented |
| Ken go-ahead | STOP until exact phrase |
| Smoke verify | STOP / not live if fail |
| Unknown | STOP |

`MERIDIAN_AUTO_EXECUTE=1` only drains jobs that already have Ken go-ahead. It does not skip Ken.

## Record go-ahead

```
POST /api/ops/close/go-ahead/:jobId
Authorization: Bearer OPS_TOKEN
{ "phrase": "yes lets go ahead with this", "execute": true }
```

Hold:

```
POST /api/ops/close/hold/:jobId
```
