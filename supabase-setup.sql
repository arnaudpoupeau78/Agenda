-- À exécuter dans Supabase : menu "SQL Editor" > "New query" > coller > "Run".
-- Crée la table des événements de l'agenda.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date date not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now()
);

-- Autorise la lecture/écriture avec la clé publique "anon"
-- (agenda personnel : la protection repose sur le fait que le lien
--  et la clé ne sont pas partagés publiquement).
alter table events enable row level security;

create policy "acces_agenda_perso" on events
  for all
  to anon
  using (true)
  with check (true);
