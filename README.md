# Little People Song List

An unofficial, static catalog of songs from Fisher-Price Little People toys. No build step, no dependencies.

## Data (`data/toys.json`)

```
toys[]
  id       required, unique slug (lowercase letters, numbers, hyphens)
  title    required
  image    optional, relative path such as "images/toy-name.jpg"
  songs[]
    title   required
    stage   1 | 2 | 3 | null (optional)
    lyrics  required; use \n for line breaks
```

Problems in the data show in a red box at the top of the page and in the console.

## Editing in the browser

Editing uses GitHub as the backend, so permissions are GitHub's own:

- **Admin**: the repo owner. Edits everything and manages editors (Admin page).
- **Editor**: anyone with write access to the repo. Adds and edits toys, songs and photos.
- **Everyone else**: read only.

Setup: set `owner` and `repo` in `config.js` (auto-detected on GitHub Pages). Each person creates a fine-grained personal access token limited to this repo with Contents read/write (admins managing editors also need Administration read/write), then signs in from the site. Saving commits to `data/toys.json`; the live site updates after GitHub Pages rebuilds (about a minute).

## SEO and generated files

Search engines can't index `#/` routes, so each toy also gets a real page at `/toys/<id>/`. `scripts/build.mjs` generates these from `data/toys.json`, along with `sitemap.xml`, `404.html` and the SEO tags and pre-rendered toy list in `index.html`. A GitHub Action (`.github/workflows/build.yml`) runs it whenever the data changes, so saving in the editor updates them about a minute later. To run it yourself: `node scripts/build.mjs`. Don't hand-edit anything under `toys/`; edit `index.html` (outside the `<!--seo-head-->` and `<!--prerender-->` markers) or the script instead.

The site address comes from `CNAME`.

## Local preview

```
python -m http.server 8000
```

Open http://localhost:8000. Opening `index.html` via `file://` will not work because `fetch` is blocked.

## GitHub Pages

1. Push to `main`.
2. Settings > Pages > Deploy from a branch > `main` / `(root)`.
3. Live at `https://<username>.github.io/<repo>/`.

Remove the "Example Toy" entry before publishing.

## Disclaimer

Fisher-Price and Little People are trademarks of Mattel, Inc. This is an unofficial fan project.
