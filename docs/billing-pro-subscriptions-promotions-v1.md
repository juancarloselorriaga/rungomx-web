# Billing Pro Subscriptions + Promotions (V1)

Provider-agnostic Pro access system with trials, admin overrides, promo codes, and pending grants.
All timestamps are UTC and `endsAt` is exclusive (`now < endsAt`).

## Environment

- `BILLING_HASH_SECRET` (preferred): HMAC secret used as version 1 for promo and pending-grant hashing.
- `BILLING_HASH_SECRET_V1` (supported): Versioned secret; used if `BILLING_HASH_SECRET` is not set or if you are rotating secrets.
- `BILLING_TRIAL_DAYS` (optional): Trial length in days; defaults to `7` when unset/invalid.

## Cron (billing maintenance)

Route: `/api/cron/billing-maintenance`

- If `CRON_SECRET` is set, call with `Authorization: Bearer $CRON_SECRET`.
- In development, it also accepts `x-vercel-cron: 1`.

Example:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing-maintenance
```

## Tests

- Unit + DB: `pnpm test`
- E2E: `pnpm test:e2e`
- Full CI suite: `pnpm test:ci` (or `pnpm test:ci:isolated`)

## DDL audit

Exact DDL applied in Neon:

- `docs/db/billing-pro-subscriptions-promotions-v1.sql`
