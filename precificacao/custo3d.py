"""Custo de produção de uma peça impressa em 3D."""
from dataclasses import dataclass


@dataclass
class CustoPeca:
    material: float
    energia: float
    depreciacao: float
    manutencao: float
    falhas: float
    mao_de_obra: float
    extras: float
    embalagem: float

    @property
    def total(self) -> float:
        return round(sum(vars(self).values()), 2)

    def linhas(self) -> list[tuple[str, float]]:
        nomes = {"material": "Filamento/resina", "energia": "Energia", "depreciacao": "Desgaste da impressora",
                 "manutencao": "Manutenção", "falhas": "Reserva p/ falhas", "mao_de_obra": "Mão de obra",
                 "extras": "Insumos extras", "embalagem": "Embalagem"}
        return [(nomes[k], v) for k, v in vars(self).items()]


def custo_peca(cfg: dict, gramas: float, horas: float, material: str = "PLA",
               minutos_trabalho: float = 10, extras: float = 0.0, embalagem: float | None = None) -> CustoPeca:
    """gramas e horas vêm do fatiador; minutos_trabalho = seu tempo em pós-processo e embalagem;
    extras = ímãs, parafusos, tinta etc."""
    imp = cfg["impressao"]
    precos = {k.upper(): v for k, v in imp["materiais_r_kg"].items()}
    if material.upper() not in precos:
        raise ValueError(f"Material '{material}' sem preço. Opções: {', '.join(precos)}")
    mat = gramas / 1000 * precos[material.upper()]
    energia = imp["potencia_w"] / 1000 * horas * imp["kwh_r"]
    deprec = imp["preco_impressora_r"] / imp["vida_util_h"] * horas
    manut = imp["manutencao_r_h"] * horas
    # Uma impressão que falha gasta de novo material, energia e máquina.
    falhas = (mat + energia + deprec + manut) * imp["taxa_falha"]
    return CustoPeca(
        material=round(mat, 2), energia=round(energia, 2), depreciacao=round(deprec, 2),
        manutencao=round(manut, 2), falhas=round(falhas, 2),
        mao_de_obra=round(minutos_trabalho / 60 * imp["mao_de_obra_r_h"], 2),
        extras=round(extras, 2),
        embalagem=round(imp["embalagem_r"] if embalagem is None else embalagem, 2),
    )
