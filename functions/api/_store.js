const DEFAULT_TABLE = "campaign_state";
const DEFAULT_BUCKET = "campaign-assets";
const DEFAULT_ROW_ID = "main";

export function getConfig(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const table = String(env.SUPABASE_STATE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE;
  const bucket = String(env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
  const rowId = String(env.SUPABASE_STATE_ROW_ID || DEFAULT_ROW_ID).trim() || DEFAULT_ROW_ID;
  return { supabaseUrl, serviceKey, table, bucket, rowId };
}

function headers(config, extra = {}) {
  return {
    Authorization: `Bearer ${config.serviceKey}`,
    apikey: config.serviceKey,
    ...extra
  };
}

export async function readStateRow(env) {
  const config = getConfig(env);
  if (!config.supabaseUrl || !config.serviceKey) {
    throw new Error("Configuração do Supabase ausente.");
  }
  const url = `${config.supabaseUrl}/rest/v1/${config.table}?id=eq.${encodeURIComponent(config.rowId)}&select=state_json,revision,updated_at`;
  const response = await fetch(url, { headers: headers(config, { Accept: "application/json" }) });
  if (!response.ok) {
    throw new Error(`Falha ao ler o estado: ${response.status}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function writeStateRow(env, state, expectedRevision) {
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
  if (!Number.isFinite(expectedRevision)) throw new Error("Revisão de origem obrigatória para salvar.");
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.table}?id=eq.${encodeURIComponent(config.rowId)}&revision=eq.${expectedRevision}`, {
    method: "PATCH",
    headers: headers(config, {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Falha ao salvar o estado (${response.status}): ${detail}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) {
    const error = new Error("A campanha mudou durante o salvamento. Tente novamente.");
    error.status = 409;
    throw error;
  }
  return rows;
}
