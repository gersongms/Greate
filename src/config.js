import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function num(valor, padrao) {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) ? n : padrao;
}

function bool(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  return ['1', 'true', 'sim', 'yes', 'on'].includes(String(valor).toLowerCase());
}

export const config = {
  raiz,

  // --- Onde ficam os dados que precisam sobreviver a um restart ---
  dados: process.env.DATA_DIR || path.join(raiz, 'data'),
  get banco() { return path.join(this.dados, 'genil.db'); },
  get sessaoWhatsapp() { return path.join(this.dados, 'sessao-whatsapp'); },
  get midia() { return path.join(this.dados, 'midia'); },

  // --- WhatsApp ---
  whatsapp: {
    // JID do grupo monitorado, ex: 1203630xxxxxxxxx@g.us
    // Rode `npm run pareia` para descobrir o JID dos grupos do numero.
    grupo: process.env.WHATSAPP_GRUPO_JID || '',
    // Numeros autorizados a pautar (so E.164, sem +, ex: 5562999999999).
    // Vazio = aceita qualquer participante do grupo.
    autores: (process.env.WHATSAPP_AUTORES || '')
      .split(',')
      .map((n) => n.replace(/\D/g, ''))
      .filter(Boolean),
    // Palavra-chave opcional: se definida, so vira materia a mensagem que a contiver.
    gatilho: (process.env.WHATSAPP_GATILHO || '').trim().toLowerCase(),
  },

  // --- Agrupamento de mensagens em uma pauta ---
  pauta: {
    // Mensagens do mesmo autor dentro dessa janela entram na mesma materia.
    janelaMinutos: num(process.env.PAUTA_JANELA_MINUTOS, 10),
    // Texto minimo para considerar que ha uma pauta de verdade.
    minimoCaracteres: num(process.env.PAUTA_MINIMO_CARACTERES, 40),
    maxFotos: num(process.env.PAUTA_MAX_FOTOS, 12),
  },

  // --- Redacao ---
  redacao: {
    chaveApi: process.env.ANTHROPIC_API_KEY || '',
    modelo: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    colegio: process.env.NOME_COLEGIO || 'Colégio Genil',
    // Arquivo com o manual de redacao / tom editorial do colegio.
    manual: process.env.MANUAL_REDACAO || path.join(raiz, 'editorial', 'manual.md'),
  },

  // --- Fotos ---
  fotos: {
    larguraMax: num(process.env.FOTO_LARGURA_MAX, 1600),
    larguraThumb: num(process.env.FOTO_LARGURA_THUMB, 480),
    qualidade: num(process.env.FOTO_QUALIDADE, 82),
  },

  // --- Publicacao ---
  publicacao: {
    // 'wordpress' | 'markdown' | 'nenhum'
    destino: (process.env.PUBLICADOR || 'nenhum').toLowerCase(),
    // true  = cria como rascunho no destino, alguem publica depois
    // false = vai direto ao ar quando aprovado no painel
    comoRascunho: bool(process.env.PUBLICAR_COMO_RASCUNHO, true),
    wordpress: {
      url: (process.env.WP_URL || '').replace(/\/+$/, ''),
      usuario: process.env.WP_USUARIO || '',
      senhaApp: process.env.WP_SENHA_APP || '',
      categoria: process.env.WP_CATEGORIA_ID || '',
      autorId: process.env.WP_AUTOR_ID || '',
    },
    markdown: {
      pasta: process.env.MD_PASTA || path.join(raiz, 'saida', 'materias'),
      pastaImagens: process.env.MD_PASTA_IMAGENS || path.join(raiz, 'saida', 'materias', 'imagens'),
    },
  },

  // --- Painel de aprovacao ---
  painel: {
    porta: num(process.env.PORTA, 3000),
    usuario: process.env.PAINEL_USUARIO || 'genil',
    senha: process.env.PAINEL_SENHA || '',
    // URL publica do painel, usada no aviso enviado pelo WhatsApp.
    urlPublica: (process.env.PAINEL_URL || '').replace(/\/+$/, ''),
    // Avisa no WhatsApp (resposta no proprio grupo) quando um rascunho fica pronto.
    avisarNoGrupo: bool(process.env.AVISAR_NO_GRUPO, true),
  },

  logNivel: process.env.LOG_NIVEL || 'info',
};

/** Erros de configuracao que impedem o sistema de funcionar. */
export function validarConfig() {
  const problemas = [];
  if (!config.whatsapp.grupo) {
    problemas.push('WHATSAPP_GRUPO_JID não definido — rode `npm run pareia` para descobrir o JID do grupo.');
  } else if (!config.whatsapp.grupo.endsWith('@g.us')) {
    problemas.push(`WHATSAPP_GRUPO_JID deve terminar em @g.us (recebi "${config.whatsapp.grupo}").`);
  }
  if (!config.redacao.chaveApi) {
    problemas.push('ANTHROPIC_API_KEY não definida — sem ela não há como redigir a matéria.');
  }
  if (!config.painel.senha) {
    problemas.push('PAINEL_SENHA não definida — o painel de aprovação não sobe sem senha.');
  }
  if (config.publicacao.destino === 'wordpress') {
    const wp = config.publicacao.wordpress;
    if (!wp.url) problemas.push('PUBLICADOR=wordpress exige WP_URL.');
    if (!wp.usuario) problemas.push('PUBLICADOR=wordpress exige WP_USUARIO.');
    if (!wp.senhaApp) problemas.push('PUBLICADOR=wordpress exige WP_SENHA_APP (Application Password).');
  }
  if (!['wordpress', 'markdown', 'nenhum'].includes(config.publicacao.destino)) {
    problemas.push(`PUBLICADOR inválido: "${config.publicacao.destino}". Use wordpress, markdown ou nenhum.`);
  }
  return problemas;
}
