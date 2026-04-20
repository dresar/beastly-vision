-- Roles enum & table
create type public.app_role as enum ('admin', 'operator', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users view own roles" on public.user_roles for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles viewable by authenticated" on public.profiles for select to authenticated using (true);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Trigger: auto create profile + default role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  insert into public.user_roles (user_id, role) values (new.id, 'viewer');
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at helper
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at();

-- Devices
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  latitude double precision,
  longitude double precision,
  status text not null default 'offline',
  last_seen timestamptz,
  api_key text not null default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.devices enable row level security;

create policy "Devices viewable by authenticated" on public.devices for select to authenticated using (true);
create policy "Admins manage devices" on public.devices for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create trigger devices_updated_at before update on public.devices
  for each row execute function public.update_updated_at();

-- Detections
create table public.detections (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.devices(id) on delete set null,
  image_url text,
  detected_objects jsonb not null default '[]'::jsonb,
  primary_label text,
  max_confidence numeric,
  threat_level text not null default 'low',
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.detections enable row level security;

create policy "Detections viewable by authenticated" on public.detections for select to authenticated using (true);
create policy "Admins manage detections" on public.detections for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create index detections_detected_at_idx on public.detections (detected_at desc);
create index detections_device_id_idx on public.detections (device_id);
create index detections_threat_level_idx on public.detections (threat_level);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  detection_id uuid references public.detections(id) on delete cascade,
  title text not null,
  message text not null,
  severity text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;

create policy "Notifications viewable by authenticated" on public.notifications for select to authenticated using (true);
create policy "Authenticated update notifications" on public.notifications for update to authenticated using (true);
create policy "Admins insert notifications" on public.notifications for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

-- Realtime
alter publication supabase_realtime add table public.detections;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.devices;