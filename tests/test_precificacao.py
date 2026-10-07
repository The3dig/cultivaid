import json
from unittest import mock

import pytest

from precificacao import carregar, custo_peca, precificar, simular, tabela
from shopee_plugin import publicar
from shopee_plugin.bot_telegram import ler_custo
from tests.test_shopee_plugin import ANUNCIO


@pytest.fixture
def cfg(tmp_path):
    return carregar(str(tmp_path / "nao_existe.json"))


def test_custo_peca(cfg):
    c = custo_peca(cfg, gramas=45, horas=3.5, material="pla", minutos_trabalho=10)
    assert c.material == 4.95           # 45 g × R$ 110/kg
    assert c.energia == 0.50            # 0,15 kW × 3,5 h × R$ 0,95
    assert c.depreciacao == 3.50        # R$ 5000 / 5000 h × 3,5 h
    assert c.falhas == 1.00             # 10% de (material+energia+desgaste+manutenção)
    assert c.mao_de_obra == 5.00
    assert c.total == 18.50


def test_material_desconhecido(cfg):
    with pytest.raises(ValueError):
        custo_peca(cfg, 10, 1, "madeira")


def test_simular_shopee_faixas(cfg):
    r = simular(cfg, "shopee", 20, 50)
    assert r.comissao == 14.00          # 20% + R$ 4
    r = simular(cfg, "shopee", 20, 150)
    assert r.comissao == 41.00          # 14% + R$ 20
    assert r.imposto == 9.00


def test_preco_garante_margem_em_todos_os_canais(cfg):
    for custo in (5, 18.5, 40, 60, 300):
        for r in tabela(cfg, custo):
            assert r.lucro >= max(cfg["margem"] * r.preco, cfg["lucro_minimo_r"]) - 1e-6, (custo, r)
            assert f"{r.preco:.2f}".endswith(".90")


def test_preco_e_o_menor_possivel(cfg):
    cfg["arredondar"] = False
    r = precificar(cfg, "shopee", 18.5)
    menos = simular(cfg, "shopee", 18.5, r.preco - 0.01)
    assert menos.lucro < cfg["margem"] * menos.preco


def test_pula_faixa_quando_nao_fecha(cfg):
    # custo 40 não fecha abaixo de R$ 80 (20% + R$ 4) e vai pra faixa 14% + R$ 16
    r = precificar(cfg, "shopee", 40)
    assert 80 <= r.preco < 100


def test_amazon_comissao_minima(cfg):
    assert simular(cfg, "amazon", 1, 5).comissao == 1.00 + 4.50


def test_frete_informado_substitui_tabela(cfg):
    assert simular(cfg, "ml_classico", 50, 120, frete=35).frete == 35
    assert simular(cfg, "ml_classico", 10, 40, frete=35).frete == 0   # abaixo de R$ 79 não há frete grátis


def test_config_do_usuario_sobrescreve(tmp_path):
    arq = tmp_path / "p.json"
    arq.write_text(json.dumps({"margem": 0.3, "impressao": {"kwh_r": 1.2}}))
    cfg = carregar(str(arq))
    assert cfg["margem"] == 0.3 and cfg["impressao"]["kwh_r"] == 1.2
    assert cfg["impressao"]["potencia_w"] == 150   # o resto continua o padrão


def test_ler_custo_legenda():
    assert ler_custo("custo 18,50 tamanho M") == (18.5, "tamanho M")
    with mock.patch("shopee_plugin.bot_telegram.custo_impressao", return_value=12.0) as ci:
        assert ler_custo("gramas 45 horas 3,5 PETG vaso") == (12.0, "PETG vaso")
        ci.assert_called_with(45.0, 3.5, "PETG")
        assert ler_custo("45g 3,5h")[0] == 12.0
        ci.assert_called_with(45.0, 3.5, "PLA")
    assert ler_custo("tamanho M") == (None, "tamanho M")


def test_plugin_usa_preco_do_custo():
    api = mock.Mock()
    api.recomendar_categoria.return_value = [1]
    api.atributos_obrigatorios.return_value = []
    api.subir_imagem.return_value = "i"
    api.canais_logistica.return_value = [2]
    with mock.patch.object(publicar, "gerar_anuncio", return_value=ANUNCIO), \
         mock.patch.object(publicar, "carregar_precificacao", return_value=carregar("/nao/existe.json")):
        _, item = publicar.preparar(api, ["f.jpg"], custo=18.5)
        assert item["original_price"] == 41.90          # e não os 39,90 sugeridos pelo Claude
        _, item = publicar.preparar(api, ["f.jpg"], preco=55.0, custo=18.5)
        assert item["original_price"] == 55.0           # preço informado continua mandando
        assert "lucro R$" in publicar.resumo(ANUNCIO, item, 18.5)


def test_tiktok_frete_gratis_com_teto(cfg):
    assert simular(cfg, "tiktok", 10, 40).comissao == 4.00 + 4.00 + 2.40         # 10% + R$ 4 + 6%
    assert simular(cfg, "tiktok", 10, 1000).comissao == 60.00 + 6.00 + 50.00     # 6% + R$ 6 + teto R$ 50
    assert simular(cfg, "tiktok_afiliado", 10, 100).comissao == 6 + 6 + 6 + 10   # + 10% do afiliado


def test_tiktok_preco_alto_usa_teto(cfg):
    cfg["arredondar"] = False
    r = precificar(cfg, "tiktok", 600)
    menos = simular(cfg, "tiktok", 600, r.preco - 0.01)
    assert r.lucro >= cfg["margem"] * r.preco - 1e-6 and menos.lucro < cfg["margem"] * menos.preco


def test_elo7_frete_acima_de_79_90(cfg):
    assert simular(cfg, "elo7", 10, 50).frete == 0
    assert simular(cfg, "elo7", 10, 79.90).frete == 6.00
