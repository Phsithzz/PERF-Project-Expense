# Backend test strategy

The backend uses a small test pyramid rather than one large end-to-end suite.

## Layers

- `unit/`: pure rules, codecs, repository query construction, configuration, and lifecycle behavior. These run without PostgreSQL and should give fast, local failure feedback.
- `api/`: Express HTTP behavior with service/repository boundaries replaced by focused fakes. These verify middleware order, status codes, headers, validation, auth boundaries, envelopes, and secret-safe errors.
- `integration/`: real PostgreSQL behavior for migrations, repositories, transactions, constraints, concurrency, ownership, and deterministic pagination. These require `TEST_DATABASE_URL` and run files serially because the suite shares one isolated database.
- `contract/`: executable OpenAPI validation, including operation inventory, references, examples, security rules, and error-code parity.

The SQL files under `database/tests/` independently prove database constraints inside rollback-only transactions.

## Commands

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run test:contract
npm.cmd run test:coverage
```

`test:integration` and meaningful coverage require a clean disposable PostgreSQL database with migrations and seeds applied. Never point them at development or production data.

## Coverage policy

Coverage is a gap detector, not the goal. Thresholds apply to maintained application modules while excluding the process entry point and ambient type declarations. Critical auth, ownership, money, cursor, transaction, and error behavior must have explicit negative tests even when line coverage already passes.

## Isolation and flake policy

- Reset owned mutable tables before every integration test and restore shared category active state.
- Use deterministic UUID/date/money fixtures when order matters.
- Do not use sleeps to coordinate concurrency tests.
- A failure is fixed at its cause; do not add retries to hide flakes.
- Record suite runtime during Phase verification so unexpected growth is visible.
