// QR Laundry · 관리자 앱(외부 서버) 전용 등록 API
// 필요한 비밀값: ADMIN_APP_TOKEN (Edge Functions → Secrets). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 자동 제공.
// 대시보드 설정: Verify JWT 끔 (이 함수가 x-admin-token 으로 직접 검사합니다)
// 동작: create_item(새 물건+첫 이력) / add_record(기존 물건에 이력 추가) / find_by_phone(전화번호로 물건 조회)
import { createClient } from "npm:@supabase/supabase-js@2";

const PUBLIC_BASE = "https://project-qhmkv.vercel.app/q/";
const BUCKET = "laundry-photos";
const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const DEFAULT_SERVICE = "프리미엄 케어";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) { super(message); }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (e: ApiError) =>
  json({ ok: false, error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } }, e.status);

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
const str = (v: unknown, field: string, max: number, required = false) => {
  if (v === undefined || v === null || v === "") {
    if (required) throw new ApiError(400, "invalid_field", `${field} 값이 필요합니다`, field);
    return null;
  }
  if (typeof v !== "string") throw new ApiError(400, "invalid_field", `${field} 는 문자열이어야 합니다`, field);
  const t = v.trim();
  if (required && !t) throw new ApiError(400, "invalid_field", `${field} 값이 필요합니다`, field);
  if (t.length > max) throw new ApiError(400, "invalid_field", `${field} 는 ${max}자 이내여야 합니다`, field);
  return t || null;
};
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
const newCode = () => "QL-" + crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const todaySeoul = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function checkComment(comment: string | null, name: string | null, phone: string | null) {
  if (!comment) return;
  const p = digits(phone);
  if ((name && comment.includes(name)) || (p && digits(comment).includes(p)) || /01[016789][ -]?\d{3,4}[ -]?\d{4}/.test(comment))
    throw new ApiError(400, "comment_contains_customer_info", "고객에게 보이는 코멘트에 이름이나 전화번호를 넣을 수 없습니다", "record.staff_comment");
}

