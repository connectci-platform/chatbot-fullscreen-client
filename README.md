# ACCESS Full-Screen Chat Client

The full-screen ACCESS-CI assistant: a standalone Next.js client that talks to
the ACCESS agent's LangGraph-compatible thread/run protocol. It complements the
embedded qa-bot-core widget and supports cross-surface conversation continuity
with it (sidebar reunion for signed-in users plus a one-time token handoff).

## Stack

- Next.js 16 (App Router), React 19, TypeScript 5
- Tailwind CSS 4 + shadcn/ui for the chat UI
- `@access-ci/ui` for the ACCESS site chrome (header, universal nav, footer),
  rendered shadow-DOM-isolated so its styles don't collide with the app's
- `@langchain/langgraph-sdk` for the thread/run protocol client

## Develop

Requires Node 22+ and pnpm 10.5.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Configuration is via environment variables (see `.env.example`):

- `NEXT_PUBLIC_API_URL` — the ACCESS agent base URL. In production this is
  same-origin (the client and the agent are served from the same host), so a
  relative `/api/v1` works; for local dev point it at a running agent.
- `NEXT_PUBLIC_ASSISTANT_ID` — the assistant/graph id.

Without a reachable agent the UI renders but cannot hold a conversation (you'll
see connection errors in the console — expected).

## Scripts

| Command                             | What it does                                      |
| ----------------------------------- | ------------------------------------------------- |
| `pnpm dev`                          | Dev server                                        |
| `pnpm build`                        | Production build (`next build`)                   |
| `pnpm start`                        | Serve the production build                        |
| `pnpm typecheck`                    | `tsc --noEmit`                                    |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                            |
| `pnpm format` / `pnpm format:check` | Prettier                                          |
| `pnpm test` / `pnpm test:watch`     | Vitest                                            |
| `pnpm test:coverage`                | Vitest with a coverage report (no threshold gate) |

CI (`.github/workflows/ci.yml`) runs format-check, lint, typecheck, test, and
build on every PR; coverage is reported, not gated.

## Auth

Identity comes from the `SESSaccess_auth` JWT cookie (scoped to
`.access-ci.org`), sent on the SDK's credentialed calls to the agent. The token
is minted only by `support.access-ci.org`.

Login is **not yet functional end-to-end** (see the comment in
`src/components/SiteChrome.tsx`): support's login only redirects back to
support-internal paths and the JWT cookie is `.access-ci.org`-scoped, so the
client must be deployed on an `*.access-ci.org` subdomain, and the login flow
must be a popup/new-tab that mints the cookie which the client then detects in
place — not a redirect round-trip. That flow is deferred until the deploy origin
is settled.

## Deploy

Intended to run on burrow (UKY) served from `qa.access-ci.org`, the same origin
as the agent, behind the existing Caddy: `/api/*` (and `/docs`, `/openapi.json`)
route to the agent, `/dashboard/*` to the reporting dashboard, and everything
else to this client. Same-origin with the agent means no CORS and the auth
cookie flows with no special handling. A Dockerfile and the Caddy path-routing
change are the remaining deploy artifacts.

## Provenance

Forked from [langchain-ai/agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui)
(MIT) at commit `cf72cb0f68a04d24db93eb19afb2d46f3a5261d4` (2026-09-28). Upstream
is the read-only `upstream` remote; pull fixes by diffing against that SHA rather
than merging its history. This fork has since pinned stable TypeScript (dropping
upstream's TS7-preview toolchain), replaced the branding with ACCESS chrome, and
added the cross-surface handoff and credentialed-call plumbing.

## License

MIT — see [LICENSE](./LICENSE).
