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
