#!/usr/bin/env bash
# herdr-spaces installer: symlink the picker onto PATH and seed a config.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${HERDR_SPACES_BIN:-$HOME/.local/bin}"
cfg_dir="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-spaces"
cfg="$cfg_dir/config.toml"

mkdir -p "$bin_dir" "$cfg_dir"

ln -sf "$here/herdr-spaces" "$bin_dir/herdr-spaces"
echo "linked  $bin_dir/herdr-spaces -> $here/herdr-spaces"

if [[ -e "$cfg" ]]; then
  echo "config  $cfg (exists, left unchanged)"
else
  cp "$here/config.example.toml" "$cfg"
  echo "config  $cfg (created from example — edit your folder list)"
fi

case ":$PATH:" in
  *":$bin_dir:"*) : ;;
  *) echo "warning: $bin_dir is not on your PATH — add it or herdr won't find herdr-spaces" ;;
esac

cat <<'SNIPPET'

Next: bind a key in ~/.config/herdr/config.toml, then `herdr server reload-config`.

    [[keys.command]]
    key = "prefix+o"
    type = "pane"
    command = "herdr-spaces"

Note: prefix+o is herdr's default `open_notification_target`. If you also use
that action, either pick a different key here, or explicitly move it, e.g. add
`open_notification_target = "prefix+shift+o"` under [keys].
SNIPPET
