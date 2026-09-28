// Vercel Cron: 매일 한 번 Supabase를 두드려 무료 플랜 자동 일시정지(7일 미사용) 방지
export default async function handler(req, res) {
  const url = "https://qwwejwiiuzsitrycdnxh.supabase.co";
  const key = "sb_publishable_15rMns4_bbknjEM0s8GB4w_g7fNGMee";
  try {
    const r = await fetch(`${url}/rest/v1/rpc/get_care_history`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ lookup_code: "QL-00000000" }) });
    const body = await r.text();
    res.status(200).json({ ok: r.ok, status: r.status, at: new Date().toISOString(), body: body.slice(0, 200) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e), at: new Date().toISOString() });
  }
}
