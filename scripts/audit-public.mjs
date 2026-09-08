import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { publicAssets } from './public-assets.mjs';

const forbidden = [/campaign-state/i, /^recovered-/i, /^backup-/i, /\.zip$/i, /serve\.ps1$/i, /screenshot/i];
const dist = join(process.cwd(), "dist");
async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(join(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

const files = await listFiles(dist);
const normalizedFiles = files.map((file) => file.replace(/\\/g, '/'));
const manifest = JSON.parse(await readFile(join(dist, 'asset-manifest.json'), 'utf8'));
const allowed = new Set(['index.html', '_headers', 'asset-manifest.json', ...publicAssets, ...Object.values(manifest)]);
const violations = files.filter((file) => forbidden.some((pattern) => pattern.test(file))).map((file) => file);
for (const asset of publicAssets) if (!normalizedFiles.includes(asset)) violations.push(`${asset}: asset público ausente`);
for (const file of files) if (!allowed.has(file.replaceAll('\\', '/'))) violations.push(`${file}: fora da lista pública`);
for (const file of files.filter((item) => /\.(js|html|json|css)$/i.test(item))) {
  const content = await readFile(join(dist, file), "utf8");
  if (/310898|pinHash|pinSalt|campaign-state-before-public/i.test(content)) violations.push(`${file}: conteúdo sensível`);
}
if (violations.length) {
  console.error(`Falha na auditoria pública:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Auditoria pública aprovada: somente os arquivos permitidos estão em dist.");
