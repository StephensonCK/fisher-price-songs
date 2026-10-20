"use strict";

const app = document.getElementById("app");
// Pre-built toy pages (toys/<id>/) set these so paths and routing still work from a subfolder.
const ROOT = document.body.dataset.root || "";
const STATIC_TOY = document.body.dataset.toy || null;
const HOME = ROOT || "./";
let rawData = { toys: [] }; // unvalidated copy, what editors work on and save
let toys = [];              // validated copy, what visitors see
let problems = [];

// Build DOM with textContent only; never innerHTML with data.
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else if (key === "value") node.value = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child != null) node.append(child);
  }
  return node;
}

function show(...nodes) {
  app.replaceChildren(...nodes.filter(Boolean));
}

function validate(list) {
  const found = [];
  const ids = new Set();
  const usable = [];
  list.forEach((toy, i) => {
    const label = `Toy #${i + 1}${toy && toy.title ? ` (${toy.title})` : ""}`;
    if (!toy || typeof toy !== "object") {
      found.push(`${label}: not an object`);
      return;
    }
    let ok = true;
    if (typeof toy.id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(toy.id)) {
      found.push(`${label}: id must be a slug (lowercase letters, numbers, hyphens)`);
      ok = false;
    } else if (ids.has(toy.id)) {
      found.push(`${label}: duplicate id "${toy.id}"`);
      ok = false;
    } else {
      ids.add(toy.id);
    }
    if (typeof toy.title !== "string" || !toy.title.trim()) {
      found.push(`${label}: title is required`);
      ok = false;
    }
    if (toy.image != null && typeof toy.image !== "string") {
      found.push(`${label}: image must be a string`);
      toy = { ...toy, image: null };
    }
    const songs = [];
    if (!Array.isArray(toy.songs)) {
      found.push(`${label}: songs must be an array`);
    } else {
      toy.songs.forEach((song, j) => {
        const sl = `${label}, song #${j + 1}`;
        if (!song || typeof song.title !== "string" || !song.title.trim()) {
          found.push(`${sl}: title is required`);
          return;
        }
        if (typeof song.lyrics !== "string" || !song.lyrics.trim()) {
          found.push(`${sl} (${song.title}): lyrics are required`);
          return;
        }
        let stage = song.stage == null ? null : song.stage;
        if (stage !== null && ![1, 2, 3].includes(stage)) {
          found.push(`${sl} (${song.title}): stage must be 1, 2, 3 or null`);
          stage = null;
        }
        songs.push({ title: song.title, lyrics: song.lyrics, stage });
      });
    }
    if (ok) usable.push({ id: toy.id, title: toy.title, image: toy.image || null, songs });
  });
  if (found.length) console.warn("toys.json problems:", found);
  return { usable, found };
}

function errorBox() {
  if (!problems.length) return null;
  return el("div", { class: "error-box", role: "alert" },
    el("strong", { text: "Problems found in data/toys.json:" }),
    el("ul", {}, problems.map((p) => el("li", { text: p }))));
}

function toyImage(toy, cls) {
  if (!toy.image) return null;
  return el("img", {
    class: cls,
    src: ROOT + toy.image,
    alt: `${toy.title} toy`,
    loading: "lazy",
    onerror: (e) => e.target.remove(),
  });
}

function matches(text, query) {
  return text.toLowerCase().includes(query);
}

function renderHome() {
  const grid = el("ul", { class: "grid" });
  const empty = el("p", { class: "empty", text: "No toys match your search.", hidden: true });

  const draw = (query) => {
    const q = query.trim().toLowerCase();
    grid.replaceChildren();
    const shown = toys.filter((t) => !q || matches(t.title, q));
    for (const toy of shown) {
      const n = toy.songs.length;
      grid.append(el("li", {},
        el("a", { class: "card", href: `${ROOT}toys/${toy.id}/` },
          toyImage(toy),
          el("div", { class: "card-body" },
            el("h2", { class: "card-title", text: toy.title }),
            el("p", { class: "card-meta", text: `${n} song${n === 1 ? "" : "s"}` })))));
    }
    empty.hidden = shown.length > 0;
  };

  const search = el("input", {
    class: "search", type: "search", enterkeyhint: "search", placeholder: "Search toys",
    "aria-label": "Search toys", oninput: (e) => draw(e.target.value),
  });

  show(errorBox(),
    el("section", { class: "hero" },
      el("div", { class: "hero-copy" },
        el("p", { class: "eyebrow", text: "A little help for big sing-alongs" }),
        el("h1", { text: "Find that Little People song." }),
        el("p", { class: "hero-description", text: "Browse toy songs and lyrics, all in one happy place." })),
      el("div", { class: "hero-art", "aria-hidden": "true" },
        el("span", { class: "sun" }), el("span", { class: "hill hill-back" }),
        el("span", { class: "hill hill-front" }), el("span", { class: "music-note note-one", text: "♪" }),
        el("span", { class: "music-note note-two", text: "♫" }))),
    el("div", { class: "section-heading" },
      el("div", {}, el("p", { class: "eyebrow", text: "Explore the collection" }), el("h2", { text: "Pick a toy to hear its songs" }))),
    Admin.canEdit() ? el("p", {}, el("a", { class: "button", href: "#/edit-toy/new", text: "Add toy" })) : null,
    search, grid, empty);
  draw("");
}

