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


def test_catalogo_ponta_a_ponta(cfg, tmp_path):
    from precificacao import catalogo as cat
    arq = tmp_path / "produtos.csv"
    cat.criar_modelo(str(arq))
    with open(arq, "a", encoding="utf-8") as f:
        f.write("REVENDA-1;Produto comprado;;;;;;12,50;;;;;5;10;;\n")
        f.write("SEM-DADOS;Faltou custo;PLA;;;;;;;;;;;;;\n")
    produtos, invalidos = cat.montar(cfg, cat.ler(str(arq)), cfg["carteira"])
    assert len(produtos) == 6 and invalidos == [("SEM-DADOS", "preencha custo, ou gramas e horas")]
    revenda = next(p for p in produtos if p.sku == "REVENDA-1")
    assert revenda.custo == 12.5 and revenda.horas == 0
    assert set(revenda.precos) == {"shopee", "tiktok", "ml_classico", "amazon", "magalu", "elo7"}
    arquivos = cat.exportar(produtos, cfg["carteira"], str(tmp_path / "saida"))
    assert len(arquivos) == 7
    shopee = cat.ler(str(tmp_path / "saida" / "shopee.csv"))
    assert len(shopee) == 6 and shopee[0]["sku"] == "VASO-GEO-15"
    nec, disp = cat.capacidade(cfg, produtos)
    assert disp == 18 * 30 and nec > 0


def test_numero_brasileiro():
    from precificacao.catalogo import _num
    assert _num("1.200") == 1200 and _num("1.234,56") == 1234.56 and _num("4,5") == 4.5
    assert _num("4.5") == 4.5 and _num("R$ 12,90") == 12.9 and _num("") is None


def test_lote_pula_publicados_e_usa_medidas_reais():
    from shopee_plugin.lote import ajustar_item, pendentes
    linhas = [{"sku": "A", "fotos": "a.jpg"}, {"sku": "B", "fotos": "b.jpg"}, {"sku": "C", "fotos": ""}]
    assert [l["sku"] for l in pendentes(linhas, {"A": 1})] == ["B"]
    item = ajustar_item({"weight": 0.8, "dimension": {}},
                        {"sku": "B", "peso_g": "180", "comp_cm": "18", "larg_cm": "18", "alt_cm": "17"})
    assert item["item_sku"] == "B" and item["weight"] == 0.18
    assert item["dimension"] == {"package_length": 18, "package_width": 18, "package_height": 17}
