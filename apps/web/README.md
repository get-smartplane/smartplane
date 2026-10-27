# @pc/web

Admin dashboard SPA: Vite, React 19, TanStack Router (file routes in `src/routes`), Tailwind v4 and shadcn/ui,
served as Workers static assets (`wrangler.jsonc`, SPA fallback).

- `bun run dev` serves on :5173 and proxies `/api`, `/auth`, `/mcp` to the API worker on :8787
  (override with `API_ORIGIN`), so the session cookie is same-origin.
- `bun run typecheck`, `bun run build`, `bun run deploy`.

Data flow: `src/lib/api` derives a typed client from `@pc/domain`'s `PrimitiveApi` and exposes it through one
atom runtime (`effect/reactivity` + `@effect/atom-react`). Features declare query/mutation atoms in
`src/features/<area>/atoms.ts`; mutations invalidate reactivity keys so dependent queries refetch.
