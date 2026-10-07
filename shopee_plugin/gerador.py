"""Usa o Claude (visão) para transformar uma foto em um anúncio da Shopee."""
import base64
import json
import mimetypes

import anthropic
from pydantic import BaseModel, Field

MODELO = "claude-opus-5-5"
# Se o modelo recusar por política, a API refaz o pedido num modelo alternativo.
FALLBACK = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}


class Anuncio(BaseModel):
    titulo: str = Field(description="Título do produto para a Shopee, até 100 caracteres, com palavras-chave de busca")
    descricao: str = Field(description="Descrição de venda em português, entre 300 e 2500 caracteres, com benefícios, características e cuidados")
    preco_sugerido: float = Field(description="Preço sugerido em reais para o mercado brasileiro")
    peso_kg: float = Field(description="Peso estimado do produto embalado em kg")
    comprimento_cm: int
    largura_cm: int
    altura_cm: int
    marca: str = Field(description="Marca visível na foto, ou 'Sem marca'")


class ValorAtributo(BaseModel):
    attribute_id: int
    value_id: int = Field(description="value_id de uma das opções; 0 se o valor for texto livre")
    valor_texto: str = Field(description="Nome do valor escolhido ou texto livre")


class Atributos(BaseModel):
    atributos: list[ValorAtributo]


def _imagem(caminho: str) -> dict:
    tipo = mimetypes.guess_type(caminho)[0] or "image/jpeg"
    with open(caminho, "rb") as f:
        dados = base64.standard_b64encode(f.read()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": tipo, "data": dados}}


def _parse(client, conteudo, formato):
    resp = client.beta.messages.parse(
        model=MODELO,
        max_tokens=16000,
        output_config={"effort": "medium"},
        output_format=formato,
        messages=[{"role": "user", "content": conteudo}],
        **FALLBACK,
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("O Claude recusou gerar o anúncio para esta foto.")
    return resp.parsed_output


def gerar_anuncio(fotos: list[str], dica: str = "", client: anthropic.Anthropic | None = None) -> Anuncio:
    client = client or anthropic.Anthropic()
    texto = (
        "Você é especialista em vender na Shopee Brasil. Analise a(s) foto(s) do produto e "
        "crie um anúncio completo, otimizado para busca e conversão. Não invente características "
        "que não dá para ver ou deduzir com segurança."
    )
    if dica:
        texto += f"\n\nInformações do vendedor: {dica}"
    return _parse(client, [*map(_imagem, fotos), {"type": "text", "text": texto}], Anuncio)


def preencher_atributos(anuncio: Anuncio, obrigatorios: list[dict],
                        client: anthropic.Anthropic | None = None) -> list[dict]:
    """Escolhe valores para os atributos obrigatórios da categoria."""
    if not obrigatorios:
        return []
    client = client or anthropic.Anthropic()
    resumo = [{
        "attribute_id": a["attribute_id"],
        "nome": a.get("name") or a.get("display_attribute_name"),
        "opcoes": [{"value_id": v["value_id"], "nome": v.get("name") or v.get("display_value_name")}
                   for v in a.get("attribute_value_list", [])][:200],
    } for a in obrigatorios]
    texto = (
        f"Produto: {anuncio.titulo}\n{anuncio.descricao}\n\n"
        f"Preencha TODOS estes atributos obrigatórios da Shopee. Quando houver opções, use um value_id "
        f"delas; sem opções, value_id=0 e valor em texto.\n{json.dumps(resumo, ensure_ascii=False)}"
    )
    resultado = _parse(client, [{"type": "text", "text": texto}], Atributos)
    return [{
        "attribute_id": a.attribute_id,
        "attribute_value_list": [{"value_id": a.value_id, "original_value_name": a.valor_texto}],
    } for a in resultado.atributos]
