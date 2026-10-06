-- =====================================================================
-- MegGym — códigos de convite para criar conta no admin
-- Rode DEPOIS do schema.sql: SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem problema.
-- =====================================================================

-- Quem virou admin por convite (e quando)
alter table public.admins add column if not exists invite_code text;
alter table public.admins add column if not exists created_at timestamptz not null default now();

-- Códigos de convite
create table if not exists public.invites (
  code       text primary key,
  note       text,
  max_uses   integer not null default 1 check (max_uses > 0),
  uses       integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

drop policy if exists "invites: admins gerenciam" on public.invites;
create policy "invites: admins gerenciam" on public.invites for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins podem ver todos os admins e remover os outros (não a si mesmos)
drop policy if exists "admins: admins veem todos" on public.admins;
drop policy if exists "admins: admins removem outros" on public.admins;
create policy "admins: admins veem todos" on public.admins for select
  to authenticated using (public.is_admin());
create policy "admins: admins removem outros" on public.admins for delete
  to authenticated using (
    public.is_admin() and lower(email) <> lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Ao criar uma conta com código de convite: valida o código, conta o uso
-- e libera o e-mail como admin. Código inválido/expirado/esgotado => cadastro recusado.
create or replace function public.handle_new_user_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(nullif(trim(new.raw_user_meta_data ->> 'invite_code'), ''));
begin
  if v_code is null then
    return new; -- usuários criados pelo painel do Supabase (sem convite)
  end if;

  update public.invites
     set uses = uses + 1
   where upper(code) = v_code
     and uses < max_uses
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'Código de convite inválido, expirado ou esgotado';
  end if;

  insert into public.admins (email, invite_code)
  values (lower(new.email), v_code)
  on conflict (email) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_invite on auth.users;
create trigger on_auth_user_invite
  after insert on auth.users
  for each row execute function public.handle_new_user_invite();
