import hashlib
import hmac
from unittest import mock

from shopee_plugin import publicar
from shopee_plugin.bot_telegram import ler_legenda
from shopee_plugin.gerador import Anuncio
from shopee_plugin.shopee_api import assinar

ANUNCIO = Anuncio(titulo="Vaso Cerâmica Branco 15cm", descricao="Lindo vaso.", preco_sugerido=39.9,
                  peso_kg=0.8, comprimento_cm=18, largura_cm=18, altura_cm=17, marca="Sem marca")


def test_assinatura_hmac_sha256():
    esperado = hmac.new(b"chave", b"123/api/v2/x1700000000", hashlib.sha256).hexdigest()
    assert assinar("chave", "123/api/v2/x1700000000") == esperado


def test_ler_legenda():
    assert ler_legenda("preço 49,90 estoque 5 tamanho M") == (49.9, 5, "tamanho M")
    assert ler_legenda("") == (None, 1, "")


def test_preparar_monta_item_completo():
    api = mock.Mock()
    api.recomendar_categoria.return_value = [100123]
    api.atributos_obrigatorios.return_value = []
    api.subir_imagem.return_value = "img1"
    api.canais_logistica.return_value = [90001]
    with mock.patch.object(publicar, "gerar_anuncio", return_value=ANUNCIO):
        anuncio, item = publicar.preparar(api, ["f.jpg"], estoque=3)
    assert item["item_name"] == ANUNCIO.titulo
    assert item["original_price"] == 39.9
    assert item["category_id"] == 100123
    assert item["image"] == {"image_id_list": ["img1"]}
    assert item["seller_stock"] == [{"stock": 3}]
    assert item["logistic_info"] == [{"logistic_id": 90001, "enabled": True}]
    assert "attribute_list" not in item


def test_preco_informado_tem_prioridade():
    item = publicar.montar_item(ANUNCIO, ["i"], 1, [2], [], 59.0, 1)
    assert item["original_price"] == 59.0
