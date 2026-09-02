import { getBearerToken, migrateCredentials, publicUser, verifySessionToken } from "../_auth.js";
import { readStateRow, writeStateRow } from "../_store.js";

export async function onRequestGet({ request, env }) {
  try {
    const payload = await verifySessionToken(env, getBearerToken(request));
    if (!payload) return new Response(JSON.stringify({ error: "Sessão inválida." }), { status: 401 });
    const row = await readStateRow(env);
    const migrated = await migrateCredentials(row?.state_json || {});
    const user = migrated.state.users.find((entry) => entry.id === payload.sub);
    if (!user || Number(user.authVersion) !== Number(payload.ver)) return new Response(JSON.stringify({ error: "Sessão expirada." }), { status: 401 });
    if (migrated.changed) {
      migrated.state.revision = Math.max(Number(row?.revision) || 0, Number(migrated.state.revision) || 0) + 1;
      migrated.state.updatedAt = Date.now();
      await writeStateRow(env, migrated.state);
    }
    return new Response(JSON.stringify({ user: publicUser(user) }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Sessão indisponível." }), { status: 500 });
  }
}
