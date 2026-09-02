import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const statePath = process.env.PERF_STATE_FILE || join(root, "campaign-state.json");
const sourceFiles = ["app.js", "styles.css", "table-data.json", "index.html"];
const sizes = {};
for (const file of sourceFiles) {
  sizes[file] = (await stat(join(root, file))).size;
}

const state = JSON.parse(await readFile(statePath, "utf8"));
const board = state.campfire?.investigationBoard || {};
const report = {
  sourcesKiB: Object.fromEntries(Object.entries(sizes).map(([file, bytes]) => [file, Number((bytes / 1024).toFixed(1))])),
  stateKiB: Number(((await stat(statePath)).size / 1024).toFixed(1)),
  records: {
    rooms: state.rooms?.length || 0,
    npcs: state.npcs?.length || 0,
    financeSources: state.financeSources?.length || 0,
    events: state.events?.length || 0,
    heroes: state.campfire?.heroes?.length || 0,
    boardNotes: board.notes?.length || 0,
    boardLinks: board.links?.length || 0,
    journeyEntries: state.journey?.entries?.length || 0,
    journeyComments: (state.journey?.entries || []).reduce((count, entry) => count + (entry.comments?.length || 0), 0),
    users: state.users?.length || 0
  }
};

console.log(JSON.stringify(report, null, 2));
