# Precificação multicanal + custo de peças 3D

Calcula **quanto custa** cada peça impressa e **por quanto vender** em cada canal
(Shopee, Mercado Livre Clássico/Premium, Amazon, TikTok Shop, Magalu, Elo7, Shein, AliExpress,
venda direta) para sobrar a margem que você quer,
já descontando comissão, taxa fixa por item, frete grátis pago por você e imposto.

## Uso rápido

```bash
# Peça 3D: gramas e horas vêm do fatiador (Cura/Bambu/Orca/Prusa)
python -m precificacao peca --gramas 45 --horas 3.5 --material PETG --minutos 15 --extras 2

# Produto qualquer (comprado/revenda): só o custo da unidade
python -m precificacao preco --custo 18.50

# Já tem um preço em mente? Veja quanto sobra em cada canal
python -m precificacao simular --custo 18.50 --preco 49.90

# Opções: --canais shopee,amazon   --margem 0.25   --frete 25
```

Exemplo (45 g de PLA, 3,5 h):

```
Custo da peça: R$ 18,50 (filamento 4,95 · energia 0,50 · desgaste 3,50 · manutenção 1,05
               · falhas 1,00 · mão de obra 5,00 · embalagem 2,50)

Canal                            Preço    Comissão     Frete   Imposto      Lucro  Margem
Shopee (CNPJ)                 R$ 41,90    R$ 12,38   R$ 0,00   R$ 2,51    R$ 8,51     20%
Mercado Livre Clássico        R$ 41,90    R$ 11,95   R$ 0,00   R$ 2,51    R$ 8,94     21%
Mercado Livre Premium         R$ 44,90    R$ 14,58   R$ 0,00   R$ 2,69    R$ 9,13     20%
Amazon (DBA)                  R$ 40,90    R$ 11,41   R$ 0,00   R$ 2,45    R$ 8,54     21%
TikTok Shop                   R$ 38,90    R$ 10,22   R$ 0,00   R$ 2,33    R$ 7,85     20%
TikTok Shop + afiliado        R$ 46,90    R$ 16,19   R$ 0,00   R$ 2,81    R$ 9,40     20%
Magalu                        R$ 40,90    R$ 11,54   R$ 0,00   R$ 2,45    R$ 8,41     21%
Elo7                          R$ 40,90    R$ 11,35   R$ 0,00   R$ 2,45    R$ 8,60     21%
Shein                         R$ 33,90     R$ 6,10   R$ 0,00   R$ 2,03    R$ 7,27     21%
AliExpress                    R$ 28,90     R$ 2,31   R$ 0,00   R$ 1,73    R$ 6,36     22%
Venda direta (Pix/cartão)     R$ 26,90     R$ 1,08   R$ 0,00   R$ 1,61    R$ 5,71     21%
```

## Ajuste para a sua realidade (importante)

```bash
python -m precificacao config     # cria precificacao.json
```

Edite no arquivo:

| Campo | O que é |
|---|---|
| `impressao.materiais_r_kg` | preço que você paga no kg de cada filamento/resina |
| `impressao.potencia_w`, `kwh_r` | consumo da impressora e tarifa da sua conta de luz |
| `impressao.preco_impressora_r`, `vida_util_h` | quanto custou a impressora e em quantas horas quer "pagá-la" |
| `impressao.taxa_falha` | fração de impressões perdidas (0.10 = 10%) |
| `impressao.mao_de_obra_r_h` | quanto vale sua hora |
| `imposto` | alíquota sobre a venda (Simples ≈ 0.04–0.06; MEI: 0) |
| `margem`, `lucro_minimo_r` | lucro desejado: % do preço e mínimo em R$ por unidade |
| `canais.*.faixas` | comissão por faixa de preço: `pct`, `fixo`, `minimo`, `frete` |
| `canais.*.adicionais` | taxas em qualquer faixa, com teto opcional: `pct`, `teto` (ex.: afiliado do TikTok) |

Para desligar um canal: `"canais": {"ml_premium": {"ativo": false}}`. Vende como CPF na Shopee?
Ligue `shopee_cpf` e desligue `shopee`.

## Como o preço é calculado

Lucro = preço − comissão − frete − imposto − custo, e o programa acha o **menor preço** com
lucro ≥ margem × preço e ≥ lucro mínimo. Como as comissões mudam por faixa de preço
(ex.: Shopee 20% + R$ 4 até R$ 79,99, depois 14% + R$ 16), ele testa cada faixa e, ao arredondar
para ,90, confere de novo para não cair numa faixa pior.

## Taxas padrão (conferidas em out/2026 — confirme nos simuladores oficiais)

- **Shopee CNPJ** (desde 01/03/2026): até R$ 79,99 → 20% + R$ 4; R$ 80–99,99 → 14% + R$ 16;
  R$ 100–199,99 → 14% + R$ 20; R$ 200–499,99 → 14% + R$ 26; acima → 14% + R$ 28. CPF: + R$ 3/item.
- **Mercado Livre**: Clássico 10–14%, Premium 15–19% (padrão 13% / 18%). Abaixo de R$ 79 há custo
  operacional por peso (padrão R$ 6,50); a partir de R$ 79 o frete grátis é seu (padrão R$ 22 —
  ajuste pelo peso da peça ou use `--frete`).
- **Amazon (DBA)**: comissão 8–15% conforme categoria (padrão 12%, mínimo R$ 1); taxa por item
  R$ 4,50 (< R$ 30), R$ 6,50 (R$ 30–49,99), R$ 6,75 (R$ 50–78,99); acima disso frete por peso (padrão R$ 20).
- **TikTok Shop** (desde 15/07/2026): abaixo de R$ 50 → 10% + R$ 4; a partir de R$ 50 → 6% + R$ 6;
  programa de frete grátis + 6% (teto R$ 50/item). A linha "+ afiliado" soma 10% para o criador
  (ajuste em `tiktok_afiliado.adicionais`; costuma ser 8–15%). Novos vendedores: 0% por 60 dias.
- **Magalu**: 10–18% conforme categoria (padrão 16%) + R$ 5 por pedido; novos sellers 9,9% por 3 meses.
  O Magalu deixou de bancar o frete grátis — se você paga frete, use `--frete` ou ajuste `frete`.
- **Elo7**: 18% (exposição padrão; 20% na máxima) + R$ 3,99 por item; acima de R$ 79,90 + R$ 6 de frete.
- **Shein**: 18% na maioria das categorias (20% moda feminina), sem taxa fixa; só CNPJ/MEI;
  90 dias sem comissão para novos.
- **AliExpress**: 5–10% conforme categoria (padrão 8%), sem mensalidade.
- **Venda direta**: 4% de taxa de maquininha/gateway.

## No plugin da Shopee

O plugin (`shopee_plugin/`) usa esta regra no lugar do preço sugerido pelo Claude:

```bash
python -m shopee_plugin.publicar foto.jpg --gramas 45 --horas 3.5 --material PLA
python -m shopee_plugin.publicar foto.jpg --custo 18.50
```

No Telegram, legenda: `gramas 45 horas 3,5 PETG` ou `custo 18,50`. A prévia mostra custo,
comissão e lucro. Se você informar `preço`, ele continua valendo.
