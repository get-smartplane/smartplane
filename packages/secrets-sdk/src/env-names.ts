/**
 * Env names that change how a process loads or runs code (`NODE_OPTIONS`, `LD_PRELOAD`, `PATH`, ...). The
 * server never delivers them; this copy of its list (this package has no dependencies) makes sure a
 * compromised or impersonated server cannot set one in this process either. Keep in sync with
 * `isLoaderEnvName` in @pc/domain (packages/domain/src/resources/loader-env.ts).
 */
const loaderNames: ReadonlySet<string> = new Set([
  "NODE_OPTIONS", "NODE_PATH", "BUN_OPTIONS", "ELECTRON_RUN_AS_NODE",
  "PATH", "ENV", "BASH_ENV", "BASHOPTS", "SHELLOPTS", "PROMPT_COMMAND", "PS4", "IFS", "ZDOTDIR", "GCONV_PATH",
  "PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "PYTHONUSERBASE", "PYTHONWARNINGS", "PYTHONBREAKPOINT",
  "PERL5OPT", "PERL5LIB", "PERLLIB", "PERL5DB", "RUBYOPT", "RUBYLIB",
  "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH", "GOFLAGS", "RUSTC_WRAPPER",
  "GIT_SSH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_EXEC_PATH", "GIT_EDITOR", "GIT_PAGER",
  "GIT_PROXY_COMMAND", "GIT_EXTERNAL_DIFF", "GIT_TEMPLATE_DIR", "GIT_CONFIG",
  "LESSOPEN", "LESSCLOSE"
])
const loaderPrefixes: ReadonlyArray<string> = ["LD_", "DYLD_", "GIT_CONFIG_", "NPM_CONFIG_"]
const envNamePattern = /^[A-Z_][A-Z0-9_]{0,127}$/

/** A name this SDK will put into the environment: well-formed and not a loader variable. */
export const isSafeEnvName = (name: string): boolean => {
  const upper = name.toUpperCase()
  return envNamePattern.test(name) && !loaderNames.has(upper) && !loaderPrefixes.some((prefix) => upper.startsWith(prefix))
}
