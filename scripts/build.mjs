// Generates the crawlable parts of the site from data/toys.json:
//   toys/<id>/index.html   one real page per toy (title, meta, JSON-LD, full lyrics)
//   index.html             the SEO head block and a pre-rendered toy list
//   sitemap.xml, robots.txt, 404.html
// Run with: node scripts/build.mjs   (CI runs it whenever data/toys.json changes)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const write = (p, text) => {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), text);
};

const SITE = "Little People Song List";
const domain = read("CNAME").trim();
const base = `https://${domain}`;
const today = new Date().toISOString().slice(0, 10);
const DEFAULT_IMAGE = `${base}/og-image.png`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const trim = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:.\s-]+$/, "") + "…";
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---- data (same rules the browser applies: skip anything unusable) ----
const raw = JSON.parse(read("data/toys.json"));
const toys = (Array.isArray(raw) ? raw : raw.toys || []).filter((t) => {
  const ok = t && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id || "") && t.title && Array.isArray(t.songs);
  if (!ok) console.warn("Skipping invalid toy:", t && (t.id || t.title));
  return ok;
}).map((t) => ({
  id: t.id,
  title: t.title,
  image: typeof t.image === "string" && t.image ? t.image : null,
  songs: t.songs
    .filter((s) => s && s.title && s.lyrics)
    .map((s) => ({ title: s.title, lyrics: s.lyrics, stage: [1, 2, 3].includes(s.stage) ? s.stage : null })),
}));

// ---- markup shared with app.js (keep the two in step so the page does not jump when JS runs) ----
const imgTag = (toy, prefix, cls) =>
  toy.image ? `<img${cls ? ` class="${cls}"` : ""} src="${prefix}${esc(toy.image)}" alt="${esc(toy.title)} toy" loading="lazy">` : "";

function homePrerender() {
  const cards = toys.map((t) => `<li><a class="card" href="toys/${t.id}/">${imgTag(t, "")}<div class="card-body"><h2 class="card-title">${esc(t.title)}</h2><p class="card-meta">${plural(t.songs.length, "song")}</p></div></a></li>`).join("");
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">A little help for big sing-alongs</p><h1>Find that Little People song.</h1><p class="hero-description">Browse toy songs and lyrics, all in one happy place.</p></div><div class="hero-art" aria-hidden="true"><span class="sun"></span><span class="hill hill-back"></span><span class="hill hill-front"></span><span class="music-note note-one">♪</span><span class="music-note note-two">♫</span></div></section>
<div class="section-heading"><div><p class="eyebrow">Explore the collection</p><h2>Pick a toy to hear its songs</h2></div></div>
<ul class="grid">${cards}</ul>`;
}

function toyPrerender(toy) {
  const groups = [1, 2, 3, null].map((stage) => ({ stage, songs: toy.songs.filter((s) => s.stage === stage) })).filter((g) => g.songs.length);
  const staged = toy.songs.some((s) => s.stage !== null);
  const songs = groups.map((g) =>
    (g.stage !== null || staged ? `<h2 class="stage-heading">${g.stage === null ? "Other songs" : `Stage ${g.stage}`}</h2>` : "") +
    g.songs.map((s) => `<details><summary>${esc(s.title)}</summary><p class="lyrics">${esc(s.lyrics)}</p></details>`).join("")).join("");
  const others = toys.filter((t) => t.id !== toy.id);
  const related = others.length
    ? `<nav class="related" aria-label="More toys"><h2>More Little People toys</h2><ul>${others.map((t) => `<li><a href="../${t.id}/">${esc(t.title)}</a></li>`).join("")}</ul></nav>`
    : "";
  return `<a class="back" href="../../">← All toys</a>
<h1>${esc(toy.title)}</h1>
<p class="intro">Songs from the Fisher-Price Little People ${esc(toy.title)}, grouped by stage.</p>
${imgTag(toy, "../../", "toy-image")}
<div>${songs}</div>
${related}`;
}

// ---- head block ----
function headBlock({ title, description, url, image, imageAlt, type, graph, noindex }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta name="robots" content="${noindex ? "noindex,follow" : "index,follow,max-image-preview:large"}">`,
    `<meta property="og:site_name" content="${SITE}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    graph ? jsonLd({ "@context": "https://schema.org", "@graph": graph }) : "",
  ].filter(Boolean).join("\n  ");
}

const website = { "@type": "WebSite", "@id": `${base}/#website`, name: SITE, url: `${base}/`, inLanguage: "en",
  description: "An unofficial fan-made catalog of songs from Fisher-Price Little People toys." };

const swap = (html, tag, content) => {
  const re = new RegExp(`<!--${tag}-->[\\s\\S]*?<!--/${tag}-->`);
  if (!re.test(html)) throw new Error(`index.html is missing the <!--${tag}--> markers`);
  return html.replace(re, () => `<!--${tag}-->${content}<!--/${tag}-->`);
};

