import { db, agora, registrarEvento } from '../db.js';
import { config } from '../config.js';
import { log } from '../logger.js';
import { normalizarFoto } from '../media/fotos.js';
import { redigirMateria } from '../writer/article.js';

/**
 * Professor raramente manda tudo numa mensagem: vem o texto, depois seis fotos,
 * depois um "esqueci de falar que...". Uma pauta e tudo que o mesmo autor manda
 * dentro de uma janela de tempo. Passada a janela sem mensagem nova, a pauta
 * fecha e vira materia.
 */

function pautaAberta(grupoJid, autorJid) {
  const limite = new Date(Date.now() - config.pauta.janelaMinutos * 60_000).toISOString();
  return db
    .prepare(
      `SELECT p.* FROM pautas p
       WHERE p.grupo_jid = ? AND p.autor_jid = ? AND p.estado = 'aberta'
         AND COALESCE(
               (SELECT MAX(m.recebida_em) FROM mensagens m WHERE m.pauta_id = p.id),
               p.recebida_em
             ) >= ?
       ORDER BY p.id DESC LIMIT 1`
    )
    .get(grupoJid, autorJid, limite);
}

function abrirPauta(grupoJid, autorJid, autorNome) {
  const r = db
    .prepare(
      'INSERT INTO pautas (grupo_jid, autor_jid, autor_nome, recebida_em, estado) VALUES (?, ?, ?, ?, ?)'
    )
    .run(grupoJid, autorJid, autorNome ?? null, agora(), 'aberta');
  const id = Number(r.lastInsertRowid);
  registrarEvento(id, 'pauta_aberta', `autor: ${autorNome || autorJid}`);
  log.info({ pautaId: id, autor: autorNome || autorJid }, 'pauta aberta');
  return db.prepare('SELECT * FROM pautas WHERE id = ?').get(id);
}

/**
 * Registra uma mensagem do grupo na pauta correspondente.
 *
 * @param {object} msg
 * @param {string} msg.grupoJid
 * @param {string} msg.autorJid
 * @param {string} [msg.autorNome]
 * @param {string} msg.whatsappId
 * @param {'texto'|'imagem'} msg.tipo
 * @param {string} [msg.texto] texto ou legenda da foto
 * @param {Buffer} [msg.imagem] bytes da foto, quando tipo === 'imagem'
 * @returns {Promise<{pautaId: number|null, motivo?: string}>}
 */
