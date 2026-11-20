import { config } from '../config.js';

export const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const CSS = `
:root {
  --fundo: #f6f7f9; --papel: #fff; --borda: #e3e6ea; --texto: #16191d;
  --fraco: #5c6670; --marca: #1a4f8a; --marca-texto: #fff;
  --alerta-fundo: #fff8e6; --alerta-borda: #e8c969; --alerta-texto: #6b4e00;
  --perigo: #a3301f; --ok: #1f6b3a; --sombra: 0 1px 2px rgba(0,0,0,.06), 0 4px 12px rgba(0,0,0,.04);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="claro"]) {
    --fundo: #14171a; --papel: #1c2024; --borda: #2e343a; --texto: #e8eaed;
    --fraco: #9aa4ae; --marca: #4d90d4; --marca-texto: #0d1115;
    --alerta-fundo: #332b14; --alerta-borda: #6b5620; --alerta-texto: #f0d78a;
    --perigo: #e08273; --ok: #6cc08b; --sombra: 0 1px 2px rgba(0,0,0,.3);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--fundo); color: var(--texto);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.faixa {
  background: var(--papel); border-bottom: 1px solid var(--borda);
  padding: 14px 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.faixa h1 { font-size: 17px; margin: 0; font-weight: 650; }
.faixa .sub { color: var(--fraco); font-size: 13px; }
.env { max-width: 920px; margin: 0 auto; padding: 24px 16px 64px; }
.cartao {
  background: var(--papel); border: 1px solid var(--borda); border-radius: 12px;
  padding: 18px; margin-bottom: 16px; box-shadow: var(--sombra);
}
.cartao h2 { margin: 0 0 4px; font-size: 19px; line-height: 1.3; }
.meta { color: var(--fraco); font-size: 13px; margin-bottom: 12px; }
a { color: var(--marca); }
.btn {
  display: inline-block; border: 1px solid var(--borda); background: var(--papel);
  color: var(--texto); padding: 9px 16px; border-radius: 8px; font-size: 15px;
  cursor: pointer; text-decoration: none; font-weight: 500;
}
.btn:hover { border-color: var(--fraco); }
.btn-principal { background: var(--marca); color: var(--marca-texto); border-color: var(--marca); }
.btn-perigo { color: var(--perigo); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
label { display: block; font-size: 13px; font-weight: 600; color: var(--fraco); margin: 14px 0 5px; }
input[type=text], textarea {
  width: 100%; padding: 9px 11px; border: 1px solid var(--borda); border-radius: 8px;
  background: var(--fundo); color: var(--texto); font: inherit;
}
textarea { min-height: 220px; resize: vertical; font-size: 15px; }
.alerta {
  background: var(--alerta-fundo); border: 1px solid var(--alerta-borda);
  color: var(--alerta-texto); padding: 12px 14px; border-radius: 10px;
  margin: 14px 0; font-size: 14px;
}
.alerta ul { margin: 8px 0 0; padding-left: 20px; }
.fotos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.foto { border: 2px solid var(--borda); border-radius: 10px; overflow: hidden; background: var(--fundo); }
.foto.fora { opacity: .38; border-style: dashed; }
.foto img { width: 100%; display: block; aspect-ratio: 4/3; object-fit: cover; }
.foto .pe { padding: 8px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; }
.foto .pe input { margin-top: 3px; flex-shrink: 0; }
.bruto {
  white-space: pre-wrap; background: var(--fundo); border: 1px solid var(--borda);
  border-radius: 8px; padding: 12px; font-size: 14px; color: var(--fraco);
  max-height: 260px; overflow: auto;
}
.selo {
  display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .04em; padding: 3px 8px; border-radius: 20px;
  background: var(--fundo); border: 1px solid var(--borda); color: var(--fraco);
}
.selo.rascunho { color: var(--marca); border-color: var(--marca); }
.selo.publicada { color: var(--ok); border-color: var(--ok); }
.selo.erro, .selo.recusada { color: var(--perigo); border-color: var(--perigo); }
.confere { background: var(--fundo); border: 1px solid var(--borda); border-radius: 10px; padding: 14px; margin: 18px 0; }
.confere p { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.confere label { display: flex; gap: 9px; font-weight: 400; color: var(--texto); font-size: 14px; margin: 9px 0; text-transform: none; }
.confere input { margin-top: 3px; flex-shrink: 0; }
.acoes { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 18px;
  padding-top: 18px; border-top: 1px solid var(--borda); }
.vazio { text-align: center; color: var(--fraco); padding: 56px 16px; }
.vazio p { margin: 6px 0; }
@media (max-width: 560px) { .env { padding: 16px 12px 48px; } .cartao { padding: 14px; } }
`;

