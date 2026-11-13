// herdr-spaces: a project picker modal for herdr-app.
//
// Open spaces (live, with agent status) and the project folders from
// ~/.config/herdr-spaces/config.toml (read through `herdr-spaces --json`).
// Type to fuzzy-filter, ↑/↓ (or ctrl-n/ctrl-p) to move, Enter to go, Esc to close.
// A folder that already has a space jumps to it; otherwise it becomes a new space.
//
// Opened with `mod.open:herdr-spaces` (keys.json). Lives in the herdr-spaces repo
// under mod/ and is linked to ~/.config/herdr-app/mods/herdr-spaces by install.sh.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, panes, run, exec, home, theme, props, closeOverlay, shared, setShared } from "herdr";

const ICON = (name) => `mods/herdr-spaces/icons/${name}.svg`;

// ---------------------------------------------------------------------------
// Space colors: the same rule as Herdr's own picker and sidebar (shared
// "space.colors", fewest-used theme color first), so tiles match everywhere.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

// ---------------------------------------------------------------------------
// Paths
const trim = (p) => (p.length > 1 ? p.replace(/\/+$/, "") : p);
function expand(p) {
  if (!p || p === "~") return home();
  return trim(p.startsWith("~/") ? home() + p.slice(1) : p);
}
function tilde(p) {
  const h = home();
  return p === h ? "~" : p.startsWith(h + "/") ? "~" + p.slice(h.length) : p;
}

// Where each space is now: its terminals' live folders, first tab's first
// terminal first (Herdr names unnamed spaces after that one). `space.folder`
// is only where new terminals start, so it's the fallback.
function liveFolders() {
  const all = panes();
  const out = new Map();
  for (const s of spaces()) {
    const tabs = [...s.tabs].sort((a, b) => a.index - b.index).map((t) => t.id);
    out.set(s.id, tabs.flatMap((id) => all.filter((p) => p.tab === id && p.cwd).map((p) => trim(p.cwd))));
  }
  return out;
}

// An open space on this computer for a folder: a terminal in that folder, then
// one inside it, then its start folder, then the same name (herdr-spaces' label).
function spaceFor(d, local, live) {
  const want = [trim(d.path), trim(d.real)];
  const cwds = (s) => live.get(s.id) ?? [];
  return local.find((s) => cwds(s).some((c) => want.includes(c)))
    ?? local.find((s) => cwds(s).some((c) => want.some((w) => c.startsWith(w + "/"))))
    ?? local.find((s) => want.includes(expand(s.folder)))
    ?? local.find((s) => s.name === d.label)
    ?? null;
}

// ---------------------------------------------------------------------------
// fzf-style matching: every whitespace-separated term must appear as a
// subsequence. Consecutive characters and word starts score higher; matches in
// the last path segment score highest. Returns { score, hits } or null.
const BOUNDARY = /[\/\-_. ]/;
function matchTerm(term, text) {
  const s = text.toLowerCase();
  const base = s.lastIndexOf("/") + 1;
  // Try every start of the first character and keep the best greedy run.
  let best = null;
  for (let start = s.indexOf(term[0]); start !== -1; start = s.indexOf(term[0], start + 1)) {
    const hits = [start];
    let i = start;
    for (let k = 1; k < term.length; k++) {
      i = s.indexOf(term[k], i + 1);
      if (i === -1) break;
      hits.push(i);
    }
    if (hits.length < term.length) break; // later starts can't do better
    let score = 0;
    hits.forEach((h, n) => {
      score += 1;
      if (n > 0 && h === hits[n - 1] + 1) score += 6;
      if (h === 0 || BOUNDARY.test(s[h - 1])) score += 8;
      if (h >= base) score += 3;
    });
    score -= (hits[hits.length - 1] - hits[0] + 1 - hits.length) * 0.5; // gaps
    if (!best || score > best.score) best = { score, hits };
  }
  return best;
}
function fuzzy(query, text) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { score: 0, hits: [] };
  let score = 0;
  const hits = new Set();
  for (const term of terms) {
    const m = matchTerm(term, text);
    if (!m) return null;
    score += m.score;
    m.hits.forEach((h) => hits.add(h));
  }
  return { score, hits: [...hits] };
}

