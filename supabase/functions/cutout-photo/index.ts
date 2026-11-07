// QR Laundry · 사진 배경 정리 (Photoroom Remove Background API 경유)
// 필요한 비밀값: PHOTOROOM_API_KEY (Edge Functions → Secrets). 키는 서버에만 있고 화면 코드에는 없습니다.
// 사용 가능: QR Laundry 관리자 로그인 사용자, 또는 x-admin-token 을 가진 관리자 앱 서버
// 요청: { image: "<JPEG 사진 문자열>" }  →  응답: { png: "<물건만 남은 투명 PNG 문자열>" }
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function b64ToBytes(b64: string) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function bytesToB64(u: Uint8Array) { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const key = Deno.env.get("PHOTOROOM_API_KEY");
    if (!key) return json({ error: "배경 정리 서비스 키(PHOTOROOM_API_KEY)가 아직 설정되지 않았습니다" }, 503);

    const adminToken = Deno.env.get("ADMIN_APP_TOKEN") ?? "";
    const given = req.headers.get("x-admin-token") ?? "";
    if (given) {
      const x = new TextEncoder().encode(given), y = new TextEncoder().encode(adminToken);
      let diff = x.length ^ y.length;
      for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
      if (adminToken.length < 32 || diff !== 0) return json({ error: "x-admin-token 이 올바르지 않습니다" }, 401);
    } else {
      const who = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
        headers: { Authorization: req.headers.get("Authorization") ?? "", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
      });
      if (!who.ok) return json({ error: "로그인이 필요합니다" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const image = String(body.image ?? "").replace(/^data:[^,]*,/, "");
    if (image.length < 100) return json({ error: "사진이 없습니다" }, 400);
    if (image.length > 8_000_000) return json({ error: "사진이 너무 큽니다 (긴 변 1600px 정도로 줄여 주세요)" }, 413);

    const form = new FormData();
    form.append("image_file", new Blob([b64ToBytes(image)], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch("https://sdk.photoroom.com/v1/segment", { method: "POST", headers: { "x-api-key": key }, body: form });
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      const msg = res.status === 402 ? "배경 정리 서비스 이용 한도가 다 됐습니다 (요금제 확인 필요)"
        : res.status === 401 || res.status === 403 ? "배경 정리 서비스 키가 올바르지 않습니다"
        : `배경 정리 실패 (${res.status}) ${t}`;
      return json({ error: msg }, 502);
    }
    const png = new Uint8Array(await res.arrayBuffer());
    return json({ png: bytesToB64(png) });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