// ---- home (rewrites index.html in place; it is also the template for the other pages) ----
let template = read("index.html");
const homeTitle = `${SITE} – Fisher-Price Toy Songs & Lyrics`;
const names = toys.slice(0, 2).map((t) => t.title);
const homeDescription = trim(
  `Browse songs and lyrics from Fisher-Price Little People toys${names.length ? `, like the ${names.join(" and ")}` : ""}. An unofficial fan-made list.`, 158);

const homeHead = headBlock({
  title: homeTitle, description: homeDescription, url: `${base}/`, image: DEFAULT_IMAGE,
  imageAlt: `${SITE}: songs and lyrics from Fisher-Price Little People toys`, type: "website",
  graph: [website, {
    "@type": "CollectionPage", "@id": `${base}/#page`, url: `${base}/`, name: homeTitle, description: homeDescription,
    isPartOf: { "@id": `${base}/#website` }, inLanguage: "en",
    mainEntity: { "@type": "ItemList", itemListElement: toys.map((t, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/toys/${t.id}/`, name: t.title })) },
  }],
});

template = swap(template, "seo-head", `\n  ${homeHead}\n  `);
template = swap(template, "prerender", homePrerender());
write("index.html", template);

// ---- one page per toy ----
rmSync(join(root, "toys"), { recursive: true, force: true });
const rebase = (html) => html
  .replace(/(href|src)="(style\.css|config\.js|admin\.js|app\.js|favicon\.svg|favicon-32\.png|apple-touch-icon\.png)"/g, '$1="../../$2"')
  .replace('href="#/"', 'href="../../"');

for (const toy of toys) {
  const url = `${base}/toys/${toy.id}/`;
  const longTitle = `${toy.title} Songs & Lyrics | ${SITE}`;
  const title = longTitle.length <= 62 ? longTitle : `${toy.title} Songs & Lyrics`;
  const songNames = toy.songs.map((s) => s.title);
  const description = trim(
    `${plural(songNames.length, "song")} on the Fisher-Price Little People ${toy.title}${songNames.length ? `: ${songNames.join(", ")}` : ""}. Full list with lyrics, grouped by stage.`, 158);
  const image = toy.image ? `${base}/${toy.image}` : DEFAULT_IMAGE;

  const head = headBlock({
    title, description, url, image, imageAlt: `${toy.title} toy`, type: "article",
    graph: [
      website,
      { "@type": "WebPage", "@id": `${url}#page`, url, name: title, description, inLanguage: "en",
        isPartOf: { "@id": `${base}/#website` }, breadcrumb: { "@id": `${url}#breadcrumb` },
        ...(toy.image ? { primaryImageOfPage: { "@type": "ImageObject", url: image } } : {}),
        mainEntity: { "@id": `${url}#songs` } },
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: "All toys", item: `${base}/` },
        { "@type": "ListItem", position: 2, name: toy.title, item: url } ] },
      { "@type": "ItemList", "@id": `${url}#songs`, name: `Songs on the ${toy.title}`, numberOfItems: toy.songs.length,
        itemListElement: toy.songs.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.title })) },
    ],
  });

  let page = swap(template, "seo-head", `\n  ${head}\n  `);
  page = swap(page, "prerender", toyPrerender(toy));
  page = rebase(page).replace("<body>", `<body data-root="../../" data-toy="${toy.id}">`);
  write(`toys/${toy.id}/index.html`, page);
}

// ---- 404 (served from any depth, so it uses root-relative paths) ----
const notFoundHead = headBlock({
  title: `Page not found | ${SITE}`, description: "That page could not be found.", url: `${base}/`,
  image: DEFAULT_IMAGE, imageAlt: SITE, type: "website", noindex: true,
});
let notFound = swap(template, "seo-head", `\n  ${notFoundHead}\n  `)
  .replace(/<link rel="canonical"[^>]*>\n\s*/, "")
  .replace(/(href|src)="(style\.css|config\.js|admin\.js|app\.js|favicon\.svg|favicon-32\.png|apple-touch-icon\.png)"/g, '$1="/$2"')
  .replace('href="#/"', 'href="/"')
  .replace(/<main id="app"[^>]*>[\s\S]*?<\/main>/,
    `<main id="app"><h1>Page not found</h1><p>That page doesn't exist. <a href="/">Browse all toys</a>.</p></main>`)
  .replace(/\s*<script src="\/(config|admin|app)\.js"><\/script>/g, "");
write("404.html", notFound);

// ---- sitemap + robots ----
const url = (loc, extra = "") => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>${extra}\n  </url>`;
const imageXml = (toy) => toy.image ? `\n    <image:image><image:loc>${base}/${esc(toy.image)}</image:loc></image:image>` : "";
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[url(`${base}/`), ...toys.map((t) => url(`${base}/toys/${t.id}/`, imageXml(t)))].join("\n")}
</urlset>
`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);

console.log(`Built ${toys.length} toy page(s), sitemap, robots, 404 for ${base}`);
