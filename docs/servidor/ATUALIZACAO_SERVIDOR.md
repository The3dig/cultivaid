# Jardim Vivo — Atualização do servidor (Supabase)

Este arquivo junta as migrações `001`, `002` e `003` (pasta `supabase/migrations/`) num único SQL.

## Resumo

| Item | Valor |
|---|---|
| Onde aplicar | Supabase → **SQL Editor** |
| Pode rodar mais de uma vez? | Sim, nenhuma parte quebra se for executada de novo |
| Apaga dados? | Não. A tabela `plants` antiga é preservada como `plants_legacy` |
| Testado em | Supabase local, em 2 situações: banco já atualizado e banco só com a tabela antiga |

## Passo a passo

1. **Faça um backup:** Database → Backups.
2. **SQL Editor → New query.**
3. Copie **todo o bloco SQL** do final deste arquivo, cole e clique em **Run**.
4. Confira a linha de resultado que aparece no fim:

| Coluna | Valor esperado | O que significa |
|---|---|---|
| `bucket_publico_deve_ser_false` | `false` | As fotos ficaram privadas |
| `especies_catalogo_deve_ser_12` | `12` | O catálogo inicial de espécies foi carregado |
| `politicas_dono_deve_ser_36` | `36` | As regras de acesso estão ativas |
| `coluna_estado_final_deve_ser_1` | `1` | O campo de estado final da planta existe |
| `existe_plants_legacy` | `true` ou `false` | `true` se havia a tabela antiga do `teste_cultiva.py` |

Se aparecer algum erro, copie a mensagem e envie.

## Depois do SQL, no painel do Supabase

- **Authentication → Sign In / Providers:** depois de criar a sua conta, desligue **"Allow new users to sign up"**. O app ainda não está liberado ao público.
- **Authentication → URL Configuration:** coloque em **Site URL** o endereço definitivo do app.

## Variáveis do app (Vercel / Netlify)

| Variável | Valor |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave publishable/anon |
| `VITE_PUBLIC_URL` | Endereço definitivo do app. É gravado nos QR Codes: **defina antes de imprimir etiquetas** |

## SQL completo

