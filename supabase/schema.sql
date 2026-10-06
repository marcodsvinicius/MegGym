-- =====================================================================
-- MegGym — estrutura do banco no Supabase
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar mais de uma vez sem duplicar nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) TROQUE o e-mail abaixo pelo e-mail que você vai usar para entrar
--    no admin. Só e-mails desta lista conseguem cadastrar/editar.
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values ('SEU_EMAIL_AQUI@exemplo.com')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.groups (
  id         text primary key,
  name       text not null,
  icon       text,
  color      text,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id          text primary key,
  group_id    text not null references public.groups(id) on update cascade on delete restrict,
  name        text not null,
  description text not null,
  sets        text,
  reps        text not null,
  rest        text,
  difficulty  text check (difficulty in ('iniciante', 'intermediario', 'avancado')),
  image       text,
  video       text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists exercises_group_id_idx on public.exercises (group_id);

-- ---------------------------------------------------------------------
-- 3) Segurança (RLS): todo mundo lê, só admins escrevem
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins    enable row level security;
alter table public.groups    enable row level security;
alter table public.exercises enable row level security;

drop policy if exists "groups: leitura pública" on public.groups;
drop policy if exists "groups: admins escrevem" on public.groups;
create policy "groups: leitura pública" on public.groups for select using (true);
create policy "groups: admins escrevem" on public.groups for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exercises: leitura pública" on public.exercises;
drop policy if exists "exercises: admins escrevem" on public.exercises;
create policy "exercises: leitura pública" on public.exercises for select using (true);
create policy "exercises: admins escrevem" on public.exercises for all
  to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins: cada um vê o próprio" on public.admins;
create policy "admins: cada um vê o próprio" on public.admins for select
  to authenticated using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- ---------------------------------------------------------------------
-- 4) Imagens (Storage): bucket público, só admins enviam/apagam
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-images', 'exercise-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "imagens: admins enviam" on storage.objects;
drop policy if exists "imagens: admins alteram" on storage.objects;
drop policy if exists "imagens: admins apagam" on storage.objects;
create policy "imagens: admins enviam" on storage.objects for insert
  to authenticated with check (bucket_id = 'exercise-images' and public.is_admin());
create policy "imagens: admins alteram" on storage.objects for update
  to authenticated using (bucket_id = 'exercise-images' and public.is_admin());
create policy "imagens: admins apagam" on storage.objects for delete
  to authenticated using (bucket_id = 'exercise-images' and public.is_admin());

-- ---------------------------------------------------------------------
-- 5) Dados iniciais (os mesmos do site atual)
-- ---------------------------------------------------------------------
insert into public.groups (id, name, icon, color, position) values
  ('peito', 'Peito', '🛡️', '#e4572e', 0),
  ('costas', 'Costas', '🦅', '#2e86ab', 1),
  ('ombros', 'Ombros', '🏔️', '#f18f01', 2),
  ('biceps', 'Bíceps', '💪', '#c73e1d', 3),
  ('triceps', 'Tríceps', '🔱', '#6a4c93', 4),
  ('quadriceps', 'Quadríceps', '🦵', '#3bb273', 5),
  ('posterior', 'Posterior de coxa', '🦿', '#1b998b', 6),
  ('gluteos', 'Glúteos', '🍑', '#ef476f', 7),
  ('panturrilha', 'Panturrilha', '🦶', '#8d6a9f', 8),
  ('abdomen', 'Abdômen', '🎯', '#ffb400', 9),
  ('antebraco', 'Antebraço', '✊', '#7f8c8d', 10),
  ('cardio', 'Cardio', '❤️', '#d7263d', 11)
on conflict (id) do nothing;

