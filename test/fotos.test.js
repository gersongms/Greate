import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { normalizarFoto, temMetadadoSensivel } from '../src/media/fotos.js';
import { config } from '../src/config.js';

/** JPEG grande e com EXIF/GPS, como sai de um celular. */
async function fotoDeCelular() {
  return sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .withExif({
      IFD0: { Make: 'Apple', Model: 'iPhone 14' },
      GPS: { GPSLatitudeRef: 'S', GPSLongitudeRef: 'W' },
    })
    .jpeg()
    .toBuffer();
}

test('remove o EXIF (GPS inclusive) da foto publicada', async () => {
  const original = await fotoDeCelular();
  assert.ok((await sharp(original).metadata()).exif, 'a foto de teste deveria ter EXIF na entrada');

  const r = await normalizarFoto(original, { pautaId: 9999, whatsappId: 'teste-exif' });

  const abs = path.join(config.midia, r.arquivo);
  assert.equal(await temMetadadoSensivel(abs), false, 'a foto publicada não pode levar metadado');
});

test('reduz a foto para a largura maxima configurada e gera thumb', async () => {
  const r = await normalizarFoto(await fotoDeCelular(), { pautaId: 9999, whatsappId: 'teste-resize' });

  assert.equal(r.largura, config.fotos.larguraMax);
  assert.ok(r.bytes < 400 * 1024, `foto deveria ficar leve, ficou com ${r.bytes} bytes`);

  const thumb = await sharp(path.join(config.midia, r.thumb)).metadata();
  assert.equal(thumb.width, config.fotos.larguraThumb);
});

test('nao aumenta foto pequena', async () => {
  const pequena = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#888' },
  }).jpeg().toBuffer();

  const r = await normalizarFoto(pequena, { pautaId: 9999, whatsappId: 'teste-pequena' });
  assert.equal(r.largura, 320);
});

test.after(async () => {
  await fs.rm(path.join(config.midia, 'pautas', '9999'), { recursive: true, force: true });
});
