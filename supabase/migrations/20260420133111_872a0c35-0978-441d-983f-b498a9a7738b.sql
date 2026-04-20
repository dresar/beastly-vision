-- Fix search_path
create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Tighten notifications update: only admins
drop policy if exists "Authenticated update notifications" on public.notifications;
create policy "Admins update notifications" on public.notifications for update to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));