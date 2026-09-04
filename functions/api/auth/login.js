import { createSessionToken, hashPin, migrateCredentials, normalizeAccessName, publicUser, verifyPin } from "../_auth.js";
import { readStateRow, writeStateRow } from "../_store.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  try {
    const { name, pin } = await request.json();
    const accessName = normalizeAccessName(name);
    if (!accessName || !String(pin || "").trim()) return json({ error: "Informe nome e PIN." }, 400);
    const row = await readStateRow(env);
    const migrated = await migrateCredentials(row?.state_json || {});
    const state = migrated.state;
    let user = state.users.find((entry) => normalizeAccessName(entry.name) === accessName);
    let changed = migrated.changed;
    if (user) {
      if (!await verifyPin(pin, user)) return json({ error: "Nome ou PIN inválidos." }, 401);
    } else {
      const credential = await hashPin(pin);
      user = { id: crypto.randomUUID(), name: String(name).trim(), role: "player", createdAt: Date.now(), updatedAt: Date.now(), authVersion: 1, pinHash: credential.hash, pinSalt: credential.salt, pinIterations: credential.iterations };
      state.users.push(user);
      changed = true;
    }
    if (changed) {
      state.revision = Math.max(Number(row?.revision) || 0, Number(state.revision) || 0) + 1;
      state.updatedAt = Date.now();
      await writeStateRow(env, state, Number(row?.revision) || 0);
    }
    const session = await createSessionToken(env, user);
    return json({ ...session, user: publicUser(user) });
  } catch (error) {
    return json({ error: error?.message || "Não foi possível iniciar a sessão." }, 500);
  }
}
