# Jardim Vivo — Relatório de implementação (v0.1, MVP)

> Relatório técnico para revisão externa. Descreve o que foi construído a partir da
> *Documentação Mestra v1 (03/09/2026)*: as decisões tomadas, o que mudou em relação ao documento,
> o que foi testado e o que ainda falta.

- **Repositório:** `the3dig/cultivaid`
- **Branch:** `claude/agricultural-cultivation-app-ihplv7`
- **Commit:** `6884a15`
- **Tamanho:** cerca de 3.000 linhas (TypeScript/React + SQL)
- **Situação:** MVP funcional, testado em um Supabase local. Ainda não foi conectado ao projeto Supabase de produção.

---

## 1. Ponto de partida

O repositório tinha apenas:
- um `README.md` de uma linha;
- o `teste_cultiva.py`, que inseria um registro direto numa tabela `plants` do Supabase
  (colunas `codigo_publico`, `nome_comum`, `especie`, `id_vaso`, `estagio`, `saude`), sem usuário dono e sem RLS.

Não consegui ver o esquema real do Supabase de produção: a rede do ambiente bloqueou o acesso.
Por isso, as migrações foram escritas para serem **idempotentes** e para **preservar** essa tabela antiga (veja a seção 4.1).

---

## 2. Decisões de arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Tipo de app | **PWA** (web app instalável) | A documentação pede "celular, Mac e Windows". Um único código serve todos, sem loja de apps. Instala na tela inicial do Android/iOS. |
| Front-end | React 19 + TypeScript + Vite 8 + `vite-plugin-pwa` | Stack simples e rápida. Se um dia precisar de app nativo, dá para migrar para React Native/Expo reaproveitando a lógica. |
| Rotas | `react-router-dom` 7 (BrowserRouter) | Gera URLs limpas para o QR Code (`/p/JV-000001`). |
| Back-end | **Supabase** (Postgres + Auth + Storage), sem servidor próprio | Decisão definitiva da documentação. Toda a lógica roda no cliente, protegida por RLS. |
| QR Code | biblioteca `qrcode`, gerado no cliente | O QR carrega só a URL do registro, como exige a seção 12. |
| Relatório | Página HTML com CSS de impressão A4 (`@page size: A4`) | Imprime ou salva em PDF pelo navegador, sem servidor de PDF. |
| Fotos | Supabase Storage, bucket `plant-photos` | Imagem redimensionada no aparelho (no máx. 1600 px, JPEG 0,82) antes do envio, para economizar dados móveis. |
| Idioma do banco | Tabelas em inglês (como na seção 4); **colunas em português** | Mantém compatibilidade com as colunas que o `teste_cultiva.py` já usava (`codigo_publico`, `nome_comum`, `estagio`, `saude`). |

---

## 3. Funcionalidades entregues

### 3.1 Comparação com o MVP da documentação (seção 21)

| Item do MVP | Status | Observação |
|---|---|---|
| Login/cadastro | ✅ | E-mail e senha (Supabase Auth). O perfil é criado por trigger. |
| Cadastro de planta | ✅ | Todos os campos da seção 5, exceto "características" e "uso/curiosidades" por planta (esses vêm da espécie). |
| Upload de foto | ✅ | Câmera do celular (`capture="environment"`) ou galeria. |
| Registro de espécie | ✅ | Catálogo `plant_species` com 12 espécies iniciais. O usuário também pode criar espécies próprias (RLS). |
| Supabase | ✅ | 2 migrações SQL. |
| Cadastro de vaso | ✅ | Tipo, tamanho, volume, material, local. Vaso pode ser arquivado. |
| Histórico básico | ✅ | Linha do tempo que junta cuidados, observações, fotos e trocas de vaso. |
| Observações | ✅ | Com atalhos de sinais visuais e avaliação de saúde opcional. |
| Próxima ação | ✅ | Tarefas geradas automaticamente pelas regras (seção 5 deste relatório). |
| Página da planta | ✅ | Prontuário interno e página pública (`/p/:codigo`). |
| Relatório de 2 páginas | ✅ | Página 1 "Ação" e Página 2 "Conhecimento", conforme a seção 9. |
| QR Code | ✅ | Etiqueta 50 mm, com várias cópias e reimpressão. |

### 3.2 Itens além do MVP que entraram

