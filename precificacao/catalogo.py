"""Carteira de produtos: uma planilha (CSV) com todos os produtos -> preço e lucro em cada canal.

Colunas do CSV (separador ; ou , — abre direto no Excel/Google Planilhas):
    sku, nome, material, gramas, horas, minutos, extras, custo, peso_g, comp_cm, larg_cm, alt_cm,
    estoque, vendas_mes, fotos, dica
- Peça 3D: preencha material/gramas/horas (minutos e extras opcionais) e deixe custo vazio.
- Produto comprado/revenda: preencha só custo.
- fotos: caminhos separados por | ; vendas_mes: sua estimativa (usada no cálculo de capacidade).
"""
import csv
import os
import re
from dataclasses import dataclass, field

from .custo3d import custo_peca
from .preco import Resultado, precificar

COLUNAS = ["sku", "nome", "material", "gramas", "horas", "minutos", "extras", "custo", "peso_g",
           "comp_cm", "larg_cm", "alt_cm", "estoque", "vendas_mes", "fotos", "dica"]

EXEMPLO = [
    ["VASO-GEO-15", "Vaso geométrico 15 cm", "PLA", "120", "6", "10", "", "", "180", "18", "18", "17", "5", "20",
     "fotos/vaso1.jpg|fotos/vaso2.jpg", "decorativo, não vai água"],
    ["SUP-FONE", "Suporte de headset de mesa", "PETG", "85", "4,5", "10", "", "", "120", "15", "12", "26", "5", "15",
     "fotos/suporte.jpg", ""],
    ["CHAV-PET-NOME", "Chaveiro personalizado com nome", "PLA", "8", "0,5", "5", "1,5", "", "20", "10", "6", "2", "20", "60",
     "fotos/chaveiro.jpg", "personalizado: cliente envia o nome"],
    ["ORG-CABOS-6", "Organizador de cabos kit 6 un", "TPU", "30", "2", "8", "", "", "60", "12", "8", "3", "10", "30",
     "fotos/org.jpg", ""],
    ["LUMI-LUA", "Luminária lua 3D 12 cm", "PLA", "150", "9", "20", "18", "", "350", "16", "16", "16", "3", "8",
     "fotos/lua.jpg", "acompanha base e LED USB"],
]


@dataclass
class Produto:
    sku: str
    nome: str
    custo: float
    linha: dict
    horas: float = 0.0
    vendas_mes: float = 0.0
    precos: dict[str, Resultado] = field(default_factory=dict)
    erros: dict[str, str] = field(default_factory=dict)


def _num(v: str | None, padrao: float | None = None) -> float | None:
    v = (v or "").strip().replace("R$", "").strip()
    if not v:
        return padrao
    if "," in v or re.fullmatch(r"\d{1,3}(\.\d{3})+", v):  # formato brasileiro: 1.234,56 / 1.200
        v = v.replace(".", "").replace(",", ".")
    return float(v)


def ler(caminho: str) -> list[dict]:
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        amostra = f.read(4096)
        f.seek(0)
        sep = ";" if amostra.count(";") >= amostra.count(",") else ","
        return [{(k or "").strip().lower(): (v or "").strip() for k, v in linha.items()}
                for linha in csv.DictReader(f, delimiter=sep) if any((v or "").strip() for v in linha.values())]


def custo_da_linha(cfg: dict, linha: dict) -> float:
    custo = _num(linha.get("custo"))
    if custo is not None:
        return custo
    gramas, horas = _num(linha.get("gramas")), _num(linha.get("horas"))
    if gramas is None or horas is None:
        raise ValueError("preencha custo, ou gramas e horas")
    return custo_peca(cfg, gramas, horas, linha.get("material") or "PLA",
                      _num(linha.get("minutos"), 10), _num(linha.get("extras"), 0.0)).total


def montar(cfg: dict, linhas: list[dict], canais: list[str]) -> tuple[list[Produto], list[tuple[str, str]]]:
    produtos, invalidos = [], []
    for i, linha in enumerate(linhas, start=2):
        sku = linha.get("sku") or f"linha {i}"
        try:
            custo = custo_da_linha(cfg, linha)
        except ValueError as e:
            invalidos.append((sku, str(e)))
            continue
        p = Produto(sku, linha.get("nome", ""), custo, linha,
                    horas=_num(linha.get("horas"), 0.0) if _num(linha.get("custo")) is None else 0.0,
                    vendas_mes=_num(linha.get("vendas_mes"), 0.0))
        for c in canais:
            try:
                p.precos[c] = precificar(cfg, c, custo)
            except ValueError as e:
                p.erros[c] = str(e)
        produtos.append(p)
    return produtos, invalidos


def _br(v: float) -> str:
    return f"{v:.2f}".replace(".", ",")


def exportar(produtos: list[Produto], canais: list[str], pasta: str) -> list[str]:
    """precos.csv (visão geral) + um arquivo por canal pronto para colar na planilha de cadastro em massa."""
    os.makedirs(pasta, exist_ok=True)
    arquivos = []
    geral = os.path.join(pasta, "precos.csv")
    with open(geral, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["sku", "nome", "custo"] + [f"{c}_{x}" for c in canais for x in ("preco", "lucro")])
        for p in produtos:
            w.writerow([p.sku, p.nome, _br(p.custo)] + [
                v for c in canais for v in ((_br(p.precos[c].preco), _br(p.precos[c].lucro)) if c in p.precos else ("", ""))])
    arquivos.append(geral)
    for c in canais:
        caminho = os.path.join(pasta, f"{c}.csv")
        with open(caminho, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["sku", "nome", "preco", "estoque", "peso_g", "comp_cm", "larg_cm", "alt_cm",
                        "comissao", "frete", "lucro", "margem"])
            for p in produtos:
                if c not in p.precos:
                    continue
                r, l = p.precos[c], p.linha
                w.writerow([p.sku, p.nome, _br(r.preco), l.get("estoque", ""), l.get("peso_g", ""),
                            l.get("comp_cm", ""), l.get("larg_cm", ""), l.get("alt_cm", ""),
                            _br(r.comissao), _br(r.frete), _br(r.lucro), f"{r.margem:.0%}"])
        arquivos.append(caminho)
    return arquivos


def capacidade(cfg: dict, produtos: list[Produto]) -> tuple[float, float]:
    """(horas de impressão/mês necessárias para as vendas estimadas, horas/mês disponíveis)."""
    imp = cfg["impressao"]
    necessarias = sum(p.horas * p.vendas_mes for p in produtos) * (1 + imp["taxa_falha"])
    disponiveis = imp.get("impressoras", 1) * imp.get("horas_dia", 18) * 30
    return necessarias, disponiveis


def criar_modelo(caminho: str) -> None:
    with open(caminho, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(COLUNAS)
        w.writerows(EXEMPLO)
