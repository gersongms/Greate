import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { log } from '../logger.js';

/**
 * Normaliza uma foto que veio do WhatsApp para uso no site.
 *
 * O ponto mais importante aqui nao e o tamanho: e o EXIF. Foto tirada no
 * celular carrega coordenada de GPS, modelo do aparelho e horario. Publicar
 * isso junto com imagem de aluno entrega a localizacao exata da escola.
 * O sharp descarta todo o metadado por padrao (nao chamamos withMetadata()),
 * e o `rotate()` aplica a orientacao do EXIF antes de joga-lo fora, para a
 * foto nao sair de lado.
 *
 * @param {Buffer} buffer bytes originais recebidos do WhatsApp
 * @param {object} opts
 * @param {number} opts.pautaId
 * @param {string} opts.whatsappId usado para gerar nome de arquivo estavel
 * @returns {Promise<{arquivo: string, thumb: string, largura: number, altura: number, bytes: number}>}
 */
export async function normalizarFoto(buffer, { pautaId, whatsappId }) {
  const hash = crypto.createHash('sha1').update(whatsappId).digest('hex').slice(0, 10);
  const pastaRel = path.join('pautas', String(pautaId));
  const pastaAbs = path.join(config.midia, pastaRel);
  await fs.mkdir(pastaAbs, { recursive: true });

  const nome = `${hash}.webp`;
  const nomeThumb = `${hash}-thumb.webp`;

  // ATENCAO: nao chame .withMetadata() aqui. Sem ela o sharp descarta todo o
  // metadado; com ela (inclusive `withMetadata(false)`) o EXIF e PRESERVADO.
  // O `rotate()` sem argumento aplica a orientacao do EXIF antes do descarte,
  // para a foto nao sair deitada.
  const base = sharp(buffer, { failOn: 'none' }).rotate();

  const principal = await base
    .clone()
    .resize({
      width: config.fotos.larguraMax,
      height: config.fotos.larguraMax,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: config.fotos.qualidade })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({ width: config.fotos.larguraThumb, withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();

  await fs.writeFile(path.join(pastaAbs, nome), principal.data);
  await fs.writeFile(path.join(pastaAbs, nomeThumb), thumb);

  log.debug(
    { pautaId, nome, largura: principal.info.width, bytes: principal.data.length },
    'foto normalizada'
  );

  return {
    arquivo: path.join(pastaRel, nome),
    thumb: path.join(pastaRel, nomeThumb),
    largura: principal.info.width,
    altura: principal.info.height,
    bytes: principal.data.length,
  };
}

/** Confere que um arquivo ja tratado nao ficou com metadado sensivel. */
export async function temMetadadoSensivel(caminhoAbs) {
  const meta = await sharp(caminhoAbs).metadata();
  return Boolean(meta.exif || meta.icc || meta.iptc || meta.xmp);
}
