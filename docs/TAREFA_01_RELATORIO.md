# Jardim Vivo — Tarefa 01: auditoria e preparação do piloto

- **Branch:** `claude/agricultural-cultivation-app-ihplv7`
- **Base auditada:** commit `75d06a3`
- **Ambiente de teste:** Supabase local oficial (Docker, CLI 2.120) + Chromium.
- **Projeto Supabase de produção:** não foi tocado.

> Os testes locais passaram, mas o app **não** está pronto para publicação pública. Veja a seção I (Pendências).

---

## A. O que já está correto

- **RLS de leitura, alteração e exclusão por dono** (`owner_id = auth.uid()`). Os testes confirmaram:
  - outro usuário vê 0 linhas em todas as 9 tabelas;
  - o usuário anônimo também vê 0 linhas;
  - nenhum dos dois consegue alterar ou excluir dados alheios.
- **Autenticação.** Cadastro e login por e-mail funcionam; o perfil é criado por trigger.
- **Vaso separado da planta.** Trocar de vaso mantém o ID da planta e grava o histórico.
- **Sementeira → célula → planta.** As células não viram plantas sozinhas; a planta individual só nasce no transplante. O modelo já estava certo, com dois bugs de interface (seção B).
- **Página pública.** A função `public_plant` só devolve plantas com `publica = true` e só campos escolhidos. Notas, observações, vaso e local não aparecem.
- **Relatório de 2 páginas A4.** Conteúdo e layout corretos. **Não foi alterado**, exceto a forma de carregar a foto.
- **QR Code.** Grava só o endereço `/p/JV-xxxxxx`; os dados ficam no banco.
- **Regras de cuidado.** Rega começa pela verificação do substrato; planta crítica suspende a adubação; o transplante não apaga uma reavaliação urgente.
- **Plantas mortas.** Nada é apagado automaticamente. O fim do ciclo desativa a planta e mantém o histórico.

## B. Problemas encontrados

| # | Problema | Gravidade |
|---|---|---|
| 1 | **`plant_id` forjado.** Um usuário conseguia criar cuidado, observação, foto, tarefa ou histórico apontando para a planta de outro usuário. Também conseguia criar célula na bandeja de outro e planta no vaso de outro. | Crítico |
| 2 | **Fotos públicas.** O bucket era público: qualquer foto abria pela URL, mesmo de planta privada. | Crítico |
| 3 | **`foto_path` apontando para arquivo alheio.** Um usuário podia gravar na própria planta pública o caminho da foto de outro usuário e expor essa foto. | Crítico |
| 4 | **Código escolhido pelo cliente.** O app aceitava `codigo_publico` enviado pelo cliente. Daria para "tomar" códigos e travar a numeração de outros usuários. O código também podia ser alterado depois. | Alto |
| 5 | **Papel.** O próprio usuário conseguia se promover a `administrador` em `profiles.papel`. | Alto (o papel ainda não é usado, mas seria uma brecha futura) |
| 6 | **Edição em lote de células apagava dados.** O app copiava a espécie e as datas da 1ª célula selecionada para todas as outras. Com 200 sementes de espécies diferentes, isso corromperia os registros. | Crítico para o piloto |
| 7 | **Respostas fora de ordem.** O carregador das telas (`useLoad`) não descartava respostas antigas. Uma consulta lenta feita antes do login sobrescrevia a mais nova. Apareceu de forma intermitente no QR do dono. | Alto |
| 8 | **Endereço do QR.** O QR usava o endereço onde o app estava aberto. Etiquetas impressas durante o teste (localhost ou IP da rede) não abririam depois. | Alto para o piloto |
| 9 | **Estado final.** A morte da planta era só um texto livre (`motivo_encerramento`) e não aparecia na linha do tempo. | Médio |
| 10 | **Célula sem estágio "muda".** Faltava o estágio entre germinada e transplantada. | Médio |
| 11 | **Seleção de células uma a uma.** Para 200 sementes, era preciso tocar célula por célula. | Médio |
| 12 | **Resumo das bandejas.** Era calculado baixando todas as células. Passaria do limite de 1000 linhas da API e mostraria números errados em silêncio. | Médio |
| 13 | **Cadastro duplicado.** Se a foto falhasse depois de a planta ser criada, o usuário via um erro, salvava de novo e criava uma planta duplicada. | Médio |
| 14 | **Erro de estágio sem aviso.** Erros ao mudar o estágio eram engolidos (promessa sem tratamento). | Baixo |
| 15 | **Tipo da foto.** Arquivos que não eram JPEG eram enviados com o tipo `image/jpeg`. | Baixo |
| 16 | **Exclusão fácil demais.** Um único "OK" apagava a planta e todo o histórico. | Médio |
| 17 | **Taxa de germinação enganosa.** Contava sementes ainda em espera como falha: "20%" logo após o plantio. | Baixo |

