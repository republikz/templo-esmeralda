import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = [/campaign-state/i, /^recovered-/i, /^backup-/i, /\.zip$/i, /serve\.ps1$/i, /screenshot/i];
const dist = join(process.cwd(), "dist");
const entries = await readdir(dist, { withFileTypes: true });
const violations = entries.filter((entry) => forbidden.some((pattern) => pattern.test(entry.name))).map((entry) => entry.name);
for (const entry of entries.filter((item) => item.isFile() && /\.(js|html|json|css)$/i.test(item.name))) {
  const content = await readFile(join(dist, entry.name), "utf8");
  if (/310898|pinHash|pinSalt|campaign-state-before-public/i.test(content)) violations.push(`${entry.name}: conteúdo sensível`);
}
if (violations.length) {
  console.error(`Falha na auditoria pública:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("Auditoria pública aprovada: somente os arquivos permitidos estão em dist.");
