"""Cliente mínimo da Shopee Open Platform API v2."""
import hashlib
import hmac
import json
import os
import time

import requests

from .config import Config


class ShopeeErro(Exception):
    pass


def assinar(partner_key: str, base: str) -> str:
    return hmac.new(partner_key.encode(), base.encode(), hashlib.sha256).hexdigest()


class ShopeeAPI:
    def __init__(self, config: Config, sessao: requests.Session | None = None):
        self.cfg = config
        self.http = sessao or requests.Session()
        self.tokens = self._ler_tokens()

    # ---------- tokens ----------
    def _ler_tokens(self) -> dict:
        if os.path.exists(self.cfg.arquivo_tokens):
            with open(self.cfg.arquivo_tokens) as f:
                return json.load(f)
        return {}

    def _salvar_tokens(self, resp: dict) -> None:
        self.tokens = {
            "access_token": resp["access_token"],
            "refresh_token": resp["refresh_token"],
            "expira_em": int(time.time()) + int(resp.get("expire_in", 14400)) - 300,
        }
        with open(self.cfg.arquivo_tokens, "w") as f:
            json.dump(self.tokens, f)

    def link_autorizacao(self) -> str:
        path = "/api/v2/shop/auth_partner"
        ts = int(time.time())
        sign = assinar(self.cfg.partner_key, f"{self.cfg.partner_id}{path}{ts}")
        return (f"{self.cfg.host}{path}?partner_id={self.cfg.partner_id}&timestamp={ts}"
                f"&sign={sign}&redirect={self.cfg.redirect_url}")

    def trocar_codigo(self, code: str) -> None:
        resp = self._chamar_publica("POST", "/api/v2/auth/token/get",
                                    json={"code": code, "shop_id": self.cfg.shop_id, "partner_id": self.cfg.partner_id})
        self._salvar_tokens(resp)

    def _access_token(self) -> str:
        if not self.tokens:
            raise ShopeeErro("Loja não autorizada. Rode: python -m shopee_plugin.publicar autorizar")
        if time.time() >= self.tokens["expira_em"]:
            resp = self._chamar_publica("POST", "/api/v2/auth/access_token/get", json={
                "refresh_token": self.tokens["refresh_token"],
                "shop_id": self.cfg.shop_id, "partner_id": self.cfg.partner_id})
            self._salvar_tokens(resp)
        return self.tokens["access_token"]

    # ---------- chamadas ----------
    @staticmethod
    def _checar(r: requests.Response) -> dict:
        try:
            dados = r.json()
        except ValueError:
            raise ShopeeErro(f"HTTP {r.status_code}: {r.text[:300]}")
        if dados.get("error"):
            raise ShopeeErro(f"{dados['error']}: {dados.get('message')}")
        return dados

    def _chamar_publica(self, metodo: str, path: str, **kwargs) -> dict:
        ts = int(time.time())
        params = {"partner_id": self.cfg.partner_id, "timestamp": ts,
                  "sign": assinar(self.cfg.partner_key, f"{self.cfg.partner_id}{path}{ts}")}
        r = self.http.request(metodo, self.cfg.host + path, params=params, timeout=60, **kwargs)
        return self._checar(r)

    def _chamar_loja(self, metodo: str, path: str, params: dict | None = None, **kwargs) -> dict:
        ts = int(time.time())
        token = self._access_token()
        base = f"{self.cfg.partner_id}{path}{ts}{token}{self.cfg.shop_id}"
        todos = {"partner_id": self.cfg.partner_id, "timestamp": ts, "access_token": token,
                 "shop_id": self.cfg.shop_id, "sign": assinar(self.cfg.partner_key, base), **(params or {})}
        r = self.http.request(metodo, self.cfg.host + path, params=todos, timeout=60, **kwargs)
        return self._checar(r).get("response", {})

    # ---------- endpoints usados ----------
    def subir_imagem(self, caminho: str) -> str:
        with open(caminho, "rb") as f:
            resp = self._chamar_publica("POST", "/api/v2/media_space/upload_image", files={"image": f})
        info = resp.get("response", {}).get("image_info") or resp["response"]["image_info_list"][0]["image_info"]
        return info["image_id"]

    def recomendar_categoria(self, titulo: str) -> list[int]:
        resp = self._chamar_loja("GET", "/api/v2/product/category_recommend", {"item_name": titulo})
        return resp.get("category_id", [])

    def categorias(self) -> list[dict]:
        resp = self._chamar_loja("GET", "/api/v2/product/get_category", {"language": self.cfg.idioma})
        return resp.get("category_list", [])

    def atributos_obrigatorios(self, category_id: int) -> list[dict]:
        resp = self._chamar_loja("GET", "/api/v2/product/get_attribute_tree",
                                 {"category_id_list": str(category_id), "language": self.cfg.idioma})
        arvores = resp.get("list", [])
        attrs = arvores[0].get("attribute_tree", []) if arvores else []
        return [a for a in attrs if a.get("mandatory")]

    def canais_logistica(self) -> list[int]:
        resp = self._chamar_loja("GET", "/api/v2/logistics/get_channel_list")
        return [c["logistics_channel_id"] for c in resp.get("logistics_channel_list", []) if c.get("enabled")]

    def adicionar_item(self, corpo: dict) -> dict:
        return self._chamar_loja("POST", "/api/v2/product/add_item", json=corpo)
