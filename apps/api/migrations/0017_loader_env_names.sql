-- Env names that change how processes load code (NODE_OPTIONS, LD_*, PATH, ...) are no longer valid
-- (`isLoaderEnvName` in packages/domain/src/resources/loader-env.ts). Clear any stored explicit `envName`
-- that is one, so the row still decodes; the secret falls back to its derived name, and is not delivered
-- at all when that is unsafe too.
UPDATE resources SET config = json_remove(config, '$.envName')
WHERE kind IN ('secret', 'variable')
  AND json_extract(config, '$.envName') IS NOT NULL
  AND (
    upper(json_extract(config, '$.envName')) IN (
    'NODE_OPTIONS', 'NODE_PATH', 'BUN_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'PATH', 'ENV', 'BASH_ENV', 'BASHOPTS',
    'SHELLOPTS', 'PROMPT_COMMAND', 'PS4', 'IFS', 'ZDOTDIR', 'GCONV_PATH', 'PYTHONPATH', 'PYTHONSTARTUP',
    'PYTHONHOME', 'PYTHONUSERBASE', 'PYTHONWARNINGS', 'PYTHONBREAKPOINT', 'PERL5OPT', 'PERL5LIB', 'PERLLIB', 'PERL5DB',
    'RUBYOPT', 'RUBYLIB', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'JDK_JAVA_OPTIONS', 'CLASSPATH', 'GOFLAGS', 'RUSTC_WRAPPER',
    'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_EXEC_PATH', 'GIT_EDITOR', 'GIT_PAGER', 'GIT_PROXY_COMMAND',
    'GIT_EXTERNAL_DIFF', 'GIT_TEMPLATE_DIR', 'GIT_CONFIG', 'LESSOPEN', 'LESSCLOSE'
    )
    OR substr(upper(json_extract(config, '$.envName')), 1, 3) = 'LD_'
    OR substr(upper(json_extract(config, '$.envName')), 1, 5) = 'DYLD_'
    OR substr(upper(json_extract(config, '$.envName')), 1, 11) = 'GIT_CONFIG_'
    OR substr(upper(json_extract(config, '$.envName')), 1, 11) = 'NPM_CONFIG_'
  );
