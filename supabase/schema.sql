create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  country text not null,
  company text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hosting_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  plan_name text not null,
  ram text not null,
  storage_gb integer not null check (storage_gb > 0),
  cpu text not null,
  addons jsonb not null default '{}'::jsonb,
  customer_data jsonb not null default '{}'::jsonb,
  payment_method text not null check (payment_method in ('mercadopago', 'card', 'paypal')),
  payment_preference_id text,
  payment_provider_id text,
  payment_status text not null default 'paid' check (payment_status in ('pending', 'paid', 'failed')),
  provisioning_status text not null default 'pending' check (provisioning_status in ('pending', 'creating', 'ready', 'failed')),
  server_id text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.customer_profiles enable row level security;
alter table public.hosting_orders enable row level security;
drop policy if exists "customers can read own profile" on public.customer_profiles;
create policy "customers can read own profile" on public.customer_profiles for select using (auth.uid() = id);
drop policy if exists "customers can update own profile" on public.customer_profiles;
create policy "customers can update own profile" on public.customer_profiles for update using (auth.uid() = id);
drop policy if exists "customers can read own orders" on public.hosting_orders;
create policy "customers can read own orders" on public.hosting_orders for select using (auth.uid() = user_id);

create or replace function public.handle_new_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.customer_profiles (id, full_name, phone, country, company)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullName', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'country', ''),
    new.raw_user_meta_data->>'company'
  )
  on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone,
    country = excluded.country, company = excluded.company, updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_customer();

alter table public.hosting_orders add column if not exists payment_preference_id text;
alter table public.hosting_orders add column if not exists payment_provider_id text;
alter table public.hosting_orders drop constraint if exists hosting_orders_payment_method_check;
alter table public.hosting_orders add constraint hosting_orders_payment_method_check check (payment_method in ('mercadopago', 'card', 'paypal'));

create table if not exists public.hosting_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.hosting_orders(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'MXN',
  status text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
  provider_id text,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hosting_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 160),
  department text not null default 'support' check (department in ('sales', 'support', 'billing')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'waiting', 'answered', 'closed')),
  server_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hosting_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.hosting_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hosting_service_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  server_id text,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.hosting_invoices enable row level security;
alter table public.hosting_tickets enable row level security;
alter table public.hosting_ticket_messages enable row level security;
alter table public.hosting_service_events enable row level security;

drop policy if exists "customers can read own invoices" on public.hosting_invoices;
create policy "customers can read own invoices" on public.hosting_invoices for select using (auth.uid() = user_id);
drop policy if exists "customers can manage own tickets" on public.hosting_tickets;
create policy "customers can manage own tickets" on public.hosting_tickets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "customers can read own ticket messages" on public.hosting_ticket_messages;
create policy "customers can read own ticket messages" on public.hosting_ticket_messages for select using (exists (select 1 from public.hosting_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
drop policy if exists "customers can create own ticket messages" on public.hosting_ticket_messages;
create policy "customers can create own ticket messages" on public.hosting_ticket_messages for insert with check (author_id = auth.uid() and exists (select 1 from public.hosting_tickets t where t.id = ticket_id and t.user_id = auth.uid()));
drop policy if exists "customers can read own service events" on public.hosting_service_events;
create policy "customers can read own service events" on public.hosting_service_events for select using (auth.uid() = user_id);

create index if not exists hosting_orders_user_created_idx on public.hosting_orders (user_id, created_at desc);
create index if not exists hosting_invoices_user_created_idx on public.hosting_invoices (user_id, created_at desc);
create index if not exists hosting_tickets_user_updated_idx on public.hosting_tickets (user_id, updated_at desc);
create index if not exists hosting_ticket_messages_ticket_created_idx on public.hosting_ticket_messages (ticket_id, created_at);
create index if not exists hosting_service_events_user_created_idx on public.hosting_service_events (user_id, created_at desc);

-- Acceso compartido por servidor, notificaciones y soporte administrativo.
create table if not exists public.server_members (
  id uuid primary key default gen_random_uuid(),
  server_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (server_id, user_id)
);
alter table public.server_members add column if not exists active boolean not null default true;
create table if not exists public.server_permissions (
  permission text primary key,
  description text not null
);
insert into public.server_permissions (permission, description) values
  ('server.read', 'Ver información del servidor'), ('server.update', 'Modificar el servidor'), ('server.delete', 'Eliminar el servidor'),
  ('control.start', 'Iniciar servidor'), ('control.stop', 'Detener servidor'), ('control.restart', 'Reiniciar servidor'), ('control.console', 'Usar consola'),
  ('files.list', 'Ver archivos'), ('files.read', 'Leer y descargar archivos'), ('files.create', 'Crear archivos y carpetas'), ('files.update', 'Editar archivos'), ('files.delete', 'Eliminar archivos'), ('files.sftp', 'Acceso SFTP/FTP'),
  ('database.read', 'Ver bases de datos'), ('database.create', 'Crear bases de datos'), ('database.update', 'Modificar bases de datos'), ('database.delete', 'Eliminar bases de datos'),
  ('backup.read', 'Ver copias'), ('backup.create', 'Crear copias'), ('backup.download', 'Descargar copias'), ('backup.restore', 'Restaurar copias'), ('backup.delete', 'Eliminar copias'),
  ('schedule.read', 'Ver tareas'), ('schedule.create', 'Crear tareas'), ('schedule.update', 'Editar tareas'), ('allocation.read', 'Ver puertos'), ('allocation.update', 'Editar puertos'),
  ('user.read', 'Ver subusuarios'), ('user.create', 'Crear subusuarios'), ('user.update', 'Editar permisos'), ('user.delete', 'Eliminar subusuarios')
on conflict (permission) do update set description = excluded.description;
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists server_members_server_idx on public.server_members (server_id);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
alter table public.server_members enable row level security;
alter table public.server_permissions enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "members can read own server memberships" on public.server_members;
create policy "members can read own server memberships" on public.server_members for select using (auth.uid() = user_id);
drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications" on public.notifications for update using (auth.uid() = user_id);
drop policy if exists "authenticated users can read permission catalog" on public.server_permissions;
create policy "authenticated users can read permission catalog" on public.server_permissions for select using (auth.role() = 'authenticated');
