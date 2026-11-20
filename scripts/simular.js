/**
 * Roda a esteira inteira sem WhatsApp: injeta uma pauta de mentira (texto de
 * professor + fotos), redige, e sobe o painel para você revisar e publicar.
 *
 * Uso: npm run simular
 *
 * Com ANTHROPIC_API_KEY no .env, a matéria é redigida de verdade. Sem a chave,
 * usa um texto de exemplo — serve para conferir o painel e a publicação.
 */
import sharp from 'sharp';
import { db, agora, registrarEvento } from '../src/db.js';
import { config } from '../src/config.js';
import { log } from '../src/logger.js';
import { registrarMensagem, processarPauta } from '../src/pipeline/pautas.js';
import { verificarDestino } from '../src/publisher/index.js';
import { criarApp } from '../src/web/server.js';

const GRUPO = config.whatsapp.grupo || 'simulacao@g.us';

const RELATO = `bom dia pessoal! hoje foi a culminância do projeto de horta com o 4º ano
as crianças plantaram alface rúcula e cebolinha nos canteiros que a gente montou
no mês passado. A profa Daniela trabalhou com eles a parte de ciências, germinação
e tal, e o pessoal da cozinha vai usar o que colher na merenda 🌱🥬
ficaram super empolgados, teve até quem falou que vai fazer horta em casa
mandando umas fotos`;

const LEGENDAS = [
  'turma do 4º ano nos canteiros',
  'plantando as mudas de alface',
  '',
];

/** Fotos de mentira, com EXIF, do tamanho que um celular manda. */
async function fotoFalsa(i) {
  const cores = ['#2d6a4f', '#40916c', '#52b788'];
  return sharp({
    create: { width: 3024, height: 4032, channels: 3, background: cores[i % 3] },
  })
    .withExif({ IFD0: { Make: 'samsung', Model: 'SM-A546E' }, GPS: { GPSLatitudeRef: 'S' } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

const carimbo = Date.now();
log.info('injetando pauta de simulação');

const { pautaId } = await registrarMensagem({
  grupoJid: GRUPO,
  autorJid: '5562999990000@s.whatsapp.net',
  autorNome: 'Profa. Daniela (simulação)',
  whatsappId: `sim-${carimbo}-texto`,
  tipo: 'texto',
  texto: RELATO,
});

for (const [i, legenda] of LEGENDAS.entries()) {
  await registrarMensagem({
    grupoJid: GRUPO,
    autorJid: '5562999990000@s.whatsapp.net',
    autorNome: 'Profa. Daniela (simulação)',
    whatsappId: `sim-${carimbo}-foto-${i}`,
    tipo: 'imagem',
    texto: legenda,
    imagem: await fotoFalsa(i),
  });
}

const fotos = db.prepare('SELECT COUNT(*) AS n FROM fotos WHERE pauta_id = ?').get(pautaId).n;
log.info({ pautaId, fotos }, 'pauta montada');

const pauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(pautaId);

if (config.redacao.chaveApi) {
  log.info('redigindo com a API...');
  const r = await processarPauta(pauta);
  log.info({ estado: r.estado }, r.estado === 'rascunho' ? `rascunho: "${r.materia.titulo}"` : 'não redigiu');
  if (r.erro) log.error(r.erro.message);
} else {
  log.warn('ANTHROPIC_API_KEY ausente — usando matéria de exemplo (o painel funciona igual)');
  db.prepare("UPDATE pautas SET estado = 'redigindo', fechada_em = ? WHERE id = ?").run(agora(), pautaId);
  db.prepare(
    `INSERT INTO materias (pauta_id, titulo, subtitulo, resumo, corpo_html, tags, criada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    pautaId,
    'Alunos do 4º ano colhem a primeira safra da horta',
    'Alface, rúcula e cebolinha plantadas pela turma vão para a merenda escolar',
    'A turma do 4º ano encerrou o projeto de horta com o plantio de alface, rúcula e cebolinha nos canteiros da escola.',
    `<p>A turma do 4º ano do ${config.redacao.colegio} encerrou nesta [CONFIRMAR: data da culminância] o projeto de horta escolar, com o plantio de alface, rúcula e cebolinha nos canteiros montados pelos próprios alunos no mês anterior.</p>
<p>O trabalho foi conduzido pela professora Daniela, que aproveitou a atividade para tratar de conteúdos de Ciências — entre eles o processo de germinação — a partir do que as crianças viam acontecer nos canteiros.</p>
<p>O que for colhido vai para a cozinha da escola e entra na merenda dos alunos, fechando o ciclo entre o que foi plantado e o que chega à mesa.</p>
<p>Segundo a professora, parte da turma manifestou interesse em montar hortas em casa — sinal de que a atividade passou dos muros da escola.</p>`,
    JSON.stringify(['horta escolar', 'ensino fundamental', '4º ano', 'ciências']),
    agora()
  );
  for (const [i, f] of db.prepare('SELECT * FROM fotos WHERE pauta_id = ? ORDER BY ordem').all(pautaId).entries()) {
    db.prepare('UPDATE fotos SET alt = ? WHERE id = ?').run(
      ['Alunos do 4º ano nos canteiros da horta escolar',
       'Aluno plantando muda de alface no canteiro',
       'Canteiros da horta da escola'][i] ?? 'Registro da atividade na horta escolar',
      f.id
    );
  }
  registrarEvento(pautaId, 'pendencia', 'data exata da culminância do projeto');
  db.prepare("UPDATE pautas SET estado = 'rascunho' WHERE id = ?").run(pautaId);
}

const d = await verificarDestino().catch((e) => ({ detalhe: e.message }));
log.info({ publicador: config.publicacao.destino }, d.detalhe);

criarApp().listen(config.painel.porta, () => {
  log.info(`painel em http://localhost:${config.painel.porta}  (usuário: ${config.painel.usuario})`);
  log.info(`rascunho da simulação: http://localhost:${config.painel.porta}/pauta/${pautaId}`);
});
