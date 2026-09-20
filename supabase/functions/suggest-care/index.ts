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
    const imageBefore: string = String(body.image_before ?? "");
    const mediaType: string = String(body.media_type ?? "image/jpeg");
    const itemTypes: string[] = Array.isArray(body.item_types) ? body.item_types.map(String) : [];
    const services: string[] = Array.isArray(body.services) ? body.services.map(String) : [];
    // AI가 고를 수 있는 작업: 세탁 방식(드라이/물세탁)은 제외 — 케어라벨 확인 후 직원이 직접 체크
    const aiServices = services.filter((x) => !/드라이|물세탁|손세탁/.test(x));
    if (!image || image.length < 100) return json({ error: "사진이 없습니다" }, 400);
    if (image.length > 6_000_000) return json({ error: "사진이 너무 큽니다" }, 413);

    const today = new Date(Date.now() + 9 * 3600 * 1000);
    const month = today.getUTCMonth() + 1;
    const season = month >= 10 || month <= 2 ? "겨울(한창 입는 시기)" : month <= 4 ? "봄(겨울옷은 보관 직전)" : month <= 8 ? "여름(겨울옷은 보관 중)" : "가을(겨울옷 꺼내 입기 시작)";
    const prompt = `당신은 프리미엄 세탁 브랜드 '세탁플랜'의 20년 경력 케어 전문가입니다. 세탁·케어가 끝난 물건 사진을 보고, 고객에게 전달할 케어 완료 안내를 작성해 주세요.
오늘은 ${month}월, 계절은 ${season}입니다.
${imageBefore ? "사진이 두 장입니다: 첫 번째는 케어 전, 두 번째는 케어 후입니다. 두 사진을 비교해 달라진 점(밝기·볼륨·결·색감·정돈된 형태 등)을 comment 1문장에 긍정적으로 담으세요. 예: '처음 맡기셨을 때보다 한층 밝고 정돈된 모습으로 돌아왔습니다.' 케어 전 상태를 부정적으로 묘사하지 마세요." : ""}

품목 목록(가능하면 이 중에서 고르고, 정말 없으면 짧은 한국어 명사로 새로 적으세요. '기타'는 마지막 수단):
${itemTypes.join(" / ")}

작업 내용 목록(이 중에서만 고르세요, 여러 개 가능. 이 품목에 통상 하는 케어를 고르세요):
${aiServices.join(" / ")}

comment 작성 규칙(고객이 QR로 보는 문장입니다):
- 2~3문장, 총 120자 이내. 존댓말. 과장 없이 신뢰감 있게.
- 1문장: 이 품목의 소재·특성에 맞춰 '집중 케어'를 정성껏 마쳤다는 내용. 어떤 부분(충전재·볼륨·갑피·가죽결·시트·벨트 등)을 신경 썼는지는 언급해도 되지만, 세탁 방식은 절대 쓰지 마세요. 금지어: 드라이클리닝, 물세탁, 손세탁, 세척, 스팀, 세제, 온도, 건조기, 발수코팅 등 공정·약제 이름 일체. (케어라벨과 어긋나면 분쟁이 됩니다.)
- 2문장: 오래 쓰기 위한 관리 팁 한 가지. 사용 중 팁이든 보관 팁이든 좋습니다. 오늘 계절을 참고해 자연스럽게(입는 시기면 사용 팁, 넣어둘 시기면 보관 팁을 우선).
- 브랜드명이 확실할 때만 자연스럽게 언급. 얼룩·손상·오염 같은 부정적 표현은 쓰지 마세요(이미 케어 완료된 상태입니다).
- "세탁플랜"이라는 이름은 넣지 마세요(따로 붙습니다).
- 이모지·느낌표·해시태그 금지.

기타 규칙:
- brand: 로고·라벨·특징으로 브랜드를 확실히 알 수 있을 때만 한글 표기(예: 몽클레어, 나이키, 부가부). 불확실하면 빈 문자열.
- 사진이 세탁물이 아니거나 판단 불가면 item_type과 comment를 빈 문자열로 두세요.
- 반드시 아래 JSON 하나만 출력하세요. 설명·마크다운 금지.
{"item_type":"","brand":"","services":[],"comment":"","confidence":0.0}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-haiku-4-5",
        max_tokens: 700,
        messages: [{
          role: "user",
          content: [
            ...(imageBefore ? [{ type: "text", text: "케어 전 사진:" }, { type: "image", source: { type: "base" + "64", media_type: mediaType, data: imageBefore } }, { type: "text", text: "케어 후 사진:" }] : []),
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
    const svcSet = new Set(aiServices);
    return json({
      item_type: String(out.item_type ?? "").trim().slice(0, 40),
      brand: String(out.brand ?? "").trim().slice(0, 40),
      services: (Array.isArray(out.services) ? out.services : []).map(String).filter((s: string) => svcSet.has(s)),
      comment: String(out.comment ?? "").trim().slice(0, 600),
      confidence: Number(out.confidence ?? 0) || 0,
    });
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});
