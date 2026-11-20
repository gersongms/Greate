# Matérias do WhatsApp → site do Colégio Genil

O professor posta no grupo do WhatsApp como já posta hoje. O sistema junta o
texto e as fotos, escreve a matéria no tom do colégio, e deixa um rascunho
esperando aprovação. Alguém lê, confere as fotos e publica.

```
Grupo do WhatsApp
      │  texto do professor + fotos
      ▼
  Ouvinte (Baileys) ──► agrupa em "pauta" (mesma pessoa, janela de 10 min)
      │
      ▼
  Fotos: gira, reduz, converte p/ webp e REMOVE O EXIF (GPS, aparelho)
      │
      ▼
  Redação (Claude) ──► título, subtítulo, corpo, tags, alt text, pendências
      │
      ▼
  Painel de aprovação ──► revisor edita, escolhe as fotos, confirma e aprova
      │
      ▼
  WordPress (rascunho ou publicado) │ arquivo Markdown │ nada
```

## Por que não é a API oficial do WhatsApp

A WhatsApp Business Cloud API da Meta **não lê nem envia mensagem em grupo** —
só conversa um-a-um. Para escutar um grupo, o único caminho é parear um número
como se fosse o WhatsApp Web, que é o que o Baileys faz aqui.

**Isso está fora dos Termos de Uso do WhatsApp e o número pode ser banido.**
Por isso:

- Use um **chip separado**, só para isso. Nunca o número oficial do colégio.
- O robô não marca mensagem como lida, não fica "online" e só fala no grupo
  para avisar que um rascunho ficou pronto. Quanto mais discreto, menor o risco.
- Se o número cair, o conserto é um chip novo e `npm run pareia` de novo. O
  banco de matérias e o histórico não se perdem.

## Instalação

Requer Node 22.5+ (usa o SQLite embutido do Node) ou Docker.

```bash
git clone <este-repositorio>
cd Greate
npm install
cp .env.example .env
```

Preencha o `.env`. O mínimo para funcionar:

| Variável | O que é |
|---|---|
| `WHATSAPP_GRUPO_JID` | o grupo monitorado — descubra com `npm run pareia` |
| `ANTHROPIC_API_KEY` | chave em console.anthropic.com → API keys |
| `PAINEL_SENHA` | senha do painel — gere com `openssl rand -base64 24` |
| `PUBLICADOR` | `wordpress`, `markdown` ou `nenhum` |

### 1. Parear o número

```bash
npm run pareia
```

Aparece um QR no terminal. No celular do **chip do colégio**:
WhatsApp → Dispositivos conectados → Conectar dispositivo.

Depois de conectar, o script lista os grupos daquele número com o JID de cada
um. Copie a linha `WHATSAPP_GRUPO_JID=...` do grupo certo para o `.env`.

A credencial fica em `data/sessao-whatsapp/`. Enquanto essa pasta existir não
pede QR de novo — é a pasta mais importante do projeto para não perder.

### 2. Testar sem mexer no grupo

```bash
npm run simular
```

Injeta uma pauta de mentira (texto de professor + 3 fotos), redige a matéria e
sobe o painel. Serve para ver como fica antes de ligar no grupo de verdade.

### 3. Subir

```bash
npm start           # ouvinte + relógio + painel, tudo junto
```

ou com Docker, que é o indicado no servidor:

```bash
docker compose up -d --build
docker compose logs -f          # o QR do pareamento aparece aqui na 1ª vez
```

## O painel

`http://localhost:3000` (usuário e senha do `.env`).

Cada rascunho mostra a mensagem original do professor ao lado da matéria
redigida, as fotos recebidas e o que o professor **não** informou. O revisor
edita o que quiser, desmarca a foto que não pode ir ao ar e aprova.

O botão de aprovar só libera com as três confirmações marcadas — e o servidor
confere de novo, para ninguém contornar pelo HTML:

1. autorização de uso de imagem de quem aparece nas fotos marcadas;
2. nomes, datas e números conferidos, sem `[CONFIRMAR]` sobrando;
3. matéria lida inteira.

