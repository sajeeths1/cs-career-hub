-- Add a shared catalog skill and select it for the authenticated caller atomically.
begin;

create function public.add_known_skill(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  cleaned text := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  chosen public.skills%rowtype;
begin
  if caller is null then
    raise exception 'Sign in before adding a skill' using errcode = '42501';
  end if;
  if cleaned is null or char_length(cleaned) not between 1 and 100 or cleaned ~ '[[:cntrl:]]' then
    raise exception 'Skill names must contain 1–100 characters without control characters' using errcode = '22023';
  end if;

  select s.* into chosen from public.skills s
    where lower(btrim(s.name)) = lower(cleaned);
  if chosen.id is null then
    select s.* into chosen from public.skill_aliases a
      join public.skills s on s.id = a.skill_id where a.alias = lower(cleaned);
  end if;
  if chosen.id is null then
    insert into public.skills (name) values (cleaned)
      on conflict (lower(btrim(name))) do nothing;
    -- A separate statement sees the winning row if another caller added it concurrently.
    select s.* into chosen from public.skills s
      where lower(btrim(s.name)) = lower(cleaned);
  end if;

  insert into public.user_skills (user_id, skill_id) values (caller, chosen.id)
    on conflict (user_id, skill_id) do nothing;
  return jsonb_build_object('id', chosen.id, 'name', chosen.name);
end;
$$;

revoke all on function public.add_known_skill(text) from public, anon, authenticated;
grant execute on function public.add_known_skill(text) to authenticated;

commit;
