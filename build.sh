#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT="$ROOT/dist"
SITE_DIR="$OUTPUT/HBL"
SITE_URL=${SITE_URL:-}

if [ -n "$SITE_URL" ]; then
  SITE_URL=${SITE_URL%/}
  case "$SITE_URL" in
    https://?*) SITE_HOST=${SITE_URL#https://} ;;
    *)
      printf '%s\n' "SITE_URL must be the public HTTPS origin, for example https://www.example.cl" >&2
      exit 1
      ;;
  esac
  case "$SITE_HOST" in
    */*|*[!A-Za-z0-9.:-]*)
      printf '%s\n' "SITE_URL must contain only an HTTPS hostname and optional port, with no path." >&2
      exit 1
      ;;
  esac
fi

if [ -L "$OUTPUT" ] || [ -L "$SITE_DIR" ]; then
  printf '%s\n' "Refusing to use symlinked deployment output." >&2
  exit 1
fi

if [ ! -d "$SITE_DIR" ]; then
  printf '%s\n' "Missing prebuilt HBL site: $SITE_DIR" >&2
  exit 1
fi

PAGES="index.html empresa.html clientes.html equipo.html recursos-humanos.html alianzas.html servicios.html operaciones.html desierto-1.html tecnologia.html contacto.html"
for file in $PAGES; do
  if [ ! -f "$SITE_DIR/$file" ]; then
    printf 'Missing HBL page: %s\n' "$SITE_DIR/$file" >&2
    exit 1
  fi
done

for file in styles.css animated-gradient.js favicon.svg robots.txt; do
  if [ ! -f "$OUTPUT/$file" ]; then
    printf 'Missing deployment resource: %s\n' "$OUTPUT/$file" >&2
    exit 1
  fi
done

if [ ! -f "$OUTPUT/images/hero.jpeg" ]; then
  printf 'Missing deployment image: %s\n' "$OUTPUT/images/hero.jpeg" >&2
  exit 1
fi

printf '/ /HBL/index.html 301\n' > "$OUTPUT/_redirects"

if [ -n "$SITE_URL" ]; then
  SITE_URL="$SITE_URL" OUTPUT="$OUTPUT" node --input-type=module <<'NODE'
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const siteUrl = process.env.SITE_URL;
const output = process.env.OUTPUT;
const pages = [
  "index.html",
  "empresa.html",
  "clientes.html",
  "equipo.html",
  "recursos-humanos.html",
  "alianzas.html",
  "servicios.html",
  "operaciones.html",
  "desierto-1.html",
  "tecnologia.html",
  "contacto.html"
];
const metadataTags = [
  /  <link rel="canonical" href="[^"]*">\n/g,
  /  <meta property="og:url" content="[^"]*">\n/g,
  /  <meta property="og:image" content="[^"]*">\n/g,
  /  <meta property="og:image:alt" content="[^"]*">\n/g,
  /  <meta name="twitter:image" content="[^"]*">\n/g,
  /  <meta name="twitter:image:alt" content="[^"]*">\n/g
];

for (const file of pages) {
  const pagePath = path.join(output, "HBL", file);
  let html = await readFile(pagePath, "utf8");
  html = html.replace("  <!-- DOMAIN_METADATA -->\n", "");
  html = html.replace(/  <meta name="twitter:card" content="[^"]*">\n/, "");
  for (const pattern of metadataTags) html = html.replace(pattern, "");

  const pageUrl = `${siteUrl}/HBL/${file}`;
  const metadata = [
    `  <link rel="canonical" href="${pageUrl}">`,
    `  <meta property="og:url" content="${pageUrl}">`,
    `  <meta property="og:image" content="${siteUrl}/images/hero.jpeg">`,
    '  <meta property="og:image:alt" content="Imagen principal de las operaciones logísticas de Hansa">',
    '  <meta name="twitter:card" content="summary_large_image">',
    `  <meta name="twitter:image" content="${siteUrl}/images/hero.jpeg">`,
    '  <meta name="twitter:image:alt" content="Imagen principal de las operaciones logísticas de Hansa">'
  ].join("\n");

  const twitterDescription = /  <meta\s+name="twitter:description"[\s\S]*?  >\n/;
  if (!twitterDescription.test(html)) {
    throw new Error(`Could not find Twitter description metadata in ${pagePath}`);
  }
  html = html.replace(twitterDescription, (tag) => `${tag}${metadata}\n`);
  await writeFile(pagePath, html);
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map((file) => `  <url><loc>${siteUrl}/HBL/${file}</loc></url>`),
  "</urlset>",
  ""
].join("\n");
await writeFile(path.join(output, "sitemap.xml"), sitemap);
NODE
else
  OUTPUT="$OUTPUT" node --input-type=module <<'NODE'
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const output = process.env.OUTPUT;
const pages = [
  "index.html",
  "empresa.html",
  "clientes.html",
  "equipo.html",
  "recursos-humanos.html",
  "alianzas.html",
  "servicios.html",
  "operaciones.html",
  "desierto-1.html",
  "tecnologia.html",
  "contacto.html"
];
const metadataTags = [
  /  <link rel="canonical" href="[^"]*">\n/g,
  /  <meta property="og:url" content="[^"]*">\n/g,
  /  <meta property="og:image" content="[^"]*">\n/g,
  /  <meta property="og:image:alt" content="[^"]*">\n/g,
  /  <meta name="twitter:image" content="[^"]*">\n/g,
  /  <meta name="twitter:image:alt" content="[^"]*">\n/g
];

for (const file of pages) {
  const pagePath = path.join(output, "HBL", file);
  let html = await readFile(pagePath, "utf8");
  html = html.replace("  <!-- DOMAIN_METADATA -->\n", "");
  for (const pattern of metadataTags) html = html.replace(pattern, "");
  html = html.replace(
    /  <meta name="twitter:card" content="[^"]*">\n/,
    '  <meta name="twitter:card" content="summary">\n'
  );
  await writeFile(pagePath, html);
}

const robotsPath = path.join(output, "robots.txt");
const robots = await readFile(robotsPath, "utf8");
await writeFile(robotsPath, robots.replace(/^Sitemap:.*\r?\n?/gm, ""));
await unlink(path.join(output, "sitemap.xml")).catch((error) => {
  if (error.code !== "ENOENT") throw error;
});
NODE
fi

if [ -n "$SITE_URL" ]; then
  printf '\nSitemap: %s/sitemap.xml\n' "$SITE_URL" >> "$OUTPUT/robots.txt"
fi

printf 'Validated HBL deployment files in %s\n' "$OUTPUT"
