# Expense Tracker API

Express + TypeScript modular-monolith backend. Phase 7 adds authenticated category reads and the core expense create/detail/update/delete vertical slice.

## Architecture

```text
Route -> Controller -> Service -> Repository -> PostgreSQL
```

- Routes bind HTTP paths.
- Controllers translate HTTP input/output.
- Services own business/dependency behavior.
- Repositories are the only production source files that contain SQL.
- Middleware owns cross-cutting HTTP behavior such as request IDs, validation, logging, and errors.

## Local configuration

Copy `.env.example` to an untracked `.env`, replace its placeholder credentials, and inject those variables before starting the API. The server fails before listening when required configuration is invalid.

Important authentication configuration:

- `JWT_ACCESS_SECRET`: generated secret of at least 32 characters; never commit the real value.
- `ACCESS_TOKEN_TTL_SECONDS`: defaults to 900 and is bounded to 60-3600.
- `REFRESH_TOKEN_TTL_DAYS`: defaults to 30 and is an absolute family lifetime.
- `WEB_ORIGINS`: comma-separated exact origins allowed to make credentialed browser requests.
- `AUTH_RATE_LIMIT_*`: bounded single-process authentication quota. The in-memory store must be replaced with a shared store before running multiple API replicas.
- `CURSOR_SIGNING_SECRET`: a separate random secret of at least 32 characters used only for expense cursor integrity.

The current entry point reads normal process environment variables. With Node 22+ a local run can use:

```powershell
node --env-file=.env dist/server.js
```

## Commands

```powershell
npm.cmd run dev
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:unit
npm.cmd run test:api
npm.cmd run test:contract
npm.cmd run test:integration
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run check
```

Run the repository integration test against an isolated PostgreSQL database:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/expense_tracker_test'
npm.cmd run test:integration
```

`test:coverage` is meaningful only with `TEST_DATABASE_URL` set to a clean disposable migrated/seeded database. It enforces 90% statements, 80% branches, 90% functions, and 90% lines while retaining explicit negative tests for security and data invariants. See `tests/README.md` and `docs/testing/backend-test-report.md` for the pyramid, isolation rules, measured baseline, runtime, and remaining gaps.

## Health behavior

- `GET /api/v1/health/live` proves the HTTP process can respond and does not query PostgreSQL.
- `GET /api/v1/health/ready` proves PostgreSQL accepts a query; dependency failure returns `503 SERVICE_NOT_READY` with `Retry-After: 5`.
- Every response has a server-generated `X-Request-Id`; JSON errors repeat it in `error.requestId`.

SIGINT/SIGTERM stops new HTTP intake, closes idle HTTP connections, waits for active requests, and then closes the PostgreSQL pool. A bounded timeout prevents shutdown from hanging forever.

## Authentication behavior

- Registration normalizes email and stores only an Argon2id encoded hash.
- Access JWTs default to 15 minutes and validate algorithm, issuer, audience, expiry, and UUID subject.
- Web refresh tokens use the `__Host-expense_refresh` Secure/HttpOnly/SameSite=Strict cookie and never appear in JSON.
- Mobile refresh tokens appear in JSON for OS secure storage and never use the web cookie.
- Refresh rotation is transactional. Reuse of a rotated generation revokes its active family.
- Logout is repeat-safe; logout-all requires a valid access token and revokes only that subject's sessions.

## Core CRUD behavior

- `GET /api/v1/categories` returns only active shared categories in configured order.
- Expense create/detail/update/delete derives ownership exclusively from the access-token subject.
- Money is accepted and returned as an exact two-decimal string; it is never converted to JavaScript floating point.
- Non-owned expense IDs return the same `404 EXPENSE_NOT_FOUND` as missing IDs.
- Update/delete require a quoted integer `If-Match`; stale writes return `412` with the current `ETag`.
- The create endpoint already requires `Idempotency-Key` so clients can adopt the stable contract. Durable key storage, fingerprint comparison, and safe replay are intentionally deferred to Phase 13. Until that phase is complete, callers must not automatically retry expense creation and assume duplicate prevention.

## Expense list behavior

- `GET /api/v1/expenses` supports literal case-insensitive title/note search, category and inclusive date filters, four whitelisted sorts, and limits from 1 to 100.
- Every order uses expense UUID as a final tie-breaker. Pagination is forward keyset pagination, not `OFFSET`.
- The server-signed opaque cursor is bound to the authenticated user, normalized filters, sort, and limit. Tampering returns `INVALID_CURSOR`; reuse with another query returns `CURSOR_QUERY_MISMATCH`.
- Responses return `limit`, `hasMore`, and nullable `nextCursor`, but no unneeded total count.
- Historical expenses remain filterable when their category is later inactive.