- **Sementeiras e células** (seção 7). Grade de células A1, B2…, edição de várias células de uma vez, status (vazia/plantada/germinada/perdida/transplantada), dias até germinar e taxa de sucesso por bandeja. Transplantar uma célula germinada abre o cadastro de planta já preenchido (nome, espécie, origem "Sementeira X, célula A1", data de plantio) e liga a célula à planta criada.
- **Agenda/Dashboard** (seção 10). Totais por saúde, tarefas de hoje e atrasadas, próximos 7 dias, plantas sem foto há mais de 14 dias, atividade recente e alerta para plantas críticas.
- **Encerramento de ciclo.** Motivos: colheita final, morreu, doada, descartada. A planta sai da lista e da agenda, mas o histórico fica. Pode ser reativada.
- **Abrir registro por código** (menu Mais). Atende o caso de etiqueta perdida ou molhada da seção 12.
- **Favoritas, busca e filtros** (seção 11, "Minhas Plantas").

### 3.3 Telas (rotas)

| Rota | Tela |
|---|---|
| `/` | Início (dashboard) |
| `/plantas`, `/plantas/nova`, `/plantas/:id`, `/plantas/:id/editar` | Lista, cadastro, prontuário, edição |
| `/plantas/:id/relatorio` | Relatório A4 de 2 páginas |
| `/plantas/:id/etiqueta` | Etiqueta QR imprimível |
| `/agenda` | Tarefas: atrasadas / hoje / 7 dias / depois |
| `/vasos` | Vasos e locais |
| `/sementeiras`, `/sementeiras/:id` | Bandejas e grade de células |
| `/mais` | Conta, abrir por código, atalhos, como instalar, sair |
| `/p/:codigo` | Página pública (não precisa de login) |

A navegação inferior tem 5 abas: Início, Plantas, Agenda, Sementeiras e Mais. Os menus "Identificar", "Comunidade" e "Jardim Vivo IA" da seção 11 ainda não existem.

---

## 4. Banco de dados

### 4.1 Migrações

**`supabase/migrations/001_jardim_vivo_mvp.sql`**
- Detecta a tabela `plants` antiga (sem a coluna `owner_id`) e faz o seguinte:
  - **renomeia para `plants_legacy`**;
  - renomeia constraints e índices com o prefixo `legacy_`, para não colidirem com a nova tabela;
  - ativa RLS sem nenhuma política, o que deixa a tabela inacessível pela API até ser migrada à mão.

  **Nenhum dado é apagado.**
- Cria as tabelas, os triggers, as políticas RLS, a função `public_plant()`, o bucket de fotos e as políticas do Storage.
- Pode ser executado mais de uma vez (`if not exists`, `drop policy if exists`, `on conflict`).

**`supabase/migrations/002_especies_iniciais.sql`**
- Insere 12 espécies no catálogo oficial (`owner_id = null`): Manjericão, Alecrim, Tomate, Pimenta Dedo-de-Moça, Alface, Cebolinha, Salsa, Hortelã, Morango, Babosa, Coentro e Rúcula.
- Os textos de cada espécie são simples e voltados para iniciantes. Cobrem: luz, rega, substrato, adubação, temperatura, poda, transplante, floração, colheita, pragas, deficiências, estágios, usos e uma dica.
- Cada espécie também traz três números usados pelas regras:
  - `intervalo_verificacao_rega_dias`
  - `intervalo_adubacao_dias`
  - `dias_ate_colheita`

### 4.2 Tabelas criadas

| Tabela | Uso | Colunas principais |
|---|---|---|
| `profiles` | Usuário e papel | `papel` ∈ administrador, proprietario, contribuidor, externo, parceiro (definido, mas ainda sem efeito) |
| `plant_species` | Catálogo e base de conhecimento | Campos de texto do relatório + intervalos |
| `containers` | Vasos e recipientes | `tipo`, `tamanho`, `volume_litros`, `material`, `local`, `ativo` |
| `plants` | Identidade da planta | `codigo_publico` (gerado por sequence: `JV-` + 6 dígitos), `status_identificacao`, `confianca` 0–100, `estagio`, `saude`, `container_id`, `foto_path`, `publica`, `ativa`, `encerrada_em` |
| `plant_photos` | Fotos e evolução | `storage_path`, `legenda`, `tirada_em` |
| `plant_container_history` | Trocas de vaso | `from_container_id`, `to_container_id`, `motivo` |
| `seed_trays` / `seed_cells` | Sementeiras | `linhas`×`colunas`; células únicas por posição; `status`; `plant_id` de destino |
| `care_events` | Todos os cuidados | `tipo` ∈ rega, adubação, húmus, poda, transplante, colheita, floração, tratamento, limpeza, outro |
| `observations` | Observações | `texto`, `saude` opcional |
| `tasks` | Próximas ações e lembretes | `tipo`, `titulo`, `vence_em`, `concluida_em` |

