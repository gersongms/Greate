import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { log } from '../logger.js';

let cliente;
function obterCliente() {
  if (!cliente) {
    if (!config.redacao.chaveApi) throw new Error('ANTHROPIC_API_KEY não definida.');
    cliente = new Anthropic({ apiKey: config.redacao.chaveApi });
  }
  return cliente;
}

async function lerManual() {
  try {
    return await fs.readFile(config.redacao.manual, 'utf8');
  } catch {
    log.warn({ caminho: config.redacao.manual }, 'manual de redação não encontrado; seguindo sem ele');
    return '(Nenhum manual de redação configurado — use tom institucional sóbrio.)';
  }
}

/** Schema da materia, entregue ao modelo como ferramenta para a saida vir estruturada. */
const FERRAMENTA = {
  name: 'entregar_materia',
  description: 'Entrega a matéria redigida, pronta para revisão humana.',
  input_schema: {
    type: 'object',
    properties: {
      titulo: { type: 'string', description: 'Até 65 caracteres, sem ponto final.' },
      subtitulo: { type: 'string', description: 'Uma linha, acrescenta informação ao título.' },
      resumo: { type: 'string', description: '1 a 2 frases para a listagem do site e meta description.' },
      corpo_html: {
        type: 'string',
        description:
          'Corpo em HTML simples. Apenas <p>, <h3>, <ul>, <li>, <strong>, <em>, <blockquote>. ' +
          'Sem <img> (as fotos são inseridas pelo sistema), sem <script>, sem atributo de estilo.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '3 a 6 tags curtas em minúsculas, ex: ["educação infantil", "feira de ciências"].',
      },
      legendas_fotos: {
        type: 'array',
        description: 'Uma entrada por foto recebida, na mesma ordem. Descreve só o que é verificável.',
        items: {
          type: 'object',
          properties: {
            legenda: { type: 'string', description: 'Legenda curta exibida sob a foto. Pode ser vazia.' },
            alt: { type: 'string', description: 'Texto alternativo para leitor de tela. Obrigatório.' },
          },
          required: ['alt'],
        },
      },
      pendencias: {
        type: 'array',
        items: { type: 'string' },
        description:
          'O que o professor não informou e a matéria precisaria: data exata, série, nome de professor, ' +
          'resultado. Vazio se nada falta.',
      },
    },
    required: ['titulo', 'resumo', 'corpo_html', 'tags', 'legendas_fotos', 'pendencias'],
  },
};

const SISTEMA = `Você é o redator do site do {COLEGIO}. Recebe o relato bruto que um professor
mandou no grupo de WhatsApp da escola, junto com as legendas das fotos que ele
enviou, e devolve uma matéria pronta para o site.

O relato é informal: áudio transcrito, mensagem digitada correndo, abreviação,
emoji, erro de digitação. Seu trabalho é transformar isso em texto institucional
sem inventar nada.

REGRA MAIS IMPORTANTE: você não tem nenhuma informação além do que está no relato.
Não complete nome, não estime quantidade de alunos, não suponha data, não deduza
em que série aconteceu, não crie fala entre aspas que ninguém disse. Se a matéria
precisa de um dado que não está no relato, escreva [CONFIRMAR: qual dado] no corpo
e repita o item em "pendencias". Um [CONFIRMAR] é muito melhor do que um dado
inventado: o revisor preenche em dez segundos, um erro factual no site da escola
custa a confiança dos pais.

Sobre as fotos: você NÃO as vê. Você só tem a legenda que o professor escreveu,
quando escreveu. Então o alt text deve se apoiar no contexto do relato e ficar
genérico quando não houver base ("Alunos durante a atividade em sala"). Nunca
afirme quem aparece na foto, quantas pessoas aparecem, nem descreva expressão,
roupa ou aparência de ninguém.

Manual de redação da escola, que vale sobre qualquer instinto seu de estilo:

{MANUAL}`;

/**
 * Redige a materia a partir da pauta bruta.
 *
 * @param {object} pauta
 * @param {string} pauta.texto texto cru que o professor mandou
 * @param {string} [pauta.autor] nome de quem mandou (vai como contexto, nao para o texto)
 * @param {string} [pauta.recebidaEm] ISO
 * @param {Array<{legenda?: string}>} pauta.fotos
 * @returns {Promise<object>} materia estruturada
 */
export async function redigirMateria({ texto, autor, recebidaEm, fotos = [] }) {
  const manual = await lerManual();
  const sistema = SISTEMA.replace('{COLEGIO}', config.redacao.colegio).replace('{MANUAL}', manual);

  const descricaoFotos = fotos.length
    ? fotos
        .map((f, i) => `  Foto ${i + 1}: ${f.legenda?.trim() ? `legenda do professor — "${f.legenda.trim()}"` : '(sem legenda)'}`)
        .join('\n')
    : '  (nenhuma foto)';

  const data = recebidaEm
    ? new Date(recebidaEm).toLocaleDateString('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' })
    : 'não informada';

  const entrada = `RELATO RECEBIDO NO GRUPO
Enviado por: ${autor || 'não identificado'}
Chegou no grupo em: ${data} (esta é a data de envio da mensagem, NÃO necessariamente a data do evento — não afirme que o evento foi nesse dia a menos que o relato diga)

--- texto do professor, literal ---
${texto}
--- fim do texto ---

FOTOS ENVIADAS (${fotos.length}):
${descricaoFotos}

Redija a matéria e entregue com a ferramenta entregar_materia. Devolva exatamente ${fotos.length} entrada(s) em legendas_fotos.`;

  const resposta = await obterCliente().messages.create({
    model: config.redacao.modelo,
    max_tokens: 4096,
    system: sistema,
    tools: [FERRAMENTA],
    tool_choice: { type: 'tool', name: 'entregar_materia' },
    messages: [{ role: 'user', content: entrada }],
  });

  const bloco = resposta.content.find((c) => c.type === 'tool_use' && c.name === 'entregar_materia');
  if (!bloco) {
    throw new Error(`O modelo não devolveu a matéria estruturada (stop_reason: ${resposta.stop_reason}).`);
  }

  const materia = bloco.input;
  materia.corpo_html = limparHtml(materia.corpo_html);

  // Garante uma entrada de legenda por foto, mesmo que o modelo devolva a mais ou a menos.
  const legendas = Array.isArray(materia.legendas_fotos) ? materia.legendas_fotos : [];
  materia.legendas_fotos = fotos.map((_, i) => ({
    legenda: legendas[i]?.legenda?.trim() || '',
    alt: legendas[i]?.alt?.trim() || `Registro da atividade no ${config.redacao.colegio}`,
  }));

  log.info(
    { titulo: materia.titulo, pendencias: materia.pendencias?.length ?? 0, uso: resposta.usage },
    'matéria redigida'
  );
  return materia;
}

/**
 * Deixa passar so a marcacao que o site aceita. O texto vem de um modelo, mas
 * passa por um painel e vai para uma pagina publica: filtrar e barato.
 */
export function limparHtml(html) {
  if (!html) return '';
  const permitidas = new Set(['p', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'br']);
  return String(html)
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tagInteira, nome) => {
      const t = nome.toLowerCase();
      if (!permitidas.has(t)) return '';
      return tagInteira.startsWith('</') ? `</${t}>` : `<${t}>`;
    })
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .trim();
}
