import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { config, validarConfig } from '../config.js';
import { log } from '../logger.js';
import { db, agora, registrarEvento } from '../db.js';
import { publicar, verificarDestino } from '../publisher/index.js';
import { limparHtml } from '../writer/article.js';
import { listagem, revisao, pagina, esc } from './views.js';

export function criarApp({ aoPublicar } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '2mb' }));
  app.use(cookieParser());

  // --- Autenticacao -------------------------------------------------------
  app.use((req, res, proximo) => {
    const enviado = req.headers.authorization || '';
    const [, base64] = enviado.split(' ');
    const [usuario, senha] = Buffer.from(base64 || '', 'base64').toString().split(':');

    if (igual(usuario, config.painel.usuario) && igual(senha, config.painel.senha)) return proximo();

    res.set('WWW-Authenticate', 'Basic realm="Painel de matérias", charset="UTF-8"');
    res.status(401).send('Acesso restrito.');
  });

  // --- CSRF (cookie + campo no formulario) --------------------------------
  app.use((req, res, proximo) => {
    let token = req.cookies?.csrf;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      res.cookie('csrf', token, { httpOnly: false, sameSite: 'strict', path: '/' });
    }
    req.csrf = token;

    if (req.method === 'POST' && !igual(req.body?._csrf, token)) {
      return res.status(403).send('Sessão expirou. Volte, recarregue a página e tente de novo.');
    }
    proximo();
  });

  // --- Fotos --------------------------------------------------------------
  app.use('/midia', express.static(config.midia, { maxAge: '7d', index: false, dotfiles: 'deny' }));

  // --- Listagem -----------------------------------------------------------
  app.get('/', (req, res) => {
    const rascunhos = db
      .prepare(
        `SELECT p.id AS pauta_id, p.autor_nome, p.recebida_em, m.titulo, m.resumo,
                (SELECT COUNT(*) FROM fotos f WHERE f.pauta_id = p.id AND f.aprovada = 1) AS fotos,
                (SELECT COUNT(*) FROM eventos e WHERE e.pauta_id = p.id AND e.tipo = 'pendencia') AS pendencias
         FROM pautas p JOIN materias m ON m.pauta_id = p.id
         WHERE p.estado = 'rascunho'
         ORDER BY p.recebida_em DESC`
      )
      .all();

    const recentes = db
      .prepare(
        `SELECT p.id, p.estado, p.recebida_em, p.fechada_em, p.erro,
                m.titulo, m.url_publicada
         FROM pautas p LEFT JOIN materias m ON m.pauta_id = p.id
         WHERE p.estado <> 'rascunho' AND p.estado <> 'aberta'
         ORDER BY COALESCE(p.fechada_em, p.recebida_em) DESC
         LIMIT 15`
      )
      .all();

    res.send(listagem({ rascunhos, recentes }));
  });

  // --- Revisao de uma pauta ----------------------------------------------
  app.get('/pauta/:id', (req, res) => {
    const dados = carregarPauta(req.params.id);
    if (!dados) return res.status(404).send(naoEncontrada());
    res.send(revisao({ ...dados, csrf: req.csrf, aviso: req.query.aviso }));
  });

  app.post('/pauta/:id', async (req, res) => {
    const dados = carregarPauta(req.params.id);
    if (!dados) return res.status(404).send(naoEncontrada());

    const { pauta, materia, fotos } = dados;
    if (pauta.estado !== 'rascunho') {
      return redirecionar(res, pauta.id, 'Esta pauta não está mais editável.');
    }

    const acao = req.body.acao;

    if (acao === 'recusar') {
      db.prepare("UPDATE pautas SET estado = 'recusada', fechada_em = ? WHERE id = ?").run(agora(), pauta.id);
      registrarEvento(pauta.id, 'recusada', 'descartada no painel');
      log.info({ pautaId: pauta.id }, 'pauta descartada no painel');
      return res.redirect('/');
    }

    // Salva as edicoes do revisor antes de qualquer coisa.
    const tags = String(req.body.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    db.prepare(
      `UPDATE materias SET titulo = ?, subtitulo = ?, resumo = ?, corpo_html = ?, tags = ?, editada_em = ?
       WHERE pauta_id = ?`
    ).run(
      String(req.body.titulo || '').trim() || materia.titulo,
      String(req.body.subtitulo || '').trim() || null,
      String(req.body.resumo || '').trim() || null,
      limparHtml(req.body.corpo_html),
      JSON.stringify(tags),
      agora(),
      pauta.id
    );

    for (const foto of fotos) {
      const marcada = req.body[`foto_${foto.id}`] ? 1 : 0;
      db.prepare('UPDATE fotos SET aprovada = ? WHERE id = ?').run(marcada, foto.id);
    }

    if (acao === 'salvar') {
      registrarEvento(pauta.id, 'editada', 'rascunho salvo no painel');
      return redirecionar(res, pauta.id, 'Rascunho salvo.');
    }

    if (acao !== 'aprovar') return redirecionar(res, pauta.id, 'Ação não reconhecida.');

    // --- Aprovacao: as tres confirmacoes sao obrigatorias no servidor ------
    if (!req.body.ok_imagem || !req.body.ok_fatos || !req.body.ok_leitura) {
      return redirecionar(res, pauta.id, 'Marque as três confirmações antes de aprovar.');
    }

    const atual = carregarPauta(pauta.id);
    const aprovadas = atual.fotos.filter((f) => f.aprovada);

    try {
      const r = await publicar({ materia: atual.materia, fotos: aprovadas, pauta });

      db.prepare(
        'UPDATE materias SET publicada_em = ?, url_publicada = ?, id_externo = ?, revisor = ? WHERE pauta_id = ?'
      ).run(agora(), r.url ?? null, r.idExterno ?? null, config.painel.usuario, pauta.id);
      db.prepare("UPDATE pautas SET estado = 'publicada', fechada_em = ? WHERE id = ?").run(agora(), pauta.id);

      registrarEvento(pauta.id, 'publicada', `${config.publicacao.destino} → ${r.url || r.estado}`);
      log.info({ pautaId: pauta.id, url: r.url, estado: r.estado }, 'matéria publicada');

      aoPublicar?.({ pauta, materia: atual.materia, resultado: r });
      return res.redirect('/');
    } catch (erro) {
      db.prepare('UPDATE pautas SET erro = ? WHERE id = ?').run(String(erro.message), pauta.id);
      registrarEvento(pauta.id, 'erro_publicacao', erro.message);
      log.error({ pautaId: pauta.id, erro: erro.message }, 'falha ao publicar');
      return redirecionar(res, pauta.id, `Não publicou: ${erro.message}`);
    }
  });

  app.get('/saude', (req, res) => {
    const porEstado = db.prepare('SELECT estado, COUNT(*) AS n FROM pautas GROUP BY estado').all();
    res.json({ ok: true, publicador: config.publicacao.destino, pautas: porEstado });
  });

  app.use((req, res) => res.status(404).send(naoEncontrada()));

  return app;
}

