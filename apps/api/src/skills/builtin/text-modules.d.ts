/** Markdown files imported as text: wrangler's `Text` module rule in production, a Vite plugin under vitest. */
declare module "*.md" {
  const text: string
  export default text
}