Valores fechados usados nos campos (CHECK no banco):
- **estágio:** semente, germinação, muda, crescimento, floração, frutificação, colheita, dormência;
- **saúde:** saudável, atenção, crítica;
- **identificação:** ia, confirmado, pendente, contestado.

### 4.3 Diferenças em relação à lista da seção 4

| Entidade da documentação | O que foi feito |
|---|---|
| `users` | Virou `profiles`, ligada a `auth.users`, como é padrão no Supabase. |
| `watering_records`, `fertilization_records`, `care_events` | **Juntas em `care_events`**, com a coluna `tipo`. Isso simplifica a linha do tempo e as consultas. Se precisar de campos específicos (ml de água, produto e dose do adubo), dá para criar tabelas de detalhe depois. |
| `health_assessments` | Não existe ainda. A saúde fica em `plants.saude` e em `observations.saude`. Deve virar tabela própria quando a IA de saúde entrar. |
| `plant_identifications` | Não existe ainda. A identificação está resumida em `plants.status_identificacao` e `plants.confianca`. É necessária para a IA, que pode sugerir várias espécies possíveis. |
| `qr_codes` | Não criada. O QR é derivado de `codigo_publico`, que é fixo. Uma tabela só seria útil para controlar etiquetas físicas (versões, reimpressões). |
| `reports` | Não criada. O relatório é gerado na hora e não é guardado. |
| `notifications` | Não criada. A tabela `tasks` faz esse papel por enquanto. |
| `community_posts`, `suppliers` | Fora do escopo do MVP. |
| "Locais" (seção 11) | Ficou como texto em `containers.local`, sem tabela própria. |

### 4.4 Segurança

- **RLS em todas as tabelas.** A política é `owner_id = auth.uid()`, e `owner_id` já vem preenchido com `auth.uid()` por padrão.
- **Espécies:** qualquer usuário lê o catálogo oficial e as próprias espécies; só altera as próprias.
- **Página pública:** a função `public_plant(p_codigo)` é `SECURITY DEFINER` e liberada para `anon`. Ela devolve **apenas campos escolhidos** e **apenas se `plants.publica = true`**: nome, nome científico, confiança, estágio, saúde, foto, cuidados essenciais da espécie e os últimos 10 tipos de cuidado com a data. Notas, vaso, local e observações não aparecem.
- **Storage:** o bucket é **público para leitura**. Para enviar ou apagar, o usuário só pode mexer na própria pasta (`<user_id>/...`).

---

## 5. Regras de cuidado (`src/lib/care.ts`)

Estas regras traduzem a seção 23 ("casos especiais") e a seção 14 ("as notificações não devem impor um calendário rígido").

1. **Uma tarefa aberta por planta e por tipo.** `scheduleTask` atualiza a tarefa que já existe em vez de criar outra, para os lembretes não se acumularem.
2. **Ao cadastrar uma planta**, o app cria:
   - "Verificar umidade do substrato" para amanhã;
   - "Foto de acompanhamento" em 7 dias;
   - "Avaliar adubação/húmus", se a espécie tiver intervalo de adubação e a planta não for crítica;
   - "Colheita estimada", se houver data de plantio e `dias_ate_colheita`;
   - "Reavaliar planta debilitada" em 2 dias, se a planta for crítica.
3. **Rega.** Registrar uma rega fecha a tarefa de rega e agenda uma nova *verificação* depois do intervalo da espécie (2 dias se não houver). Na agenda, os botões são "💧 Reguei" e "Ainda úmido · ver amanhã", e não um "feito" cego.
4. **Adubação ou húmus.** Agenda a próxima avaliação, **exceto se a planta estiver crítica**.
5. **Observação marcada como "crítica":**
   - atualiza a saúde da planta;
   - **fecha as tarefas de adubação abertas**;
   - agenda "Reavaliar planta debilitada" em 2 dias, com o aviso "primeiro estabilizar; não presuma que adubo ou transplante resolvem".

   Uma observação "atenção" agenda reavaliação em 4 dias. Uma observação "saudável" fecha as reavaliações.
