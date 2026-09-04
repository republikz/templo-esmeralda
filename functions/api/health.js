import { getBearerToken, migrateCredentials, verifySessionToken } from "./_auth.js";
import { readStateRow, writeStateRow } from "./_store.js";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

export async function onRequest({ request, env }) {
  try {
    const session = await verifySessionToken(env, getBearerToken(request));
    if (!session) return reply({ ok: false, error: "Autenticação necessária." }, 401);
    const row = await readStateRow(env);
    const migrated = await migrateCredentials(row?.state_json || {});
    const user = migrated.state.users.find((entry) => entry.id === session.sub);
    if (!user || Number(user.authVersion) !== Number(session.ver)) return reply({ ok: false, error: "Sessão expirada." }, 401);
    if (migrated.changed) {
      migrated.state.revision = Math.max(Number(row?.revision) || 0, Number(migrated.state.revision) || 0) + 1;
      migrated.state.updatedAt = Date.now();
      await writeStateRow(env, migrated.state, Number(row?.revision) || 0);
    }
    return reply({ ok: true, revision: Number(row?.revision) || 0, checkedAt: new Date().toISOString() });
  } catch (error) {
    return reply({ ok: false, error: error?.message || "Erro inesperado." }, 500);
  }
}
