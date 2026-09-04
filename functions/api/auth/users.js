import { getBearerToken, hashPin, migrateCredentials, normalizeAccessName, publicUser, verifySessionToken } from "../_auth.js";
import { readStateRow, writeStateRow } from "../_store.js";

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

async function getAdmin(request, env) {
  const session = await verifySessionToken(env, getBearerToken(request));
  if (!session) return { error: "Autenticação necessária.", status: 401 };
  const row = await readStateRow(env);
  const migrated = await migrateCredentials(row?.state_json || {});
  const user = migrated.state.users.find((entry) => entry.id === session.sub);
  if (!user || user.role !== "admin" || Number(user.authVersion) !== Number(session.ver)) {
    return { error: "Permissão de Mestre necessária.", status: 403 };
  }
  return { row, state: migrated.state, migrated };
}

async function saveIfNeeded(context, env, changed) {
  if (!changed) return;
  context.state.revision = Math.max(Number(context.row?.revision) || 0, Number(context.state.revision) || 0) + 1;
  context.state.updatedAt = Date.now();
  await writeStateRow(env, context.state, Number(context.row?.revision) || 0);
}

export async function onRequestPost({ request, env }) {
  try {
    const context = await getAdmin(request, env);
    if (context.error) return reply({ error: context.error }, context.status);
    const payload = await request.json();
    const name = String(payload?.name || "").trim();
    const role = payload?.role === "admin" ? "admin" : "player";
    if (!name) return reply({ error: "Informe um nome para o usuário." }, 400);
    const nameKey = normalizeAccessName(name);
    let user = context.state.users.find((entry) => entry.id === String(payload?.id || ""));
    const duplicate = context.state.users.find((entry) => normalizeAccessName(entry.name) === nameKey && entry.id !== user?.id);
    if (duplicate) return reply({ error: "Já existe um usuário com esse nome." }, 409);
    if (!user) {
      const pin = String(payload?.pin || "").trim();
      if (!pin) return reply({ error: "Informe um PIN para o novo usuário." }, 400);
      const credential = await hashPin(pin);
      user = {
        id: crypto.randomUUID(), name, role, createdAt: Date.now(), updatedAt: Date.now(), authVersion: 1,
        pinHash: credential.hash, pinSalt: credential.salt, pinIterations: credential.iterations
      };
      context.state.users.push(user);
    } else {
      user.name = name;
      user.role = role;
      user.updatedAt = Date.now();
      const pin = String(payload?.pin || "").trim();
      if (pin) {
        const credential = await hashPin(pin);
        user.pinHash = credential.hash;
        user.pinSalt = credential.salt;
        user.pinIterations = credential.iterations;
        user.authVersion = Number(user.authVersion) + 1 || 1;
      }
    }
    await saveIfNeeded(context, env, true);
    return reply({ user: publicUser(user) });
  } catch (error) {
    return reply({ error: error?.message || "Não foi possível salvar o usuário." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const context = await getAdmin(request, env);
    if (context.error) return reply({ error: context.error }, context.status);
    const { id } = await request.json();
    const targetId = String(id || "");
    if (!targetId) return reply({ error: "Usuário inválido." }, 400);
    if (targetId === context.state.users.find((user) => user.role === "admin")?.id) {
      return reply({ error: "O Mestre não pode ser removido por esta ação." }, 400);
    }
    const before = context.state.users.length;
    context.state.users = context.state.users.filter((user) => user.id !== targetId);
    if (context.state.users.length === before) return reply({ error: "Usuário não encontrado." }, 404);
    context.state.deletedRecords = Array.isArray(context.state.deletedRecords) ? context.state.deletedRecords : [];
    context.state.deletedRecords.push({ type: "user", id: targetId, deletedAt: Date.now() });
    await saveIfNeeded(context, env, true);
    return reply({ ok: true });
  } catch (error) {
    return reply({ error: error?.message || "Não foi possível remover o usuário." }, 500);
  }
}
