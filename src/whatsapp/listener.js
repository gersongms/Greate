import baileys from '@whiskeysockets/baileys';
import { config } from '../config.js';
import { log } from '../logger.js';
import { registrarMensagem } from '../pipeline/pautas.js';

const { downloadMediaMessage } = baileys;

/** Extrai o numero (sem sufixo) de um JID, para comparar com a lista de autores. */
const numeroDe = (jid) => String(jid || '').split(/[@:]/)[0].replace(/\D/g, '');

function autorPermitido(autorJid) {
  if (!config.whatsapp.autores.length) return true;
  return config.whatsapp.autores.includes(numeroDe(autorJid));
}

/**
 * Lê o conteudo util de uma mensagem do Baileys.
 * Retorna null para o que nao interessa (figurinha, audio, enquete, sistema...).
 */
export function interpretar(msg) {
  const m = msg.message;
  if (!m) return null;

  const conteudo = m.ephemeralMessage?.message ?? m.viewOnceMessageV2?.message ?? m;

  if (conteudo.imageMessage) {
    return { tipo: 'imagem', texto: conteudo.imageMessage.caption || '' };
  }
  const texto =
    conteudo.conversation ??
    conteudo.extendedTextMessage?.text ??
    conteudo.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    null;

  if (texto) return { tipo: 'texto', texto };
  return null;
}

/** A mensagem passa o filtro de gatilho configurado? */
export function passaGatilho(texto) {
  const g = config.whatsapp.gatilho;
  if (!g) return true;
  return String(texto || '').toLowerCase().includes(g);
}

/**
 * Liga o ouvinte no socket: toda mensagem do grupo monitorado entra na esteira.
 * @param {object} sock socket do Baileys
 */
export function ouvir(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // 'append' = historico sincronizando, nao e mensagem nova

    for (const msg of messages) {
      try {
        await tratar(sock, msg);
      } catch (erro) {
        log.error({ erro: erro.message, id: msg.key?.id }, 'falha ao tratar mensagem');
      }
    }
  });

  log.info(
    {
      grupo: config.whatsapp.grupo,
      autoresAutorizados: config.whatsapp.autores.length || 'todos do grupo',
      gatilho: config.whatsapp.gatilho || '(nenhum)',
    },
    'ouvindo o grupo'
  );
}

async function tratar(sock, msg) {
  const grupoJid = msg.key?.remoteJid;
  if (grupoJid !== config.whatsapp.grupo) return;      // outro grupo ou conversa privada
  if (msg.key?.fromMe) return;                          // eco do proprio robo

  const autorJid = msg.key.participant || msg.participant;
  if (!autorJid) return;

  if (!autorPermitido(autorJid)) {
    log.debug({ autor: numeroDe(autorJid) }, 'autor fora da lista autorizada; ignorado');
    return;
  }

  const conteudo = interpretar(msg);
  if (!conteudo) return;

  if (!passaGatilho(conteudo.texto)) {
    log.debug({ gatilho: config.whatsapp.gatilho }, 'mensagem sem a palavra-chave; ignorada');
    return;
  }

  const base = {
    grupoJid,
    autorJid,
    autorNome: msg.pushName || undefined,
    whatsappId: msg.key.id,
    tipo: conteudo.tipo,
    texto: conteudo.texto,
  };

  if (conteudo.tipo === 'imagem') {
    const imagem = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: log,
      reuploadRequest: sock.updateMediaMessage,
    });
    await registrarMensagem({ ...base, imagem });
    log.info({ bytes: imagem.length, autor: base.autorNome }, 'foto recebida do grupo');
  } else {
    await registrarMensagem(base);
    log.info({ autor: base.autorNome, caracteres: conteudo.texto.length }, 'texto recebido do grupo');
  }
}

/** Responde no grupo, citando a mensagem original quando houver. */
export async function avisarNoGrupo(sock, texto) {
  if (!config.painel.avisarNoGrupo) return;
  try {
    await sock.sendMessage(config.whatsapp.grupo, { text: texto });
  } catch (erro) {
    log.warn({ erro: erro.message }, 'não consegui avisar no grupo');
  }
}