6. **Transplante ou troca de vaso.**
   - Registra o histórico e mantém o ID da planta.
   - Registra um cuidado do tipo transplante (só se a planta já estava em algum vaso).
   - Agenda "Avaliar adaptação" em 5 dias, **sem substituir uma reavaliação mais urgente** que já exista (parâmetro `keepEarlier`).
7. **Foto.** A próxima foto de acompanhamento vem em 14 dias se a planta está saudável e em 7 dias se não está.
8. **Várias plantas no mesmo vaso.** A tela de vasos avisa que mudas juntas competem e devem ser separadas no momento certo.
9. **Encerrar ciclo.** Fecha todas as tarefas abertas da planta.

Os dois últimos pontos das regras 5 e 6 corrigem bugs que o teste encontrou na primeira versão. Antes, uma planta crítica continuava com lembrete de adubação, e o lembrete do transplante apagava a reavaliação urgente.

---

## 6. Relatório A4 (`src/pages/Report.tsx`)

**Página 1 — Ação:**
- identidade Jardim Vivo, código, nome comum e científico, situação da identificação e confiança;
- foto, QR Code (só se a planta for pública);
- estágio, saúde, dificuldade, data de plantio, próxima ação e próxima avaliação;
- "O que fazer hoje — passo a passo", gerado assim:
  - se a planta está crítica, entram passos de estabilização;
  - entram as tarefas vencidas;
  - entram passos fixos: verificar o substrato, inspecionar folhas, conferir a luz da espécie;
- riscos (observações não saudáveis + pragas comuns da espécie);
- explicação (texto conforme a saúde);
- dica extra.

**Página 2 — Conhecimento:** os 16 campos da espécie que estiverem preenchidos, em duas colunas, e um aviso sobre uso culinário ou medicinal.

A regra da seção 9 foi seguida: o relatório **não contém nada interno do app**, só informação sobre a planta.

---

## 7. Estrutura de arquivos

```
supabase/
  config.toml                         configuração do Supabase CLI local
  migrations/001_jardim_vivo_mvp.sql  esquema, RLS, função pública, storage
  migrations/002_especies_iniciais.sql catálogo inicial
src/
  main.tsx, App.tsx                   entrada, rotas, layout com navegação inferior
  styles.css                          tema mobile-first, modo escuro, regras de impressão
  lib/supabase.ts                     cliente e URL das fotos
  lib/auth.tsx                        contexto de sessão
  lib/hooks.ts                        useLoad + consultas de espécies e vasos
  lib/care.ts                         regras de cuidado, tarefas, upload de foto, troca de vaso
  lib/types.ts                        tipos e valores dos campos fechados
  lib/dates.ts, lib/qr.ts             utilidades
  components/ui.tsx                   Badge, Thumb, TopBar, Sheet, TaskItem…
  pages/*.tsx                         13 telas
vercel.json, public/_redirects        rotas da SPA para Vercel e Netlify
.env.example                          VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
```

---

## 8. Como foi testado

1. **SQL.** As migrações rodaram num PostgreSQL 16 local com simulação do Supabase, **duas vezes seguidas** (para provar que são idempotentes). O teste incluiu uma tabela `plants` antiga, igual à do `teste_cultiva.py`, e confirmou que ela vira `plants_legacy` sem perder dados.
2. **Supabase local completo** (`supabase start` no Docker). As migrações foram aplicadas pela CLI oficial.
3. **Teste ponta a ponta com Playwright/Chromium**, em tela de celular (390×844). O roteiro foi:
   1. criar conta e cadastrar 2 vasos;
   2. cadastrar uma planta com espécie, foto, vaso e página pública;
   3. registrar uma rega e uma observação crítica;
   4. trocar de vaso;
   5. abrir o dashboard e a agenda;
   6. gerar o relatório (e um PDF A4) e a etiqueta QR;
   7. abrir a página pública **sem login** e testar um código inexistente;
   8. criar uma sementeira 2×3, editar várias células, marcar uma perda e transplantar uma célula para uma nova planta;
   9. abrir a lista de plantas.

   Resultado: **todos os passos passaram, sem nenhum erro no console**.
4. **Conferência direta no banco** do estado das tarefas depois das regras: adubação fechada na planta crítica e reavaliação preservada.
5. `tsc` (modo strict) e `vite build` sem erros.

**Não foi testado:**
- o projeto Supabase de produção;
- aparelhos físicos (iPhone e Android reais);
- impressão em impressora real;
- testes automatizados versionados no repositório (o roteiro do Playwright ficou fora do repo).

