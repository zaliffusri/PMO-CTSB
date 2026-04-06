-- Account status: inactive users cannot sign in (see routes/users.js, routes/auth.js).
alter table public.users_app add column if not exists active boolean not null default true;

comment on column public.users_app.active is 'When false, user cannot log in; admin-managed.';
