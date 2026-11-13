#!/usr/bin/env bash
# herdr-spaces installer: link the picker onto PATH, the modal into herdr-app, seed a config.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${HERDR_SPACES_BIN:-$HOME/.local/bin}"
cfg_dir="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-spaces"
cfg="$cfg_dir/config.toml"

mkdir -p "$bin_dir" "$cfg_dir"

ln -sf "$here/herdr-spaces" "$bin_dir/herdr-spaces"
echo "linked  $bin_dir/herdr-spaces -> $here/herdr-spaces"

# The herdr-app modal: link mod/ into herdr-app's mods folder (edits reload live).
mods_dir="${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods"
mod="$mods_dir/herdr-spaces"
if [[ -e "$mod" && ! -L "$mod" ]]; then
  echo "skip    $mod is a real folder, not a link; move it aside to install the modal"
else
  mkdir -p "$mods_dir"
  ln -sfn "$here/mod" "$mod"
  echo "linked  $mod -> $here/mod"
fi

if [[ -e "$cfg" ]]; then
  echo "config  $cfg (exists, left unchanged)"
else
  cp "$here/config.example.toml" "$cfg"
  echo "config  $cfg (created from example — edit your folder list)"
fi

case ":$PATH:" in
  *":$bin_dir:"*) : ;;
  *) echo "warning: $bin_dir is not on your PATH — add it or herdr-app won't find herdr-spaces" ;;
esac

cat <<'SNIPPET'

Next: bind a key in ~/.config/herdr-app/keys.json, under "global"
(the file is reloaded live):

    "ctrl-s f": "mod.open:herdr-spaces"

(or, for the fzf picker in a split pane instead:
    "ctrl-s f": {"command": "pane.split", "args": {"direction": "down", "argv": ["herdr-spaces"]}} )

SNIPPET
