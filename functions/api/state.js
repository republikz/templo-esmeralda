const DEFAULT_TABLE = "campaign_state";
const DEFAULT_BUCKET = "campaign-assets";
const DEFAULT_ROW_ID = "main";

function getConfig(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const table = String(env.SUPABASE_STATE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE;
  const bucket = String(env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  const rowId = String(env.SUPABASE_STATE_ROW_ID || DEFAULT_ROW_ID).trim() || DEFAULT_ROW_ID;
  return { supabaseUrl, serviceKey, table, bucket, rowId };
}

function jsonResponse(body, init = {}) {
  return new Response(body, {
    status: init.status || 200,
    headers: {
      "Content-Type": init.contentType || "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse(JSON.stringify({ error: message }), { status });
}

function parseDataUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function extensionForMime(mimeType) {
  const lookup = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  };
  return lookup[String(mimeType || "").toLowerCase()] || ".bin";
}

function bytesFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isRemoteUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

async function uploadDataUrl({ env, dataUrl, prefix, entityId, field, revision }) {
  const config = getConfig(env);
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !config.supabaseUrl || !config.serviceKey) {
    return dataUrl;
  }

  const ext = extensionForMime(parsed.mimeType);
  const safePrefix = prefix.replace(/^\/+|\/+$/g, "");
  const safeEntityId = String(entityId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, "");
  const safeField = String(field || "image").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeRevision = String(revision || Date.now()).replace(/[^0-9]/g, "");
  const objectPath = `${safePrefix}/${safeEntityId}-${safeField}-${safeRevision}${ext}`;
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${config.bucket}/${objectPath}`;
  const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${config.bucket}/${objectPath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": parsed.mimeType,
      "x-upsert": "true"
    },
    body: bytesFromBase64(parsed.base64)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem para o Supabase (${response.status}): ${detail}`);
  }

  return publicUrl;
}

async function hydrateStateImages(state, env) {
  if (!state || typeof state !== "object") {
    return state;
  }
  const config = getConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) {
    return state;
  }

  const nextState = structuredClone(state);
  const revision = Number(nextState.revision) || Date.now();

  if (Array.isArray(nextState.rooms)) {
    for (const room of nextState.rooms) {
      if (room && typeof room.image === "string" && parseDataUrl(room.image)) {
        room.image = await uploadDataUrl({
          env,
          dataUrl: room.image,
          prefix: "rooms",
          entityId: room.id || crypto.randomUUID(),
          field: "room",
          revision
        });
      }
    }
  }

  if (Array.isArray(nextState.npcs)) {
    for (const npc of nextState.npcs) {
      if (npc && typeof npc.image === "string" && parseDataUrl(npc.image)) {
        npc.image = await uploadDataUrl({
          env,
          dataUrl: npc.image,
          prefix: "npcs",
          entityId: npc.id || crypto.randomUUID(),
          field: "npc",
          revision
        });
      }
    }
  }

  if (nextState.campfire && Array.isArray(nextState.campfire.heroes)) {
    for (const hero of nextState.campfire.heroes) {
      if (hero && typeof hero.image === "string" && parseDataUrl(hero.image)) {
        hero.image = await uploadDataUrl({
          env,
          dataUrl: hero.image,
          prefix: "campfire",
          entityId: hero.id || crypto.randomUUID(),
          field: "hero",
          revision
        });
      }
    }
  }

  if (nextState.journey && Array.isArray(nextState.journey.entries)) {
    for (const entry of nextState.journey.entries) {
      if (entry && typeof entry.image === "string" && parseDataUrl(entry.image)) {
        entry.image = await uploadDataUrl({
          env,
          dataUrl: entry.image,
          prefix: "journey",
          entityId: entry.id || crypto.randomUUID(),
          field: "entry",
          revision
        });
      }
    }
  }

  return nextState;
}


const CANONICAL_MASTER = {
  id: "user-gabriel-vieira",
  name: "Gabriel Vieira",
  role: "admin",
  pin: "310898"
};

function normalizeAccessName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function normalizeUser(user) {
  const role = user?.role === "admin" ? "admin" : "player";
  return {
    id: String(user?.id || crypto.randomUUID()),
    name: String(user?.name || (role === "admin" ? CANONICAL_MASTER.name : "Jogador")).trim(),
    role,
    pin: String(role === "admin" ? (user?.pin || CANONICAL_MASTER.pin) : (user?.pin || "")),
    createdAt: Number(user?.createdAt) || Date.now(),
    updatedAt: Number(user?.updatedAt) || Number(user?.createdAt) || Date.now()
  };
}

