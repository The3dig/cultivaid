"""Bot do Telegram: mande a foto do produto, confira a prévia e responda "ok" para publicar.

Legenda opcional na foto: "preço 49,90 estoque 10 tamanho M, algodão".
Uso: python -m shopee_plugin.bot_telegram
"""
import os
import re
import tempfile
import traceback

import requests

from .config import carregar_config
from .publicar import preparar, resumo
from .shopee_api import ShopeeAPI

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DONO = os.environ.get("TELEGRAM_CHAT_ID", "")  # só este chat pode usar o bot
URL = f"https://api.telegram.org/bot{TOKEN}"


def ler_legenda(texto: str) -> tuple[float | None, int, str]:
    preco = re.search(r"pre[çc]o\s*:?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)", texto, re.I)
    estoque = re.search(r"estoque\s*:?\s*(\d+)", texto, re.I)
    resto = texto
    for m in (preco, estoque):
        if m:
            resto = resto.replace(m.group(0), "")
    return (float(preco.group(1).replace(",", ".")) if preco else None,
            int(estoque.group(1)) if estoque else 1,
            resto.strip(" ,;"))


def enviar(chat_id, texto: str) -> None:
    requests.post(f"{URL}/sendMessage", json={"chat_id": chat_id, "text": texto[:4000]}, timeout=30)


def baixar_foto(file_id: str, pasta: str) -> str:
    caminho = requests.get(f"{URL}/getFile", params={"file_id": file_id}, timeout=30).json()["result"]["file_path"]
    destino = os.path.join(pasta, os.path.basename(caminho))
    with open(destino, "wb") as f:
        f.write(requests.get(f"https://api.telegram.org/file/bot{TOKEN}/{caminho}", timeout=60).content)
    return destino


def main() -> None:
    if not TOKEN or not DONO:
        raise SystemExit("Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID.")
    api = ShopeeAPI(carregar_config())
    pendente: dict | None = None
    offset = 0
    print("Bot rodando. Mande uma foto no Telegram.")
    while True:
        updates = requests.get(f"{URL}/getUpdates", params={"offset": offset, "timeout": 50}, timeout=60).json()
        for up in updates.get("result", []):
            offset = up["update_id"] + 1
            msg = up.get("message") or {}
            chat_id = msg.get("chat", {}).get("id")
            if str(chat_id) != DONO:
                continue
            try:
                if msg.get("photo"):
                    enviar(chat_id, "📸 Recebi! Criando o anúncio...")
                    preco, estoque, dica = ler_legenda(msg.get("caption", ""))
                    with tempfile.TemporaryDirectory() as pasta:
                        foto = baixar_foto(msg["photo"][-1]["file_id"], pasta)
                        anuncio, pendente = preparar(api, [foto], dica, preco, estoque)
                    enviar(chat_id, resumo(anuncio, pendente) + "\n\nResponda \"ok\" para publicar ou \"cancelar\".")
                elif (msg.get("text") or "").strip().lower() in ("ok", "publicar", "sim") and pendente:
                    resp = api.adicionar_item(pendente)
                    pendente = None
                    enviar(chat_id, f"✅ Publicado na Shopee! item_id={resp.get('item_id')}")
                elif (msg.get("text") or "").strip().lower() == "cancelar":
                    pendente = None
                    enviar(chat_id, "Cancelado.")
                else:
                    enviar(chat_id, "Mande a foto do produto (legenda opcional: preço 49,90 estoque 10).")
            except Exception as e:
                traceback.print_exc()
                enviar(chat_id, f"❌ Erro: {e}")


if __name__ == "__main__":
    main()
