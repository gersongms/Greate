import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dados, { recursive: true });
fs.mkdirSync(config.midia, { recursive: true });

export const db = new DatabaseSync(config.banco);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS pautas (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  grupo_jid       TEXT    NOT NULL,
  autor_jid       TEXT    NOT NULL,
  autor_nome      TEXT,
  texto_bruto     TEXT    NOT NULL DEFAULT '',
  recebida_em     TEXT    NOT NULL,
  fechada_em      TEXT,
  -- aberta: ainda juntando mensagens | fechada: pronta para redigir
  -- redigindo | rascunho | aprovada | publicada | recusada | erro
  estado          TEXT    NOT NULL DEFAULT 'aberta',
  erro            TEXT
);

CREATE TABLE IF NOT EXISTS mensagens (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pauta_id        INTEGER NOT NULL REFERENCES pautas(id) ON DELETE CASCADE,
  whatsapp_id     TEXT    NOT NULL UNIQUE,
  tipo            TEXT    NOT NULL,          -- texto | imagem
  texto           TEXT,
  recebida_em     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS fotos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pauta_id        INTEGER NOT NULL REFERENCES pautas(id) ON DELETE CASCADE,
  whatsapp_id     TEXT    NOT NULL UNIQUE,
  arquivo         TEXT    NOT NULL,          -- caminho relativo dentro de data/midia
  thumb           TEXT,
  largura         INTEGER,
  altura          INTEGER,
  bytes           INTEGER,
  legenda_wpp     TEXT,                      -- legenda que veio do WhatsApp
  alt             TEXT,                      -- alt text gerado na redacao
  -- o painel marca quais fotos entram na materia
  aprovada        INTEGER NOT NULL DEFAULT 1,
  ordem           INTEGER NOT NULL DEFAULT 0,
  recebida_em     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS materias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pauta_id        INTEGER NOT NULL UNIQUE REFERENCES pautas(id) ON DELETE CASCADE,
  titulo          TEXT    NOT NULL,
  subtitulo       TEXT,
  resumo          TEXT,
  corpo_html      TEXT    NOT NULL,
  categoria       TEXT,
  tags            TEXT,                      -- JSON array
  criada_em       TEXT    NOT NULL,
  editada_em      TEXT,
  publicada_em    TEXT,
  url_publicada   TEXT,
  id_externo      TEXT,                      -- id do post no WordPress, etc
  revisor         TEXT
);

CREATE TABLE IF NOT EXISTS eventos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pauta_id        INTEGER REFERENCES pautas(id) ON DELETE CASCADE,
  em              TEXT    NOT NULL,
  tipo            TEXT    NOT NULL,
  detalhe         TEXT
);

CREATE INDEX IF NOT EXISTS idx_pautas_estado   ON pautas(estado);
CREATE INDEX IF NOT EXISTS idx_fotos_pauta     ON fotos(pauta_id, ordem);
CREATE INDEX IF NOT EXISTS idx_mensagens_pauta ON mensagens(pauta_id);
CREATE INDEX IF NOT EXISTS idx_eventos_pauta   ON eventos(pauta_id, em);
`);

export const agora = () => new Date().toISOString();

export function registrarEvento(pautaId, tipo, detalhe) {
  db.prepare('INSERT INTO eventos (pauta_id, em, tipo, detalhe) VALUES (?, ?, ?, ?)')
    .run(pautaId ?? null, agora(), tipo, detalhe ? String(detalhe).slice(0, 2000) : null);
}

export function caminhoMidia(...partes) {
  return path.join(config.midia, ...partes);
}
