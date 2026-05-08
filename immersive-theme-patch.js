(function () {
  "use strict";

  const viewTitles = {
    dashboard: "Mirante do Templo",
    rooms: "Câmaras Sagradas",
    npcs: "Aliados do Templo",
    finance: "Tesouro Esmeralda",
    calendar: "Ciclo das Estações",
    campfire: "Fogueira dos Heróis",
    market: "Mercado Esmeralda",
    settings: "Oráculo da Mesa"
  };

  const textReplacements = new Map([
    ["Base Pathfinder 2e", "Santuário nas Alturas"],
    ["Gerenciamento da Base", "Crônicas do Templo"],
    ["Painel", "Mirante"],
    ["Salas", "Câmaras"],
    ["Salas especiais", "Câmaras sagradas"],
    ["NPCs", "Aliados"],
    ["NPCs na base", "Aliados no templo"],
    ["NPCs da base", "Aliados do templo"],
    ["Finanças", "Tesouro"],
    ["Finanças da base", "Tesouro Esmeralda"],
    ["Calendário", "Ciclo das Estações"],
    ["Mercado", "Bazar"],
    ["Mercado atual", "Ofertas do Bazar"],
    ["Mercado Atual", "Ofertas do Bazar"],
    ["Mercado Esmeralda", "Bazar Esmeralda"],
    ["Mercadores da base", "Mercadores da montanha"],
    ["Dados", "Oráculo"],
    ["Dados da campanha", "Oráculo da mesa"],
    ["Saldo", "Cofres"],
    ["Saldo atual", "Cofre atual"],
    ["Saldo compartilhado", "Cofre compartilhado"],
    ["Receitas pendentes", "Tributos a receber"],
    ["Despesas pendentes", "Juramentos a pagar"],
    ["Ciclos recorrentes", "Pactos recorrentes"],
    ["Nova fonte", "Novo pacto"],
    ["Fontes", "Pactos"],
    ["Construções, salas e NPCs", "Obras, câmaras e aliados"],
    ["Livro-caixa", "Crônica do tesouro"],
    ["Lançamentos", "Movimentos do cofre"],
    ["Visão geral", "Ecos recentes"],
    ["Atividade recente", "Sussurros da montanha"],
    ["Calendário do mês", "Lua corrente"],
    ["Calendário atual", "Ciclo atual"],
    ["Itens no mercado", "Relíquias à venda"],
    ["Próxima atualização", "Próxima caravana"],
    ["Gerar estoque", "Renovar ofertas"],
    ["Saldo atual e backup", "Cofre atual e salvaguarda"],
    ["Saldo inicial em gp", "Cofre atual em gp"],
    ["Salvar saldo", "Guardar cofre"],
    ["Salvar saldo atual", "Guardar cofre atual"],
    ["Adicionar", "Inscrever"],
    ["Salvar sala", "Consagrar câmara"],
    ["Salvar NPC", "Guardar aliado"],
    ["Salvar fonte", "Selar pacto"],
    ["Salvar evento", "Gravar presságio"],
    ["Salvar personagem", "Guardar herói"],
    ["Salvar objetivo", "Guardar objetivo"],
    ["Salvar anotações", "Guardar crônicas"],
    ["Salvar ajustes", "Guardar ajustes"],
    ["Salvar usuário", "Guardar viajante"],
    ["Editar", "Ajustar"],
    ["Buscar NPCs", "Buscar aliados"],
    ["Sem lançamentos", "Nenhum eco no cofre"],
    ["O livro-caixa ainda não recebeu registros.", "A crônica do tesouro ainda aguarda seu primeiro traço."],
    ["Mercado vazio", "Bazar silencioso"],
    ["Gere o estoque dos mercadores.", "Chame a próxima caravana para revelar novas ofertas."],
    ["Nenhuma fonte", "Nenhum pacto selado"],
    ["Adicione construções, salas, NPCs ou despesas recorrentes.", "Sele as obras, câmaras, aliados e juramentos que sustentam o templo."],
    ["Nenhum gasto, receita ou evento neste mês.", "Nenhum tributo, juramento ou presságio marcou esta lua."],
    ["Nada pendente", "Nada clama por atenção"],
    ["Todas as fontes recorrentes estão atualizadas para o dia atual.", "Os pactos do templo estão em harmonia com o dia corrente."],
    ["Sem registros", "Sem presságios"],
    ["Data no RPG", "Dia do mundo"],
    ["Data atual do RPG", "Dia atual do mundo"],
    ["Calendário da campanha", "Ciclo da campanha"],
    ["Perfil ativo", "Voz à mesa"],
    ["Seu Herói", "Seu Herói"],
    ["Objetivos atuais", "Votos em curso"]
  ]);

  function currentView() {
    return (location.hash || "#dashboard").replace("#", "") || "dashboard";
  }

  function replaceExactTextNode(node) {
    const original = node.nodeValue;
    const trimmed = original.trim();
    if (!trimmed || !textReplacements.has(trimmed)) {
      return;
    }
    node.nodeValue = original.replace(trimmed, textReplacements.get(trimmed));
  }

  function replaceAttributes(root) {
    const attrs = ["placeholder", "title", "aria-label"];
    root.querySelectorAll("input, textarea, button, [title], [aria-label]").forEach((element) => {
      attrs.forEach((attr) => {
        const value = element.getAttribute(attr);
        if (value && textReplacements.has(value.trim())) {
          element.setAttribute(attr, value.replace(value.trim(), textReplacements.get(value.trim())));
        }
      });
    });
  }

  function walkText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, textarea, input")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }
    nodes.forEach(replaceExactTextNode);
  }

  function applyViewTitle() {
    const title = document.querySelector("#viewTitle");
    const next = viewTitles[currentView()];
    if (title && next) {
      title.textContent = next;
    }
    document.querySelectorAll(".nav-button").forEach((button) => {
      const target = button.dataset.viewTarget;
      const label = button.querySelector(".nav-label") || Array.from(button.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (target && viewTitles[target] && label) {
        if (label.nodeType === Node.TEXT_NODE) {
          label.nodeValue = viewTitles[target].replace(" do Templo", "").replace(" Esmeralda", "").replace(" das Estações", "");
        } else {
          label.textContent = viewTitles[target].replace(" do Templo", "").replace(" Esmeralda", "").replace(" das Estações", "");
        }
      }
    });
  }

  function injectStyles() {
    if (document.querySelector("#immersiveThemePatchStyles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "immersiveThemePatchStyles";
    style.textContent = `
      :root {
        --temple-ice: #a9f0df;
        --temple-star: #fff7d7;
        --temple-ruin: #7d6846;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: -2;
        background:
          linear-gradient(115deg, rgba(5, 8, 11, .96) 0%, rgba(10, 14, 16, .88) 48%, rgba(6, 18, 17, .94) 100%),
          repeating-linear-gradient(90deg, rgba(255,255,255,.045) 0 1px, transparent 1px 96px),
          repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 96px);
      }
      body::after {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: -1;
        opacity: .42;
        background-image:
          radial-gradient(circle at 12% 14%, rgba(255,255,255,.9) 0 1px, transparent 1.6px),
          radial-gradient(circle at 28% 6%, rgba(169,240,223,.85) 0 1px, transparent 1.5px),
          radial-gradient(circle at 72% 11%, rgba(255,247,215,.72) 0 1px, transparent 1.4px),
          radial-gradient(circle at 88% 22%, rgba(255,255,255,.7) 0 1px, transparent 1.5px),
          linear-gradient(155deg, transparent 0 68%, rgba(155, 190, 190, .10) 68.2% 72%, transparent 72.2%),
          linear-gradient(160deg, transparent 0 74%, rgba(255,255,255,.08) 74.2% 77%, transparent 77.2%);
        background-size: 380px 260px, 440px 310px, 520px 330px, 620px 380px, 100% 100%, 100% 100%;
      }
      .brand span {
        color: rgba(220, 244, 239, .72) !important;
      }
      .topbar .eyebrow,
      .section-header .eyebrow,
      .panel .eyebrow {
        color: #d8b56a !important;
      }
      .topbar h1 {
        text-shadow: 0 0 22px rgba(169, 240, 223, .12), 0 2px 0 rgba(0,0,0,.34);
      }
      .panel,
      .metric-card,
      .item-card,
      .npc-card,
      .room-card,
      .source-card,
      .hero-card {
        border-color: rgba(216, 181, 106, .34) !important;
        background:
          linear-gradient(145deg, rgba(22, 27, 23, .92), rgba(7, 10, 10, .94)) !important;
        box-shadow: inset 0 1px 0 rgba(255,247,215,.035), 0 16px 42px rgba(0,0,0,.18);
      }
      .panel:hover,
      .room-card:hover,
      .npc-card:hover,
      .item-card:hover,
      .hero-card:hover {
        border-color: rgba(169, 240, 223, .44) !important;
      }
      .button.primary {
        background: linear-gradient(135deg, #b8f5df, #55d8c5) !important;
        color: #061313 !important;
      }
      .button.subtle,
      .icon-button,
      .chip {
        border-color: rgba(216, 181, 106, .45) !important;
      }
      .calendar-mini-day.today,
      .calendar-day.today {
        box-shadow: inset 0 0 0 1px rgba(169,240,223,.65), 0 0 18px rgba(169,240,223,.10) !important;
      }
      .toast {
        border-color: rgba(169,240,223,.45) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyAll() {
    injectStyles();
    applyViewTitle();
    walkText(document.body);
    replaceAttributes(document.body);
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyAll();
    setInterval(applyAll, 1200);
  });
  window.addEventListener("hashchange", () => queueMicrotask(applyAll));
}());
