# Expense Tracker Web

React/TypeScript client for the shared Expense Tracker REST API.

## Local setup

1. Copy `.env.example` to `.env` and adjust `VITE_API_BASE_URL` if needed.
2. Configure the API `WEB_ORIGINS` with the exact Vite origin, normally `http://localhost:5173`.
3. Run `npm install`, then `npm run dev`.

The web refresh credential is an HttpOnly cookie. The access token is held only in memory and attached as a Bearer token by the API client.

## Checks

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

Phase 10 deliberately disables automatic retries and does not implement refresh coalescing, request cancellation, or optimistic financial mutations. Those policies are introduced and tested in Phase 12.
