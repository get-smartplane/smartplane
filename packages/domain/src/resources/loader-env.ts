/**
 * Environment variables that change how a process loads or runs code (preloads, module paths, shell startup
 * files, helper commands). Delivering one runs code on whatever machine starts the command (a developer's
 * laptop, a CI runner), so they are refused as env names: admins cannot set them, and the CLI and SDK skip
 * them even if a compromised server sends one. `@smartplane/secrets` keeps a copy (it has no dependencies).
 */
export const loaderEnvNames: ReadonlySet<string> = new Set([
  // Node, Bun, Electron
  "NODE_OPTIONS", "NODE_PATH", "BUN_OPTIONS", "ELECTRON_RUN_AS_NODE",
  // Shells and the dynamic loader's search path
  "PATH", "ENV", "BASH_ENV", "BASHOPTS", "SHELLOPTS", "PROMPT_COMMAND", "PS4", "IFS", "ZDOTDIR", "GCONV_PATH",
  // Python, Perl, Ruby, the JVM, Go, Rust
  "PYTHONPATH", "PYTHONSTARTUP", "PYTHONHOME", "PYTHONUSERBASE", "PYTHONWARNINGS", "PYTHONBREAKPOINT",
  "PERL5OPT", "PERL5LIB", "PERLLIB", "PERL5DB", "RUBYOPT", "RUBYLIB",
  "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH", "GOFLAGS", "RUSTC_WRAPPER",
  // Git and SSH helper commands
  "GIT_SSH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_EXEC_PATH", "GIT_EDITOR", "GIT_PAGER",
  "GIT_PROXY_COMMAND", "GIT_EXTERNAL_DIFF", "GIT_TEMPLATE_DIR", "GIT_CONFIG",
  // Pagers that run input preprocessors
  "LESSOPEN", "LESSCLOSE"
])

/** `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n`, `npm_config_script_shell`, ... */
export const loaderEnvPrefixes: ReadonlyArray<string> = ["LD_", "DYLD_", "GIT_CONFIG_", "NPM_CONFIG_"]

/** Case-insensitive: Windows environment names are, and npm reads `npm_config_*` in either case. */
export const isLoaderEnvName = (name: string): boolean => {
  const upper = name.toUpperCase()
  return loaderEnvNames.has(upper) || loaderEnvPrefixes.some((prefix) => upper.startsWith(prefix))
}