## C. Críticos (impediam o piloto)

Os problemas **B1, B2, B3, B6, B7 e B8**. **Todos foram corrigidos e cobertos por teste.**

## D. Pode esperar (não impede o piloto)

- **Arquivos de foto órfãos.** Ao excluir uma planta, os arquivos ficam no Storage, privados e inacessíveis. Precisa de uma rotina de limpeza.
- **Limite de 1000 linhas da API.** Atinge a lista de plantas e a agenda. Com ~4 lembretes por planta, a agenda passa de 1000 tarefas a partir de ~250 plantas individualizadas. A ordenação por data faz com que se percam só as tarefas mais distantes. Precisa de paginação antes de crescer.
- **Bandeja de 20 colunas.** A grade rola na horizontal e as letras das linhas saem da tela.
- **Senha.** Não há "esqueci a senha". No piloto, dá para redefinir pelo painel do Supabase.
- **Fotos HEIC.** Fotos HEIC que o navegador não converte são guardadas como HEIC. Só o Safari as exibe.
- **Sem uso offline.** Registrar um cuidado sem internet falha (o app avisa com erro).
- **Exclusão de bandeja.** Excluir uma bandeja apaga suas células (pede confirmação). As plantas já transplantadas não são afetadas.
- **Script antigo.** O `teste_cultiva.py` não funciona com o esquema atual. Ficou como estava, porque é um arquivo do dono.
- **Relatório anterior desatualizado.** O `docs/RELATORIO_IMPLEMENTACAO.md` não foi atualizado para refletir esta tarefa.

## E. Alterações feitas

1. **RLS reescrita por operação.** Ler, criar, alterar e excluir têm políticas separadas, só para usuários logados. Na criação e na alteração, o banco confere que `plant_id`, `container_id`, `tray_id`, `from/to_container_id` e `species_id` pertencem ao usuário. Isso é feito por funções do próprio banco, sem confiar no que o cliente envia.
2. **Fotos privadas.**
   - O bucket deixou de ser público. Limite de 10 MB por arquivo; só formatos de imagem.
   - Leitura liberada só para o dono, por URL assinada válida por 1 h.
   - Exceção: a **foto atual** de uma planta marcada como pública. Fotos antigas dela continuam privadas, e tudo volta a ser privado ao despublicar.
   - Envio só no caminho `<seu_id>/<sua_planta>/…`.
   - `foto_path` e `storage_path` precisam seguir esse mesmo formato.
3. **Fotos no app.** Todas as telas passaram a usar URL assinada, pedida em lote (uma chamada por tela) e guardada em cache. Arquivo novo: `src/lib/photos.tsx`.
4. **Código JV, dono e data de criação** passaram a ser controlados pelo banco (trigger). O código é gerado sempre pelo banco e não pode ser alterado pelo app. A numeração continua depois do maior código existente, incluindo os da `plants_legacy`, para não repetir etiquetas antigas.
5. **`profiles`.** O usuário só altera o próprio `nome`; o `papel` não pode mais ser mudado pelo app.
6. **Estado final estruturado.** Nova coluna `plants.estado_final`: colhida, morta, doada, descartada ou outro. Ao encerrar o ciclo:
   - entra uma observação na linha do tempo;
   - a lista mostra "encerrada: morta";
   - reativar também fica registrado.
