/** The folder on github.com at an exact commit (or ref), so the link shows what agents are served. */
export const githubUrl = (repo: string, at: string | undefined, path: string | undefined): string =>
  at === undefined ? `https://github.com/${repo}` : `https://github.com/${repo}/tree/${at}${path ? `/${path}` : ""}`
