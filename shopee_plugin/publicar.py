"""Foto -> anúncio -> publicado na Shopee.

Uso:
    python -m shopee_plugin.publicar autorizar               # uma vez, para conectar a loja
    python -m shopee_plugin.publicar foto.jpg [foto2.jpg ...] [--preco 49.90] [--estoque 10] [--dica "..."] [--sim]

Preço: --preco manda; senão --custo (ou --gramas/--horas da peça 3D) calcula pela regra de
precificação (precificacao/); senão usa o preço sugerido pelo Claude.
"""
import argparse

from precificacao import carregar as carregar_precificacao
from precificacao import custo_peca, precificar, simular

from .config import carregar_config
from .gerador import Anuncio, gerar_anuncio, preencher_atributos
from .shopee_api import ShopeeAPI


def montar_item(anuncio: Anuncio, image_ids: list[int], category_id: int, logistica: list[int],
                atributos: list[dict], preco: float, estoque: int, listar: bool = True) -> dict:
    item = {
        "item_name": anuncio.titulo[:100],
        "description": anuncio.descricao,
        "original_price": round(preco, 2),
        "seller_stock": [{"stock": estoque}],
        "weight": round(max(anuncio.peso_kg, 0.01), 2),
        "dimension": {"package_length": anuncio.comprimento_cm, "package_width": anuncio.largura_cm,
                      "package_height": anuncio.altura_cm},
        "image": {"image_id_list": image_ids},
        "category_id": category_id,
        "brand": {"brand_id": 0, "original_brand_name": "NoBrand"},
        "logistic_info": [{"logistic_id": lid, "enabled": True} for lid in logistica],
        "condition": "NEW",
        "item_status": "NORMAL" if listar else "UNLIST",
    }
    if atributos:
        item["attribute_list"] = atributos
    return item


def custo_impressao(gramas: float, horas: float, material: str = "PLA", minutos: float = 10,
                    extras: float = 0.0) -> float:
    return custo_peca(carregar_precificacao(), gramas, horas, material, minutos, extras).total


def preco_por_custo(custo: float) -> float:
    """Menor preço na Shopee que cobre custo, comissão e imposto com a margem configurada."""
    return precificar(carregar_precificacao(), "shopee", custo).preco


def preparar(api: ShopeeAPI, fotos: list[str], dica: str = "", preco: float | None = None,
             estoque: int = 1, custo: float | None = None) -> tuple[Anuncio, dict]:
    """Gera o anúncio e monta o corpo do add_item, sem publicar."""
    if preco is None and custo is not None:
        preco = preco_por_custo(custo)
    anuncio = gerar_anuncio(fotos, dica)
    categorias = api.recomendar_categoria(anuncio.titulo)
    if not categorias:
        raise RuntimeError("A Shopee não recomendou categoria para este título.")
    category_id = categorias[0]
    atributos = preencher_atributos(anuncio, api.atributos_obrigatorios(category_id))
    image_ids = [api.subir_imagem(f) for f in fotos[:9]]
    item = montar_item(anuncio, image_ids, category_id, api.canais_logistica(), atributos,
                       preco if preco is not None else anuncio.preco_sugerido, estoque)
    return anuncio, item


def resumo(anuncio: Anuncio, item: dict, custo: float | None = None) -> str:
    lucro = ""
    if custo is not None:
        r = simular(carregar_precificacao(), "shopee", custo, item["original_price"])
        lucro = f"\n📊 custo R$ {custo:.2f} | comissão R$ {r.comissao:.2f} | lucro R$ {r.lucro:.2f} ({r.margem:.0%})"
    return (f"📦 {item['item_name']}\n💰 R$ {item['original_price']:.2f} | estoque {item['seller_stock'][0]['stock']}"
            f" | categoria {item['category_id']} | {item['weight']} kg{lucro}\n\n{anuncio.descricao}")


def main() -> None:
    p = argparse.ArgumentParser(description="Publica produto na Shopee a partir de fotos.")
    p.add_argument("fotos", nargs="+", help="caminho das fotos, ou 'autorizar'")
    p.add_argument("--preco", type=float, help="preço em R$ (padrão: calculado pelo custo, ou sugerido pelo Claude)")
    p.add_argument("--custo", type=float, help="custo da unidade em R$; o preço sai da regra de precificação")
    p.add_argument("--gramas", type=float, help="peça 3D: filamento usado (calcula o custo)")
    p.add_argument("--horas", type=float, help="peça 3D: tempo de impressão")
    p.add_argument("--material", default="PLA")
    p.add_argument("--minutos", type=float, default=10, help="peça 3D: seu tempo de acabamento/embalagem")
    p.add_argument("--extras", type=float, default=0.0, help="peça 3D: ímãs, parafusos... em R$")
    p.add_argument("--estoque", type=int, default=1)
    p.add_argument("--dica", default="", help="info extra: tamanho, material, etc.")
    p.add_argument("--sim", action="store_true", help="publica sem pedir confirmação")
    args = p.parse_args()

    api = ShopeeAPI(carregar_config())
    if args.fotos == ["autorizar"]:
        print("1) Abra este link e autorize a loja:\n" + api.link_autorizacao())
        api.trocar_codigo(input("2) Cole aqui o 'code' que aparece na URL de retorno: ").strip())
        print("Loja conectada!")
        return

    custo = args.custo
    if custo is None and args.gramas is not None and args.horas is not None:
        custo = custo_impressao(args.gramas, args.horas, args.material, args.minutos, args.extras)
    anuncio, item = preparar(api, args.fotos, args.dica, args.preco, args.estoque, custo)
    print(resumo(anuncio, item, custo))
    if not args.sim and input("\nPublicar? [s/N] ").strip().lower() != "s":
        print("Cancelado.")
        return
    resp = api.adicionar_item(item)
    print(f"✅ Publicado! item_id={resp.get('item_id')}")


if __name__ == "__main__":
    main()
