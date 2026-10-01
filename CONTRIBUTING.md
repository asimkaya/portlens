# Contributing

Thanks for taking a look. A few notes to keep changes easy to review.

## Before you start

For anything bigger than a bug fix, open an issue first so we can agree on the approach. Portlens is deliberately small: it shows ports and stops the processes behind them. Network scanning, remote machines and port forwarding are out of scope.

## Setup

See [Building](README.md#building). Windows is the only supported platform, so the Rust crates only build there.

## Layout

| Path | What lives there |
| --- | --- |
| `crates/portlens-core` | Win32 access: socket tables, process info, classification, stopping processes |
| `crates/portlens-cli` | The `portlens` command |
| `app/src-tauri` | The Tauri shell: commands, tray, window handling |
| `app/src` | The React interface |

Keep Win32 and `unsafe` code in `portlens-core`, and keep the Tauri layer thin.

## Code style

- Run `cargo fmt` and `npx prettier --write src` before committing. CI checks both.
- Comments explain why, not what. If a line needs a comment to say what it does, rename something instead.
- Every `unsafe` block should be small and sit next to the reason it is sound.
- Prefer a plain function over a new abstraction until there are two callers.
- Add a test when you fix a bug or touch parsing and classification logic.
- User-facing text is sentence case, in plain language, and says what will happen ("Stop process", not "Submit").

## Commits and pull requests

- Write commit messages in the imperative: "Handle IPv6 scope ids in the UDP table".
- One logical change per pull request. Explain what changed and why, and include a screenshot for visible changes.
- CI must pass.

## Reporting security problems

Please do not open a public issue. See [SECURITY.md](SECURITY.md).
