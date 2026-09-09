begin;
alter table public.items add column if not exists care_grade text;
alter table public.service_records
 add column if not exists stage text check(stage in ('접수','검수','세탁','건조','검품','출고')),
 add column if not exists staff_name text,
 add column if not exists inspection jsonb not null default '[]' check(jsonb_typeof(inspection)='array'),
 add column if not exists processes jsonb not null default '[]' check(jsonb_typeof(processes)='array'),
 add column if not exists detergent_info text,
 add column if not exists safety_info text,
 add column if not exists staff_comment text,
 add column if not exists next_care_on date;
create table if not exists public.care_settings (
 id integer primary key check(id=1), kakao_url text, warranty_text text,
 business_name text, business_owner text, business_number text, business_address text
);
alter table public.care_settings enable row level security;
create policy "staff care settings" on public.care_settings for all to authenticated using(true) with check(true);
grant select,insert,update on public.care_settings to authenticated;
revoke all on public.care_settings from anon;
insert into public.care_settings(id) values(1) on conflict do nothing;
create schema if not exists care_private;
revoke all on schema care_private from public;
grant usage on schema care_private to anon,authenticated;
-- Redact known customer identifiers in all public string values, including free text.
create or replace function care_private.redact(value jsonb, customer_name text, customer_phone text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; txt text; k text; v jsonb;
begin
 if jsonb_typeof(value)='object' then
  result='{}'; for k,v in select * from jsonb_each(value) loop result=result||jsonb_build_object(k,care_private.redact(v,customer_name,customer_phone)); end loop; return result;
 elsif jsonb_typeof(value)='array' then
  select coalesce(jsonb_agg(care_private.redact(x,customer_name,customer_phone)),'[]') into result from jsonb_array_elements(value) x; return result;
 elsif jsonb_typeof(value)='string' then
  txt=value#>>'{}';
  if nullif(trim(customer_name),'') is not null then txt=replace(txt,trim(customer_name),'[비공개]'); end if;
  if nullif(trim(customer_phone),'') is not null then txt=replace(txt,trim(customer_phone),'[비공개]'); end if;
  txt=regexp_replace(txt,'01[016789][[:space:]-]?[0-9]{3,4}[[:space:]-]?[0-9]{4}','[비공개]','g');
  return to_jsonb(txt);
 end if; return value;
end $$;
revoke all on function care_private.redact(jsonb,text,text) from public;
-- Anonymous QR lookup is intentional. The definer lives outside the exposed schema,
-- accepts one exact code, and constructs an explicit public allowlist.
create or replace function care_private.get_care_history(lookup_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.items%rowtype; payload jsonb; records jsonb; settings jsonb;
begin
 if lookup_code !~ '^QL-[0-9A-F]{8}$' then return null; end if;
 select * into i from public.items where public_code=lookup_code;
 if not found then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'received_on',r.received_on,'completed_on',r.completed_on,'created_at',r.created_at,
  'status',r.status,'stage',coalesce(r.stage,case when r.status='완료' then '출고' else '접수' end),
  'services',r.services,'before_photos',r.before_photos[1:3],'after_photos',r.after_photos[1:3],
  'staff_name',r.staff_name,'inspection',r.inspection,'processes',r.processes,
  'detergent_info',r.detergent_info,'safety_info',r.safety_info,'staff_comment',r.staff_comment,'next_care_on',r.next_care_on
 ) order by r.received_on desc,r.created_at desc),'[]') into records from public.service_records r where r.item_id=i.id;
 select to_jsonb(s)-'id' into settings from public.care_settings s where id=1;
 payload=jsonb_build_object('item',jsonb_build_object('public_code',i.public_code,'item_type',i.item_type,'brand',i.brand,'model_name',i.model_name,'care_grade',i.care_grade),'records',records);
 return care_private.redact(payload,i.customer_name,i.customer_phone)||jsonb_build_object('settings',coalesce(settings,'{}'));
end $$;
revoke all on function care_private.get_care_history(text) from public;
grant execute on function care_private.get_care_history(text) to anon,authenticated;
create or replace function public.get_care_history(lookup_code text)
returns jsonb language sql stable security invoker set search_path='' as $$select care_private.get_care_history(lookup_code)$$;
revoke all on function public.get_care_history(text) from public;
grant execute on function public.get_care_history(text) to anon,authenticated;
-- Atomically create a product and its first care record under the existing staff RLS.
create or replace function public.create_care_item(item_data jsonb, record_data jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare item_id uuid;
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
 insert into public.items(public_code,item_type,brand,model_name,customer_name,customer_phone,notes,care_grade)
 values(item_data->>'public_code',item_data->>'item_type',item_data->>'brand',item_data->>'model_name',item_data->>'customer_name',item_data->>'customer_phone',item_data->>'notes',item_data->>'care_grade) returning id into item_id;
 insert into public.service_records(item_id,stage,status,services,before_photos,staff_name,inspection,processes,detergent_info,safety_info,staff_comment,next_care_on)
 values(item_id,'접수','접수',array(select jsonb_array_elements_text(coalesce(record_data->'services','[]'))),array(select jsonb_array_elements_text(coalesce(record_data->'before_photos','[]'))),record_data->>'staff_name',coalesce(record_data->'inspection','[]'),coalesce(record_data->'processes','[]'),record_data->>'detergent_info',record_data->>'safety_info',record_data->>'staff_comment',nullif(record_data->>'next_care_on','')::date);
 return item_id;
end $$;
revoke all on function public.create_care_item(jsonb,jsonb) from public,anon;
grant execute on function public.create_care_item(jsonb,jsonb) to authenticated;
commit;