export async function registrarMensagem(msg) {
  const { grupoJid, autorJid, autorNome, whatsappId, tipo, texto, imagem } = msg;

  const jaVista = db.prepare('SELECT 1 FROM mensagens WHERE whatsapp_id = ?').get(whatsappId);
  if (jaVista) return { pautaId: null, motivo: 'mensagem repetida' };

  const pauta = pautaAberta(grupoJid, autorJid) ?? abrirPauta(grupoJid, autorJid, autorNome);

  db.prepare(
    'INSERT INTO mensagens (pauta_id, whatsapp_id, tipo, texto, recebida_em) VALUES (?, ?, ?, ?, ?)'
  ).run(pauta.id, whatsappId, tipo, texto ?? null, agora());

  if (tipo === 'texto' && texto?.trim()) {
    const novo = [pauta.texto_bruto, texto.trim()].filter(Boolean).join('\n\n');
    db.prepare('UPDATE pautas SET texto_bruto = ? WHERE id = ?').run(novo, pauta.id);
  }

  if (tipo === 'imagem' && imagem) {
    const quantas = db.prepare('SELECT COUNT(*) AS n FROM fotos WHERE pauta_id = ?').get(pauta.id).n;
    if (quantas >= config.pauta.maxFotos) {
      log.warn({ pautaId: pauta.id }, 'limite de fotos da pauta atingido; foto descartada');
      registrarEvento(pauta.id, 'foto_descartada', `limite de ${config.pauta.maxFotos} fotos`);
    } else {
      const tratada = await normalizarFoto(imagem, { pautaId: pauta.id, whatsappId });
      db.prepare(
        `INSERT INTO fotos (pauta_id, whatsapp_id, arquivo, thumb, largura, altura, bytes, legenda_wpp, ordem, recebida_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        pauta.id,
        whatsappId,
        tratada.arquivo,
        tratada.thumb,
        tratada.largura,
        tratada.altura,
        tratada.bytes,
        texto?.trim() || null,
        quantas,
        agora()
      );
      // Legenda de foto tambem e informacao de pauta.
      if (texto?.trim()) {
        const novo = [pauta.texto_bruto, `(legenda de foto) ${texto.trim()}`].filter(Boolean).join('\n\n');
        db.prepare('UPDATE pautas SET texto_bruto = ? WHERE id = ?').run(novo, pauta.id);
      }
    }
  }

  return { pautaId: pauta.id };
}

/** Pautas cuja janela expirou e que estao prontas para redacao. */
export function pautasVencidas() {
  const limite = new Date(Date.now() - config.pauta.janelaMinutos * 60_000).toISOString();
  return db
    .prepare(
      `SELECT p.* FROM pautas p
       WHERE p.estado = 'aberta'
         AND COALESCE(
               (SELECT MAX(m.recebida_em) FROM mensagens m WHERE m.pauta_id = p.id),
               p.recebida_em
             ) < ?`
    )
    .all(limite);
}

/**
 * Fecha a pauta e manda redigir. Pauta sem texto suficiente e descartada: foto
 * solta no grupo, "bom dia" e figurinha nao sao materia.
 */
export async function processarPauta(pauta) {
  const texto = (pauta.texto_bruto || '').trim();
  const fotos = db.prepare('SELECT * FROM fotos WHERE pauta_id = ? ORDER BY ordem').all(pauta.id);

  if (texto.length < config.pauta.minimoCaracteres) {
    db.prepare("UPDATE pautas SET estado = 'recusada', fechada_em = ?, erro = ? WHERE id = ?").run(
      agora(),
      `texto curto demais (${texto.length} caracteres, mínimo ${config.pauta.minimoCaracteres})`,
      pauta.id
    );
    registrarEvento(pauta.id, 'descartada', 'texto insuficiente para virar matéria');
    log.info({ pautaId: pauta.id, caracteres: texto.length }, 'pauta descartada: texto insuficiente');
    return { estado: 'recusada' };
  }

  db.prepare("UPDATE pautas SET estado = 'redigindo', fechada_em = ? WHERE id = ?").run(agora(), pauta.id);

  try {
    const materia = await redigirMateria({
      texto,
      autor: pauta.autor_nome,
      recebidaEm: pauta.recebida_em,
      fotos: fotos.map((f) => ({ legenda: f.legenda_wpp })),
    });

    db.prepare(
      `INSERT INTO materias (pauta_id, titulo, subtitulo, resumo, corpo_html, tags, criada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      pauta.id,
      materia.titulo,
      materia.subtitulo ?? null,
      materia.resumo ?? null,
      materia.corpo_html,
      JSON.stringify(materia.tags ?? []),
      agora()
    );

    fotos.forEach((foto, i) => {
      const leg = materia.legendas_fotos?.[i];
      db.prepare('UPDATE fotos SET alt = ?, legenda_wpp = COALESCE(NULLIF(?, \'\'), legenda_wpp) WHERE id = ?')
        .run(leg?.alt ?? null, leg?.legenda ?? '', foto.id);
    });

    for (const pendencia of materia.pendencias ?? []) {
      registrarEvento(pauta.id, 'pendencia', pendencia);
    }

    db.prepare("UPDATE pautas SET estado = 'rascunho' WHERE id = ?").run(pauta.id);
    registrarEvento(
      pauta.id,
      'rascunho_pronto',
      `"${materia.titulo}" — ${fotos.length} foto(s), ${materia.pendencias?.length ?? 0} pendência(s)`
    );
    log.info({ pautaId: pauta.id, titulo: materia.titulo }, 'rascunho pronto');

    return { estado: 'rascunho', materia, pendencias: materia.pendencias ?? [] };
  } catch (erro) {
    db.prepare("UPDATE pautas SET estado = 'erro', erro = ? WHERE id = ?").run(String(erro.message), pauta.id);
    registrarEvento(pauta.id, 'erro_redacao', erro.message);
    log.error({ pautaId: pauta.id, erro: erro.message }, 'falha ao redigir');
    return { estado: 'erro', erro };
  }
}
