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
- `NEXT_PUBLIC_SUPPORT_URL` — the support site that mints agent tokens and
  hosts login and logout. Defaults to the program's `supportUrl`
  (`https://support.access-ci.org` for ACCESS).
- `NEXT_PUBLIC_PROGRAM` — the program whose settings this build uses, a key in
  `src/config/programs` (names, URLs, disclaimer, feature flags). Defaults to
  `access`.

All `NEXT_PUBLIC_*` values are inlined into the client bundle at build time.

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

Signed-in users are identified by a short-lived Bearer token. The client asks
the support site for one with a credentialed `POST` to `/api/agent-token`,
which authenticates the browser with its support session cookie, and holds the
token in memory (`src/lib/agent-token.ts`). It mints again shortly before the
token expires. A 401 means the user is signed out, and the chat then continues
anonymously.

`src/lib/agent-fetch.ts` adds the token as an `Authorization: Bearer` header on
calls to the agent, and on a 401 it mints once and retries the request once.
The agent never needs the support cookie.

Sign-in opens support's login page in a popup (`src/lib/sign-in.ts`), so the
user stays on the chat. When the popup closes, or the window regains focus, the
client mints again and picks up the new session. If the browser blocks the
popup, login opens in a new tab and the focus re-mint covers it. The header's
sign-in and sign-out links come from `@access-ci/ui` and point at support
(`src/components/SiteChrome.tsx`).

## Deploy

The `Dockerfile` is a multi-stage build on `node:22-alpine`. It installs from
the lockfile, runs `pnpm build`, and ships the Next standalone server as a
non-root user on port 3000 (`node server.js`). `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_ASSISTANT_ID`, `NEXT_PUBLIC_SUPPORT_URL` and `NEXT_PUBLIC_PROGRAM`
are build arguments, because Next bakes them into the bundle. The defaults point
at `https://qa.access-ci.org/api/v1`, assistant `agent`,
`https://support.access-ci.org`, and program `access`. Override them with
`--build-arg` for a different host or program.

`.github/workflows/ci.yml` runs format check, lint, typecheck, test, build and
spelling checks on every PR and on pushes to `main`. When CI succeeds on `main`
(or on manual dispatch), `.github/workflows/publish.yml` builds the image,
pushes it to GHCR, and deploys it over SSH to the production host by pulling it
and force-recreating the `chatbot` service in the `access-mcp` compose project.
It then smoke-tests that the container runs the new image and serves on port 3000.

The agent's `/api/v1` is expected on the same host as this client, so the
client needs no CORS handling.

## Provenance

Forked from [langchain-ai/agent-chat-ui](https://github.com/langchain-ai/agent-chat-ui)
(MIT) at commit `cf72cb0f68a04d24db93eb19afb2d46f3a5261d4` (2026-09-28). Upstream
is the read-only `upstream` remote; pull fixes by diffing against that SHA rather
than merging its history. This fork has since pinned stable TypeScript (dropping
upstream's TS7-preview toolchain), replaced the branding with ACCESS chrome, and
added the cross-surface handoff and credentialed-call plumbing.

## License

MIT — see [LICENSE](./LICENSE).
