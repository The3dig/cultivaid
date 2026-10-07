import os
from dataclasses import dataclass

HOSTS = {
    "producao": "https://partner.shopeemobile.com",
    "sandbox": "https://partner.test-stable.shopeemobile.com",
}


@dataclass
class Config:
    partner_id: int
    partner_key: str
    shop_id: int
    ambiente: str = "producao"
    arquivo_tokens: str = "shopee_tokens.json"
    redirect_url: str = "https://www.google.com"
    idioma: str = "pt-br"

    @property
    def host(self) -> str:
        return HOSTS[self.ambiente]


def carregar_config() -> Config:
    """Lê a configuração das variáveis de ambiente (veja .env.example)."""
    faltando = [v for v in ("SHOPEE_PARTNER_ID", "SHOPEE_PARTNER_KEY", "SHOPEE_SHOP_ID") if not os.environ.get(v)]
    if faltando:
        raise SystemExit(f"Configure as variáveis de ambiente: {', '.join(faltando)}")
    return Config(
        partner_id=int(os.environ["SHOPEE_PARTNER_ID"]),
        partner_key=os.environ["SHOPEE_PARTNER_KEY"],
        shop_id=int(os.environ["SHOPEE_SHOP_ID"]),
        ambiente=os.environ.get("SHOPEE_AMBIENTE", "producao"),
        arquivo_tokens=os.environ.get("SHOPEE_ARQUIVO_TOKENS", "shopee_tokens.json"),
        redirect_url=os.environ.get("SHOPEE_REDIRECT_URL", "https://www.google.com"),
    )
