-- QR Laundry · 관리자 앱 연동(register-care) 준비. 여러 번 실행해도 안전합니다.
begin;
-- 1) 관리번호(public_code) 중복 금지
do $$
begin
  if exists (select public_code from public.items group by public_code having count(*) > 1) then
    raise exception '중복된 public_code 가 있어 제약을 추가할 수 없습니다. 먼저 정리하세요.';
  end if;
  if not exists (
    select 1 from pg_index x
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid and a.attnum = x.indkey[0]
    where n.nspname = 'public' and t.relname = 'items' and x.indisunique and x.indnatts = 1 and a.attname = 'public_code'
  ) then
    alter table public.items add constraint items_public_code_key unique (public_code);
  end if;
end $$;
alter table public.items alter column public_code set not null;

-- 2) 전화번호(숫자만 비교)로 물건 조회 — 서버(service_role) 전용
create or replace function public.admin_find_items_by_phone(p_digits text)
returns table(public_code text, item_type text, brand text, customer_name text, customer_phone text,
              store_code text, created_at timestamptz, record_count bigint, last_received_on date)
language sql stable security definer set search_path = '' as $$
  select i.public_code, i.item_type, i.brand, i.customer_name, i.customer_phone, i.store_code, i.created_at,
         count(r.id), max(r.received_on)
  from public.items i
  left join public.service_records r on r.item_id = i.id
  where p_digits ~ '^[0-9]{9,11}$'
    and regexp_replace(coalesce(i.customer_phone, ''), '[^0-9]', '', 'g') = p_digits
  group by i.id
  order by max(r.received_on) desc nulls last, i.created_at desc
  limit 50
$$;
revoke all on function public.admin_find_items_by_phone(text) from public, anon, authenticated;
grant execute on function public.admin_find_items_by_phone(text) to service_role;
-- 3) register-care(service_role)가 쓰는 테이블 권한
grant usage on schema public to service_role;
grant select on public.stores to service_role;
grant select, insert, update, delete on public.items to service_role;
grant select, insert, update, delete on public.service_records to service_role;
commit;
