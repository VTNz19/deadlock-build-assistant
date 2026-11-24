# Deadlock Build Assistant

Assistente de builds para o jogo **Deadlock**: mostra as builds da comunidade na ordem em que vale comprar cada item e sugere o que levar contra cada inimigo.

> Projeto de fã, não afiliado à Valve. Deadlock e as imagens do jogo pertencem à Valve.

## O que faz

- **Builds da comunidade** de cada herói, em uma "comanda de compras": ordem dos itens, custo em almas e total acumulado. A ordem vem da hora média em que os jogadores compram cada item.
- **Itens mais fortes** por herói, com taxa de vitória e número de partidas.
- **Contra o inimigo:** itens que resolvem "muito dano de habilidade", "dano de disparo", "tanque" ou "cura", e quais itens vão melhor ou pior contra um herói específico.
- **Montar composição:** escolha seu herói, seu time e o time inimigo e veja a build adaptada para a partida.

## Como funciona

É um site estático (React + Vite + Tailwind + shadcn/ui). Os dados vêm direto do navegador para a [Deadlock API](https://deadlock-api.com), gratuita e mantida pela comunidade. Não há servidor nem chave de API.

Os números são estatísticas, não verdades: taxa de vitória mostra correlação, e o tipo de dano dos inimigos é uma estimativa feita pelos itens que os jogadores compram.

## Rodar localmente

```bash
npm install
npm run dev
```

## IA opcional

Existe um mini servidor (`server/`) que usa a API da Anthropic para refinar a ordem de compra. Ele é opcional e só funciona localmente: copie `.env.example` para `.env`, coloque sua chave e rode `npm run server` em outro terminal. No site publicado esse botão não aparece.

## Publicação

O site é publicado no GitHub Pages a cada push na branch `main` (veja `.github/workflows/deploy.yml`).
