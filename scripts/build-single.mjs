// Packs the production build (dist/) into one self-contained HTML file:
// CSS, fonts (as data URIs) and JS inlined. Useful as an offline demo or a hosted preview.
//   node scripts/build-single.mjs            → dist-single/WorkRadar.html (full document)
//   node scripts/build-single.mjs --fragment → dist-single/WorkRadar-fragment.html (no <html>/<head>/<body>)
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const out = new URL('../dist-single/', import.meta.url);
const fragment = process.argv.includes('--fragment');
const html = readFileSync(new URL('index.html', dist), 'utf8');
const assets = readdirSync(new URL('assets/', dist));
const cssFile = assets.find((f) => f.endsWith('.css'));
const jsFile = assets.find((f) => f.endsWith('.js'));

let css = readFileSync(new URL(`assets/${cssFile}`, dist), 'utf8');
css = css.replace(/url\(\.\.\/fonts\/([^)]+\.woff)\)/g, (_, f) => `url(data:font/woff;base64,${readFileSync(new URL(`fonts/${f}`, dist)).toString('base64')})`);
const js = readFileSync(new URL(`assets/${jsFile}`, dist), 'utf8').replace(/<\/script/gi, '<\\/script');
const favicon = `data:image/svg+xml;base64,${readFileSync(new URL('favicon.svg', dist)).toString('base64')}`;
const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';

const head = `<title>WorkRadar</title>
<meta name="description" content="${desc}" />
<link rel="icon" type="image/svg+xml" href="${favicon}" />
<style>${css}</style>`;
const body = `<div id="root"></div>
<script type="module">${js}</script>`;

const doc = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

mkdirSync(out, { recursive: true });
const name = fragment ? 'WorkRadar-fragment.html' : 'WorkRadar.html';
writeFileSync(new URL(name, out), doc);
console.log(`${name}: ${(doc.length / 1024).toFixed(0)} KB`);
