alter table public.vocabulary_entries
add column suspended boolean not null default false;
