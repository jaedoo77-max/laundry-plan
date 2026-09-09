-- QR Laundry · 사진 갤러리 단순화 마이그레이션
-- Supabase SQL Editor에 전체 붙여넣고 Run. 여러 번 실행해도 안전합니다.
begin;
-- 1) 케어 기록마다 사진 목록 하나 (장수 제한 없음). 기존 입고/완료 사진은 합쳐서 옮깁니다.
alter table public.service_records add column if not exists photos text[] not null default '{}';
update public.service_records
 set photos = coalesce(before_photos,'{}') || coalesce(after_photos,'{}')
 where cardinality(photos)=0 and (cardinality(coalesce(before_photos,'{}'))>0 or cardinality(coalesce(after_photos,'{}'))>0);
-- 2) 진행 단계는 더 이상 쓰지 않으므로 제약을 풀어 둡니다 (컬럼은 남겨 둠).
alter table public.service_records drop constraint if exists service_records_stage_check;
-- 3) 공개 조회: 사진 제한 제거, photos 반환
create or replace function care_private.get_care_history(lookup_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.items%rowtype; payload jsonb; records jsonb; settings jsonb;
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
 payload=jsonb_build_object('item',jsonb_build_object('public_code',i.public_code,'item_type',i.item_type,'brand',i.brand,'model_name',i.model_name,'care_grade',i.care_grade),'records',records);
 return care_private.redact(payload,i.customer_name,i.customer_phone)||jsonb_build_object('settings',coalesce(settings,'{}'));
end $$;
-- 4) 신규 등록: 완료된 케어 기록 + 사진 목록으로 저장
create or replace function public.create_care_item(item_data jsonb, record_data jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item_id uuid; care_day date;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
 care_day=coalesce(nullif(record_data->>'received_on','')::date,(now() at time zone 'Asia/Seoul')::date);
 insert into public.items(public_code,item_type,brand,model_name,customer_name,customer_phone,notes,care_grade)
 values(item_data->>'public_code',item_data->>'item_type',item_data->>'brand',item_data->>'model_name',item_data->>'customer_name',item_data->>'customer_phone',item_data->>'notes',item_data->>'care_grade') returning id into item_id;
 insert into public.service_records(item_id,received_on,completed_on,status,services,photos,staff_name,inspection,processes,detergent_info,safety_info,staff_comment,next_care_on)
 values(item_id,care_day,care_day,'완료',array(select jsonb_array_elements_text(coalesce(record_data->'services','[]'))),array(select jsonb_array_elements_text(coalesce(record_data->'photos','[]'))),record_data->>'staff_name',coalesce(record_data->'inspection','[]'),coalesce(record_data->'processes','[]'),record_data->>'detergent_info',record_data->>'safety_info',record_data->>'staff_comment',nullif(record_data->>'next_care_on','')::date);
 return item_id;
end $$;
commit;
