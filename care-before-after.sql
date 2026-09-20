-- 케어 전/후 사진을 공개 조회에 포함 (여러 번 실행해도 안전)
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
  'before_photos',coalesce(r.before_photos,'{}'),'after_photos',coalesce(r.after_photos,'{}'),
  'staff_name',r.staff_name,'inspection',r.inspection,'processes',r.processes,
  'detergent_info',r.detergent_info,'safety_info',r.safety_info,'staff_comment',r.staff_comment,'next_care_on',r.next_care_on
 ) order by r.received_on desc,r.created_at desc),'[]') into records from public.service_records r where r.item_id=i.id;
 select to_jsonb(s)-'id' into settings from public.care_settings s where id=1;
 select jsonb_build_object('code',s.code,'name',s.name,'is_hq',s.is_hq,'phone',s.phone,'booking_url',case when s.is_hq then s.booking_url else null end)
  into store from public.stores s where s.code=coalesce(i.store_code,'HQ');
 payload=jsonb_build_object('item',jsonb_build_object('public_code',i.public_code,'item_type',i.item_type,'brand',i.brand,'model_name',i.model_name,'care_grade',i.care_grade),'records',records);
 return care_private.redact(payload,i.customer_name,i.customer_phone)||jsonb_build_object('settings',coalesce(settings,'{}'),'store',coalesce(store,'{}'));
end $$;
