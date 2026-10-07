"""Precificação multicanal e custo de peças 3D.

Uso:
    python -m precificacao peca --gramas 45 --horas 3.5 [--material PETG] [--minutos 15] [--extras 2]
    python -m precificacao preco --custo 18.50
    python -m precificacao simular --custo 18.50 --preco 49.90
    python -m precificacao config            # cria precificacao.json para você editar
Opções gerais: --canais shopee,amazon   --frete 25 (frete grátis pago por você, acima de R$ 79)
"""
import argparse
import json
import os

from .config import PADRAO, carregar
from .custo3d import custo_peca
from .preco import Resultado, canais_ativos, precificar, simular


def brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def imprimir_tabela(rs: list[Resultado]) -> None:
    print(f"\n{'Canal':<26}{'Preço':>12}{'Comissão':>12}{'Frete':>10}{'Imposto':>10}{'Lucro':>11}{'Margem':>8}")
    print("-" * 89)
    for r in rs:
        print(f"{r.nome:<26}{brl(r.preco):>12}{brl(r.comissao):>12}{brl(r.frete):>10}"
              f"{brl(r.imposto):>10}{brl(r.lucro):>11}{r.margem:>8.0%}")


def main() -> None:
    p = argparse.ArgumentParser(description="Precificação para Shopee, Mercado Livre, Amazon e venda direta.")
    sub = p.add_subparsers(dest="cmd", required=True)
    pc = sub.add_parser("peca", help="custo da peça 3D + preço em cada canal")
    pc.add_argument("--gramas", type=float, required=True, help="filamento usado (do fatiador)")
    pc.add_argument("--horas", type=float, required=True, help="tempo de impressão (do fatiador)")
    pc.add_argument("--material", default="PLA")
    pc.add_argument("--minutos", type=float, default=10, help="seu tempo de pós-processo/embalagem")
    pc.add_argument("--extras", type=float, default=0.0, help="ímãs, parafusos, tinta... em R$")
    pc.add_argument("--embalagem", type=float, help="R$ (padrão: o da configuração)")
    pp = sub.add_parser("preco", help="preço em cada canal a partir de um custo")
    pp.add_argument("--custo", type=float, required=True)
    ps = sub.add_parser("simular", help="lucro em cada canal vendendo por um preço")
    ps.add_argument("--custo", type=float, required=True)
    ps.add_argument("--preco", type=float, required=True)
    sub.add_parser("config", help="cria precificacao.json com os valores padrão")
    for s in (pc, pp, ps):
        s.add_argument("--canais", help="lista separada por vírgula (padrão: todos os ativos)")
        s.add_argument("--frete", type=float, help="frete pago por você quando há frete grátis")
        s.add_argument("--margem", type=float, help="margem desejada, ex.: 0.25")
    args = p.parse_args()

    if args.cmd == "config":
        destino = os.environ.get("PRECIFICACAO_CONFIG", "precificacao.json")
        if os.path.exists(destino):
            raise SystemExit(f"{destino} já existe; edite-o ou apague antes.")
        with open(destino, "w", encoding="utf-8") as f:
            json.dump(PADRAO, f, ensure_ascii=False, indent=2)
        print(f"Criado {destino}. Ajuste preço do filamento, energia, impressora, imposto, margem e taxas.")
        return

    cfg = carregar()
    if args.margem is not None:
        cfg["margem"] = args.margem
    canais = args.canais.split(",") if args.canais else canais_ativos(cfg)

    if args.cmd == "peca":
        c = custo_peca(cfg, args.gramas, args.horas, args.material, args.minutos, args.extras, args.embalagem)
        print(f"\nCusto da peça ({args.gramas:g} g de {args.material.upper()}, {args.horas:g} h):")
        for nome, v in c.linhas():
            print(f"  {nome:<24}{brl(v):>12}")
        print(f"  {'TOTAL':<24}{brl(c.total):>12}")
        custo = c.total
    else:
        custo = args.custo

    if args.cmd == "simular":
        imprimir_tabela([simular(cfg, k, custo, args.preco, args.frete) for k in canais])
    else:
        imprimir_tabela([precificar(cfg, k, custo, args.frete) for k in canais])
        print(f"\nMeta: margem de {cfg['margem']:.0%} e lucro mínimo de {brl(cfg['lucro_minimo_r'])} por unidade, "
              f"imposto {cfg['imposto']:.0%}.")


if __name__ == "__main__":
    main()