```sql
-- =====================================================================
-- JARDIM VIVO — ATUALIZAÇÃO COMPLETA DO SERVIDOR (Supabase)
-- Gerado a partir de supabase/migrations/001, 002 e 003 (commit atual).
--
-- COMO USAR: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mesmo que a 001/002 já tenham sido aplicadas: tudo é
-- idempotente. Nada é apagado; a tabela "plants" antiga (do
-- teste_cultiva.py) é preservada como "plants_legacy".
-- Recomendado: faça um backup antes (Database → Backups).
-- =====================================================================


-- >>>>>>>>>>>>>>>> 001_jardim_vivo_mvp.sql <<<<<<<<<<<<<<<<

-- =====================================================================
-- Jardim Vivo — esquema do MVP (Supabase / PostgreSQL)
-- Rode no SQL Editor do Supabase (ou via `supabase db push`).
-- O script é idempotente: pode ser executado mais de uma vez.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabela "plants" antiga (criada pelo teste_cultiva.py, sem dono/RLS):
-- é preservada como plants_legacy para não perder dados.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'plants')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'plants'
                       and column_name = 'owner_id') then
    alter table public.plants rename to plants_legacy;
    -- sem políticas: fica inacessível pela API até ser migrada manualmente
    alter table public.plants_legacy enable row level security;
    -- renomeia constraints e índices para não colidirem com a nova tabela
    for r in select conname from pg_constraint
             where conrelid = 'public.plants_legacy'::regclass and contype in ('p','u') loop
      execute format('alter table public.plants_legacy rename constraint %I to %I',
                     r.conname, 'legacy_' || r.conname);
    end loop;
    for r in select c.relname from pg_index i join pg_class c on c.oid = i.indexrelid
             where i.indrelid = 'public.plants_legacy'::regclass
               and c.relname not like 'legacy\_%' loop
      execute format('alter index public.%I rename to %I', r.relname, 'legacy_' || r.relname);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Perfis de usuário
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  papel text not null default 'proprietario'
    check (papel in ('administrador','proprietario','contribuidor','externo','parceiro')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Catálogo de espécies (base de conhecimento usada no relatório)
-- owner_id nulo = catálogo oficial Jardim Vivo
-- ---------------------------------------------------------------------
create table if not exists public.plant_species (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade default auth.uid(),
  nome_comum text not null,
  nome_cientifico text,
  familia text,
  descricao text,
  origem text,
  dificuldade text check (dificuldade in ('fácil','média','difícil')),
  luminosidade text,
  rega text,
  intervalo_verificacao_rega_dias int,
  substrato text,
  adubacao text,
  intervalo_adubacao_dias int,
  temperatura text,
  poda text,
  transplante text,
  floracao text,
  colheita text,
  dias_ate_colheita int,
  pragas text,
  deficiencias text,
  estagios text,
  usos text,
  dica text,
  created_at timestamptz not null default now()
);
create unique index if not exists plant_species_oficial_nome
  on public.plant_species (lower(nome_comum)) where owner_id is null;

-- ---------------------------------------------------------------------
-- Vasos / recipientes (entidade separada da planta)
-- ---------------------------------------------------------------------
create table if not exists public.containers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nome text not null,
  tipo text not null default 'vaso'
    check (tipo in ('vaso','jardineira','canteiro','floreira','garrafa','saco de cultivo','outro')),
  tamanho text,
  volume_litros numeric,
  material text,
  local text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Plantas — identidade individual
-- ---------------------------------------------------------------------
create sequence if not exists public.plant_codigo_seq;

create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  codigo_publico text not null unique
    default ('JV-' || lpad(nextval('public.plant_codigo_seq')::text, 6, '0')),
  nome_comum text not null,
  nome_cientifico text,
  species_id uuid references public.plant_species(id) on delete set null,
  confianca numeric check (confianca between 0 and 100),
  status_identificacao text not null default 'pendente'
    check (status_identificacao in ('ia','confirmado','pendente','contestado')),
  estagio text not null default 'muda'
    check (estagio in ('semente','germinação','muda','crescimento','floração','frutificação','colheita','dormência')),
  saude text not null default 'saudável'
    check (saude in ('saudável','atenção','crítica')),
  dificuldade text check (dificuldade in ('fácil','média','difícil')),
  origem text,
  data_plantio date,
  ambiente text,
  luminosidade text,
  container_id uuid references public.containers(id) on delete set null,
  foto_path text,
  foto_em timestamptz,
  favorita boolean not null default false,
  publica boolean not null default false,
  ativa boolean not null default true,
  encerrada_em date,
  motivo_encerramento text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plants_owner_idx on public.plants (owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists plants_touch on public.plants;
create trigger plants_touch before update on public.plants
  for each row execute function public.touch_updated_at();

-- Fotos e evolução
create table if not exists public.plant_photos (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  storage_path text not null,
  legenda text,
  tirada_em timestamptz not null default now()
);
create index if not exists plant_photos_plant_idx on public.plant_photos (plant_id, tirada_em desc);

-- Histórico planta ↔ vaso (troca de vaso preserva o ID da planta)
create table if not exists public.plant_container_history (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  from_container_id uuid references public.containers(id) on delete set null,
  to_container_id uuid references public.containers(id) on delete set null,
  data timestamptz not null default now(),
  motivo text
);
create index if not exists pch_plant_idx on public.plant_container_history (plant_id, data desc);

-- ---------------------------------------------------------------------
-- Sementeiras e células
-- ---------------------------------------------------------------------
create table if not exists public.seed_trays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  nome text not null,
  linhas int not null check (linhas between 1 and 26),
  colunas int not null check (colunas between 1 and 30),
  local text,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.seed_cells (
  id uuid primary key default gen_random_uuid(),
  tray_id uuid not null references public.seed_trays(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  linha int not null,
  coluna int not null,
  species_id uuid references public.plant_species(id) on delete set null,
  semente text,
  data_plantio date,
  data_germinacao date,
  status text not null default 'vazia'
    check (status in ('vazia','plantada','germinada','perdida','transplantada')),
  plant_id uuid references public.plants(id) on delete set null,
  observacoes text,
  updated_at timestamptz not null default now(),
  unique (tray_id, linha, coluna)
);

-- ---------------------------------------------------------------------
-- Cuidados, observações e tarefas
-- ---------------------------------------------------------------------
create table if not exists public.care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  tipo text not null
    check (tipo in ('rega','adubação','húmus','poda','transplante','colheita','floração','tratamento','limpeza','outro')),
  data timestamptz not null default now(),
  quantidade text,
  notas text
);
create index if not exists care_events_plant_idx on public.care_events (plant_id, data desc);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  texto text not null,
  saude text check (saude in ('saudável','atenção','crítica')),
  data timestamptz not null default now()
);
create index if not exists observations_plant_idx on public.observations (plant_id, data desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  plant_id uuid references public.plants(id) on delete cascade,
  tipo text not null default 'outro',
  titulo text not null,
  vence_em date not null default current_date,
  concluida_em timestamptz,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists tasks_owner_open_idx on public.tasks (owner_id, vence_em) where concluida_em is null;

-- ---------------------------------------------------------------------
-- Row Level Security: cada usuário vê e altera apenas o que é seu
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists "perfil próprio" on public.profiles;
create policy "perfil próprio" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

alter table public.plant_species enable row level security;
drop policy if exists "espécies: leitura" on public.plant_species;
create policy "espécies: leitura" on public.plant_species
  for select using (owner_id is null or owner_id = auth.uid());
drop policy if exists "espécies: próprias" on public.plant_species;
create policy "espécies: próprias" on public.plant_species
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['containers','plants','plant_photos','plant_container_history',
                           'seed_trays','seed_cells','care_events','observations','tasks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Página pública da planta (QR Code) — expõe só o permitido
-- ---------------------------------------------------------------------
create or replace function public.public_plant(p_codigo text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'codigo_publico', p.codigo_publico,
    'nome_comum', p.nome_comum,
    'nome_cientifico', p.nome_cientifico,
    'confianca', p.confianca,
    'status_identificacao', p.status_identificacao,
    'estagio', p.estagio,
    'saude', p.saude,
    'foto_path', p.foto_path,
    'atualizado_em', p.updated_at,
    'especie', case when s.id is null then null else json_build_object(
      'luminosidade', s.luminosidade, 'rega', s.rega, 'substrato', s.substrato,
      'adubacao', s.adubacao, 'dica', s.dica) end,
    'cuidados', (select coalesce(json_agg(c order by c.data desc), '[]'::json) from (
        select tipo, data from public.care_events where plant_id = p.id
        order by data desc limit 10) c)
  )
  from public.plants p
  left join public.plant_species s on s.id = p.species_id
  where p.codigo_publico = upper(p_codigo) and p.publica;
$$;
grant execute on function public.public_plant(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage de fotos: bucket público para leitura (caminhos com UUID),
-- escrita só na pasta do próprio usuário: <user_id>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', true)
on conflict (id) do nothing;

drop policy if exists "fotos: enviar próprias" on storage.objects;
create policy "fotos: enviar próprias" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: apagar próprias" on storage.objects;
create policy "fotos: apagar próprias" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- >>>>>>>>>>>>>>>> 002_especies_iniciais.sql <<<<<<<<<<<<<<<<

-- =====================================================================
-- Jardim Vivo — catálogo inicial de espécies (orientação oficial)
-- Intervalos são apenas lembretes para VERIFICAR; a decisão de regar ou
-- adubar deve sempre considerar o substrato e a condição da planta.
-- =====================================================================

insert into public.plant_species
  (owner_id, nome_comum, nome_cientifico, familia, descricao, origem, dificuldade,
   luminosidade, rega, intervalo_verificacao_rega_dias, substrato, adubacao, intervalo_adubacao_dias,
   temperatura, poda, transplante, floracao, colheita, dias_ate_colheita, pragas, deficiencias,
   estagios, usos, dica)
values
(null, 'Manjericão', 'Ocimum basilicum', 'Lamiaceae',
 'Erva aromática de folhas macias e perfumadas, muito usada na cozinha.',
 'Regiões tropicais da Ásia e África.', 'fácil',
 'Sol pleno ou pelo menos 4–6 h de sol direto.',
 'Manter o substrato levemente úmido, sem encharcar. Verifique com o dedo: regue quando os 2 cm de cima estiverem secos.', 2,
 'Substrato leve, rico em matéria orgânica e bem drenado.',
 'Húmus de minhoca ou composto orgânico a cada 30 dias, em pequena quantidade.', 30,
 'Prefere 18–30 °C; sofre com frio e geada.',
 'Belisque as pontas acima de um par de folhas para ramificar. Retire os botões florais para prolongar a produção de folhas.',
 'Transplante quando a muda tiver 4–6 folhas verdadeiras.',
 'Floresce no verão; a floração reduz o sabor das folhas.',
 'Colha as folhas de cima para baixo, sempre deixando folhas na planta.', 60,
 'Pulgões, mosca-branca, lagartas e fungos por excesso de umidade.',
 'Folhas amareladas por baixo podem indicar falta de nitrogênio ou excesso de água.',
 'Semente → germinação (5–10 dias) → muda → crescimento → floração.',
 'Culinária (molhos, saladas, pesto). Atrai polinizadores quando floresce.',
 'Não regue as folhas no fim da tarde: isso favorece fungos.'),

(null, 'Alecrim', 'Salvia rosmarinus', 'Lamiaceae',
 'Arbusto aromático de folhas finas, muito resistente.',
 'Região do Mediterrâneo.', 'fácil',
 'Sol pleno, o máximo possível.',
 'Pouca água. Regue só quando o substrato estiver seco; o encharcamento é a principal causa de perda.', 4,
 'Substrato arenoso e muito bem drenado; evite pratinho com água.',
 'Pouca adubação: composto ou húmus a cada 60 dias.', 60,
 'Tolera calor e frio moderado.',
 'Poda leve após a floração para manter a forma; não corte a parte lenhosa sem folhas.',
 'Transplante para vaso maior quando as raízes saírem pelo furo.',
 'Pequenas flores azuladas no inverno/primavera.',
 'Colha ramos com tesoura limpa, até 1/3 da planta por vez.', 90,
 'Cochonilhas e podridão de raiz por excesso de água.',
 'Folhas escurecendo na base geralmente indicam excesso de água, não falta de adubo.',
 'Estaca/semente → enraizamento → muda → arbusto.',
 'Culinária e aromatização.',
 'Se ficar em dúvida, espere mais um dia para regar.'),

(null, 'Tomate', 'Solanum lycopersicum', 'Solanaceae',
 'Hortaliça-fruto de ciclo anual, muito cultivada em hortas e vasos grandes.',
 'Região andina da América do Sul.', 'média',
 'Sol pleno: 6–8 h de sol direto.',
 'Rega regular e uniforme, no pé da planta. Variações bruscas de umidade causam rachaduras e fundo preto nos frutos.', 1,
 'Substrato fértil, com bastante matéria orgânica, em vaso de pelo menos 20 L.',
 'Composto ou húmus a cada 15–20 dias; na frutificação, adubo rico em potássio e cálcio.', 20,
 'Ideal 20–28 °C.',
 'Retire os brotos laterais (ladrões) nas variedades de crescimento indeterminado. Use tutor.',
 'Transplante quando a muda tiver 4–6 folhas, enterrando um pouco do caule.',
 'Flores amarelas aparecem cerca de 45–60 dias após a semeadura.',
 'Colha quando o fruto estiver com cor uniforme e levemente macio.', 90,
 'Traça-do-tomateiro, pulgões, mosca-branca, requeima e pinta-preta.',
 'Fundo preto no fruto: irregularidade de rega/cálcio. Folhas velhas amarelas: possível falta de nitrogênio.',
 'Semente → germinação (5–10 dias) → muda → crescimento → floração → frutificação → colheita.',
 'Culinária.',
 'Regue sempre no solo, não nas folhas, para reduzir doenças.'),

(null, 'Pimenta Dedo-de-Moça', 'Capsicum baccatum', 'Solanaceae',
 'Pimenta de ardência média, frutos alongados e vermelhos quando maduros.',
 'América do Sul.', 'fácil',
 'Sol pleno.',
 'Manter levemente úmido; tolera pequenos períodos de seca melhor que o encharcamento.', 2,
 'Substrato fértil e bem drenado, vaso de 10 L ou mais.',
 'Húmus ou composto a cada 30 dias.', 30,
 'Gosta de calor; 20–30 °C.',
 'Poda de limpeza após a colheita para renovar a planta.',
 'Transplante com 4–6 folhas definitivas.',
 'Flores brancas pequenas; cada flor pode virar um fruto.',
 'Colha quando os frutos estiverem totalmente vermelhos.', 100,
 'Pulgões, ácaros e mosca-branca.',
 'Queda de flores pode indicar calor extremo, falta de água ou falta de polinização.',
 'Semente → germinação (10–20 dias) → muda → crescimento → floração → frutificação.',
 'Culinária. Manuseie com cuidado e lave as mãos após cortar.',
 'Mexa levemente os galhos floridos para ajudar a polinização em locais sem insetos.'),

(null, 'Alface', 'Lactuca sativa', 'Asteraceae',
 'Hortaliça folhosa de ciclo rápido.',
 'Região do Mediterrâneo.', 'fácil',
 'Sol da manhã ou meia-sombra no calor forte.',
 'Rega frequente e leve; não deixe o substrato secar por completo.', 1,
 'Substrato leve, fofo e rico em matéria orgânica.',
 'Húmus a cada 15 dias.', 15,
 'Prefere clima ameno (15–24 °C); no calor tende a pendoar e amargar.',
 'Não precisa de poda; retire folhas velhas ou danificadas.',
 'Transplante quando a muda tiver 4–5 folhas.',
 'Ao florescer (pendoar), as folhas ficam amargas.',
 'Colha a planta inteira ou folhas externas conforme a necessidade.', 50,
 'Lesmas, pulgões e lagartas.',
 'Pontas queimadas: falta de água ou calor excessivo.',
 'Semente → germinação (3–7 dias) → muda → crescimento → colheita.',
 'Culinária (saladas).',
 'Semeie um pouco a cada 2–3 semanas para ter colheita contínua.'),

(null, 'Cebolinha', 'Allium fistulosum', 'Amaryllidaceae',
 'Tempero de folhas tubulares, rebrota após o corte.',
 'Ásia.', 'fácil',
 'Sol pleno ou meia-sombra.',
 'Manter úmido sem encharcar.', 2,
 'Substrato fértil e drenado.',
 'Húmus a cada 30 dias, principalmente após cortes.', 30,
 'Tolera ampla faixa de temperatura.',
 'Corte as folhas a 3–5 cm do solo para estimular a rebrota.',
 'Divida as touceiras quando o vaso ficar cheio.',
 'Flores brancas em bolinhas; retire para prolongar as folhas.',
 'Colha cortando as folhas externas.', 60,
 'Tripes e fungos por excesso de umidade.',
 'Pontas amarelas podem indicar falta de nitrogênio ou água irregular.',
 'Semente/touceira → muda → crescimento → cortes sucessivos.',
 'Culinária.',
 'Colher com frequência estimula a planta.'),

(null, 'Salsa', 'Petroselinum crispum', 'Apiaceae',
 'Tempero de folhas recortadas, de crescimento lento no início.',
 'Região do Mediterrâneo.', 'média',
 'Sol da manhã ou meia-sombra.',
 'Manter levemente úmido.', 2,
 'Substrato fértil, profundo e drenado.',
 'Húmus a cada 30 dias.', 30,
 'Prefere clima ameno.',
 'Colha os talos externos rente à base.',
 'Não gosta de transplante; prefira semear no local definitivo.',
 'Floresce no segundo ano e depois encerra o ciclo.',
 'Colha talos externos quando a planta tiver muitas folhas.', 75,
 'Pulgões e lagartas.',
 'Folhas amareladas: possível falta de nitrogênio ou excesso de sol forte.',
 'Semente → germinação lenta (15–30 dias) → muda → crescimento.',
 'Culinária.',
 'Deixe as sementes de molho por 12 h antes de semear para acelerar a germinação.'),

(null, 'Hortelã', 'Mentha spicata', 'Lamiaceae',
 'Erva aromática vigorosa que se espalha por estolões.',
 'Europa e Ásia.', 'fácil',
 'Meia-sombra ou sol da manhã.',
 'Gosta de umidade constante.', 1,
 'Substrato rico em matéria orgânica.',
 'Húmus a cada 30 dias.', 30,
 'Tolera frio e calor moderados.',
 'Pode com frequência para manter compacta.',
 'Cultive sozinha no vaso: ela compete com outras plantas.',
 'Pequenas flores lilases no verão.',
 'Colha as pontas dos ramos.', 45,
 'Ferrugem (pontos alaranjados), pulgões e ácaros.',
 'Folhas pequenas e pálidas: falta de luz ou nutrientes.',
 'Estaca/muda → enraizamento → crescimento.',
 'Culinária, chás e bebidas.',
 'Enraíza facilmente em um copo com água.'),

(null, 'Morango', 'Fragaria × ananassa', 'Rosaceae',
 'Planta rasteira que produz frutos doces e emite estolões.',
 'Híbrido desenvolvido na Europa.', 'média',
 'Sol pleno ou pelo menos 6 h de sol.',
 'Manter úmido, regando no solo; evite molhar os frutos.', 1,
 'Substrato leve, ácido e bem drenado.',
 'Composto/húmus a cada 20 dias; na frutificação, adubo rico em potássio.', 20,
 'Prefere clima ameno (15–25 °C).',
 'Retire folhas secas e estolões se quiser priorizar frutos.',
 'Plante as mudas com a coroa no nível do substrato.',
 'Flores brancas na primavera.',
 'Colha frutos totalmente vermelhos.', 90,
 'Lesmas, ácaros, pássaros e mofo-cinzento.',
 'Folhas avermelhadas podem indicar frio ou falta de fósforo.',
 'Muda/estolão → enraizamento → floração → frutificação.',
 'Culinária.',
 'Use palha ou casca de pinus sob os frutos para não encostarem no solo úmido.'),

(null, 'Babosa', 'Aloe vera', 'Asphodelaceae',
 'Suculenta de folhas carnudas que armazenam água.',
 'Península Arábica.', 'fácil',
 'Sol pleno ou muita claridade.',
 'Pouca água: regue só quando o substrato estiver completamente seco.', 7,
 'Substrato para cactos e suculentas, muito drenado.',
 'Raramente precisa; composto leve a cada 90 dias na primavera/verão.', 90,
 'Não tolera geada.',
 'Retire folhas secas na base.',
 'Separe os filhotes que nascem ao redor quando tiverem algumas folhas.',
 'Pode emitir haste com flores tubulares em plantas adultas.',
 'Não se aplica.', null,
 'Cochonilhas e podridão por excesso de água.',
 'Folhas finas e enrugadas: falta de água. Folhas moles e escuras: excesso de água.',
 'Muda/filhote → crescimento → planta adulta.',
 'Ornamental. Uso medicinal somente com orientação profissional.',
 'Folhas avermelhadas costumam indicar sol muito forte ou estresse.'),

(null, 'Coentro', 'Coriandrum sativum', 'Apiaceae',
 'Erva de ciclo rápido, folhas e sementes aromáticas.',
 'Região do Mediterrâneo e Oriente Médio.', 'média',
 'Sol da manhã ou meia-sombra no calor intenso.',
 'Manter levemente úmido.', 1,
 'Substrato leve e fértil.',
 'Húmus a cada 20 dias.', 20,
 'Pendoa rápido no calor forte.',
 'Colha folhas externas com frequência.',
 'Não gosta de transplante; semeie no local definitivo.',
 'Flores brancas que viram sementes (coentro em grão).',
 'Colha folhas a partir de 30–40 dias.', 40,
 'Pulgões.',
 'Amarelamento geral: falta de nutrientes ou excesso de água.',
 'Semente → germinação (7–14 dias) → crescimento → floração → sementes.',
 'Culinária.',
 'Quebre levemente a semente (que é um fruto com duas sementes) antes de plantar.'),

(null, 'Rúcula', 'Eruca vesicaria', 'Brassicaceae',
 'Folhosa de sabor picante e ciclo curto.',
 'Região do Mediterrâneo.', 'fácil',
 'Sol ou meia-sombra.',
 'Manter úmido.', 1,
 'Substrato fértil e leve.',
 'Húmus a cada 15 dias.', 15,
 'Prefere clima ameno.',
 'Colha folhas externas.',
 'Semeie direto no vaso; desbaste deixando 5–10 cm entre plantas.',
 'Flores claras; após florescer, folhas ficam mais picantes.',
 'Colha a partir de 30 dias.', 35,
 'Pulgão e besouros que furam as folhas.',
 'Folhas pálidas: falta de nitrogênio.',
 'Semente → germinação (3–5 dias) → crescimento → colheita.',
 'Culinária.',
 'Mudas muito juntas competem: desbaste cedo.')
on conflict do nothing;

-- >>>>>>>>>>>>>>>> 003_seguranca_piloto.sql <<<<<<<<<<<<<<<<

-- =====================================================================
-- Jardim Vivo — 003: segurança e ajustes para o piloto
-- Aditiva e idempotente: não apaga tabelas nem dados.
--  * RLS: além do dono da linha, valida que plant_id / container_id /
--    tray_id / species_id referenciados pertencem ao usuário.
--  * Fotos privadas: bucket deixa de ser público; leitura só do dono
--    (URL assinada) ou da foto ATUAL de planta marcada como pública.
--  * codigo_publico sempre gerado pelo sistema e imutável.
--  * profiles: usuário não altera o próprio papel.
--  * Estado final estruturado (ativa → debilitada → morta).
--  * Células de sementeira ganham o status 'muda'.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções auxiliares de posse (NULL = sem referência = permitido)
-- ---------------------------------------------------------------------
create or replace function public.jv_owns_plant(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p is null or exists (select 1 from public.plants where id = p and owner_id = auth.uid());
$$;

create or replace function public.jv_owns_container(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select c is null or exists (select 1 from public.containers where id = c and owner_id = auth.uid());
$$;

create or replace function public.jv_owns_tray(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select t is null or exists (select 1 from public.seed_trays where id = t and owner_id = auth.uid());
$$;

create or replace function public.jv_species_visible(s uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select s is null or exists (select 1 from public.plant_species
                              where id = s and (owner_id is null or owner_id = auth.uid()));
$$;

-- Caminho de foto válido para a planta: <user_id>/<plant_id>/<arquivo>
create or replace function public.jv_photo_path_ok(path text, plant uuid)
returns boolean language sql stable as $$
  select path is null or (
    split_part(path, '/', 1) = auth.uid()::text
    and split_part(path, '/', 2) = plant::text
    and split_part(path, '/', 3) <> ''
  );
$$;

-- Foto atual de uma planta pública (usada pela política do Storage)
create or replace function public.jv_foto_publica(path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.plants p
                 where p.foto_path = path and p.publica
                   and split_part(path, '/', 1) = p.owner_id::text);
$$;

-- ---------------------------------------------------------------------
-- Políticas RLS (substituem a política genérica "dono")
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['containers','plants','plant_photos','plant_container_history',
                           'seed_trays','seed_cells','care_events','observations','tasks']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('drop policy if exists "dono: ler" on public.%I', t);
    execute format('drop policy if exists "dono: excluir" on public.%I', t);
    execute format('drop policy if exists "dono: criar" on public.%I', t);
    execute format('drop policy if exists "dono: alterar" on public.%I', t);
    execute format('create policy "dono: ler" on public.%I for select to authenticated using (owner_id = auth.uid())', t);
    execute format('create policy "dono: excluir" on public.%I for delete to authenticated using (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Regras de escrita por tabela (mesma regra para criar e alterar)
do $$
declare
  r record;
begin
  for r in select * from (values
    ('containers',              'owner_id = auth.uid()'),
    ('seed_trays',              'owner_id = auth.uid()'),
    ('plants',                  'owner_id = auth.uid() and public.jv_owns_container(container_id) and public.jv_species_visible(species_id) and public.jv_photo_path_ok(foto_path, id)'),
    ('plant_photos',            'owner_id = auth.uid() and public.jv_owns_plant(plant_id) and public.jv_photo_path_ok(storage_path, plant_id)'),
    ('care_events',             'owner_id = auth.uid() and public.jv_owns_plant(plant_id)'),
    ('observations',            'owner_id = auth.uid() and public.jv_owns_plant(plant_id)'),
    ('tasks',                   'owner_id = auth.uid() and public.jv_owns_plant(plant_id)'),
    ('plant_container_history', 'owner_id = auth.uid() and public.jv_owns_plant(plant_id) and public.jv_owns_container(from_container_id) and public.jv_owns_container(to_container_id)'),
    ('seed_cells',              'owner_id = auth.uid() and public.jv_owns_tray(tray_id) and public.jv_owns_plant(plant_id) and public.jv_species_visible(species_id)')
  ) as v(tbl, chk)
  loop
    execute format('create policy "dono: criar" on public.%I for insert to authenticated with check (%s)', r.tbl, r.chk);
    execute format('create policy "dono: alterar" on public.%I for update to authenticated using (owner_id = auth.uid()) with check (%s)', r.tbl, r.chk);
  end loop;
end $$;

-- Espécies: leitura do catálogo oficial + próprias; escrita só das próprias
drop policy if exists "espécies: leitura" on public.plant_species;
create policy "espécies: leitura" on public.plant_species
  for select to authenticated using (owner_id is null or owner_id = auth.uid());
drop policy if exists "espécies: próprias" on public.plant_species;
create policy "espécies: próprias" on public.plant_species
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- profiles: lê/edita só o próprio nome; papel só pelo administrador (SQL)
-- ---------------------------------------------------------------------
drop policy if exists "perfil próprio" on public.profiles;
drop policy if exists "perfil: ler" on public.profiles;
drop policy if exists "perfil: alterar" on public.profiles;
create policy "perfil: ler" on public.profiles for select to authenticated using (id = auth.uid());
create policy "perfil: alterar" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (nome) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- Campos controlados pelo sistema (código, dono, data de criação)
-- Para usuários do app (auth.uid() presente). O administrador, pelo SQL
-- Editor, ainda pode ajustar códigos manualmente se precisar.
-- ---------------------------------------------------------------------
create or replace function public.jv_plants_protect()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.codigo_publico := 'JV-' || lpad(nextval('public.plant_codigo_seq')::text, 6, '0');
      new.created_at := now();
    else
      new.codigo_publico := old.codigo_publico;
      new.owner_id := old.owner_id;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists plants_protect on public.plants;
create trigger plants_protect before insert or update on public.plants
  for each row execute function public.jv_plants_protect();

-- Dono imutável nas demais tabelas
create or replace function public.jv_keep_owner()
returns trigger language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['containers','plant_photos','plant_container_history',
                           'seed_trays','seed_cells','care_events','observations','tasks']
  loop
    execute format('drop trigger if exists keep_owner on public.%I', t);
    execute format('create trigger keep_owner before update on public.%I for each row execute function public.jv_keep_owner()', t);
  end loop;
end $$;

-- Numeração continua depois do maior código já usado (inclui plants_legacy),
-- para não repetir códigos de etiquetas antigas.
do $$
declare m bigint := 0; x bigint;
begin
  select coalesce(max(substring(codigo_publico from '^JV-(\d+)$')::bigint), 0) into m from public.plants;
  if to_regclass('public.plants_legacy') is not null and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'plants_legacy' and column_name = 'codigo_publico') then
    execute $q$select coalesce(max(substring(codigo_publico from '^JV-(\d+)$')::bigint), 0) from public.plants_legacy$q$ into x;
    m := greatest(m, x);
  end if;
  if m > 0 and m >= (select last_value from public.plant_codigo_seq) then
    perform setval('public.plant_codigo_seq', m);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Estado final estruturado: ativa → debilitada (saude) → encerrada
-- ---------------------------------------------------------------------
alter table public.plants add column if not exists estado_final text;
alter table public.plants drop constraint if exists plants_estado_final_check;
alter table public.plants add constraint plants_estado_final_check
  check (estado_final in ('colhida','morta','doada','descartada','outro'));

update public.plants set estado_final = case
    when motivo_encerramento ilike '%morreu%' then 'morta'
    when motivo_encerramento ilike '%colheita%' then 'colhida'
    when motivo_encerramento ilike '%doada%' then 'doada'
    when motivo_encerramento ilike '%descart%' then 'descartada'
    else 'outro' end
  where not ativa and estado_final is null;

-- ---------------------------------------------------------------------
-- Sementeiras: status 'muda' entre germinada e transplantada
-- ---------------------------------------------------------------------
alter table public.seed_cells drop constraint if exists seed_cells_status_check;
alter table public.seed_cells add constraint seed_cells_status_check
  check (status in ('vazia','plantada','germinada','muda','perdida','transplantada'));

-- Resumo por bandeja calculado no banco (não esbarra no limite de linhas da API)
create or replace view public.seed_tray_stats with (security_invoker = true) as
  select tray_id,
         count(*) filter (where status = 'vazia')         as vazias,
         count(*) filter (where status = 'plantada')      as plantadas,
         count(*) filter (where status = 'germinada')     as germinadas,
         count(*) filter (where status = 'muda')          as mudas,
         count(*) filter (where status = 'perdida')       as perdidas,
         count(*) filter (where status = 'transplantada') as transplantadas
  from public.seed_cells group by tray_id;
grant select on public.seed_tray_stats to authenticated;

-- ---------------------------------------------------------------------
-- Storage: fotos privadas
-- ---------------------------------------------------------------------
update storage.buckets
   set public = false,
       file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
 where id = 'plant-photos';

drop policy if exists "fotos: ler próprias" on storage.objects;
create policy "fotos: ler próprias" on storage.objects
  for select to authenticated
  using (bucket_id = 'plant-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "fotos: ler foto atual de planta pública" on storage.objects;
create policy "fotos: ler foto atual de planta pública" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'plant-photos' and public.jv_foto_publica(name));

-- Envio só na própria pasta e para uma planta própria: <user_id>/<plant_id>/<arquivo>
drop policy if exists "fotos: enviar próprias" on storage.objects;
create policy "fotos: enviar próprias" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'plant-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.plants p
                where p.id::text = (storage.foldername(name))[2] and p.owner_id = auth.uid())
  );

-- >>>>>>>>>>>>>>>> CONFERÊNCIA (o resultado aparece no fim) <<<<<<<<<<<<<<<<
select
  (select public from storage.buckets where id = 'plant-photos')                          as bucket_publico_deve_ser_false,
  (select count(*) from public.plant_species where owner_id is null)                      as especies_catalogo_deve_ser_12,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'dono:%') as politicas_dono_deve_ser_36,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='plants' and column_name='estado_final')  as coluna_estado_final_deve_ser_1,
  to_regclass('public.plants_legacy') is not null                                        as existe_plants_legacy;
```
