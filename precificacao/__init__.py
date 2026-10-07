"""Precificação multicanal (Shopee, Mercado Livre, Amazon...) e custo de peças impressas em 3D."""
from .config import carregar
from .custo3d import custo_peca
from .preco import precificar, simular, tabela

__all__ = ["carregar", "custo_peca", "precificar", "simular", "tabela"]
