# Security policy

Smartplane governs what AI agents may reach, so we treat security reports as our highest priority.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this repository. Do not
open a public issue, pull request or discussion for a suspected vulnerability.

Include what you found, how to reproduce it, and the impact you expect. We acknowledge reports within three
business days, keep you updated while we fix, and credit you in the release notes unless you prefer otherwise.

## Scope

In scope: this repository's code (API, MCP gateway, dashboard, integration runners, CLI, SDK) and the hosted
service at app.smartplane.dev. Please test only against your own organisation and data, never other customers',
and do not run denial-of-service or social-engineering tests.

## Supported versions

Fixes land on `main` and in the latest release of the `smartplane` CLI and `@smartplane/secrets` SDK.
