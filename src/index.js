/**
 * Orquestrador: sobe o ouvinte do WhatsApp, o relogio que fecha as pautas e o
 * painel de aprovacao — os tres no mesmo processo.
 */
import { config, validarConfig } from './config.js';
import { log } from './logger.js';
import { conectar } from './whatsapp/cliente.js';
import { ouvir, avisarNoGrupo } from './whatsapp/listener.js';
import { pautasVencidas, processarPauta } from './pipeline/pautas.js';
import { verificarDestino } from './publisher/index.js';
import { criarApp } from './web/server.js';

const INTERVALO_RELOGIO = 30_000;

const problemas = validarConfig();
if (problemas.length) {
  log.error('Configuração incompleta — corrija o .env:');
  for (const p of problemas) log.error(`  • ${p}`);
  process.exit(1);
}

const destino = await verificarDestino().catch((e) => ({ ok: false, detalhe: e.message }));
if (!destino.ok) {
  log.error({ publicador: config.publicacao.destino }, `Publicador não respondeu: ${destino.detalhe}`);
  log.error('O sistema sobe de qualquer forma — as matérias ficam no painel até o destino voltar.');
} else {
  log.info({ publicador: config.publicacao.destino }, destino.detalhe);
}

let socket = null;

// --- Painel -----------------------------------------------------------------
criarApp({
  aoPublicar: ({ materia, resultado }) => {
    if (!socket) return;
    const onde = resultado.url ? `\n${resultado.url}` : '';
    avisarNoGrupo(socket, `✅ No site: "${materia.titulo}"${onde}`);
  },
}).listen(config.painel.porta, () => log.info(`painel em http://localhost:${config.painel.porta}`));

// --- WhatsApp ---------------------------------------------------------------
socket = await conectar({
  aoConectar: (sock) => {
    socket = sock;
    ouvir(sock);
  },
});

// --- Relogio: fecha pautas e manda redigir ----------------------------------
let rodando = false;

async function baterRelogio() {
  if (rodando) return;
  rodando = true;
  try {
    const vencidas = pautasVencidas();
    for (const pauta of vencidas) {
      const r = await processarPauta(pauta);

      if (r.estado === 'rascunho' && socket) {
        const link = config.painel.urlPublica
          ? `\n${config.painel.urlPublica}/pauta/${pauta.id}`
          : '';
        const pend = r.pendencias?.length
          ? `\n\n⚠️ Falta confirmar: ${r.pendencias.join('; ')}`
          : '';
        await avisarNoGrupo(
          socket,
          `📝 Rascunho pronto para revisão:\n"${r.materia.titulo}"${pend}${link}`
        );
      }
    }
  } catch (erro) {
    log.error({ erro: erro.message }, 'falha no relógio de pautas');
  } finally {
    rodando = false;
  }
}

setInterval(baterRelogio, INTERVALO_RELOGIO);
baterRelogio();

log.info(
  {
    janelaPauta: `${config.pauta.janelaMinutos} min`,
    publicarComoRascunho: config.publicacao.comoRascunho,
  },
  'esteira no ar'
);

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    log.info('encerrando');
    process.exit(0);
  });
}