7. **Sementeiras.**
   - Novo status `muda` entre germinada e transplantada.
   - Seleção rápida: linha inteira, "Todas vazias", "Todas semeadas".
   - A edição em lote aplica só os campos alterados. A data de plantio e a de germinação só preenchem células que estavam em branco.
   - Resumo calculado no banco (view `seed_tray_stats`) e mostrado como "X de Y germinaram".
   - O transplante pode sair de uma célula germinada ou já muda. O histórico do vaso registra "Transplante da sementeira".
8. **Carregamento das telas.** `useLoad` agora descarta respostas antigas.
9. **QR.**
   - Nova variável `VITE_PUBLIC_URL` define o endereço gravado no QR.
   - A tela da etiqueta mostra esse endereço e avisa se ele for local.
   - O dono logado que escaneia a própria etiqueta abre direto o registro completo, mesmo de planta privada.
10. **Cadastro de planta.** Depois que a planta é criada, falhas nos passos seguintes (foto, lembretes, célula) mostram um aviso e levam à página da planta. Isso evita cadastro duplicado.
11. **Exclusão.** Agora é preciso **digitar o código** da planta. A mensagem orienta a usar "Encerrar ciclo" quando a planta morreu.
12. **Pequenos ajustes:**
    - o próximo lembrete conta a partir da data real do cuidado (registros retroativos);
    - erro ao mudar o estágio agora aparece;
    - a foto é enviada com o tipo correto;
    - a tela Início ganhou os atalhos "Nova planta" e "Novo plantio em bandeja".

Não foram criadas funcionalidades grandes. Nenhuma tabela ou dado foi apagado. O padrão do relatório A4 não mudou.

## F. Testes executados

| Teste | Resultado |
|---|---|
| `npm run typecheck` (TypeScript strict) | ✅ |
| `vite build` (produção, PWA) | ✅ |
| `npm run test:seguranca`: 8 testes, 2 usuários + anônimo, contra Supabase local real | ✅ 8/8 (**antes das correções: 3/8**; os 5 que falharam reproduziram B1–B5) |
| `npm run test:e2e`: 17 etapas no navegador com conferência no banco | ✅ 17/17, sem erros no console; **3 execuções seguidas** a partir de banco limpo |
| Migração 003 aplicada duas vezes seguidas (idempotência) | ✅ |
| Migração 003 com `plants_legacy` contendo JV-000150 | ✅ a numeração continuou em 151 |

**O que o teste de segurança cobre:**
- outro usuário e o anônimo não leem nada nas 9 tabelas nem no resumo das bandejas;
- outro usuário não altera nem exclui;
- 11 tentativas de `plant_id`, vaso, bandeja ou caminho de foto forjados são bloqueadas;
- foto privada não abre pela URL pública, não é assinada nem baixada por outro usuário, e outro usuário não envia nem apaga arquivos na pasta do dono;
- a página pública mostra só a foto atual e volta a ser privada ao despublicar;
- o código JV não pode ser escolhido nem alterado pelo app;
- o usuário não muda o próprio papel;
- o dono continua conseguindo fazer tudo no próprio jardim.

**Etapas do teste ponta a ponta:**
1. Cadastro de conta.
2. Bandeja de **200 células**, sem criar nenhuma planta.
3. Semeadura em lote por linha e "todas vazias".
4. Germinação em lote **mantendo a espécie de cada célula**.
5. Registro de perda.
6. Célula muda → transplante para um vaso, criando **uma** planta com JV, origem e histórico do vaso.
7. Foto exibida por URL assinada (a URL pública é recusada).
8. Identificação (confirmado, 90%) e mudança de estágio.
9. Rega e observação crítica, que suspende a adubação.
10. Relatório com 2 páginas A4 e PDF.
11. Etiqueta QR; o dono escaneia e cai no próprio registro.
12. Anônimo vê "não público" e, depois de ativada, só a página pública, sem observações.
13. Outro usuário não abre a planta, o QR privado nem a bandeja.
14. Cancelar a exclusão mantém a planta.
15. Planta encerrada como **morta**, com histórico intacto e tarefas fechadas.
16. Resumo da bandeja.

