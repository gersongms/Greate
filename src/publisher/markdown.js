import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const md = () => config.publicacao.markdown;

export async function verificar() {
  await fs.mkdir(md().pasta, { recursive: true });
  return { ok: true, detalhe: `escrevendo em ${md().pasta}` };
}

function slug(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

export async function publicar({ materia, fotos, pauta }) {
  await fs.mkdir(md().pasta, { recursive: true });
  await fs.mkdir(md().pastaImagens, { recursive: true });

  const data = (materia.publicada_em || pauta.recebida_em || new Date().toISOString()).slice(0, 10);
  const nomeBase = `${data}-${slug(materia.titulo)}`;

  const imagens = [];
  for (const [i, foto] of fotos.entries()) {
    const destino = `${nomeBase}-${i + 1}.webp`;
    await fs.copyFile(path.join(config.midia, foto.arquivo), path.join(md().pastaImagens, destino));
    imagens.push({
      arquivo: path.relative(md().pasta, path.join(md().pastaImagens, destino)).split(path.sep).join('/'),
      alt: foto.alt || '',
      legenda: foto.legenda_wpp || '',
    });
  }

  const tags = JSON.parse(materia.tags || '[]');
  const frente = [
    '---',
    `titulo: ${aspas(materia.titulo)}`,
    materia.subtitulo ? `subtitulo: ${aspas(materia.subtitulo)}` : null,
    `resumo: ${aspas(materia.resumo || '')}`,
    `data: ${data}`,
    `rascunho: ${config.publicacao.comoRascunho}`,
    tags.length ? `tags:\n${tags.map((t) => `  - ${aspas(t)}`).join('\n')}` : null,
    imagens.length ? `capa: ${aspas(imagens[0].arquivo)}` : null,
    imagens.length
      ? `galeria:\n${imagens
          .map((im) => `  - arquivo: ${aspas(im.arquivo)}\n    alt: ${aspas(im.alt)}${im.legenda ? `\n    legenda: ${aspas(im.legenda)}` : ''}`)
          .join('\n')}`
      : null,
    '---',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const caminho = path.join(md().pasta, `${nomeBase}.md`);
  await fs.writeFile(caminho, frente + materia.corpo_html + '\n');

  return { idExterno: nomeBase, url: caminho, estado: config.publicacao.comoRascunho ? 'draft' : 'publish' };
}

const aspas = (s) => JSON.stringify(String(s ?? ''));