## O que o sistema não faz, de propósito

- **Não inventa dado.** O redator trabalha só com o que o professor escreveu.
  Faltou a data, a série, o nome do professor? Entra `[CONFIRMAR: ...]` no texto
  e o item aparece destacado no painel. É de longe melhor que um número errado
  no site da escola.
- **Não descreve quem está na foto.** O modelo não vê as fotos — só lê a legenda
  que o professor escreveu. Então o alt text fica genérico em vez de afirmar
  quem aparece, quantos são ou como estão.
- **Não publica sozinho** (a menos que você mande: `PUBLICAR_COMO_RASCUNHO=false`
  e aprovação no painel).

## Ajustar o tom das matérias

Edite `editorial/manual.md`. Ele é lido a cada matéria gerada, não precisa
reiniciar nem mexer em código. É ali que se define título, estrutura, o que
evitar e o que nunca pode ser inventado.

Quanto mais específico o manual, melhor a matéria. Vale colar nele trechos de
duas ou três matérias que vocês já publicaram e gostaram.

## Configuração que vale conhecer

| Variável | Padrão | Para quê |
|---|---|---|
| `PAUTA_JANELA_MINUTOS` | 10 | Mensagens do mesmo professor dentro da janela viram **uma** matéria. Professor que manda texto e depois 8 fotos cabe nisso. |
| `WHATSAPP_GATILHO` | vazio | Se o grupo também serve para recado comum, ponha algo como `#materia`: só vira matéria a mensagem que contiver a palavra. |
| `WHATSAPP_AUTORES` | vazio | Lista de números autorizados a pautar. Vazio = qualquer um do grupo. |
| `PAUTA_MINIMO_CARACTERES` | 40 | Abaixo disso a pauta é descartada. Evita "bom dia" e figurinha virarem matéria. |
| `PUBLICAR_COMO_RASCUNHO` | true | `true` = entra como rascunho no WordPress, alguém publica lá. |
| `AVISAR_NO_GRUPO` | true | O robô responde no grupo quando o rascunho fica pronto e quando vai ao ar. |

## WordPress

`PUBLICADOR=wordpress` precisa de:

- `WP_URL` — a URL do site, sem barra no fim.
- `WP_USUARIO` — um usuário com permissão de publicar.
- `WP_SENHA_APP` — em WordPress → Usuários → seu perfil → **Application
  Passwords**. Não é a senha de login; é uma senha específica para API.
- `WP_CATEGORIA_ID` (opcional) — para as matérias caírem numa categoria.

As fotos sobem para a Biblioteca de Mídia com alt text e legenda, a primeira
vira imagem destacada, e a galeria entra no fim do texto.

Se der erro de "não é JSON", quase sempre é plugin de segurança (Wordfence,
iThemes) bloqueando a REST API — libere `/wp-json/wp/v2/`.

## Hospedagem

Precisa de uma máquina ligada 24h, porque a conexão com o WhatsApp é
permanente. Um VPS de 1 vCPU e 1 GB de RAM dá conta com folga (R$ 25–40/mês).

Hospedagem compartilhada **não serve** — não roda processo contínuo.

O painel deve ficar atrás de HTTPS. O compose publica só em `127.0.0.1`,
esperando um proxy reverso (Nginx, Caddy, Traefik) na frente. Sem HTTPS, a
senha do painel trafega em texto puro.

## Backup

Só a pasta `data/` importa:

```bash
tar czf backup-$(date +%F).tar.gz data/
```

Guarde fora do servidor. Ela tem a sessão do WhatsApp, o banco de matérias e as
fotos originais tratadas.

## Testes

```bash
npm test
```

## LGPD e imagem de menor

Nada no sistema confere se existe autorização de uso de imagem — isso é
decisão de gente, e por isso o painel força a confirmação explícita antes de
cada publicação.

O que ele faz por conta própria é remover o EXIF de toda foto. Foto de celular
carrega coordenada de GPS: publicar isso junto com imagem de criança entrega a
localização exata da escola. As fotos que vão ao ar saem limpas, e há teste
automatizado garantindo que continue assim.