function carregarPauta(id) {
  const pauta = db.prepare('SELECT * FROM pautas WHERE id = ?').get(Number(id) || 0);
  if (!pauta) return null;

  const materia = db.prepare('SELECT * FROM materias WHERE pauta_id = ?').get(pauta.id) ?? null;
  const fotos = db.prepare('SELECT * FROM fotos WHERE pauta_id = ? ORDER BY ordem').all(pauta.id);
  const pendencias = db
    .prepare("SELECT detalhe FROM eventos WHERE pauta_id = ? AND tipo = 'pendencia' ORDER BY id")
    .all(pauta.id)
    .map((e) => e.detalhe);

  return { pauta, materia, fotos, pendencias };
}

const redirecionar = (res, id, aviso) =>
  res.redirect(`/pauta/${id}?aviso=${encodeURIComponent(aviso)}`);

const naoEncontrada = () =>
  pagina({ titulo: 'Não encontrada', corpo: '<div class="cartao vazio"><p>Pauta não encontrada.</p><p><a href="/">voltar</a></p></div>' });

/** Comparacao de tempo constante, para a senha nao vazar pelo tempo de resposta. */
function igual(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// Permite subir so o painel: `npm run web`
if (import.meta.url === `file://${process.argv[1]}`) {
  const problemas = validarConfig().filter((p) => !p.includes('WHATSAPP_GRUPO_JID'));
  if (problemas.length) {
    log.error({ problemas }, 'configuração incompleta');
    process.exit(1);
  }
  const d = await verificarDestino().catch((e) => ({ ok: false, detalhe: e.message }));
  log.info({ publicador: config.publicacao.destino, destino: d.detalhe }, 'publicador');
  criarApp().listen(config.painel.porta, () =>
    log.info(`painel em http://localhost:${config.painel.porta}`)
  );
}
