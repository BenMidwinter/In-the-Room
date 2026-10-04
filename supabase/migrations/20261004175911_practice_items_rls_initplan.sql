-- Evaluate auth.uid() once per statement, matching the recommended RLS pattern.

drop policy practice_items_owner_all on public.practice_items;

create policy practice_items_owner_all on public.practice_items
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
