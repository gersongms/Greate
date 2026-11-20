import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { log } from '../logger.js';

const wp = () => config.publicacao.wordpress;

function autorizacao() {
  const { usuario, senhaApp } = wp();
  return 'Basic ' + Buffer.from(`${usuario}:${senhaApp.replace(/\s+/g, '')}`).toString('base64');
}

async function chamar(rota, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const url = `${wp().url}/wp-json/wp/v2${rota}`;
  const resp = await fetch(url, {
    method: metodo,
    headers: { Authorization: autorizacao(), ...cabecalhos },
    body: corpo,
  });

  const texto = await resp.text();
  if (!resp.ok) {
    throw new Error(`WordPress respondeu ${resp.status} em ${metodo} ${rota}: ${texto.slice(0, 400)}`);
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(
      `WordPress devolveu algo que não é JSON em ${rota}. ` +
        `Costuma ser plugin de segurança bloqueando a REST API, ou URL errada. Começo da resposta: ${texto.slice(0, 200)}`
    );
  }
}

/** Confere credenciais e se a REST API esta acessivel, antes de tentar publicar. */
export async function verificar() {
  const eu = await chamar('/users/me?context=edit');
  return { ok: true, detalhe: `autenticado como "${eu.name}" (id ${eu.id})` };
}

async function enviarFoto(foto, materia) {
  const abs = path.join(config.midia, foto.arquivo);
  const bytes = await fs.readFile(abs);
  const nome = path.basename(foto.arquivo);

  const enviada = await chamar('/media', {
    metodo: 'POST',
    corpo: bytes,
    cabecalhos: {
      'Content-Type': 'image/webp',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });

  // alt e legenda em chamada separada: o upload binario nao aceita campos extra.
  await chamar(`/media/${enviada.id}`, {
    metodo: 'POST',
    corpo: JSON.stringify({
      alt_text: foto.alt || '',
      caption: foto.legenda_wpp || '',
      title: materia.titulo,
    }),
    cabecalhos: { 'Content-Type': 'application/json' },
  });

  return { id: enviada.id, url: enviada.source_url };
}

export async function publicar({ materia, fotos }) {
  const enviadas = [];
  for (const foto of fotos) {
    enviadas.push(await enviarFoto(foto, materia));
    log.debug({ arquivo: foto.arquivo }, 'foto enviada ao WordPress');
  }

  const galeria = enviadas
    .map((f, i) => {
      const foto = fotos[i];
      const legenda = foto.legenda_wpp
        ? `<figcaption>${escaparHtml(foto.legenda_wpp)}</figcaption>`
        : '';
      return `<figure class="wp-block-image size-large"><img src="${f.url}" alt="${escaparHtml(foto.alt || '')}" loading="lazy" />${legenda}</figure>`;
    })
    .join('\n');

  const corpo = {
    title: materia.titulo,
    excerpt: materia.resumo || '',
    content: [
      materia.subtitulo ? `<p class="materia-subtitulo"><strong>${escaparHtml(materia.subtitulo)}</strong></p>` : '',
      materia.corpo_html,
      galeria,
    ]
      .filter(Boolean)
      .join('\n\n'),
    status: config.publicacao.comoRascunho ? 'draft' : 'publish',
  };

  if (enviadas[0]) corpo.featured_media = enviadas[0].id;
  if (wp().categoria) corpo.categories = [Number(wp().categoria)];
  if (wp().autorId) corpo.author = Number(wp().autorId);

  const post = await chamar('/posts', {
    metodo: 'POST',
    corpo: JSON.stringify(corpo),
    cabecalhos: { 'Content-Type': 'application/json' },
  });

  return {
    idExterno: String(post.id),
    url: post.link,
    estado: post.status,
  };
}

function escaparHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
