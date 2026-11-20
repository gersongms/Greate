import fs from 'node:fs';
import baileys from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from '../config.js';
import { log } from '../logger.js';

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

/**
 * Conecta no WhatsApp com a sessao guardada em disco.
 *
 * O numero e pareado uma vez (QR code no terminal) e a credencial fica em
 * data/sessao-whatsapp. Enquanto essa pasta existir, nao pede QR de novo —
 * por isso ela precisa estar num volume persistente, nao dentro do container.
 *
 * @param {object} opts
 * @param {(sock: object) => void} [opts.aoConectar]
 * @param {boolean} [opts.reconectar=true]
 */
export async function conectar({ aoConectar, reconectar = true } = {}) {
  fs.mkdirSync(config.sessaoWhatsapp, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(config.sessaoWhatsapp);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    // Baileys e falante; o log dele fica em nivel proprio.
    logger: pino({ level: 'error' }),
    browser: ['Colegio Genil Newsroom', 'Chrome', '1.0.0'],
    // Nao marca como lido nem aparece "digitando" no grupo: o robo deve ser discreto.
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    if (qr) {
      console.log('\n┌───────────────────────────────────────────────────────────┐');
      console.log('│  Leia este QR no WhatsApp do número do colégio:           │');
      console.log('│  WhatsApp → Dispositivos conectados → Conectar dispositivo│');
      console.log('└───────────────────────────────────────────────────────────┘\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      log.info({ numero: sock.user?.id }, 'WhatsApp conectado');
      aoConectar?.(sock);
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const deslogado = codigo === DisconnectReason.loggedOut;

      if (deslogado) {
        log.error(
          'Sessão encerrada pelo WhatsApp (número desconectado no aparelho, ou banido). ' +
            `Apague ${config.sessaoWhatsapp} e pareie de novo com \`npm run pareia\`.`
        );
        return;
      }
      if (reconectar) {
        log.warn({ codigo }, 'conexão caiu; reconectando em 5s');
        setTimeout(() => conectar({ aoConectar, reconectar }).catch((e) => log.error(e)), 5000);
      }
    }
  });

  return sock;
}

/** Lista os grupos de que o numero participa — para descobrir o JID do grupo certo. */
export async function listarGrupos(sock) {
  const grupos = await sock.groupFetchAllParticipating();
  return Object.values(grupos).map((g) => ({
    jid: g.id,
    nome: g.subject,
    participantes: g.participants?.length ?? 0,
  }));
}
