-- QR Laundry · 지점(체인점) 구조 마이그레이션
-- Supabase SQL Editor에 전체 붙여넣고 Run. 여러 번 실행해도 안전합니다.
begin;
-- 1) 지점 목록. 본사(HQ)만 예약 링크를 가집니다. 지점은 로그인 없이 고객처럼 QR로만 봅니다.
create table if not exists public.stores(
 code text primary key check(code ~ '^[A-Z0-9_-]{2,20}$'),
 name text not null,
 booking_url text,
 is_hq boolean not null default false,
 created_at timestamptz not null default now()
);
insert into public.stores(code,name,booking_url,is_hq)
 values('HQ','세탁플랜 안성본점','https://booking.naver.com/booking/5/bizes/1064150',true)
 on conflict(code) do nothing;
alter table public.stores enable row level security;
drop policy if exists "stores staff" on public.stores;
create policy "stores staff" on public.stores for all to authenticated using(true) with check(true);
grant select,insert,update,delete on public.stores to authenticated;
revoke all on public.stores from anon;
-- 2) 물건마다 소속 지점. 기존 물건은 전부 본사.
alter table public.items add column if not exists store_code text references public.stores(code);
update public.items set store_code='HQ' where store_code is null;
alter table public.items alter column store_code set default 'HQ';
-- 3) 공개 조회: 지점 정보 포함 (예약 링크는 본사 물건만)
create or replace function care_private.get_care_history(lookup_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.items%rowtype; payload jsonb; records jsonb; settings jsonb; store jsonb;
begin
 if lookup_code !~ '^QL-[0-9A-F]{8}$' then return null; end if;
 select * into i from public.items where public_code=lookup_code;
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'received_on',r.received_on,'completed_on',r.completed_on,'created_at',r.created_at,
  'status',r.status,'services',r.services,
  'photos',case when cardinality(coalesce(r.photos,'{}'))>0 then r.photos else coalesce(r.before_photos,'{}')||coalesce(r.after_photos,'{}') end,
  'staff_name',r.staff_name,'inspection',r.inspection,'processes',r.processes,
  'detergent_info',r.detergent_info,'safety_info',r.safety_info,'staff_comment',r.staff_comment,'next_care_on',r.next_care_on
 ) order by r.received_on desc,r.created_at desc),'[]') into records from public.service_records r where r.item_id=i.id;
 select to_jsonb(s)-'id' into settings from public.care_settings s where id=1;
 select jsonb_build_object('code',s.code,'name',s.name,'is_hq',s.is_hq,'booking_url',case when s.is_hq then s.booking_url else null end)
  into store from public.stores s where s.code=coalesce(i.store_code,'HQ');
 payload=jsonb_build_object('item',jsonb_build_object('public_code',i.public_code,'item_type',i.item_type,'brand',i.brand,'model_name',i.model_name,'care_grade',i.care_grade),'records',records);
 return care_private.redact(payload,i.customer_name,i.customer_phone)||jsonb_build_object('settings',coalesce(settings,'{}'),'store',coalesce(store,'{}'));
end $$;
-- 4) 신규 등록: 선택한 지점으로 저장 (없으면 본사)
create or replace function public.create_care_item(item_data jsonb, record_data jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item_id uuid; care_day date; store text;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
 store=coalesce(nullif(item_data->>'store_code',''),'HQ');
 if not exists(select 1 from public.stores where code=store) then raise exception '없는 지점 코드입니다: %', store; end if;
 care_day=coalesce(nullif(record_data->>'received_on','')::date,(now() at time zone 'Asia/Seoul')::date);
 insert into public.items(public_code,item_type,brand,model_name,customer_name,customer_phone,notes,care_grade,store_code)
 values(item_data->>'public_code',item_data->>'item_type',item_data->>'brand',item_data->>'model_name',item_data->>'customer_name',item_data->>'customer_phone',item_data->>'notes',item_data->>'care_grade',store) returning id into item_id;
 insert into public.service_records(item_id,received_on,completed_on,status,services,photos,staff_name,inspection,processes,detergent_info,safety_info,staff_comment,next_care_on)
 values(item_id,care_day,care_day,'완료',array(select jsonb_array_elements_text(coalesce(record_data->'services','[]'))),array(select jsonb_array_elements_text(coalesce(record_data->'photos','[]'))),record_data->>'staff_name',coalesce(record_data->'inspection','[]'),coalesce(record_data->'processes','[]'),record_data->>'detergent_info',record_data->>'safety_info',record_data->>'staff_comment',nullif(record_data->>'next_care_on','')::date);
 return item_id;
end $$;
commit;
