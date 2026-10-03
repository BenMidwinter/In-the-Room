alter table public.services
  add column if not exists create_meet_link boolean not null default false;

comment on column public.services.create_meet_link is
  'When true and a Google connection allows Meet, booking this appointment type creates a Meet link.';
