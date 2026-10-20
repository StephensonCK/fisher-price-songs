"use strict";

// Sign-in, role detection and editing, using GitHub as the backend.
// Roles come from the person's permission on the repo:
//   admin  -> repo admin (the owner): edit content and manage editors
//   editor -> write access: edit content
//   viewer -> anyone else: read only
// GitHub enforces all of this. The UI gating is only for convenience.
const Admin = (() => {
  const TOKEN_KEY = "lp-token";
  const cfg = resolveConfig();
  let token = null;
  let user = null;
  let role = null;
  let sha = null;

  function resolveConfig() {
    const c = window.SITE_CONFIG || {};
    let { owner, repo } = c;
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (!owner && m) owner = m[1];
    if (!repo && m) repo = location.pathname.split("/")[1] || "";
    return { owner, repo, branch: c.branch || "main" };
  }

  const repoPath = () => `/repos/${cfg.owner}/${cfg.repo}`;
  const canEdit = () => role === "admin" || role === "editor";
  const roleLabel = { admin: "Admin", editor: "Editor", viewer: "Read-only" };

  function stored(value) {
    try {
      if (value === undefined) return localStorage.getItem(TOKEN_KEY);
      if (value === null) localStorage.removeItem(TOKEN_KEY);
      else localStorage.setItem(TOKEN_KEY, value);
    } catch (e) { /* storage unavailable */ }
    return null;
  }

  async function gh(path, options = {}) {
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    };
    if (options.body) headers["Content-Type"] = "application/json";
    const res = await fetch("https://api.github.com" + path, { ...options, headers });
    if (res.status === 204) return null;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.message || `GitHub error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  const toB64 = (bytes) => {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  };
  const textToB64 = (text) => toB64(new TextEncoder().encode(text));
  const b64ToText = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

  async function loadData() {
    const file = await gh(`${repoPath()}/contents/data/toys.json?ref=${cfg.branch}`);
    sha = file.sha;
    setRaw(JSON.parse(b64ToText(file.content)));
  }

  async function signIn(newToken) {
    if (!cfg.owner || !cfg.repo) throw new Error("Set the GitHub owner and repo in config.js first.");
    token = newToken.trim();
    try {
      user = await gh("/user");
      const repo = await gh(repoPath());
      role = repo.permissions && repo.permissions.admin ? "admin"
        : repo.permissions && repo.permissions.push ? "editor" : "viewer";
      if (canEdit()) await loadData();
      stored(token);
    } catch (err) {
      const status = err.status;
      reset();
      if (status === 401) stored(null);
      throw err;
    }
  }

  function reset() {
    token = user = role = sha = null;
  }

  function signOut() {
    reset();
    stored(null);
    renderAuth();
    location.hash = "#/";
    route();
  }

  async function restore() {
    const saved = stored();
    if (saved) {
      try { await signIn(saved); } catch (err) { console.warn("Saved sign-in failed:", err.message); }
    }
    renderAuth();
  }

  function renderAuth() {
    const box = document.getElementById("auth");
    if (!box) return;
    box.replaceChildren();
    if (!user) {
      box.append(el("a", { class: "quiet-link", href: "#/signin", text: "Sign in" }));
      return;
    }
    box.append(el("span", { class: "who", text: `@${user.login} · ${roleLabel[role]}` }));
    if (role === "admin") box.append(el("a", { href: "#/admin", text: "Admin" }));
    box.append(el("button", { type: "button", class: "link-button", text: "Sign out", onclick: signOut }));
  }

  async function commitData(data, message) {
    const res = await gh(`${repoPath()}/contents/data/toys.json`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: textToB64(JSON.stringify(data, null, 2) + "\n"),
        sha,
        branch: cfg.branch,
      }),
    });
    sha = res.content.sha;
    setRaw(data);
  }

  async function uploadImage(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) throw new Error("Use a jpg, png, webp or gif image.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Image is over 5 MB.");
    const base = file.name.replace(/\.[^.]+$/, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "image";
    let path = `images/${base}.${ext}`;
    try {
      await gh(`${repoPath()}/contents/${path}?ref=${cfg.branch}`);
      path = `images/${base}-${Date.now().toString(36)}.${ext}`; // never overwrite another toy's photo
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await gh(`${repoPath()}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Upload ${path}`, content: toB64(bytes), branch: cfg.branch }),
    });
    return path;
  }

  function friendly(err) {
    if (err.status === 409 || err.status === 422) {
      return "The data changed on GitHub since you signed in. Reload the page and try again.";
    }
    if (err.status === 403 || err.status === 404) {
      return `${err.message} (check that your token has access to this repo with the right permissions)`;
    }
    return err.message;
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function field(label, input, hint) {
    return el("label", { class: "field" },
      el("span", { class: "field-label", text: label }),
      input,
      hint ? el("span", { class: "hint", text: hint }) : null);
  }

  function requireEdit() {
    if (canEdit()) return true;
    show(el("p", { text: "You need to sign in with an account that has write access to edit." }),
      el("a", { class: "button", href: "#/signin", text: "Sign in" }));
    return false;
  }

  // ---- Pages ----

  function renderSignIn() {
    const status = el("p", { class: "status", role: "status" });
    const input = el("input", {
      class: "field-input", type: "password", autocomplete: "off",
      placeholder: "github_pat_…", "aria-label": "GitHub access token",
    });
    const go = async (e) => {
      e.preventDefault();
      status.textContent = "Signing in…";
      try {
        await signIn(input.value);
        renderAuth();
        location.hash = "#/";
        route();
      } catch (err) {
        status.textContent = `Could not sign in: ${friendly(err)}`;
      }
    };
    show(
      el("h1", { text: "Sign in" }),
      el("p", { text: "Editing uses your GitHub account. What you can do depends on your access to this site's repo:" }),
      el("ul", {},
        el("li", { text: "Admin: the repo owner. Can edit everything and manage editors." }),
        el("li", { text: "Editor: has write access to the repo. Can add and edit toys, songs and photos." }),
        el("li", { text: "Everyone else can view the site but not edit." })),
      el("p", {},
        "Create a fine-grained personal access token at ",
        el("a", { href: "https://github.com/settings/personal-access-tokens/new", target: "_blank", rel: "noopener", text: "github.com/settings/personal-access-tokens" }),
        ", limited to this repo, with Contents set to read and write. Admins who manage editors also need Administration set to read and write."),
      el("form", { class: "form", onsubmit: go },
        field("Access token", input, "Kept in this browser only and sent only to GitHub."),
        el("button", { class: "button", type: "submit", text: "Sign in" })),
      status);
  }

  async function renderAdmin() {
    if (role !== "admin") {
      show(el("p", { text: "Only admins can manage editors." }));
      return;
    }
    const box = el("div", {}, el("p", { text: "Loading…" }));
    show(el("a", { class: "back", href: "#/", text: "← All toys" }), el("h1", { text: "Manage editors" }), box);

    const draw = async () => {
      try {
        const [people, invites] = await Promise.all([
          gh(`${repoPath()}/collaborators?affiliation=direct&per_page=100`),
          gh(`${repoPath()}/invitations`),
        ]);
        const status = el("p", { class: "status", role: "status" });
        const act = (fn) => async () => {
          try { await fn(); await draw(); } catch (err) { status.textContent = friendly(err); }
        };
        const input = el("input", { class: "field-input", placeholder: "GitHub username", autocapitalize: "none", autocomplete: "off", spellcheck: "false", enterkeyhint: "send", "aria-label": "GitHub username" });
        const invite = async (e) => {
          e.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          await act(() => gh(`${repoPath()}/collaborators/${encodeURIComponent(name)}`, {
            method: "PUT", body: JSON.stringify({ permission: "push" }),
          }))();
        };
        box.replaceChildren(
          el("h2", { text: "People with access" }),
          el("ul", { class: "people" }, people.map((p) =>
            el("li", {},
              el("span", { text: `@${p.login} · ${p.permissions && p.permissions.admin ? "Admin" : "Editor"}` }),
              p.login === user.login || (p.permissions && p.permissions.admin) ? null :
                el("button", { type: "button", class: "link-button", text: "Remove",
                  onclick: act(() => gh(`${repoPath()}/collaborators/${p.login}`, { method: "DELETE" })) })))),
          invites.length ? el("h2", { text: "Pending invitations" }) : null,
          invites.length ? el("ul", { class: "people" }, invites.map((inv) =>
            el("li", {},
              el("span", { text: `@${inv.invitee.login}` }),
              el("button", { type: "button", class: "link-button", text: "Cancel",
                onclick: act(() => gh(`${repoPath()}/invitations/${inv.id}`, { method: "DELETE" })) })))) : null,
          el("h2", { text: "Invite an editor" }),
          el("form", { class: "form", onsubmit: invite },
            field("GitHub username", input, "They get an email from GitHub and become an editor once they accept."),
            el("button", { class: "button", type: "submit", text: "Send invite" })),
          status);
      } catch (err) {
        box.replaceChildren(el("p", { class: "status", text: friendly(err) }));
      }
    };
    draw();
  }

  function songRow(song) {
    const stage = el("select", { class: "field-input", "aria-label": "Stage" },
      el("option", { value: "", text: "No stage" }),
      [1, 2, 3].map((n) => el("option", { value: String(n), text: `Stage ${n}` })));
    stage.value = song.stage == null ? "" : String(song.stage);
    const row = el("fieldset", { class: "song-row" },
      field("Song title", el("input", { class: "field-input s-title", value: song.title || "" })),
      field("Stage", stage),
      field("Lyrics", el("textarea", { class: "field-input s-lyrics", rows: "6" }), "One line per line break."),
      el("button", { type: "button", class: "link-button danger", text: "Remove song", onclick: () => row.remove() }));
    row.querySelector("textarea").value = song.lyrics || "";
    return row;
  }

  function renderEditToy(idParam) {
    if (!requireEdit()) return;
    const isNew = idParam === "new";
    const existing = isNew ? null : rawData.toys.find((t) => t.id === idParam);
    if (!isNew && !existing) {
      show(el("p", { text: "Toy not found." }), el("a", { href: "#/", text: "← All toys" }));
      return;
    }

    const title = el("input", { class: "field-input", value: existing ? existing.title : "", required: true, enterkeyhint: "next" });
    const id = el("input", { class: "field-input", value: existing ? existing.id : "", readonly: !isNew });
    let idTouched = !isNew;
    id.addEventListener("input", () => { idTouched = true; });
    if (isNew) title.addEventListener("input", () => { if (!idTouched) id.value = slugify(title.value); });

    const image = el("input", { class: "field-input", value: (existing && existing.image) || "", placeholder: "images/toy-name.jpg", autocapitalize: "none", enterkeyhint: "next" });
    const status = el("p", { class: "status", role: "status" });
    const file = el("input", {
      type: "file", accept: "image/*", "aria-label": "Upload a photo",
      onchange: async () => {
        if (!file.files[0]) return;
        status.textContent = "Uploading photo…";
        try {
          image.value = await uploadImage(file.files[0]);
          status.textContent = "Photo uploaded. It shows on the site after GitHub Pages rebuilds (about a minute).";
        } catch (err) {
          status.textContent = `Upload failed: ${friendly(err)}`;
        }
      },
    });

    const songsBox = el("div", { class: "songs" }, (existing ? existing.songs : []).map(songRow));
    const save = el("button", { class: "button", type: "submit", text: "Save" });

    const collect = () => {
      const songs = [...songsBox.querySelectorAll(".song-row")].map((row) => {
        const stage = row.querySelector("select").value;
        return {
          title: row.querySelector(".s-title").value.trim(),
          stage: stage === "" ? null : Number(stage),
          lyrics: row.querySelector(".s-lyrics").value.replace(/\r\n/g, "\n").trim(),
        };
      }).filter((s) => s.title || s.lyrics);
      const toy = { id: id.value.trim(), title: title.value.trim() };
      if (image.value.trim()) toy.image = image.value.trim();
      toy.songs = songs;
      return toy;
    };

    const persist = async (newToys, message, goTo) => {
      const problemsFound = validate(newToys).found;
      if (problemsFound.length) {
        status.textContent = `Fix these first: ${problemsFound.join("; ")}`;
        return;
      }
      save.disabled = true;
      status.textContent = "Saving…";
      try {
        await commitData({ toys: newToys }, message);
        location.hash = goTo;
        route();
      } catch (err) {
        status.textContent = `Save failed: ${friendly(err)}`;
        save.disabled = false;
      }
    };

    const onSubmit = (e) => {
      e.preventDefault();
      const toy = collect();
      const newToys = isNew ? [...rawData.toys, toy]
        : rawData.toys.map((t) => (t.id === existing.id ? toy : t));
      persist(newToys, `${isNew ? "Add" : "Update"} toy: ${toy.title}`, `#/toy/${toy.id}`);
    };

    const onDelete = () => {
      if (!confirm(`Delete "${existing.title}" and all its songs?`)) return;
      persist(rawData.toys.filter((t) => t.id !== existing.id), `Delete toy: ${existing.title}`, "#/");
    };

    show(
      el("a", { class: "back", href: isNew ? "#/" : `#/toy/${existing.id}`, text: "← Cancel" }),
      el("h1", { text: isNew ? "Add toy" : `Edit ${existing.title}` }),
      el("form", { class: "form", onsubmit: onSubmit },
        field("Toy name", title),
        field("Address ID", id, isNew ? "Lowercase letters, numbers and hyphens. Fills in from the name." : "Can't change after creating."),
        field("Photo path", image, "Optional. Upload a photo below to fill this in."),
        field("Upload photo", file),
        el("h2", { text: "Songs" }),
        songsBox,
        el("button", { type: "button", class: "button secondary", text: "Add song",
          onclick: () => songsBox.append(songRow({})) }),
        el("div", { class: "toolbar" },
          save,
          isNew ? null : el("button", { type: "button", class: "button danger", text: "Delete toy", onclick: onDelete })),
        status));
  }

  return { restore, renderAuth, renderSignIn, renderAdmin, renderEditToy, canEdit };
})();