function renderToy(id) {
  const toy = toys.find((t) => t.id === id);
  if (!toy) {
    show(errorBox(),
      el("p", { text: "Toy not found." }),
      el("a", { href: HOME, text: "← All toys" }));
    return;
  }

  const list = el("div");
  const empty = el("p", { class: "empty", text: "No songs match your search.", hidden: true });

  const draw = (query) => {
    const q = query.trim().toLowerCase();
    list.replaceChildren();
    const shown = toy.songs.filter((s) => !q || matches(s.title, q) || matches(s.lyrics, q));
    for (const stage of [1, 2, 3, null]) {
      const group = shown.filter((s) => s.stage === stage);
      if (!group.length) continue;
      // Skip the heading when the toy has no staged songs at all.
      if (stage !== null || shown.some((s) => s.stage !== null)) {
        list.append(el("h2", {
          class: "stage-heading",
          text: stage === null ? "Other songs" : `Stage ${stage}`,
        }));
      }
      for (const song of group) {
        list.append(el("details", { open: q ? true : false },
          el("summary", { text: song.title }),
          el("p", { class: "lyrics", text: song.lyrics })));
      }
    }
    empty.hidden = shown.length > 0;
  };

  const search = el("input", {
    class: "search", type: "search", enterkeyhint: "search", placeholder: "Search songs or lyrics",
    "aria-label": "Search songs or lyrics", oninput: (e) => draw(e.target.value),
  });

  show(
    errorBox(),
    el("a", { class: "back", href: HOME, text: "← All toys" }),
    el("h1", { text: toy.title }),
    el("p", { class: "intro", text: `Songs from the Fisher-Price Little People ${toy.title}, grouped by stage.` }),
    Admin.canEdit() ? el("p", {}, el("a", { class: "button", href: `#/edit-toy/${toy.id}`, text: "Edit toy" })) : null,
    toyImage(toy, "toy-image"),
    search, list, empty, relatedToys(toy));
  draw("");
}

function relatedToys(current) {
  const others = toys.filter((t) => t.id !== current.id);
  if (!others.length) return null;
  return el("nav", { class: "related", "aria-label": "More toys" },
    el("h2", { text: "More Little People toys" }),
    el("ul", { class: "grid" }, others.map((t) => {
      const n = t.songs.length;
      return el("li", {},
        el("a", { class: "card", href: `${ROOT}toys/${t.id}/` },
          toyImage(t),
          el("div", { class: "card-body" },
            el("h3", { class: "card-title", text: t.title }),
            el("p", { class: "card-meta", text: `${n} song${n === 1 ? "" : "s"}` }))));
    })));
}

function route() {
  const hash = location.hash;
  const toy = hash.match(/^#\/toy\/([^/]+)$/);
  const edit = hash.match(/^#\/edit-toy\/([^/]+)$/);
  if (toy) renderToy(decodeURIComponent(toy[1]));
  else if (edit) Admin.renderEditToy(decodeURIComponent(edit[1]));
  else if (hash === "#/signin") Admin.renderSignIn();
  else if (hash === "#/admin") Admin.renderAdmin();
  else if (STATIC_TOY) renderToy(STATIC_TOY);
  else renderHome();
  window.scrollTo(0, 0);
}

// Replace the data shown on the site. Throws if the shape is unusable.
function setRaw(data) {
  const list = Array.isArray(data) ? data : data && data.toys;
  if (!Array.isArray(list)) throw new Error("expected a toys array");
  rawData = { toys: list };
  const result = validate(list);
  toys = result.usable;
  problems = result.found;
}

async function init() {
  try {
    const res = await fetch(ROOT + "data/toys.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setRaw(await res.json());
  } catch (err) {
    console.error(err);
    problems = [`Could not load data/toys.json (${err.message}). If you opened index.html directly, serve it over http instead.`];
  }
  route();
  await Admin.restore(); // may swap in fresh data from GitHub for signed-in editors
  route();
}

window.addEventListener("hashchange", route);
init();
