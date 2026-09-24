-- Nexo Study V0.9.1 · physical PDF metadata and progressive analysis.
-- Apply after 007. This migration keeps legacy rows and their owner-only RLS.

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.materials'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%page_count%'
  loop
    execute format('alter table public.materials drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.materials
  add constraint materials_page_count_nonnegative check (page_count is null or page_count >= 0);

alter table public.materials
  add column document_kind text not null default 'unknown'
    check (document_kind in ('text', 'scan', 'mixed', 'unknown')),
  add column analysis_status text not null default 'not_started'
    check (analysis_status in ('not_started', 'reading', 'indexing', 'ready', 'partial', 'failed')),
  add column analyzed_pages integer[] not null default '{}'
    check (array_position(analyzed_pages, null) is null);

-- Preserve the meaning of documents already prepared by V0.9.
update public.materials set
  document_kind = case when source_type = 'text' then 'text'
    when content <> '' then 'text' else 'unknown' end,
  analysis_status = case processing_status
    when 'ready' then 'ready'
    when 'processing' then 'partial'
    when 'failed' then 'failed'
    else 'not_started' end
where analysis_status = 'not_started';

comment on column public.materials.page_count is 'Physical PDF page count from pdf.numPages, independent of extracted text.';
comment on column public.materials.analyzed_pages is 'Physical page numbers inspected by the text extraction pipeline; blank pages are included.';
comment on column public.materials.metadata is 'Small PDF metadata only, such as byteSize, title and author. Full page text belongs in material_chunks.';

-- Query only the relevant course fragments when Nexo needs an answer.
create or replace function public.nexo_search_normalize(value text)
returns text language sql immutable parallel safe as $$
  select translate(lower(coalesce(value, '')), 'áéíóúüñ', 'aeiouun');
$$;

create index if not exists material_chunks_text_search_idx on public.material_chunks
  using gin (to_tsvector('simple', public.nexo_search_normalize(content)));

create or replace function public.search_material_chunks_v2(
  p_course_id text, p_question text, p_material_id text default null, p_limit integer default 6
)
returns table (id uuid, material_id text, page_start integer, page_end integer, content text, keywords text[], score real)
language sql stable security invoker set search_path = public as $$
  with terms as (
    select distinct term from regexp_split_to_table(
      public.nexo_search_normalize(left(coalesce(p_question, ''), 500)), '[^a-z0-9]+'
    ) as term
    where length(term) >= 3 and term not in ('que', 'como', 'con', 'para', 'por', 'una', 'los', 'las', 'del', 'segun')
    limit 12
  ), search_query as (
    select to_tsquery('simple', coalesce(string_agg(term, ' | '), 'nexosincoincidencia')) as value from terms
  )
  select c.id, c.material_id, c.page_start, c.page_end, c.content, c.keywords,
    ts_rank_cd(to_tsvector('simple', public.nexo_search_normalize(c.content)), q.value)::real as score
  from public.material_chunks c
  cross join search_query q
  where c.user_id = (select auth.uid()) and c.course_id = p_course_id
    and (p_material_id is null or c.material_id = p_material_id)
    and to_tsvector('simple', public.nexo_search_normalize(c.content)) @@ q.value
  order by score desc, c.page_start
  limit least(greatest(p_limit, 1), 10);
$$;

grant execute on function public.search_material_chunks_v2(text, text, text, integer) to authenticated;
