/**
 * Pareia o numero e lista os grupos, para descobrir o WHATSAPP_GRUPO_JID.
 * Uso: npm run pareia
 */
import { conectar, listarGrupos } from '../src/whatsapp/cliente.js';
import { config } from '../src/config.js';

console.log('Conectando... (se pedir QR, leia com o WhatsApp do número do colégio)\n');

await conectar({
  reconectar: false,
  aoConectar: async (sock) => {
    console.log(`\nConectado como ${sock.user?.id}\n`);
    // Da um instante para a lista de grupos sincronizar.
    await new Promise((r) => setTimeout(r, 3000));

    const grupos = await listarGrupos(sock);
    if (!grupos.length) {
      console.log('Nenhum grupo encontrado. Entre com este número no grupo e rode de novo.');
      process.exit(0);
    }

    console.log('Grupos deste número:\n');
    for (const g of grupos.sort((a, b) => a.nome.localeCompare(b.nome))) {
      const atual = g.jid === config.whatsapp.grupo ? '  ← configurado' : '';
      console.log(`  ${g.nome}  (${g.participantes} participantes)${atual}`);
      console.log(`    WHATSAPP_GRUPO_JID=${g.jid}\n`);
    }
    console.log('Copie a linha WHATSAPP_GRUPO_JID do grupo certo para o seu .env.\n');
    process.exit(0);
  },
});