type Photo = { data?: string; media_type?: string; url?: string; tag?: string };
type Uploaded = { url: string; tag: "before" | "after" | null; path?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(new ApiError(405, "method_not_allowed", "POST 만 허용됩니다"));

  const token = Deno.env.get("ADMIN_APP_TOKEN") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
  if (token.length < 32 || !url || !service)
    return fail(new ApiError(500, "server_misconfigured", "서버 비밀값(ADMIN_APP_TOKEN, 32자 이상)이 설정되지 않았습니다"));
  if (!safeEqual(req.headers.get("x-admin-token") ?? "", token))
    return fail(new ApiError(401, "unauthorized", "x-admin-token 이 올바르지 않습니다"));

  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const uploadedPaths: string[] = [];

  async function uploadPhotos(code: string, list: unknown): Promise<Uploaded[]> {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) throw new ApiError(400, "invalid_field", "record.photos 는 배열이어야 합니다", "record.photos");
    if (list.length > MAX_PHOTOS) throw new ApiError(400, "too_many_photos", `사진은 한 번에 ${MAX_PHOTOS}장까지입니다`, "record.photos");
    const out: Uploaded[] = [];
    for (const [i, raw] of (list as Photo[]).entries()) {
      const tag = raw?.tag === "before" || raw?.tag === "after" ? raw.tag : null;
      if (raw?.url) {
        const prefix = `${url}/storage/v1/object/public/${BUCKET}/`;
        if (typeof raw.url !== "string" || !raw.url.startsWith(prefix))
          throw new ApiError(400, "invalid_photo", `photos[${i}].url 은 ${BUCKET} 버킷 주소여야 합니다`, `record.photos[${i}]`);
        out.push({ url: raw.url, tag });
        continue;
      }
      const mt = String(raw?.media_type ?? "image/jpeg");
      if (!/^image\/(jpeg|png|webp|heic)$/.test(mt))
        throw new ApiError(400, "invalid_photo", `photos[${i}].media_type 은 image/jpeg, png, webp, heic 중 하나여야 합니다`, `record.photos[${i}]`);
      const b64 = String(raw?.data ?? "").replace(/^data:[^,]*,/, "");
      if (b64.length < 100) throw new ApiError(400, "invalid_photo", `photos[${i}].data 가 비어 있습니다`, `record.photos[${i}]`);
      if (b64.length * 0.75 > MAX_PHOTO_BYTES)
        throw new ApiError(413, "photo_too_large", `photos[${i}] 가 5MB 를 넘습니다. 긴 변 1600px 정도로 줄여 주세요`, `record.photos[${i}]`);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
      catch { throw new ApiError(400, "invalid_photo", `photos[${i}].data 를 해석할 수 없습니다`, `record.photos[${i}]`); }
      const ext = mt.split("/")[1].replace("jpeg", "jpg");
      const path = `${code}/admin-${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mt });
      if (up.error) throw new ApiError(500, "storage_error", "사진 업로드 실패: " + up.error.message);
      uploadedPaths.push(path);
      out.push({ url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, tag, path });
    }
    return out;
  }

  function recordRow(itemId: string, rec: Record<string, unknown>, photos: Uploaded[], name: string | null, phone: string | null) {
    const day = str(rec.received_on, "record.received_on", 10) ?? todaySeoul();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(Date.parse(day)))
      throw new ApiError(400, "invalid_field", "record.received_on 은 YYYY-MM-DD 형식이어야 합니다", "record.received_on");
    let services = [DEFAULT_SERVICE];
    if (rec.services !== undefined && rec.services !== null) {
      if (!Array.isArray(rec.services) || rec.services.some((s) => typeof s !== "string" || !s.trim() || s.length > 40))
        throw new ApiError(400, "invalid_field", "record.services 는 문자열 배열이어야 합니다", "record.services");
      if (rec.services.length) services = rec.services.map((s: string) => s.trim());
    }
    const comment = str(rec.staff_comment, "record.staff_comment", 600);
    checkComment(comment, name, phone);
    return {
      item_id: itemId, received_on: day, completed_on: day, status: "완료", services,
      photos: photos.map((p) => p.url),
      before_photos: photos.filter((p) => p.tag === "before").map((p) => p.url),
      after_photos: photos.filter((p) => p.tag === "after").map((p) => p.url),
      staff_name: str(rec.staff_name, "record.staff_name", 40),
      staff_comment: comment,
    };
  }

  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { throw new ApiError(400, "bad_json", "요청 본문이 올바른 JSON 이 아닙니다"); }
    const action = body?.action;

    if (action === "find_by_phone") {
      const p = digits(str(body.phone, "phone", 20, true));
      if (p.length < 9 || p.length > 11) throw new ApiError(400, "invalid_phone", "전화번호는 숫자 9~11자리여야 합니다", "phone");
      const r = await db.rpc("admin_find_items_by_phone", { p_digits: p });
      if (r.error) throw new ApiError(500, "db_error", r.error.message);
      const items = (r.data ?? []).map((x: Record<string, unknown>) => ({ ...x, url: PUBLIC_BASE + String(x.public_code).slice(3) }));
      return json({ ok: true, items });
    }

    if (action === "create_item") {
      const it = (body.item ?? {}) as Record<string, unknown>;
      const rec = (body.record ?? {}) as Record<string, unknown>;
      const item = {
        item_type: str(it.item_type, "item.item_type", 40, true),
        brand: str(it.brand, "item.brand", 40),
        customer_name: str(it.customer_name, "item.customer_name", 40),
        customer_phone: str(it.customer_phone, "item.customer_phone", 20),
        notes: str(it.notes, "item.notes", 1000),
        store_code: (str(it.store_code, "item.store_code", 20) ?? "HQ").toUpperCase(),
      };
      if (item.customer_phone && digits(item.customer_phone).length < 9)
        throw new ApiError(400, "invalid_phone", "item.customer_phone 이 전화번호 형식이 아닙니다", "item.customer_phone");
      checkComment(str(rec.staff_comment, "record.staff_comment", 600), item.customer_name, item.customer_phone);
      const st = await db.from("stores").select("code").eq("code", item.store_code).maybeSingle();
      if (st.error) throw new ApiError(500, "db_error", st.error.message);
      if (!st.data) throw new ApiError(400, "unknown_store", `없는 지점 코드입니다: ${item.store_code}`, "item.store_code");

      let created: { id: string; public_code: string } | null = null;
      for (let n = 0; n < 5 && !created; n++) {
        const ins = await db.from("items").insert({ ...item, public_code: newCode() }).select("id,public_code").single();
        if (!ins.error) created = ins.data;
        else if (ins.error.code !== "23505") throw new ApiError(500, "db_error", ins.error.message);
      }
      if (!created) throw new ApiError(409, "code_collision", "관리번호 생성이 반복해서 겹쳤습니다. 다시 시도해 주세요");
      try {
        const photos = await uploadPhotos(created.public_code, rec.photos);
        const r = await db.from("service_records").insert(recordRow(created.id, rec, photos, item.customer_name, item.customer_phone)).select("id").single();
        if (r.error) throw new ApiError(500, "db_error", r.error.message);
        return json({ ok: true, item_id: created.id, public_code: created.public_code, record_id: r.data.id, url: PUBLIC_BASE + created.public_code.slice(3), photos: photos.map((p) => p.url) }, 201);
      } catch (e) {
        await db.from("items").delete().eq("id", created.id); // 반쯤 만들어진 물건은 지웁니다
        throw e;
      }
    }

    if (action === "add_record") {
      const raw = (str(body.public_code, "public_code", 60, true) ?? "").toUpperCase();
      const m = raw.match(/QL-?([0-9A-F]{8})$/) ?? raw.match(/\/Q\/([0-9A-F]{8})/);
      if (!m) throw new ApiError(400, "invalid_code", "public_code 는 QL-XXXXXXXX 형식(또는 QR 주소)이어야 합니다", "public_code");
      const code = "QL-" + m[1];
      const rec = (body.record ?? {}) as Record<string, unknown>;
      const f = await db.from("items").select("id,public_code,customer_name,customer_phone").eq("public_code", code).maybeSingle();
      if (f.error) throw new ApiError(500, "db_error", f.error.message);
      if (!f.data) throw new ApiError(404, "item_not_found", `${code} 물건이 없습니다`, "public_code");
      checkComment(str(rec.staff_comment, "record.staff_comment", 600), f.data.customer_name, f.data.customer_phone);
      const photos = await uploadPhotos(code, rec.photos);
      const r = await db.from("service_records").insert(recordRow(f.data.id, rec, photos, f.data.customer_name, f.data.customer_phone)).select("id").single();
      if (r.error) throw new ApiError(500, "db_error", r.error.message);
      return json({ ok: true, item_id: f.data.id, public_code: code, record_id: r.data.id, url: PUBLIC_BASE + code.slice(3), photos: photos.map((p) => p.url) }, 201);
    }

    throw new ApiError(400, "unknown_action", "action 은 create_item, add_record, find_by_phone 중 하나여야 합니다", "action");
  } catch (e) {
    if (uploadedPaths.length) await db.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
    if (e instanceof ApiError) return fail(e);
    return fail(new ApiError(500, "internal_error", (e as Error)?.message ?? String(e)));
  }
});
