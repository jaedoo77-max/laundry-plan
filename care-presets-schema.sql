-- QR Laundry · 코멘트 문구 관리 + 지점 2개 등록
-- Supabase SQL Editor에 전체 붙여넣고 Run. 여러 번 실행해도 안전합니다.
begin;
alter table public.care_settings add column if not exists comment_presets jsonb;
insert into public.stores(code,name,phone,is_hq) values
 ('NAERI','세탁플랜 내리점','010-7731-9636',false),
 ('SINGIL','신길옷세탁','010-9854-1590',false)
on conflict(code) do update set name=excluded.name, phone=excluded.phone;
commit;
