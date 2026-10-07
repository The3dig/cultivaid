"""Publica na Shopee todos os produtos da planilha do catálogo (a mesma de `python -m precificacao catalogo`).

Uso:
    python -m shopee_plugin.lote produtos.csv [--limite 10] [--sim]

- Preço: regra de precificação a partir do custo/gramas/horas da linha.
- Peso e medidas da planilha substituem a estimativa do Claude quando preenchidos.
- Já publicados ficam em publicados_shopee.json (sku -> item_id) e são pulados; dá para rodar de novo
  depois de acrescentar produtos.
"""
import argparse
import json
import os
import time
import traceback

from precificacao import carregar as carregar_precificacao
from precificacao.catalogo import _num, custo_da_linha, ler

from .config import carregar_config
from .publicar import preparar, resumo
from .shopee_api import ShopeeAPI

ARQUIVO_PUBLICADOS = "publicados_shopee.json"


def carregar_publicados(caminho: str = ARQUIVO_PUBLICADOS) -> dict:
    if os.path.exists(caminho):
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    return {}


def salvar_publicados(publicados: dict, caminho: str = ARQUIVO_PUBLICADOS) -> None:
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(publicados, f, ensure_ascii=False, indent=2)


def ajustar_item(item: dict, linha: dict) -> dict:
    """SKU, peso e medidas reais da planilha no lugar da estimativa feita pela foto."""
    item["item_sku"] = linha["sku"]
    peso = _num(linha.get("peso_g"))
    if peso:
        item["weight"] = round(max(peso / 1000, 0.01), 2)
    medidas = [_num(linha.get(k)) for k in ("comp_cm", "larg_cm", "alt_cm")]
    if all(medidas):
        item["dimension"] = {"package_length": int(round(medidas[0])), "package_width": int(round(medidas[1])),
                             "package_height": int(round(medidas[2]))}
    return item


def pendentes(linhas: list[dict], publicados: dict) -> list[dict]:
    return [l for l in linhas if l.get("sku") and l.get("fotos") and l["sku"] not in publicados]


def main() -> None:
    p = argparse.ArgumentParser(description="Publica a planilha do catálogo na Shopee.")
    p.add_argument("planilha")
    p.add_argument("--limite", type=int, help="publica no máximo N produtos nesta rodada")
    p.add_argument("--sim", action="store_true", help="publica sem pedir confirmação de cada um")
    args = p.parse_args()

    cfg = carregar_precificacao()
    pasta = os.path.dirname(os.path.abspath(args.planilha))
    publicados = carregar_publicados()
    fila = pendentes(ler(args.planilha), publicados)[: args.limite]
    print(f"{len(fila)} produto(s) para publicar ({len(publicados)} já publicados).")
    api = ShopeeAPI(carregar_config())

    for n, linha in enumerate(fila, 1):
        sku = linha["sku"]
        try:
            fotos = [f if os.path.isabs(f) else os.path.join(pasta, f) for f in linha["fotos"].split("|") if f.strip()]
            dica = ", ".join(x for x in (linha.get("nome"), linha.get("material"), linha.get("dica")) if x)
            custo = custo_da_linha(cfg, linha)
            anuncio, item = preparar(api, fotos, dica, estoque=int(_num(linha.get("estoque"), 1)), custo=custo)
            item = ajustar_item(item, linha)
            print(f"\n[{n}/{len(fila)}] {sku}\n{resumo(anuncio, item, custo)[:600]}")
            if not args.sim:
                resposta = input("\nPublicar? [s/N/q=parar] ").strip().lower()
                if resposta == "q":
                    break
                if resposta != "s":
                    continue
            resp = api.adicionar_item(item)
            publicados[sku] = resp.get("item_id")
            salvar_publicados(publicados)
            print(f"✅ {sku} publicado: item_id={resp.get('item_id')}")
            time.sleep(1)  # respeita o limite de chamadas da API
        except Exception as e:
            traceback.print_exc()
            print(f"❌ {sku}: {e} — seguindo para o próximo.")
    print(f"\nFim. Total publicado: {len(publicados)}.")


if __name__ == "__main__":
    main()
