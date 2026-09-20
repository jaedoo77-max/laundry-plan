// QR Laundry · 사진으로 케어 내용 AI 추천 (Supabase Edge Function)
// 필요한 비밀값: ANTHROPIC_API_KEY (Edge Functions → Secrets)
// 호출: 관리자 로그인 상태에서 supabase.functions.invoke('suggest-care', { body: {...} })
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. Supabase → Edge Functions → Secrets에서 추가하세요." }, 500);

    // 관리자(로그인 사용자)만 사용 가능
    const auth = req.headers.get("Authorization") ?? "";
    const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const who = await fetch(`${supaUrl}/auth/v1/user`, { headers: { Authorization: auth, apikey: anon } });
    if (!who.ok) return json({ error: "로그인이 필요합니다" }, 401);

    const body = await req.json();
    const image: string = String(body.image ?? "");
    const mediaType: string = String(body.media_type ?? "image/jpeg");
    const itemTypes: string[] = Array.isArray(body.item_types) ? body.item_types.map(String) : [];
    const services: string[] = Array.isArray(body.services) ? body.services.map(String) : [];
    const presets: Record<string, string[]> = body.presets && typeof body.presets === "object" ? body.presets : {};
    if (!image || image.length < 100) return json({ error: "사진이 없습니다" }, 400);
    if (image.length > 6_000_000) return json({ error: "사진이 너무 큽니다" }, 413);

    const presetText = Object.entries(presets)
      .map(([g, arr]) => `[${g}]\n` + (arr as string[]).map((s) => `- ${s}`).join("\n"))
      .join("\n");

    const prompt = `당신은 프리미엄 세탁 브랜드 '세탁플랜'의 접수 담당자입니다. 고객이 맡긴 물건 사진을 보고 접수 폼을 미리 채워 주세요.

품목 목록(가능하면 이 중에서 고르고, 정말 없으면 짧은 한국어 명사로 새로 적으세요. '기타'는 마지막 수단):
${itemTypes.join(" / ")}

작업 내용 목록(이 중에서만 고르세요, 여러 개 가능):
${services.join(" / ")}

고객 코멘트 문구 목록(아래 문장 중에서 이 물건에 가장 잘 맞는 1~2개를 '토씨 하나 바꾸지 말고 그대로' 고르세요. 여러 개면 줄바꿈으로 이어 붙이세요):
${presetText}

규칙:
- brand: 로고·라벨·특징으로 브랜드를 확실히 알 수 있을 때만 한글 표기(예: 몽클레어, 나이키, 부가부). 불확실하면 빈 문자열.
- notes: 직원용 내부 메모. 사진에서 보이는 얼룩·손상·마모·변색 등 특이사항을 짧게. 없으면 빈 문자열.
- 사진이 세탁물이 아니거나 판단 불가면 item_type을 빈 문자열로 두고 notes에 이유를 적으세요.
- 반드시 아래 JSON 하나만 출력하세요. 설명·마크다운 금지.
{"item_type":"","brand":"","services":[],"comment":"","notes":"","confidence":0.0}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5",
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base" + "64", media_type: mediaType, data: image } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return json({ error: `AI 호출 실패 (${res.status}): ${t.slice(0, 300)}` }, 502);
    }
    const data = await res.json();
    const text: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "AI 응답을 해석하지 못했습니다", raw: text.slice(0, 300) }, 502);
    const out = JSON.parse(m[0]);
    const svcSet = new Set(services);
    return json({
      item_type: String(out.item_type ?? "").trim().slice(0, 40),
      brand: String(out.brand ?? "").trim().slice(0, 40),
      services: (Array.isArray(out.services) ? out.services : []).map(String).filter((s: string) => svcSet.has(s)),
      comment: String(out.comment ?? "").trim().slice(0, 600),
      notes: String(out.notes ?? "").trim().slice(0, 400),
      confidence: Number(out.confidence ?? 0) || 0,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