---

## 9. Limitações e pontos de atenção

1. **Fotos ficam acessíveis por URL.** Como o bucket é público, quem tiver a URL de uma foto consegue abri-la, mesmo que a planta não esteja marcada como pública. A URL é difícil de adivinhar (contém UUIDs), mas a proteção não é real. A alternativa é um bucket privado com URLs assinadas, e a página pública buscaria a foto por uma função própria.
2. **RLS das tabelas filhas.** A política confere `owner_id` da própria linha, mas não confere se o `plant_id` pertence ao mesmo usuário. Um usuário conseguiria inserir um registro apontando para a planta de outra pessoa, embora não consiga ler nada dela. Vale reforçar a política com `exists (select 1 from plants where id = plant_id and owner_id = auth.uid())`.
3. **Sem compartilhamento.** Os papéis (família, contribuidor, externo, parceiro; caso Tripac Imóveis) estão definidos em `profiles.papel`, mas as políticas ainda são só do dono. Precisa de uma tabela de compartilhamento (algo como `plant_members(plant_id, user_id, papel)`) e de políticas que a consultem.
4. **Sem notificações push.** Os lembretes só aparecem quando o usuário abre o app. Push num PWA exige Web Push, um service worker com push e uma função no servidor (Supabase Edge Function + cron). No iOS, só funciona com o app instalado na tela inicial.
5. **Sem IA.** Identificação, saúde visual e "Perguntar sobre a planta" não foram implementados. O campo `status_identificacao = 'ia'` e o campo `confianca` já existem para receber isso.
6. **Funciona só online.** O PWA guarda a interface em cache, mas os dados vêm sempre do Supabase. Não há fila para registrar cuidados sem internet (por exemplo, no quintal com sinal fraco).
7. **`teste_cultiva.py` não funciona mais** com o novo esquema: ele grava sem usuário dono e usa a coluna `especie`. Os dados que ele gravou estão em `plants_legacy` e não foram migrados para `plants`.
8. **Sequência dos códigos JV.** Ela começa em 1, então a primeira planta nova será `JV-000001` de novo. Se os códigos antigos já foram impressos em etiquetas, é preciso ajustar a sequência (`select setval('plant_codigo_seq', N)`) **antes** de cadastrar.
9. **Código global.** O `codigo_publico` é único no sistema todo, não por usuário. Isso combina com o QR, mas mostra para cada usuário quantas plantas existem no sistema.
10. **Catálogo inicial pequeno** (12 espécies). Os textos foram escritos à mão e merecem revisão por alguém de agronomia ou jardinagem.
11. **Fuso horário.** As tarefas usam datas (`date`) calculadas no fuso do aparelho. Os eventos usam `timestamptz`. Ainda não há uma configuração de fuso por usuário.
12. **Fontes do relatório.** O relatório usa emojis no cabeçalho, e eles podem aparecer de forma diferente na impressão conforme o sistema.
13. **Erros pouco tratados.** Algumas ações rápidas (mudar estágio, reativar planta) não mostram mensagem de erro amigável quando falham.

---

## 10. Próximos passos sugeridos (em ordem)

1. Rodar as migrações no Supabase de produção e decidir o destino de `plants_legacy` e da sequência JV.
2. Publicar na Vercel ou na Netlify e testar em celulares reais.
3. Corrigir os pontos 1 e 2 da seção 9 (privacidade das fotos e RLS das tabelas filhas).
4. **IA por foto** (seções 8 e 8.1):
   - uma Edge Function recebe a foto e chama um modelo de visão;
   - grava as possibilidades em `plant_identifications`;
   - o usuário confirma ou corrige;
   - o app pede outra foto quando a confiança for baixa.
5. Permissões: família e contribuidores, usuário externo.
6. Notificações push.
7. Comparar fotos lado a lado, estatísticas e relatórios históricos.
8. Comunidade e parceiros (seções 16 a 18).

---

## 11. Perguntas em aberto para o dono do projeto

- Os códigos JV antigos já foram impressos em etiquetas? (Isso define a numeração inicial.)
- As fotos de plantas que não são públicas precisam ficar realmente privadas desde já?
- Qual provedor de IA será usado para identificação e saúde, e qual o orçamento por foto?
- O app vai ser publicado em qual domínio? (`jardimvivo.com.br`?)
- Os papéis de família/externo são necessários já na próxima versão?
