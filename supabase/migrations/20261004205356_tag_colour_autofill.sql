alter table public.tags
  add column if not exists color text not null default '#5c6b73';

alter table public.tags
  drop constraint if exists tags_color_hex;

alter table public.tags
  add constraint tags_color_hex check (color ~ '^#[0-9a-fA-F]{6}$');

alter table public.form_definitions
  add column if not exists autofill_client boolean not null default true;