**Não testado:**
- o projeto Supabase de produção;
- celulares reais (iPhone e Android);
- câmera real e fotos HEIC;
- impressão física de etiquetas e relatório;
- desempenho com rede móvel lenta.

## G. Arquivos alterados

**Novos:**
- `supabase/migrations/003_seguranca_piloto.sql`
- `src/lib/photos.tsx`
- `tests/seguranca.test.mjs`
- `tests/piloto.e2e.mjs`
- `docs/TAREFA_01_RELATORIO.md`

**Alterados:**
- `src/lib/`: `care.ts`, `hooks.ts`, `qr.ts`, `supabase.ts`, `types.ts`
- `src/components/ui.tsx`
- `src/pages/`: `Home`, `PlantDetail`, `PlantForm`, `PlantList`, `PublicPlant`, `QrLabel`, `Report` (só a foto), `TrayDetail`, `Trays`
- `src/styles.css`
- `package.json` (scripts de teste e `playwright-core` como devDependency)
- `.env.example` (`VITE_PUBLIC_URL`)
- `.gitignore`
- `README.md`

## H. Banco de dados

**Uma migração nova: `003_seguranca_piloto.sql`.** É aditiva e idempotente; não apaga tabelas nem dados. As migrações 001 e 002 não foram alteradas.

- **Políticas:**
  - nas 9 tabelas do usuário, a antiga política "dono" foi trocada por quatro: "dono: ler", "dono: criar", "dono: alterar" e "dono: excluir";
  - `plant_species` e `profiles` tiveram as políticas recriadas;
  - `storage.objects` tem três políticas: ler as próprias fotos, ler a foto atual de planta pública e enviar as próprias.
- **Funções:**
  - de posse: `jv_owns_plant`, `jv_owns_container`, `jv_owns_tray`, `jv_species_visible`;
  - de fotos: `jv_photo_path_ok`, `jv_foto_publica`;
  - de proteção: `jv_plants_protect`, `jv_keep_owner`.
- **Triggers:** `plants_protect` e `keep_owner` (este em 8 tabelas).
- **Colunas:** `plants.estado_final` (com CHECK).
- **Status de célula:** o CHECK de `seed_cells.status` passou a incluir `muda`.
- **View:** `seed_tray_stats` (`security_invoker`).
- **Storage:** bucket `plant-photos` → privado, 10 MB, apenas imagens.
- **Permissões:** `revoke insert/update/delete` em `profiles`; `grant update(nome)`.
- **Sequência:** `plant_codigo_seq` ajustada para depois do maior código existente.

## I. Pendências para o piloto

1. **Decidir o destino da `plants_legacy`** e se os códigos antigos já foram impressos. A migração 003 já evita códigos repetidos.
2. **No Supabase de produção:**
   - rodar a 003 (e a 001 e a 002, se ainda não foram);
   - conferir em **Authentication → URL Configuration** o Site URL e a confirmação de e-mail;
   - **desativar novos cadastros** (Authentication → Sign In / Providers → Allow new users to sign up) depois de criar a conta do dono, já que o app não está liberado ao público.
3. **Escolher o endereço definitivo do app** e definir `VITE_PUBLIC_URL` **antes de imprimir qualquer etiqueta**.
4. **Publicar em HTTPS** (Vercel ou Netlify) e testar no celular do dono: câmera, instalação, uma bandeja real, uma etiqueta impressa.
5. **Rodar os testes contra uma cópia de staging, nunca contra produção.** Eles criam usuários e por isso exigem `ALLOW_REMOTE=1` para rodar fora do ambiente local.

## J. Próxima tarefa recomendada

**Tarefa 02 — Implantação do piloto:** aplicar as migrações no Supabase de produção, publicar o app em HTTPS com `VITE_PUBLIC_URL` definitivo e bloquear novos cadastros. Em seguida, fazer um teste guiado no celular do dono: registrar uma bandeja real das 200 sementes e imprimir uma etiqueta.