function ensureCanonicalUsers(state) {
  if (!state || typeof state !== "object") {
    return { state, changed: false };
  }

  const originalUsers = Array.isArray(state.users) ? state.users : [];
  const seen = new Set();
  const users = [];
  let changed = !Array.isArray(state.users);

  originalUsers.map(normalizeUser).forEach((user) => {
    const key = normalizeAccessName(user.name);
    if (!key || seen.has(key)) {
      changed = true;
      return;
    }
    seen.add(key);
    users.push(user);
  });

  const masterKey = normalizeAccessName(CANONICAL_MASTER.name);
  const master = users.find((user) => normalizeAccessName(user.name) === masterKey);
  if (master) {
    if (master.name !== CANONICAL_MASTER.name || master.role !== CANONICAL_MASTER.role || master.pin !== CANONICAL_MASTER.pin) {
      changed = true;
    }
    master.name = CANONICAL_MASTER.name;
    master.role = CANONICAL_MASTER.role;
    master.pin = CANONICAL_MASTER.pin;
  } else {
    users.unshift({ ...CANONICAL_MASTER, createdAt: Date.now() });
    changed = true;
  }

  if (users.length !== originalUsers.length) {
    changed = true;
  }

  return {
    state: {
      ...state,
      users,
      revision: changed ? (Number(state.revision) || 0) + 1 : state.revision,
      updatedAt: changed ? Date.now() : state.updatedAt
    },
    changed
  };
}

function cloneState(value) {
  return value && typeof value === "object" ? structuredClone(value) : {};
}

function cleanIncomingState(state) {
  const next = cloneState(state);
  delete next.activeUserId;
  delete next._baseRevision;
  delete next._changedFields;
  return next;
}

function recordTime(record) {
  return Number(record?.updatedAt) || Number(record?.createdAt) || 0;
}

function isNewer(incoming, current) {
  return recordTime(incoming) >= recordTime(current);
}

function normalizeDeletedRecord(record) {
  const type = String(record?.type || "").trim();
  const id = String(record?.id || "").trim();
  if (!type || !id) {
    return null;
  }
  return {
    type,
    id,
    deletedAt: Number(record?.deletedAt) || Date.now()
  };
}

function mergeDeletedRecords(currentRecords, incomingRecords) {
  const map = new Map();
  [...(Array.isArray(currentRecords) ? currentRecords : []), ...(Array.isArray(incomingRecords) ? incomingRecords : [])]
    .map(normalizeDeletedRecord)
    .filter(Boolean)
    .forEach((record) => {
      const key = `${record.type}:${record.id}`;
      const existing = map.get(key);
      if (!existing || record.deletedAt > existing.deletedAt) {
        map.set(key, record);
      }
    });
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 30;
  return [...map.values()]
    .filter((record) => record.deletedAt >= cutoff)
    .sort((a, b) => a.deletedAt - b.deletedAt)
    .slice(-500);
}

function tombstoneMap(records) {
  const map = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    const normalized = normalizeDeletedRecord(record);
    if (normalized) {
      map.set(`${normalized.type}:${normalized.id}`, normalized.deletedAt);
    }
  });
  return map;
}

function isDeleted(record, type, tombstones) {
  const deletedAt = tombstones.get(`${type}:${record?.id}`);
  return Boolean(deletedAt);
}

function mergeArrayById(currentItems, incomingItems, type, tombstones, mergeItem) {
  const map = new Map();
  (Array.isArray(currentItems) ? currentItems : []).forEach((item) => {
    if (item?.id && !isDeleted(item, type, tombstones)) {
      map.set(item.id, cloneState(item));
    }
  });
  (Array.isArray(incomingItems) ? incomingItems : []).forEach((item) => {
    if (!item?.id || isDeleted(item, type, tombstones)) {
      return;
    }
    const current = map.get(item.id);
    if (!current) {
      map.set(item.id, cloneState(item));
      return;
    }
    map.set(item.id, mergeItem ? mergeItem(current, item, tombstones) : (isNewer(item, current) ? cloneState(item) : current));
  });
  return [...map.values()];
}

function mergeCampfireHero(currentHero, incomingHero, tombstones) {
  const base = isNewer(incomingHero, currentHero) ? { ...cloneState(currentHero), ...cloneState(incomingHero) } : { ...cloneState(incomingHero), ...cloneState(currentHero) };
  base.goals = mergeArrayById(currentHero.goals, incomingHero.goals, "campfireGoal", tombstones);
  return base;
}

function mergeJourneyEntry(currentEntry, incomingEntry, tombstones) {
  const base = isNewer(incomingEntry, currentEntry) ? { ...cloneState(currentEntry), ...cloneState(incomingEntry) } : { ...cloneState(incomingEntry), ...cloneState(currentEntry) };
  base.comments = mergeArrayById(currentEntry.comments, incomingEntry.comments, "journeyComment", tombstones);
  return base;
}

