import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, basename } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const versionedFiles = ["app.js", "catalog-worker.js", "styles.css", "table-data.json", "templo-esmeralda-icon.png"];

function versionedName(file, buffer) {
  const extension = extname(file);
  const stem = basename(file, extension);
  const digest = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  return `${stem}.${digest}${extension}`;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const manifest = {};
for (const file of versionedFiles) {
  const source = join(root, file);
  await stat(source);
  const buffer = await readFile(source);
  const output = versionedName(file, buffer);
  manifest[file] = output;
  await writeFile(join(dist, output), buffer);
}

await cp(join(root, "_headers"), join(dist, "_headers"));
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });
let html = await readFile(join(root, "index.html"), "utf8");
html = html
  .replace(/styles\.css(?:\?v=\d+)?/g, manifest["styles.css"])
  .replace(/app\.js(?:\?v=\d+)?/g, manifest["app.js"])
  .replace(/templo-esmeralda-icon\.png(?:\?v=\d+)?/g, manifest["templo-esmeralda-icon.png"]);
if (html.includes('name="catalog-url"')) {
  html = html.replace(/<meta name="catalog-url" content="[^"]*">/, `<meta name="catalog-url" content="${manifest["table-data.json"]}">`);
} else {
  html = html.replace("</head>", `    <meta name="catalog-url" content="${manifest["table-data.json"]}">\n  </head>`);
}
if (html.includes('name="catalog-worker-url"')) {
  html = html.replace(/<meta name="catalog-worker-url" content="[^"]*">/, `<meta name="catalog-worker-url" content="${manifest["catalog-worker.js"]}">`);
} else {
  html = html.replace("</head>", `    <meta name="catalog-worker-url" content="${manifest["catalog-worker.js"]}">\n  </head>`);
}
await writeFile(join(dist, "index.html"), html);
await writeFile(join(dist, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Build público criado em ${dist}`);
