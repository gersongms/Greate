import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Banco proprio para o teste, definido antes de qualquer import do projeto.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'genil-test-'));
process.env.DATA_DIR = temp;
process.env.WHATSAPP_GRUPO_JID = '123@g.us';
process.env.PAUTA_JANELA_MINUTOS = '10';
process.env.PAUTA_MINIMO_CARACTERES = '40';
process.env.PAUTA_MAX_FOTOS = '2';

let db, registrarMensagem, pautasVencidas, processarPauta, sharp;

before(async () => {
  ({ db } = await import('../src/db.js'));
  ({ registrarMensagem, pautasVencidas, processarPauta } = await import('../src/pipeline/pautas.js'));
  ({ default: sharp } = await import('sharp'));
});

after(() => fs.rmSync(temp, { recursive: true, force: true }));

const base = (extra) => ({
  grupoJid: '123@g.us',
  autorJid: '5562900000001@s.whatsapp.net',
  autorNome: 'Prof. Teste',
  tipo: 'texto',
  ...extra,
});

const foto = () =>
  sharp({ create: { width: 600, height: 400, channels: 3, background: '#456' } }).jpeg().toBuffer();

test('junta varias mensagens do mesmo autor numa unica pauta', async () => {
  const a = await registrarMensagem(base({ whatsappId: 'm1', texto: 'Primeira parte do relato.' }));
  const b = await registrarMensagem(base({ whatsappId: 'm2', texto: 'Esqueci de falar que também teve apresentação.' }));

  assert.equal(a.pautaId, b.pautaId, 'mensagens seguidas do mesmo autor deveriam cair na mesma pauta');

  const pauta = db.prepare('SELECT texto_bruto FROM pautas WHERE id = ?').get(a.pautaId);
  assert.match(pauta.texto_bruto, /Primeira parte/);
  assert.match(pauta.texto_bruto, /apresentação/);
});

test('autores diferentes abrem pautas diferentes', async () => {
  const a = await registrarMensagem(base({ whatsappId: 'd1', texto: 'Relato do professor A.' }));
  const b = await registrarMensagem(
    base({ whatsappId: 'd2', texto: 'Relato do professor B.', autorJid: '5562900000002@s.whatsapp.net' })
  );
  assert.notEqual(a.pautaId, b.pautaId);
});

test('ignora mensagem repetida (mesmo id do WhatsApp)', async () => {
  await registrarMensagem(base({ whatsappId: 'rep1', texto: 'Texto qualquer.' }));
  const r = await registrarMensagem(base({ whatsappId: 'rep1', texto: 'Texto qualquer.' }));
  assert.equal(r.pautaId, null);
  assert.equal(r.motivo, 'mensagem repetida');
});

test('respeita o limite de fotos por pauta', async () => {
  const autorJid = '5562900000003@s.whatsapp.net';
  const img = await foto();
  let pautaId;
  for (let i = 0; i < 4; i++) {
    const r = await registrarMensagem(
      base({ autorJid, whatsappId: `lim${i}`, tipo: 'imagem', texto: '', imagem: img })
    );
    pautaId = r.pautaId;
  }
  const n = db.prepare('SELECT COUNT(*) AS n FROM fotos WHERE pauta_id = ?').get(pautaId).n;
  assert.equal(n, 2, 'deveria parar em PAUTA_MAX_FOTOS=2');
});

test('legenda de foto entra no texto da pauta', async () => {
  const autorJid = '5562900000004@s.whatsapp.net';
  const r = await registrarMensagem(
    base({ autorJid, whatsappId: 'leg1', tipo: 'imagem', texto: 'alunos na feira', imagem: await foto() })
  );
  const p = db.prepare('SELECT texto_bruto FROM pautas WHERE id = ?').get(r.pautaId);
  assert.match(p.texto_bruto, /alunos na feira/);
});

test('descarta pauta sem texto suficiente, sem chamar a API', async () => {
  const autorJid = '5562900000005@s.whatsapp.net';
  const r = await registrarMensagem(base({ autorJid, whatsappId: 'curto', texto: 'bom dia' }));
  const pauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(r.pautaId);

  const res = await processarPauta(pauta);

  assert.equal(res.estado, 'recusada');
  const depois = db.prepare('SELECT estado, erro FROM pautas WHERE id = ?').get(r.pautaId);
  assert.equal(depois.estado, 'recusada');
  assert.match(depois.erro, /curto demais/);
});

test('so lista como vencida a pauta parada ha mais que a janela', async () => {
  const autorJid = '5562900000006@s.whatsapp.net';
  const r = await registrarMensagem(base({ autorJid, whatsappId: 'nova', texto: 'Relato recém-chegado no grupo.' }));

  assert.ok(!pautasVencidas().some((p) => p.id === r.pautaId), 'pauta recém-criada não está vencida');

  // Envelhece a mensagem em 20 minutos.
  const velho = new Date(Date.now() - 20 * 60_000).toISOString();
  db.prepare('UPDATE mensagens SET recebida_em = ? WHERE pauta_id = ?').run(velho, r.pautaId);
  db.prepare('UPDATE pautas SET recebida_em = ? WHERE id = ?').run(velho, r.pautaId);

  assert.ok(pautasVencidas().some((p) => p.id === r.pautaId), 'pauta parada há 20 min deveria estar vencida');
});
