const DEFAULT_TABLE = "campaign_state";
const DEFAULT_ROW_ID = "main";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getConfig(env) {
  return {
    supabaseUrl: String(env.SUPABASE_URL || "").replace(/\/+$/, ""),
    serviceKey: String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    table: String(env.SUPABASE_STATE_TABLE || DEFAULT_TABLE).trim() || DEFAULT_TABLE,
    rowId: String(env.SUPABASE_STATE_ROW_ID || DEFAULT_ROW_ID).trim() || DEFAULT_ROW_ID
  };
}

async function checkSupabase(env) {
  const config = getConfig(env);
  const result = {
    hasSupabaseUrl: Boolean(config.supabaseUrl),
    hasServiceRoleKey: Boolean(config.serviceKey),
    table: config.table,
    rowId: config.rowId,
    canReadState: false,
    status: null,
    detail: ""
  };

  if (!config.supabaseUrl || !config.serviceKey) {
    result.detail = "Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes no Cloudflare.";
    return result;
  }

  const url = `${config.supabaseUrl}/rest/v1/${config.table}?id=eq.${encodeURIComponent(config.rowId)}&select=id,revision,updated_at`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      Accept: "application/json"
    }
  });

  result.status = response.status;
  if (!response.ok) {
    result.detail = await response.text().catch(() => "Falha sem detalhe.");
    return result;
  }

  const rows = await response.json();
  result.canReadState = true;
  result.detail = Array.isArray(rows) && rows.length ? "Linha de campanha encontrada." : "Tabela acessível, mas a linha main não foi encontrada.";
  result.rows = rows;
  return result;
}

export async function onRequest({ env }) {
  try {
    const supabase = await checkSupabase(env);
    return json({
      ok: supabase.hasSupabaseUrl && supabase.hasServiceRoleKey && supabase.canReadState,
      backend: "cloudflare-functions",
      supabase,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return json({
      ok: false,
      backend: "cloudflare-functions",
      error: error?.message || "Erro inesperado no diagnóstico.",
      checkedAt: new Date().toISOString()
    }, 500);
  }
}
