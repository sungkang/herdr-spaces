# herdr-spaces

`tmux-sessionizer`, but for [herdr](https://herdr.dev)'s desktop app, `herdr-app`.

Give it a TOML list of project folders. Press your keybind → a modal pops up →
fuzzy-search your open spaces and project folders → `<enter>` **shows** the
space if that folder is already open, or opens a new herdr-app **space**
rooted there.

Two front-ends share one config:

- **Modal** (`mod/`): a herdr-app mod. Native dialog with live space status
  (working / needs you / finished), branches, and highlighted fuzzy matches.
- **fzf** (`herdr-spaces`): the same picker in any terminal.

## How it works

```
ctrl-s f ─▶ mod.open:herdr-spaces ─▶ modal ─▶ space.select / space.new
                 │
                 └─ herdr-spaces --json  (folders from your config)
```

The modal reads open spaces live from herdr-app and asks the script for your
project folders (`herdr-spaces --json`), so the config, `/*` fan-out and
labels live in one place. Enter on an open space shows it; on a folder it shows
that folder's space if one is open, else runs `space.new` on this computer.

The fzf mode works the same way through the CLI: `herdr-app ls` for spaces,
then `herdr-app do space.select` or `herdr-app do space.new`.

**Show vs. create:** a folder is "already open" if a local space has a
terminal in that folder (or inside it), or its start folder is that folder,
or failing that, a local space has the same **name**. A new space is named
after the folder basename by default, the same rule tmux-sessionizer used with
session names. Use `label_style = "parent-name"` if you have same-named
folders under different roots.

## Modal keys

| key | does |
|---|---|
| type | fuzzy filter (space-separated terms must all match) |
| `↑` `↓`, `ctrl-n` `ctrl-p` | move |
| `↵` | open |
| `esc` | close |

## Requirements

- `herdr-app` (window running)
- `python3` 3.11+ (uses stdlib `tomllib`, no third-party packages)
- `fzf`, only for the terminal picker

## Install

```sh
./install.sh
```

This:

- symlinks `herdr-spaces` into `~/.local/bin`,
- symlinks `mod/` to `~/.config/herdr-app/mods/herdr-spaces` (edits here
  reload in the app),
- creates `~/.config/herdr-spaces/config.toml` from the example if you don't
  have one.

Then bind a key in `~/.config/herdr-app/keys.json`, under `"global"` (the file
is reloaded live, no restart):

```json
"ctrl-s f": "mod.open:herdr-spaces"
```

`ctrl-s f` is a chord (`ctrl-s`, then `f`); use any key you like. Pressing it
again closes the modal. The mod runs `herdr-spaces` from your `PATH`; if the
modal says it can't run it, make sure `~/.local/bin` is on the `PATH` herdr-app
starts with.

Prefer the terminal picker? Bind a split pane instead:

```json
"ctrl-s f": {"command": "pane.split", "args": {"direction": "down", "argv": ["herdr-spaces"]}}
```

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
include_open_workspaces = true # list currently-open spaces at the top too
label_style = "name"           # "name" (basename) or "parent-name"
```

## CLI flags (debug / scripting)

| flag              | effect                                              |
|-------------------|-----------------------------------------------------|
| `--json`          | print the configured folders as JSON and exit (what the modal reads) |
| `--list`          | print candidate rows and exit (no fzf, no changes)  |
| `--dry-run`       | pick, but print the `herdr-app` command instead of running it |
| `--config PATH`   | use a specific config file                          |
| `--default-config` | print a default config to stdout and exit (e.g. `herdr-spaces --default-config > ~/.config/herdr-spaces/config.toml`) |

## Uninstall

```sh
rm ~/.local/bin/herdr-spaces ~/.config/herdr-app/mods/herdr-spaces
```

Then remove the `herdr-spaces` binding from `~/.config/herdr-app/keys.json`.
