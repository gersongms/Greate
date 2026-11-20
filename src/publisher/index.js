import { config } from '../config.js';
import * as wordpress from './wordpress.js';
import * as markdown from './markdown.js';

const nenhum = {
  async verificar() {
    return { ok: true, detalhe: 'PUBLICADOR=nenhum — as matérias ficam aprovadas no painel, sem sair daqui' };
  },
  async publicar() {
    return { idExterno: null, url: null, estado: 'apenas-painel' };
  },
};

const destinos = { wordpress, markdown, nenhum };

export function publicador() {
  const p = destinos[config.publicacao.destino];
  if (!p) throw new Error(`PUBLICADOR desconhecido: "${config.publicacao.destino}".`);
  return p;
}

/**
 * @param {{materia: object, fotos: object[], pauta: object}} dados
 * @returns {Promise<{idExterno: string|null, url: string|null, estado: string}>}
 */
export const publicar = (dados) => publicador().publicar(dados);
export const verificarDestino = () => publicador().verificar();
