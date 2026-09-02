import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const publicFiles = ["index.html", "app.js", "styles.css", "table-data.json", "templo-esmeralda-icon.png", "_headers"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of publicFiles) {
  const source = join(root, file);
  await stat(source);
  await cp(source, join(dist, file));
}
console.log(`Build público criado em ${dist}`);