insert into public.exercises (id, group_id, name, description, sets, reps, rest, difficulty, image, video, position) values
  ('flexao', 'peito', 'Flexão de braço', 'Mãos um pouco mais abertas que os ombros, corpo alinhado da cabeça aos pés. Desça até o peito quase tocar o chão e empurre de volta.', '4', '10-15', '60s', 'iniciante', null, null, 0),
  ('supino-halteres', 'peito', 'Supino com halteres', 'Deitado no banco (ou no chão), halteres na linha do peito. Empurre para cima sem bater um no outro e desça controlando.', '4', '8-12', '60-90s', 'intermediario', null, null, 1),
  ('crucifixo-halteres', 'peito', 'Crucifixo com halteres', 'Braços estendidos com leve flexão nos cotovelos. Abra em arco até sentir alongar o peito e volte contraindo.', '3', '10-12', '60s', 'intermediario', null, null, 2),
  ('remada-curvada', 'costas', 'Remada curvada com halteres', 'Tronco inclinado à frente, coluna neutra. Puxe os halteres em direção ao quadril aproximando as escápulas.', '4', '8-12', '60-90s', 'intermediario', null, null, 3),
  ('remada-unilateral', 'costas', 'Remada unilateral (serrote)', 'Apoie joelho e mão no banco. Puxe o halter até a lateral do tronco, mantendo o cotovelo próximo ao corpo.', '3', '10-12 cada lado', '60s', 'iniciante', null, null, 4),
  ('superman', 'costas', 'Superman', 'Deitado de bruços, eleve braços e pernas ao mesmo tempo, segure 2 segundos no alto e desça devagar.', '3', '12-15', '45s', 'iniciante', null, null, 5),
  ('desenvolvimento-halteres', 'ombros', 'Desenvolvimento com halteres', 'Sentado ou em pé, halteres na altura das orelhas. Empurre para cima até quase estender os braços e desça controlando.', '4', '8-12', '60-90s', 'intermediario', null, null, 6),
  ('elevacao-lateral', 'ombros', 'Elevação lateral', 'Braços ao lado do corpo, eleve os halteres lateralmente até a altura dos ombros, cotovelos levemente flexionados.', '3', '12-15', '45-60s', 'iniciante', null, null, 7),
  ('flexao-pike', 'ombros', 'Flexão pike', 'Quadril elevado formando um V invertido. Flexione os cotovelos levando a cabeça em direção ao chão e empurre de volta.', '3', '8-12', '60s', 'avancado', null, null, 8),
  ('rosca-direta', 'biceps', 'Rosca direta', 'Em pé, cotovelos colados ao tronco. Suba os halteres sem balançar o corpo e desça devagar.', '4', '10-12', '60s', 'iniciante', null, null, 9),
  ('rosca-martelo', 'biceps', 'Rosca martelo', 'Pegada neutra (palmas viradas uma para a outra). Suba alternando ou simultâneo, sem mover os cotovelos.', '3', '10-12', '60s', 'iniciante', null, null, 10),
  ('triceps-banco', 'triceps', 'Tríceps no banco', 'Mãos apoiadas na borda do banco, pernas à frente. Desça flexionando os cotovelos até 90° e empurre de volta.', '3', '10-15', '60s', 'iniciante', null, null, 11),
  ('triceps-frances', 'triceps', 'Tríceps francês', 'Halter segurado com as duas mãos acima da cabeça. Desça atrás da nuca flexionando os cotovelos e estenda.', '3', '10-12', '60s', 'intermediario', null, null, 12),
  ('agachamento-livre', 'quadriceps', 'Agachamento livre', 'Pés na largura dos ombros. Desça o quadril para trás e para baixo, joelhos alinhados com a ponta dos pés, e suba empurrando o chão.', '4', '12-15', '60-90s', 'iniciante', null, null, 13),
  ('agachamento-bulgaro', 'quadriceps', 'Agachamento búlgaro', 'Pé de trás apoiado no banco. Desça o joelho de trás em direção ao chão mantendo o tronco firme.', '3', '8-12 cada perna', '60-90s', 'avancado', null, null, 14),
  ('afundo', 'quadriceps', 'Afundo (passada)', 'Dê um passo à frente e desça até os dois joelhos formarem 90°. Volte e alterne as pernas.', '3', '10-12 cada perna', '60s', 'intermediario', null, null, 15),
  ('stiff-halteres', 'posterior', 'Stiff com halteres', 'Pernas quase estendidas, leve o quadril para trás descendo os halteres rente às pernas. Suba contraindo glúteos e posterior.', '4', '10-12', '60-90s', 'intermediario', null, null, 16),
  ('ponte-unilateral', 'posterior', 'Ponte unilateral', 'Deitado, uma perna estendida no ar. Eleve o quadril empurrando o calcanhar da perna apoiada no chão.', '3', '10-12 cada perna', '45s', 'intermediario', null, null, 17),
  ('elevacao-pelvica', 'gluteos', 'Elevação pélvica', 'Costas apoiadas no banco, peso sobre o quadril. Eleve o quadril até alinhar com o tronco e segure 1 segundo no alto.', '4', '10-15', '60-90s', 'intermediario', null, null, 18),
  ('abducao-elastico', 'gluteos', 'Abdução com elástico', 'Elástico acima dos joelhos. Deitado de lado ou sentado, abra as pernas contra a resistência e volte devagar.', '3', '15-20', '45s', 'iniciante', null, null, 19),
  ('panturrilha-em-pe', 'panturrilha', 'Panturrilha em pé', 'Ponta dos pés num degrau. Suba o máximo possível, segure 1 segundo e desça até alongar.', '4', '15-20', '45s', 'iniciante', null, null, 20),
  ('panturrilha-unilateral', 'panturrilha', 'Panturrilha unilateral', 'Mesmo movimento, uma perna por vez, segurando um halter para aumentar a carga.', '3', '12-15 cada perna', '45s', 'intermediario', null, null, 21),
  ('prancha', 'abdomen', 'Prancha', 'Apoio nos antebraços e pontas dos pés, corpo reto, abdômen contraído. Não deixe o quadril cair.', '3', '30-60s', '45s', 'iniciante', null, null, 22),
  ('abdominal-supra', 'abdomen', 'Abdominal supra', 'Deitado, joelhos flexionados. Suba o tronco contraindo o abdômen, sem puxar o pescoço com as mãos.', '3', '15-20', '45s', 'iniciante', null, null, 23),
  ('elevacao-pernas', 'abdomen', 'Elevação de pernas', 'Deitado, mãos ao lado do corpo. Eleve as pernas estendidas até 90° e desça sem encostar no chão.', '3', '10-15', '45-60s', 'intermediario', null, null, 24),
  ('rosca-punho', 'antebraco', 'Rosca de punho', 'Antebraços apoiados na coxa, palmas para cima. Flexione apenas os punhos subindo os halteres.', '3', '15-20', '45s', 'iniciante', null, null, 25),
  ('farmer-walk', 'antebraco', 'Caminhada do fazendeiro', 'Segure halteres pesados ao lado do corpo e caminhe com postura ereta pelo tempo ou distância definida.', '3', '30-40s', '60s', 'intermediario', null, null, 26),
  ('polichinelo', 'cardio', 'Polichinelo', 'Salte abrindo pernas e braços ao mesmo tempo e volte à posição inicial em ritmo constante.', '3', '45s', '30s', 'iniciante', null, null, 27),
  ('burpee', 'cardio', 'Burpee', 'Agache, apoie as mãos, jogue as pernas para trás, faça uma flexão, volte e salte com os braços para cima.', '4', '10-12', '60s', 'avancado', null, null, 28),
  ('mountain-climber', 'cardio', 'Mountain climber', 'Em posição de prancha alta, leve os joelhos alternadamente em direção ao peito o mais rápido possível.', '3', '30-40s', '30-45s', 'intermediario', null, null, 29)
on conflict (id) do nothing;
