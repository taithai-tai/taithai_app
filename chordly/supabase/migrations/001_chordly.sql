-- Chordly schema for Supabase/PostgreSQL. Run with the Supabase CLI or SQL editor.
create extension if not exists pg_trgm;

create type public.chord_status as enum ('draft','needs_verification','verified','rejected');
create type public.chord_format as enum ('chordpro','json');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  avatar_url text,
  role text not null default 'member' check (role in ('member','moderator','admin')),
  created_at timestamptz not null default now()
);
create table public.artists (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 160),
  slug text not null unique, artwork text, musicbrainz_id uuid, created_at timestamptz not null default now()
);
create table public.songs (
  id uuid primary key default gen_random_uuid(), artist_id uuid references public.artists(id) on delete set null,
  title text not null check (char_length(title) between 1 and 220), slug text not null unique,
  album text, artwork text, duration integer check (duration is null or duration > 0), isrc text,
  original_key text, bpm smallint check (bpm is null or bpm between 20 and 300), capo smallint not null default 0 check (capo between 0 and 12),
  difficulty text check (difficulty in ('easy','medium','hard')), views bigint not null default 0 check (views >= 0),
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.chord_versions (
  id uuid primary key default gen_random_uuid(), song_id uuid not null references public.songs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade, key text, capo smallint not null default 0 check (capo between 0 and 12),
  content text not null check (char_length(content) between 1 and 200000), structured_content jsonb,
  format public.chord_format not null default 'chordpro', votes integer not null default 0,
  verified boolean not null default false, status public.chord_status not null default 'draft', ai_generated boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.favorites (
  user_id uuid not null references public.users(id) on delete cascade, song_id uuid not null references public.songs(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (user_id,song_id)
);
create table public.playlists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100), is_public boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.playlist_songs (
  playlist_id uuid not null references public.playlists(id) on delete cascade, song_id uuid not null references public.songs(id) on delete cascade,
  position integer not null default 0, created_at timestamptz not null default now(), primary key (playlist_id,song_id)
);
create table public.song_history (
  user_id uuid not null references public.users(id) on delete cascade, song_id uuid not null references public.songs(id) on delete cascade,
  played_at timestamptz not null default now(), play_count integer not null default 1, primary key (user_id,song_id)
);
create table public.chord_votes (
  user_id uuid not null references public.users(id) on delete cascade, chord_version_id uuid not null references public.chord_versions(id) on delete cascade,
  vote smallint not null check (vote in (-1,1)), created_at timestamptz not null default now(), primary key (user_id,chord_version_id)
);
create table public.chord_reports (
  id uuid primary key default gen_random_uuid(), chord_version_id uuid not null references public.chord_versions(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null, category text not null check (category in ('incorrect','spam','copyright','abuse','other')),
  detail text check (char_length(detail) <= 2000), status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create table public.chord_shapes (
  id uuid primary key default gen_random_uuid(), chord text not null, instrument text not null check (instrument in ('guitar','piano','ukulele')),
  tuning text, fingering jsonb not null, difficulty smallint check (difficulty between 1 and 5), is_default boolean not null default false,
  created_at timestamptz not null default now(), unique(chord,instrument,tuning,fingering)
);

create index songs_title_trgm on public.songs using gin (title gin_trgm_ops);
create index artists_name_trgm on public.artists using gin (name gin_trgm_ops);
create index chord_versions_song_score on public.chord_versions(song_id,verified,votes desc);
create index history_user_played on public.song_history(user_id,played_at desc);

alter table public.users enable row level security;
alter table public.artists enable row level security;
alter table public.songs enable row level security;
alter table public.chord_versions enable row level security;
alter table public.favorites enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_songs enable row level security;
alter table public.song_history enable row level security;
alter table public.chord_votes enable row level security;
alter table public.chord_reports enable row level security;
alter table public.chord_shapes enable row level security;

create or replace function public.is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.users where id=auth.uid() and role in ('moderator','admin'));
$$;
create or replace function public.owns_playlist(target uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.playlists where id=target and user_id=auth.uid());
$$;

create policy "public artists read" on public.artists for select using (true);
create policy "public songs read" on public.songs for select using (true);
create policy "public chord versions read" on public.chord_versions for select using (status in ('verified','needs_verification') or user_id=auth.uid());
create policy "public shapes read" on public.chord_shapes for select using (true);
create policy "users read own profile" on public.users for select using (id=auth.uid());
create policy "users update own profile" on public.users for update using (id=auth.uid()) with check (id=auth.uid() and role=(select role from public.users where id=auth.uid()));
create policy "users insert own profile" on public.users for insert with check (id=auth.uid() and role='member');
create policy "owners create chords" on public.chord_versions for insert with check (user_id=auth.uid() and status in ('draft','needs_verification') and verified=false);
create policy "owners edit chords" on public.chord_versions for update using (user_id=auth.uid()) with check (user_id=auth.uid() and verified=false and status in ('draft','needs_verification'));
create policy "owners delete chords" on public.chord_versions for delete using (user_id=auth.uid() or public.is_staff());
create policy "staff manage songs" on public.songs for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage artists" on public.artists for all using (public.is_staff()) with check (public.is_staff());
create policy "staff manage shapes" on public.chord_shapes for all using (public.is_staff()) with check (public.is_staff());
create policy "favorites own rows" on public.favorites for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "playlists readable" on public.playlists for select using (is_public or user_id=auth.uid());
create policy "playlists own rows" on public.playlists for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "playlist songs readable" on public.playlist_songs for select using (exists(select 1 from public.playlists p where p.id=playlist_id and (p.is_public or p.user_id=auth.uid())));
create policy "playlist songs own rows" on public.playlist_songs for all using (public.owns_playlist(playlist_id)) with check (public.owns_playlist(playlist_id));
create policy "history own rows" on public.song_history for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "votes own rows" on public.chord_votes for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "reports create authenticated" on public.chord_reports for insert with check (auth.uid() is not null and (user_id=auth.uid() or user_id is null));
create policy "reports staff read" on public.chord_reports for select using (public.is_staff() or user_id=auth.uid());

-- Rate limiting for submissions/reports should also be applied at the API gateway/Edge Function layer.
