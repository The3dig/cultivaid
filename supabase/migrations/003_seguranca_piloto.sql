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
