const DEFAULT_TABLE = "campaign_state";
const DEFAULT_ROW_ID = "main";

function getConfig(env) {
  return {
    supabaseUrl: String(env.SUPABASE_URL || "").replace(/\/+$/, ""),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    table: String(env.SUPABASE_STATE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE,
    rowId: String(env.SUPABASE_STATE_ROW_ID || DEFAULT_ROW_ID).trim() || DEFAULT_ROW_ID
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequest({ env }) {
  const config = getConfig(env);
  const result = {
    ok: false,
    backend: "cloudflare-functions",
    supabase: {
      hasSupabaseUrl: Boolean(config.supabaseUrl),
      hasServiceRoleKey: Boolean(config.serviceKey),
      table: config.table,
      rowId: config.rowId,
      canReadState: false
    },
    checkedAt: new Date().toISOString()
  };

  try {
    if (!config.supabaseUrl || !config.serviceKey) {
      result.error = "Configuração do Supabase ausente.";
      return jsonResponse(result, 500);
    }

    const url = `${config.supabaseUrl}/rest/v1/${config.table}?id=eq.${encodeURIComponent(config.rowId)}&select=id,revision,updated_at`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.serviceKey}`,
        apikey: config.serviceKey,
        Accept: "application/json"
      }
    });

    result.supabase.status = response.status;
    result.supabase.canReadState = response.ok;
    result.ok = response.ok;
    result.supabase.rows = response.ok ? await response.json() : [];
    result.supabase.detail = result.supabase.rows.length ? "Linha de campanha encontrada." : "Linha de campanha não encontrada.";
    return jsonResponse(result, response.ok ? 200 : 500);
  } catch (error) {
    result.error = error?.message || "Erro inesperado.";
    return jsonResponse(result, 500);
  }
}
