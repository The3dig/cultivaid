"""Parâmetros padrão: custos da impressão 3D, impostos, margem e taxas de cada canal.

Tudo pode ser sobrescrito num arquivo JSON (gere o modelo com `python -m precificacao config`).
O arquivo é procurado em $PRECIFICACAO_CONFIG ou ./precificacao.json.

Taxas conferidas em out/2026 — confira nos simuladores oficiais de tempos em tempos,
os marketplaces mudam as regras com frequência.
"""
import copy
import json
import os

PADRAO = {
    # ---- Impressão 3D ----
    "impressao": {
        "materiais_r_kg": {"PLA": 110.0, "PETG": 120.0, "ABS": 115.0, "TPU": 160.0, "RESINA": 250.0},
        "potencia_w": 150,               # consumo médio da impressora imprimindo
        "kwh_r": 0.95,                   # tarifa de energia com impostos
        "preco_impressora_r": 5000.0,
        "vida_util_h": 5000,             # horas até "pagar" a impressora
        "manutencao_r_h": 0.30,          # bico, correia, mesa, graxa... por hora
        "taxa_falha": 0.10,              # 10% das impressões dão errado e são refeitas
        "mao_de_obra_r_h": 30.0,         # valor da sua hora (fatiar, tirar suporte, lixar, embalar)
        "embalagem_r": 2.50,             # caixa/saco, plástico bolha, etiqueta
        "impressoras": 1,                # quantas impressoras você tem
        "horas_dia": 18,                 # horas por dia que cada uma imprime de verdade
    },
    # ---- Negócio ----
    "imposto": 0.06,                     # Simples Nacional anexo I ≈ 4–6%; MEI: use 0
    "margem": 0.20,                      # lucro desejado, % do preço de venda
    "lucro_minimo_r": 3.00,              # lucro mínimo em R$ por unidade
    "arredondar": True,                  # termina o preço em ,90
    # Os canais da sua carteira (comando `catalogo`). Troque à vontade pelas chaves de "canais".
    "carteira": ["shopee", "tiktok", "ml_classico", "amazon", "magalu", "elo7"],
    # ---- Canais ----
    # Cada faixa vale até o preço "ate" (null = sem limite):
    #   comissao = max(pct * preço, minimo) + fixo ; frete = custo de envio pago pelo vendedor.
    # "adicionais" valem em qualquer faixa: pct * preço, limitado a "teto" (R$) se houver.
    "canais": {
        "shopee": {
            "nome": "Shopee (CNPJ)",
            "faixas": [  # tabela única desde 01/03/2026
                {"ate": 79.99, "pct": 0.20, "fixo": 4.00},
                {"ate": 99.99, "pct": 0.14, "fixo": 16.00},
                {"ate": 199.99, "pct": 0.14, "fixo": 20.00},
                {"ate": 499.99, "pct": 0.14, "fixo": 26.00},
                {"ate": None, "pct": 0.14, "fixo": 28.00},
            ],
        },
        "shopee_cpf": {
            "nome": "Shopee (CPF)",
            "ativo": False,              # vendedor CPF paga R$ 3 a mais por item
            "faixas": [
                {"ate": 79.99, "pct": 0.20, "fixo": 7.00},
                {"ate": 99.99, "pct": 0.14, "fixo": 19.00},
                {"ate": 199.99, "pct": 0.14, "fixo": 23.00},
                {"ate": 499.99, "pct": 0.14, "fixo": 29.00},
                {"ate": None, "pct": 0.14, "fixo": 31.00},
            ],
        },
        "ml_classico": {
            "nome": "Mercado Livre Clássico",
            # Comissão 10–14% conforme categoria. Abaixo de R$ 79 há um custo operacional
            # por peso (desde 02/03/2026); acima, frete grátis obrigatório pago pelo vendedor.
            # Ajuste "fixo" e "frete" com o simulador do ML para o peso da sua peça.
            "faixas": [
                {"ate": 78.99, "pct": 0.13, "fixo": 6.50},
                {"ate": None, "pct": 0.13, "fixo": 0.00, "frete": 22.00},
            ],
        },
        "ml_premium": {
            "nome": "Mercado Livre Premium",
            "faixas": [
                {"ate": 78.99, "pct": 0.18, "fixo": 6.50},
                {"ate": None, "pct": 0.18, "fixo": 0.00, "frete": 22.00},
            ],
        },
        "amazon": {
            "nome": "Amazon (DBA)",
            # Comissão 8–15% conforme categoria (mínimo R$ 1). Plano Profissional (R$ 19/mês) sem taxa por item.
            "faixas": [
                {"ate": 29.99, "pct": 0.12, "minimo": 1.00, "fixo": 4.50},
                {"ate": 49.99, "pct": 0.12, "minimo": 1.00, "fixo": 6.50},
                {"ate": 78.99, "pct": 0.12, "minimo": 1.00, "fixo": 6.75},
                {"ate": None, "pct": 0.12, "minimo": 1.00, "fixo": 0.00, "frete": 20.00},
            ],
        },
        "tiktok": {
            "nome": "TikTok Shop",
            # Tabela desde 15/07/2026. Novos vendedores: 0% de comissão por 60 dias (até R$ 17 mil).
            "faixas": [
                {"ate": 49.99, "pct": 0.10, "fixo": 4.00},
                {"ate": None, "pct": 0.06, "fixo": 6.00},
            ],
            "adicionais": [
                {"nome": "Programa de frete grátis", "pct": 0.06, "teto": 50.00},
            ],
        },
        "tiktok_afiliado": {
            "nome": "TikTok Shop + afiliado",
            # Mesmo canal, vendendo por vídeo de afiliado/criador. A comissão do afiliado você define
            # no Seller Center (costuma ficar entre 8% e 15%).
            "faixas": [
                {"ate": 49.99, "pct": 0.10, "fixo": 4.00},
                {"ate": None, "pct": 0.06, "fixo": 6.00},
            ],
            "adicionais": [
                {"nome": "Programa de frete grátis", "pct": 0.06, "teto": 50.00},
                {"nome": "Afiliado", "pct": 0.10},
            ],
        },
        "magalu": {
            "nome": "Magalu",
            # Comissão 10–18% conforme categoria (novos sellers: 9,9% por 3 meses) + R$ 5 por pedido.
            # Desde 2026 o frete grátis não é mais bancado pelo Magalu: informe o seu em "frete".
            "faixas": [{"ate": None, "pct": 0.16, "fixo": 5.00}],
        },
        "elo7": {
            "nome": "Elo7",
            # 18% exposição padrão (20% máxima) + R$ 3,99 por item; acima de R$ 79,90 + R$ 6 de frete.
            "faixas": [
                {"ate": 79.89, "pct": 0.18, "fixo": 3.99},
                {"ate": None, "pct": 0.18, "fixo": 3.99, "frete": 6.00},
            ],
        },
        "shein": {
            "nome": "Shein",
            # 18% na maioria das categorias (20% moda feminina), sem taxa fixa. Só CNPJ/MEI.
            # Novos vendedores: 90 dias sem comissão.
            "faixas": [{"ate": None, "pct": 0.18, "fixo": 0.00}],
        },
        "aliexpress": {
            "nome": "AliExpress",
            # 5–10% conforme categoria (casa/móveis 5%, moda/beleza 8%), sem mensalidade.
            "faixas": [{"ate": None, "pct": 0.08, "fixo": 0.00}],
        },
        "direta": {
            "nome": "Venda direta (Pix/cartão)",
            "faixas": [{"ate": None, "pct": 0.04, "fixo": 0.00}],
        },
    },
}


def _mesclar(base: dict, extra: dict) -> dict:
    for k, v in extra.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict) and k != "faixas":
            _mesclar(base[k], v)
        else:
            base[k] = v
    return base


def carregar(caminho: str | None = None) -> dict:
    """Configuração padrão + o que estiver no JSON do usuário (se existir)."""
    cfg = copy.deepcopy(PADRAO)
    caminho = caminho or os.environ.get("PRECIFICACAO_CONFIG", "precificacao.json")
    if os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as f:
            _mesclar(cfg, json.load(f))
    return cfg
