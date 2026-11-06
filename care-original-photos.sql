-- 사진 자동 보정: 고객 화면에는 보정본(photos), 원본은 관리자 전용으로 따로 보관. 여러 번 실행해도 안전합니다.
alter table public.service_records add column if not exists original_photos text[] not null default '{}';