function mergeStates(currentState, incomingState) {
  const current = cleanIncomingState(currentState);
  const incoming = cleanIncomingState(incomingState);
  const changedFields = new Set(Array.isArray(incomingState?._changedFields) ? incomingState._changedFields : []);
  const deletedRecords = mergeDeletedRecords(current.deletedRecords, incoming.deletedRecords);
  const tombstones = tombstoneMap(deletedRecords);
  const merged = {
    ...current,
    updatedAt: Math.max(Number(current.updatedAt) || 0, Number(incoming.updatedAt) || 0, Date.now()),
    deletedRecords
  };

  ["currentDay", "startingBalanceCopper", "autoProcessRecurring", "market"].forEach((field) => {
    if (changedFields.has(field)) {
      merged[field] = incoming[field];
    }
  });

  merged.users = mergeArrayById(current.users, incoming.users, "user", tombstones);
  merged.rooms = mergeArrayById(current.rooms, incoming.rooms, "room", tombstones);
  merged.npcs = mergeArrayById(current.npcs, incoming.npcs, "npc", tombstones);
  merged.financeSources = mergeArrayById(current.financeSources, incoming.financeSources, "source", tombstones);
  merged.ledger = mergeArrayById(current.ledger, incoming.ledger, "ledger", tombstones);
  merged.faithTransactions = mergeArrayById(current.faithTransactions, incoming.faithTransactions, "faithTransaction", tombstones);
  merged.events = mergeArrayById(current.events, incoming.events, "event", tombstones);

  merged.campfire = {
    ...(current.campfire || {}),
    legionNotes: changedFields.has("campfire.legionNotes") ? incoming.campfire?.legionNotes : current.campfire?.legionNotes,
    heroes: mergeArrayById(current.campfire?.heroes, incoming.campfire?.heroes, "campfireHero", tombstones, mergeCampfireHero)
  };

  merged.journey = {
    ...(current.journey || {}),
    notificationBaselineAt: Math.max(
      Number(current.journey?.notificationBaselineAt) || 0,
      Number(incoming.journey?.notificationBaselineAt) || 0
    ),
    reads: mergeArrayById(current.journey?.reads, incoming.journey?.reads, "journeyRead", tombstones),
    entries: mergeArrayById(current.journey?.entries, incoming.journey?.entries, "journeyEntry", tombstones, mergeJourneyEntry)
  };

  return merged;
}

async function readStateRow(env) {
  const config = getConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) {
    return null;
  }

  const url = `${config.supabaseUrl}/rest/v1/${config.table}?id=eq.${encodeURIComponent(config.rowId)}&select=state_json,revision,updated_at`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Falha ao ler o estado: ${response.status}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function writeStateRow(env, state) {
  const config = getConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) {
    throw new Error("Configuração do Supabase ausente.");
  }

  const payload = {
    id: config.rowId,
    state_json: state,
    revision: Number(state.revision) || 0,
    updated_at: new Date().toISOString()
  };

  const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.table}?on_conflict=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([payload])
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao salvar o estado (${response.status}): ${detail}`);
  }

  return response.json();
}

export async function onRequest({ request, env }) {
  try {
    if (request.method === "GET") {
      const row = await readStateRow(env);
      if (!row?.state_json) {
        return new Response("{}", {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }
      const repaired = ensureCanonicalUsers(row.state_json);
      if (repaired.changed) {
        await writeStateRow(env, repaired.state);
      }
      return jsonResponse(JSON.stringify(repaired.state), { status: 200 });
    }

    if (request.method === "PUT") {
      const incoming = await request.json();
      const row = await readStateRow(env);
      const currentState = row?.state_json && typeof row.state_json === "object" ? row.state_json : {};
      const currentRevision = Math.max(Number(row?.revision) || 0, Number(currentState.revision) || 0);
      const baseRevision = Number(incoming?._baseRevision) || Number(incoming?.revision) || 0;
      const hydrated = await hydrateStateImages(cleanIncomingState(incoming), env);
      const merged = baseRevision < currentRevision
        ? mergeStates(currentState, { ...hydrated, _changedFields: incoming._changedFields })
        : hydrated;
      const repaired = ensureCanonicalUsers(merged);
      const finalState = cleanIncomingState(repaired.state);
      finalState.revision = currentRevision + 1;
      finalState.updatedAt = Date.now();
      finalState.deletedRecords = Array.isArray(finalState.deletedRecords) ? finalState.deletedRecords.slice(-500) : [];
      await writeStateRow(env, finalState);
      return jsonResponse(JSON.stringify(finalState), { status: 200 });
    }

    return errorResponse("Método não permitido.", 405);
  } catch (error) {
    return errorResponse(error?.message || "Erro inesperado ao processar o estado.", 500);
  }
}
