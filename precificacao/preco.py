"""Preço de venda por canal: cobre custo, comissão, frete, imposto e ainda deixa a margem desejada."""
import itertools
import math
from dataclasses import dataclass


@dataclass
class Resultado:
    canal: str
    nome: str
    preco: float
    comissao: float
    frete: float
    imposto: float
    custo: float

    @property
    def lucro(self) -> float:
        return round(self.preco - self.comissao - self.frete - self.imposto - self.custo, 2)

    @property
    def margem(self) -> float:
        return self.lucro / self.preco if self.preco else 0.0


def _faixa(faixas: list[dict], preco: float) -> dict:
    for f in faixas:
        if f.get("ate") is None or preco <= f["ate"] + 1e-9:
            return f
    return faixas[-1]


def simular(cfg: dict, canal: str, custo: float, preco: float, frete: float | None = None) -> Resultado:
    """Quanto sobra vendendo a `preco` no canal. `frete` substitui o frete da tabela, se informado."""
    c = cfg["canais"][canal]
    f = _faixa(c["faixas"], preco)
    comissao = max(f["pct"] * preco, f.get("minimo", 0.0)) + f.get("fixo", 0.0)
    # Taxas que valem em qualquer faixa (ex.: frete grátis do TikTok, comissão de afiliado), com teto opcional.
    for a in c.get("adicionais", []):
        comissao += min(a["pct"] * preco, a.get("teto") or math.inf)
    fr = f.get("frete", 0.0) if frete is None or not f.get("frete") else frete
    return Resultado(canal, c.get("nome", canal), round(preco, 2), round(comissao, 2), round(fr, 2),
                     round(cfg["imposto"] * preco, 2), round(custo, 2))


def _atinge(cfg: dict, r: Resultado) -> bool:
    return r.lucro + 1e-6 >= max(cfg["margem"] * r.preco, cfg["lucro_minimo_r"])


def _candidatos(cfg: dict, canal: str, custo: float, frete: float | None):
    """Preço mínimo que atinge a meta em cada faixa (a comissão é linear dentro da faixa)."""
    c = cfg["canais"][canal]
    faixas = c["faixas"]
    # Cada adicional entra como % (abaixo do teto) ou como valor fixo (no teto).
    combos = [(sum(p for p, _ in comb), sum(t for _, t in comb)) for comb in itertools.product(
        *[[(a["pct"], 0.0)] + ([(0.0, a["teto"])] if a.get("teto") else []) for a in c.get("adicionais", [])])]
    inicio = 0.01
    for f in faixas:
        fr = (f.get("frete", 0.0) if frete is None or not f.get("frete") else frete)
        fixos = custo + f.get("fixo", 0.0) + fr
        pct, imp, m = f["pct"], cfg["imposto"], cfg["margem"]
        for comissao_pct, comissao_fixa in ((pct, 0.0), (0.0, f.get("minimo", 0.0))):
            for meta_pct, meta_fixa in ((m, 0.0), (0.0, cfg["lucro_minimo_r"])):
                for ad_pct, ad_fixo in combos:
                    den = 1 - comissao_pct - ad_pct - imp - meta_pct
                    if den > 0:
                        yield max(inicio, (fixos + comissao_fixa + ad_fixo + meta_fixa) / den)
        yield inicio
        if f.get("ate") is None:
            return
        inicio = round(f["ate"] + 0.01, 2)


def _arredondar_90(p: float) -> float:
    """Próximo preço terminado em ,90 (ex.: 37,12 -> 37,90; 37,95 -> 38,90)."""
    return math.floor(p - 0.9 + 1 - 1e-9) + 0.9 if p > 0.9 else 0.9


def precificar(cfg: dict, canal: str, custo: float, frete: float | None = None) -> Resultado:
    """Menor preço que garante a margem e o lucro mínimo configurados no canal."""
    validos = []
    for p in _candidatos(cfg, canal, custo, frete):
        centavos = math.ceil(round(p * 100, 6))
        for extra in range(5):  # arredondamento dos componentes pode faltar 1–2 centavos
            r = simular(cfg, canal, custo, (centavos + extra) / 100, frete)
            if _atinge(cfg, r):
                validos.append(r)
                break
    if not validos:
        raise ValueError(f"Não há preço que dê a margem desejada em {canal}.")
    r = min(validos, key=lambda x: x.preco)
    if cfg.get("arredondar"):
        p = _arredondar_90(r.preco)
        # Arredondar pode empurrar o preço pra uma faixa de comissão pior; sobe até achar um que feche.
        for _ in range(2000):
            r2 = simular(cfg, canal, custo, p, frete)
            if _atinge(cfg, r2):
                return r2
            p += 1
    return r


def canais_ativos(cfg: dict) -> list[str]:
    return [k for k, c in cfg["canais"].items() if c.get("ativo", True)]


def tabela(cfg: dict, custo: float, canais: list[str] | None = None, frete: float | None = None) -> list[Resultado]:
    return [precificar(cfg, c, custo, frete) for c in (canais or canais_ativos(cfg))]