// Text with matched characters in the accent color.
function highlighted(text, hits, color, accent) {
  if (!hits?.length) return div().min_w(0).truncate().text_color(color).child(text);
  const on = new Set(hits);
  const runs = [];
  for (let i = 0; i < text.length; i++) {
    const hit = on.has(i);
    if (runs.length && runs[runs.length - 1].hit === hit) runs[runs.length - 1].text += text[i];
    else runs.push({ hit, text: text[i] });
  }
  return h_flex().min_w(0).overflow_hidden().whitespace_nowrap().children(
    runs.map((r) => div().flex_none().text_color(r.hit ? accent : color).when(r.hit, (d) => d.font_semibold()).child(r.text)),
  );
}

// ---------------------------------------------------------------------------
export default class HerdrSpaces extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = null; // index into pickable rows; null: pick a start on first render
    this.data = null; // { include_open_spaces, dirs }
    this.error = null;
    this.list = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Find a project or space…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.reveal = true;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.pickable()[this.at ?? 0]));
    this.input.focus();
    cx.timer.after(150, () => this.input.focus());
    cx.spawn(async (cx) => {
      try {
        const r = await exec("herdr-spaces", ["--json"], { timeout: 15000 });
        if (r.code !== 0) this.error = (r.stderr || r.stdout || `herdr-spaces exited ${r.code}`).trim();
        else this.data = JSON.parse(r.stdout);
      } catch (e) {
        this.error = `Couldn't run herdr-spaces: ${e?.message ?? e}`;
      }
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // All rows in display order: section heads plus pickable space/dir rows.
  rows() {
    const f = this.filter.trim();
    const all = spaces();
    const local = all.filter((s) => !s.machine);
    const live = liveFolders();
    const out = [];
    const section = (title, items) => {
      if (!items.length) return;
      out.push({ kind: "head", title, count: items.length });
      out.push(...items);
    };
    const rank = (items) => (f ? items.filter((r) => r.m).sort((a, b) => b.m.score - a.m.score) : items);

    if (this.data?.include_open_spaces ?? true) {
      section("Open spaces", rank(all.map((s) => {
        const folder = live.get(s.id)?.[0] ?? (s.folder || "~");
        const where = s.machine ? `${s.machine}:${folder}` : tilde(expand(folder));
        // Match name and folder; only the name's hits are drawn.
        return { kind: "space", s, where, m: fuzzy(f, `${s.name} ${where}`) };
      })));
    }
    if (this.data) {
      section("Projects", rank(this.data.dirs.map((d) => ({ kind: "dir", d, open: spaceFor(d, local, live), m: fuzzy(f, d.display) }))));
    }
    return out;
  }

  pickable() {
    return this.rows().filter((r) => r.kind !== "head");
  }

  go(r) {
    if (!r) return;
    this.close();
    if (r.kind === "space") run("space.select", { id: r.s.id });
    else if (r.open) run("space.select", { id: r.open.id });
    // machine "": this computer, whatever space is focused.
    else run("space.new", { name: r.d.label, folder: r.d.path, machine: "" });
  }

  move(delta, n) {
    if (!n) return;
    this.at = ((this.at ?? 0) + delta + n) % n;
    this.reveal = true;
  }

  status(t, st) {
    if (st === "working") return svg(ICON("spinner")).size(12).flex_none().text_color(t.working).spin(900);
    if (st === "blocked") return div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("needs you");
    if (st === "done") return div().flex_none().text_size(11).text_color(t.done).child("finished");
    return null;
  }

  row(t, r, on) {
    const base = h_flex()
      .id(r.kind === "space" ? `hs-s-${r.s.id}` : `hs-d-${r.d.path}`)
      .mx(6)
      .px(10)
      .h(40)
      .flex_none()
      .gap(10)
      .items_center()
      .rounded(8)
      .cursor_pointer()
      .when(on, (el) => el.bg(t.selected ?? t.hover))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.go(r));

    if (r.kind === "space") {
      const s = r.s;
      const st = this.status(t, s.status);
      return base
        .child(h_flex().size(22).flex_none().rounded(6).bg(spaceColor(t, s)).items_center().justify_center()
          .text_size(11).font_bold().text_color("#ffffff").child([...s.name][0]?.toUpperCase() ?? "?"))
        .child(v_flex().flex_1().min_w(0)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(highlighted(s.name, r.m?.hits, t.foreground, t.accent).when(s.active, (d) => d.font_semibold()))
            .when(s.active, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child("· current"))))
          .child(h_flex().gap(6).items_center().min_w(0).text_size(11).text_color(t.dim)
            .when(Boolean(s.branch), (el) => el
              .child(svg(ICON("git-branch")).size(11).flex_none())
              .child(div().flex_none().max_w(180).truncate().child(s.branch))
              .child(div().flex_none().child("·")))
            .child(div().min_w(0).truncate().child(r.where))))
        .when(Boolean(st), (el) => el.child(st));
    }

    const d = r.d;
    return base
      .child(svg(ICON(r.open ? "folder" : "folder-plus")).size(16).flex_none().text_color(r.open ? t.accent : t.dim))
      .child(div().flex_1().min_w(0).child(highlighted(d.display, r.m?.hits, t.foreground, t.accent)))
      .child(div().flex_none().text_size(11).text_color(r.open ? t.accent : t.dim)
        .child(r.open ? "open" : on ? "new space ↵" : ""));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind !== "head");
    // Start on the first row that isn't where you already are.
    if (this.at === null && (this.data || this.error)) {
      this.at = Math.max(0, pickable.findIndex((r) => !(r.kind === "space" && r.s.active)));
    }
    this.at = Math.max(0, Math.min(this.at ?? 0, pickable.length - 1));
    const sel = pickable[this.at];
    if (this.reveal && sel) {
      this.list.scroll_to_item(rows.indexOf(sel));
      this.reveal = false;
    }
    const nSpaces = rows.find((r) => r.kind === "head" && r.title === "Open spaces")?.count ?? 0;
    const nDirs = rows.find((r) => r.kind === "head" && r.title === "Projects")?.count ?? 0;

    const head = (r) => h_flex().px(16).pt(12).pb(4).gap(6).items_center().flex_none()
      .text_size(11).font_semibold().text_color(t.dim)
      .child(r.title.toUpperCase())
      .child(div().text_color(t.muted).child(String(r.count)));

    const body = this.error
      ? v_flex().flex_1().p(18).gap(8)
          .child(div().text_size(13).font_semibold().text_color(t.blocked).child("herdr-spaces couldn't list your projects"))
          .child(div().text_size(12).text_color(t.muted).child(this.error))
          .child(div().text_size(12).text_color(t.dim).child("Run `herdr-spaces --list` in a terminal to see the full error."))
      : !this.data && !pickable.length
        ? h_flex().flex_1().p(18).gap(8).items_center().text_color(t.dim)
            .child(svg(ICON("spinner")).size(14).text_color(t.dim).spin(900)).child("Reading projects…")
        : !pickable.length
          ? div().flex_1().p(18).text_color(t.dim).child(this.filter ? `Nothing matches "${this.filter}"` : "No projects: add folders to ~/.config/herdr-spaces/config.toml")
          : v_flex().id("hs-list").flex_1().min_h(0).pb(8).overflow_y_scrollbar().track_scroll(this.list)
              .children(rows.map((r) => (r.kind === "head" ? head(r) : this.row(t, r, r === sel))));

    return v_flex()
      .id("herdr-spaces")
      .track_focus(this.handle)
      .size_full()
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        const ctrl = e.modifiers.control;
        if (k === "escape") return this.close();
        if (k === "down" || (ctrl && (k === "n" || k === "j"))) this.move(1, pickable.length);
        else if (k === "up" || (ctrl && (k === "p" || k === "k"))) this.move(-1, pickable.length);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex().px(18).pt(16).pb(10).items_center().flex_none()
          .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Open project"))
          .child(div().id("hs-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")),
      )
      .child(
        h_flex().mx(18).mb(6).h(38).flex_none().px(12).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg(ICON("search")).size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)),
      )
      .child(body)
      .child(
        h_flex().flex_none().h(34).px(18).gap(14).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
          .child(div().flex_1().child(`${nSpaces} open · ${nDirs} project${nDirs === 1 ? "" : "s"}`))
          .child(div().child("↑↓ move"))
          .child(div().child("↵ open"))
          .child(div().child("esc close")),
      );
  }
}
