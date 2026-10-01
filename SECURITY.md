# Security policy

## Reporting a vulnerability

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Please do not file a public issue for security problems.

You can expect a first reply within a week. Once a fix is released, the report is credited unless you prefer otherwise.

## What matters most here

Portlens terminates processes, so the most serious problems are the ones that let it stop something it should not: a bypass of the protected-process list, stopping a process after its PID was reused, or the interface being driven by untrusted content. The web view only talks to the app through the commands in `app/src-tauri/src/lib.rs`, and it has no network access under the content security policy in `tauri.conf.json`.

## Supported versions

Only the latest release receives fixes.
