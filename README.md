# 🌱 Jardim Vivo (cultivaid)

**Conheça • Cuide • Veja Florescer**

App para acompanhar cada planta do plantio até o fim do ciclo, com um "prontuário vivo" para cada uma.
Ele é um **PWA**: funciona no navegador e pode ser instalado no celular (Android/iPhone) e no Mac/Windows.
Os dados ficam no **Supabase**.

## O que já funciona (MVP — seção 21 da documentação)

| Área | Recursos |
|---|---|
| 🔐 Conta | Cadastro e login por e-mail/senha; cada usuário só vê os próprios dados (RLS) |
| 🏠 Início | Total de plantas, saudáveis / em atenção / críticas, tarefas de hoje, próximos 7 dias, plantas sem foto recente, atividade recente, alerta de plantas críticas |
| 🌿 Plantas | Código público automático (`JV-000001`), espécie do catálogo, confiança, status da identificação, estágio, saúde, dificuldade, origem, ambiente, favorita, busca e filtros |
| 💧 Cuidados diários | Botões rápidos: reguei, adubei/húmus, podei, colhi, transplante, tratamento etc. Cada registro agenda o próximo lembrete |
| 📸 Fotos | Câmera do celular, compressão antes do envio, galeria e linha do tempo |
| 📝 Observações | Sinais rápidos (folhas amarelas, murcha, praga…) e avaliação de saúde |
| 🪴 Vasos e locais | O vaso é separado da planta; trocar de vaso mantém o ID e gera histórico |
| 🌱 Sementeiras | Bandejas com células (A1, B2…), semeadura em lote, germinação, perdas, taxa de sucesso e transplante que cria a planta com ID próprio |
| 📅 Agenda | Tarefas atrasadas / hoje / próximas; "Ainda úmido · ver amanhã" para evitar regar no automático |
| 🏁 Fim do ciclo | Encerrar (colheita final, morreu, doada…) mantendo todo o histórico |
| 📄 Relatório | Padrão de 2 páginas A4 (Ação + Conhecimento), imprimir ou salvar em PDF |
| 🔖 QR Code | Etiqueta imprimível que leva a `/p/JV-000001`; os dados continuam no banco e a etiqueta pode ser reimpressa |
| 🌐 Página pública | Mostra só o que é permitido, e só quando a planta está marcada como pública |

### Regras de cuidado embutidas (seção 23)
- Os lembretes de rega dizem **verificar** o substrato, e não regar sempre no mesmo intervalo.
- Uma planta **crítica** ganha uma tarefa de reavaliação em 2 dias, e os lembretes de adubação ficam suspensos até ela estabilizar.
- Depois de um transplante entra uma tarefa de avaliação sem apagar uma reavaliação mais urgente.
- Quando há várias plantas no mesmo vaso, o app avisa sobre a competição entre elas.
- O relatório externo traz só informações sobre a planta.

## Como rodar

### 1. Banco (Supabase)
No painel do Supabase, abra **SQL Editor** e execute, nesta ordem:
1. `supabase/migrations/001_jardim_vivo_mvp.sql` (tabelas, segurança, função pública, bucket de fotos)
2. `supabase/migrations/002_especies_iniciais.sql` (catálogo inicial com 12 espécies)
3. `supabase/migrations/003_seguranca_piloto.sql` (RLS reforçada, fotos privadas, código JV protegido, estado final)

> Se já existir a tabela `plants` criada pelo `teste_cultiva.py`, ela é **renomeada para `plants_legacy`**
> (nenhum dado é apagado). O script `teste_cultiva.py` não funciona com o novo esquema: agora cada planta
> precisa de um usuário dono. Use o app para cadastrar.

Em **Authentication → URL Configuration**, coloque a URL onde o app vai rodar.

Ou use a CLI: `npx supabase link` e depois `npx supabase db push`.

### 2. App
```bash
cp .env.example .env.local   # URL e chave publishable/anon do projeto + VITE_PUBLIC_URL (endereço gravado nos QR)
npm install
npm run dev                  # http://localhost:5173
```

### 3. Publicar (para usar no celular)
`npm run build` gera a pasta `dist/`. Publique em Vercel, Netlify ou Cloudflare Pages: o `vercel.json` e o `public/_redirects`
já tratam as rotas. Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do serviço.
Depois, no celular: Chrome → ⋮ → **Instalar app**, ou Safari → Compartilhar → **Adicionar à Tela de Início**.

### Desenvolvimento local e testes
Com Docker: `npx supabase start` sobe um Supabase local e aplica as migrações.

```bash
npm test               # typecheck + testes de segurança (RLS, fotos privadas, acesso entre usuários)
npm run dev            # em outro terminal
npm run test:e2e       # fluxo do piloto no navegador (bandeja 200 células → muda → vaso → planta)
```
Os testes criam usuários e se recusam a rodar fora do Supabase local.

## Estrutura
```
supabase/migrations/   esquema SQL + catálogo de espécies
src/lib/care.ts        regras de cuidado e agendamento de lembretes
src/lib/types.ts       tipos das entidades
src/pages/             telas (Início, Plantas, Agenda, Sementeiras, Vasos, Relatório, QR, Página pública)
src/components/ui.tsx  componentes compartilhados
```

## Próximas etapas (seção 22)
- Identificação por foto com IA e análise de saúde visual
- Notificações push no celular
- Permissões de família e contribuidores (compartilhar plantas)
- Comparação de fotos lado a lado, estatísticas e relatórios históricos
- Comunidade, base colaborativa e parceiros
