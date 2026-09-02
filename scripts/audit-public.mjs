import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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
const violations = files.filter((file) => forbidden.some((pattern) => pattern.test(file))).map((file) => file);
for (const file of files.filter((item) => /\.(js|html|json|css)$/i.test(item))) {
  const content = await readFile(join(dist, file), "utf8");
  if (/310898|pinHash|pinSalt|campaign-state-before-public/i.test(content)) violations.push(`${file}: conteúdo sensível`);
}
if (violations.length) {
  console.error(`Falha na auditoria pública:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Auditoria pública aprovada: somente os arquivos permitidos estão em dist.");
