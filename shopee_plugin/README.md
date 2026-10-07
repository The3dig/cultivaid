# Plugin Shopee — foto → anúncio publicado

Você manda a foto. O Claude analisa a imagem e escreve título, descrição, preço sugerido,
peso e medidas. A Shopee indica a categoria, o Claude preenche os atributos obrigatórios,
e o produto é publicado na sua loja.

## 1. Configuração (uma vez)

1. Crie um app em https://open.shopee.com (Console → App) e anote `Partner ID` e `Partner Key`.
2. Copie `.env.example` para `.env`, preencha e carregue: `set -a; . ./.env; set +a`
3. Instale: `pip install -r requirements.txt`
4. Conecte sua loja: `python -m shopee_plugin.publicar autorizar`
   (abre um link; depois de autorizar, cole o `code` que aparece na URL de retorno).

## 2. Publicar pelo computador

```bash
python -m shopee_plugin.publicar foto.jpg --preco 49.90 --estoque 10
```
Mostra a prévia e pergunta antes de publicar (`--sim` publica direto).
Sem `--preco`, usa o preço sugerido pelo Claude.

## 3. Publicar pelo celular (Telegram)

1. Crie um bot com o @BotFather e coloque o token em `TELEGRAM_BOT_TOKEN`.
2. Coloque seu chat id em `TELEGRAM_CHAT_ID` (só você poderá usar o bot).
3. Rode `python -m shopee_plugin.bot_telegram` num computador/servidor ligado.
4. Mande a foto pro bot (legenda opcional: `preço 49,90 estoque 10 tamanho M`),
   confira a prévia e responda **ok**.

## Observações
- Marca vai como "NoBrand"; ajuste no anúncio se o produto tiver marca registrada.
- Todos os canais de frete habilitados na loja são ativados no produto.
- Teste primeiro com `SHOPEE_AMBIENTE=sandbox`.
