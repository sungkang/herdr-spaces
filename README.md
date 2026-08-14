# herdr-spaces

`tmux-sessionizer`, but for [herdr](https://herdr.dev).

Give it a TOML list of project folders. Press your keybind → fuzzy-search the
list → `<enter>` opens a new herdr **workspace** rooted at that folder, or
**focuses** the existing one if it's already open.

It's a thin fzf front-end over `herdr workspace` — no daemon, one script.

## How it works

`herdr` has no plugin API, but it does have **custom key commands** and a
**socket CLI**. herdr-spaces is exactly that: a `[[keys.command]]` bound to a
key runs the `herdr-spaces` script in a temporary pane; the script builds the
candidate list, runs `fzf`, then calls `herdr workspace create`/`focus` over
the socket. The pane closes when you pick (or cancel).

```
prefix+o ─▶ [temp pane] herdr-spaces ─▶ fzf picker ─▶ herdr workspace create/focus
```

**Focus vs. create** is matched by workspace **label** (herdr's API doesn't
expose a workspace's cwd). A new workspace gets label = folder basename by
default; if a workspace with that label already exists, it's focused instead of
duplicated. Same rule tmux-sessionizer used with session names. Use
`label_style = "parent-name"` if you have same-named folders under different
roots.

## Requirements

- `herdr` (running, so the socket CLI works)
- `fzf`
- `python3` 3.11+ (uses stdlib `tomllib` — no third-party packages)

## Install

```sh
./install.sh
```

This symlinks `herdr-spaces` into `~/.local/bin`, and creates
`~/.config/herdr-spaces/config.toml` from the example if you don't have one.

Then bind a key in `~/.config/herdr/config.toml` and reload:

```toml
[[keys.command]]
key = "prefix+o"
type = "pane"
command = "herdr-spaces"
```

```sh
herdr server reload-config
```

> **prefix+o conflict:** `prefix+o` is herdr's default `open_notification_target`.
> Pick another key, or move that action, e.g. add `open_notification_target = "prefix+shift+o"`
> under `[keys]`. To change herdr-spaces' key later, just edit `key = "..."` above.

## Config

Default location `~/.config/herdr-spaces/config.toml` (override with
`$HERDR_SPACES_CONFIG` or `--config PATH`). See `config.example.toml`.

```toml
# project folders. A path ending in "/*" fans out: its subdirectories become
# candidates (like find -maxdepth 1 -type d). A plain path is offered as-is
# (the folder itself, not its children).
folders = ["~/dev/me/*", "~/dev/ai/*", "~/dev/work/*", "~/dev/sketch/*", "~/dev"]

folder_depth = 1               # levels below a "/*" path to collect (1 = immediate children)
include_hidden = false         # include dot-directories when fanning
include_open_workspaces = true # list currently-open workspaces at the top too
label_style = "name"           # "name" (basename) or "parent-name"
```

## CLI flags (debug / scripting)

| flag              | effect                                              |
|-------------------|-----------------------------------------------------|
| `--list`          | print candidate rows and exit (no fzf, no changes)  |
| `--dry-run`       | pick, but print the `herdr` command instead of running it |
| `--config PATH`   | use a specific config file                          |
| `--default-config` | print a default config to stdout and exit (e.g. `herdr-spaces --default-config > ~/.config/herdr-spaces/config.toml`) |

## Uninstall

```sh
rm ~/.local/bin/herdr-spaces
```

Then remove the `[[keys.command]]` block from `~/.config/herdr/config.toml`.
