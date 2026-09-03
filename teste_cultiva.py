from supabase import create_client, Client

url: str = "https://skdlbeyoavzzuvhkhkap.supabase.co"
key: str = "sb_publishable_yGIUVfsVYG8VhOE2acBfDg_l8BYhdTt"

supabase: Client = create_client(url, key)

print("Conectado ao CultivaID com sucesso!")

nova_muda = {
    "codigo_publico": "JV-000001",
    "nome_comum": "Pimenta Dedo-de-Moça",
    "especie": "Capsicum baccatum",
    "id_vaso": "Vaso-01",
    "estagio": "Muda jovem",
    "saude": "Excelente"
}

response = supabase.table("plants").insert(nova_muda).execute()

print("Muda cadastrada com sucesso no banco de dados!")
print(response)