export function pagina({ titulo, corpo, subtitulo }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="faixa">
  <h1><a href="/" style="text-decoration:none;color:inherit">${esc(config.redacao.colegio)}</a></h1>
  <span class="sub">${esc(subtitulo || 'Matérias do WhatsApp')}</span>
</div>
<div class="env">${corpo}</div>
</body>
</html>`;
}

const DATA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
});
export const dataBr = (iso) => (iso ? DATA.format(new Date(iso)) : '—');

export function listagem({ rascunhos, recentes }) {
  const corpo = [];

  if (!rascunhos.length) {
    corpo.push(`<div class="cartao vazio">
      <p style="font-size:17px;color:var(--texto)">Nenhum rascunho esperando aprovação.</p>
      <p>Quando um professor postar no grupo, a matéria aparece aqui.</p>
    </div>`);
  } else {
    corpo.push(`<p class="meta">${rascunhos.length} rascunho(s) esperando você</p>`);
    for (const r of rascunhos) {
      const pend = r.pendencias > 0
        ? `<span class="selo erro">${r.pendencias} pendência(s)</span>`
        : '';
      corpo.push(`<div class="cartao">
        <h2><a href="/pauta/${r.pauta_id}" style="text-decoration:none">${esc(r.titulo)}</a></h2>
        <div class="meta">
          ${esc(r.autor_nome || 'autor não identificado')} ·
          ${dataBr(r.recebida_em)} ·
          ${r.fotos} foto(s) ${pend}
        </div>
        <p style="margin:0;color:var(--fraco)">${esc(r.resumo || '')}</p>
        <div style="margin-top:12px"><a class="btn btn-principal" href="/pauta/${r.pauta_id}">Revisar</a></div>
      </div>`);
    }
  }

  if (recentes.length) {
    corpo.push('<h2 style="font-size:15px;color:var(--fraco);margin:28px 0 12px">Últimas</h2>');
    for (const r of recentes) {
      const destino = r.url_publicada
        ? ` · <a href="${esc(r.url_publicada)}" target="_blank" rel="noopener">ver no site</a>`
        : '';
      corpo.push(`<div class="cartao" style="padding:12px 16px">
        <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
          <span class="selo ${esc(r.estado)}">${esc(r.estado)}</span>
          <strong style="font-weight:600">${esc(r.titulo || '(sem matéria)')}</strong>
        </div>
        <div class="meta" style="margin:6px 0 0">
          ${dataBr(r.fechada_em || r.recebida_em)}${destino}
          ${r.erro ? ` · <span style="color:var(--perigo)">${esc(r.erro)}</span>` : ''}
          · <a href="/pauta/${r.id}">abrir</a>
        </div>
      </div>`);
    }
  }

  return pagina({ titulo: `Matérias — ${config.redacao.colegio}`, corpo: corpo.join('\n') });
}

export function revisao({ pauta, materia, fotos, pendencias, csrf, aviso }) {
  const editavel = pauta.estado === 'rascunho';

  const fotosHtml = fotos.length
    ? `<div class="fotos">${fotos
        .map(
          (f) => `<div class="foto ${f.aprovada ? '' : 'fora'}" data-foto>
        <img src="/midia/${esc(f.thumb || f.arquivo)}" alt="${esc(f.alt || '')}" loading="lazy">
        <div class="pe">
          <input type="checkbox" name="foto_${f.id}" id="foto_${f.id}" ${f.aprovada ? 'checked' : ''} ${editavel ? '' : 'disabled'}>
          <label for="foto_${f.id}" style="margin:0;font-weight:400;color:var(--texto);text-transform:none;font-size:12px">
            ${f.aprovada ? 'Entra na matéria' : 'Fora'}<br>
            <span style="color:var(--fraco)">${esc(f.alt || 'sem alt')}</span>
          </label>
        </div>
      </div>`
        )
        .join('')}</div>`
    : '<p class="meta">Nenhuma foto nesta pauta.</p>';

  const pendHtml = pendencias.length
    ? `<div class="alerta">
        <strong>O professor não informou:</strong>
        <ul>${pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        Procure por <code>[CONFIRMAR: ...]</code> no texto e preencha antes de aprovar.
      </div>`
    : '';

  const avisoHtml = aviso ? `<div class="alerta">${esc(aviso)}</div>` : '';

  const corpo = `
  ${avisoHtml}
  <div style="margin-bottom:14px"><a href="/">← todas as matérias</a></div>

  <div class="cartao">
    <span class="selo ${esc(pauta.estado)}">${esc(pauta.estado)}</span>
    <div class="meta" style="margin-top:10px">
      Pauta #${pauta.id} · enviada por ${esc(pauta.autor_nome || 'não identificado')} ·
      chegou em ${dataBr(pauta.recebida_em)}
      ${pauta.erro ? `<br><span style="color:var(--perigo)">${esc(pauta.erro)}</span>` : ''}
    </div>
    <label>Mensagem original no grupo</label>
    <div class="bruto">${esc(pauta.texto_bruto)}</div>
  </div>

  ${materia ? `
  <form method="post" action="/pauta/${pauta.id}" id="form">
  <input type="hidden" name="_csrf" value="${esc(csrf)}">
  <div class="cartao">
    ${pendHtml}
    <label for="titulo">Título</label>
    <input type="text" id="titulo" name="titulo" value="${esc(materia.titulo)}" maxlength="120" ${editavel ? '' : 'readonly'}>

    <label for="subtitulo">Subtítulo</label>
    <input type="text" id="subtitulo" name="subtitulo" value="${esc(materia.subtitulo || '')}" maxlength="200" ${editavel ? '' : 'readonly'}>

    <label for="resumo">Resumo (listagem do site e busca do Google)</label>
    <input type="text" id="resumo" name="resumo" value="${esc(materia.resumo || '')}" maxlength="300" ${editavel ? '' : 'readonly'}>

    <label for="corpo_html">Corpo da matéria</label>
    <textarea id="corpo_html" name="corpo_html" ${editavel ? '' : 'readonly'}>${esc(materia.corpo_html)}</textarea>

    <label for="tags">Tags (separadas por vírgula)</label>
    <input type="text" id="tags" name="tags" value="${esc(JSON.parse(materia.tags || '[]').join(', '))}" ${editavel ? '' : 'readonly'}>
  </div>

  <div class="cartao">
    <label style="margin-top:0">Fotos — desmarque a que não pode ir ao ar</label>
    ${fotosHtml}
  </div>

  ${editavel ? `
  <div class="cartao">
    <div class="confere">
      <p>Antes de publicar, confirme:</p>
      <label><input type="checkbox" name="ok_imagem" id="ok1"> Tenho autorização de uso de imagem de todos que aparecem nas fotos marcadas</label>
      <label><input type="checkbox" name="ok_fatos" id="ok2"> Conferi nomes, datas e números — não há <code>[CONFIRMAR]</code> sobrando no texto</label>
      <label><input type="checkbox" name="ok_leitura" id="ok3"> Li a matéria inteira</label>
    </div>
    <div class="acoes">
      <button class="btn" type="submit" name="acao" value="salvar">Salvar rascunho</button>
      <button class="btn btn-principal" type="submit" name="acao" value="aprovar" id="btn-aprovar" disabled>
        ${config.publicacao.destino === 'nenhum'
          ? 'Aprovar'
          : config.publicacao.comoRascunho
            ? 'Aprovar e enviar como rascunho'
            : 'Aprovar e publicar no site'}
      </button>
      <button class="btn btn-perigo" type="submit" name="acao" value="recusar"
        onclick="return confirm('Descartar esta matéria? A pauta fica no histórico, mas não vai ao ar.')">Descartar</button>
    </div>
    <p class="meta" style="margin:10px 0 0">
      ${config.publicacao.destino === 'nenhum'
        ? 'Nenhum publicador configurado: a matéria fica aprovada aqui, pronta para copiar.'
        : config.publicacao.comoRascunho
          ? 'A matéria entra como rascunho no site — alguém ainda precisa clicar em publicar lá.'
          : 'Atenção: ao aprovar, a matéria vai direto ao ar no site.'}
    </p>
  </div>` : `
  <div class="cartao">
    <div class="meta">
      ${pauta.estado === 'publicada'
        ? `Publicada em ${dataBr(materia.publicada_em)}${materia.url_publicada ? ` — <a href="${esc(materia.url_publicada)}" target="_blank" rel="noopener">ver no site</a>` : ''}`
        : 'Esta pauta não está mais editável.'}
    </div>
  </div>`}
  </form>

  <script>
  (function () {
    var form = document.getElementById('form');
    if (!form) return;
    var botao = document.getElementById('btn-aprovar');
    var confes = ['ok1', 'ok2', 'ok3'].map(function (id) { return document.getElementById(id); });
    if (botao && confes.every(Boolean)) {
      var revisar = function () {
        botao.disabled = !confes.every(function (c) { return c.checked; });
      };
      confes.forEach(function (c) { c.addEventListener('change', revisar); });
      revisar();
    }
    form.querySelectorAll('[data-foto] input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        cb.closest('[data-foto]').classList.toggle('fora', !cb.checked);
      });
    });
  })();
  </script>`
  : '<div class="cartao"><p class="meta">Esta pauta ainda não tem matéria redigida.</p></div>'}
  `;

  return pagina({
    titulo: `${materia?.titulo || `Pauta #${pauta.id}`} — ${config.redacao.colegio}`,
    subtitulo: 'Revisão',
    corpo,
  });
}
