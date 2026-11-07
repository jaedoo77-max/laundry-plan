// 사진 자동 보정
// 1) 배경 정리: 상품사진 전문 서비스(Photoroom)로 물건만 따냄 — 서버 함수 cutout-photo 경유 (키는 서버에만 있음)
// 2) 고른 배경(흰색 / 연회색 / 체크 무늬) 위에 물건 + 은은한 그림자 + 밝기·색 살짝 보정
// 물건 자체는 다시 그리지 않습니다. 원본은 따로 저장되고, 고객 화면에는 보정본이 올라갑니다.
const ENH = { out: 1600, queue: Promise.resolve() };
const ENH_BGS = { brand: '세탁플랜 벽지', white: '흰색', gray: '연회색', check: '체크 무늬' };
function enhEnabled() { try { return localStorage.getItem('enh-off') !== '1'; } catch { return true; } }
function enhSetEnabled(on) { try { on ? localStorage.removeItem('enh-off') : localStorage.setItem('enh-off', '1'); } catch {} }
function enhBg() { try { const v = localStorage.getItem('enh-bg'); return ENH_BGS[v] ? v : 'brand'; } catch { return 'brand'; } }
function enhSetBg(v) { try { localStorage.setItem('enh-bg', ENH_BGS[v] ? v : 'brand'); } catch {} }
const ENH_FLOOR = 0.78; // 세탁플랜 벽지: 벽과 바닥이 만나는 높이(비율)
// 세탁플랜 벽지: 밝은 스튜디오 벽 + 사선 '세탁플랜' 글자 무늬 + 바닥 + 가운데 조명
function enhPaintBrand(g, W, H) {
  const N = Math.max(W, H);
  g.fillStyle = '#f4f3f0'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(-25 * Math.PI / 180);
  g.fillStyle = '#d6cdbb'; g.font = `700 ${Math.round(N / 40)}px "Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif`; g.textBaseline = 'top';
  const sx = N * 0.1625, sy = N * 0.075;
  for (let j = 0, y = -N; y < N; y += sy, j++) for (let x = -N + (j % 2) * sx / 2; x < N; x += sx) g.fillText('세탁플랜', x, y);
  g.restore();
  const fy = H * ENH_FLOOR, band = N * 0.025;
  const fl = g.createLinearGradient(0, fy - band, 0, fy); fl.addColorStop(0, 'rgba(229,226,220,0)'); fl.addColorStop(1, 'rgba(229,226,220,1)');
  g.fillStyle = fl; g.fillRect(0, fy - band, W, band); g.fillStyle = '#e5e2dc'; g.fillRect(0, fy, W, H - fy);
  const hi = g.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, N * 0.75);
  hi.addColorStop(0, 'rgba(255,255,255,.38)'); hi.addColorStop(0.55, 'rgba(255,255,255,.08)'); hi.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = hi; g.fillRect(0, 0, W, H);
}
function enhCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const enhBlob = (c, type = 'image/jpeg', q = 0.9) => new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('사진을 만들지 못했습니다'))), type, q));
async function enhB64(blob) { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); }
function enhUnB64(b64, type) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); }

// 밝기·색 보정: 물건 부분만 보고 대비를 살짝 살림. 색(화이트밸런스)은 건드리지 않아 원래 색감이 유지됨.
// 어두운 물건을 억지로 밝히지 않아 '바랜' 느낌이 나지 않게 함.
function enhTone(img, alpha) {
  const d = img.data, n = d.length / 4, hist = new Uint32Array(256); let cnt = 0;
  for (let i = 0; i < n; i++) {
    if (alpha && alpha[i * 4 + 3] < 128) continue;
    hist[(d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8]++; cnt++;
  }
  if (cnt < 100) return;
  let lo = 0, hi = 255, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cnt * 0.005) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cnt * 0.005) { hi = v; break; } }
  if (hi - lo < 40) { lo = 0; hi = 255; }
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const s = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    let t = v / 255 * 0.6 + s * 0.4;                 // 구간 펴기는 40%만
    t = t + 0.10 * Math.sin((t - 0.5) * Math.PI) * (1 - Math.abs(t - 0.5) * 2) ; // 은은한 S자 대비
    lut[v] = Math.round(Math.min(1, Math.max(0, t)) * 255);
  }
  for (let i = 0; i < n; i++) {
    if (alpha && alpha[i * 4 + 3] < 8) continue;
    let r = lut[d[i * 4]], g = lut[d[i * 4 + 1]], b = lut[d[i * 4 + 2]];
    const l = r * 0.299 + g * 0.587 + b * 0.114, k = 1.06; // 채도 6% 살짝 올림
    d[i * 4] = l + (r - l) * k; d[i * 4 + 1] = l + (g - l) * k; d[i * 4 + 2] = l + (b - l) * k;
  }
}
function enhPaintBg(g, W, H, bg) {
  if (bg === 'brand') return enhPaintBrand(g, W, H);
  if (bg === 'check') {
    g.fillStyle = '#fbfbfa'; g.fillRect(0, 0, W, H);
    const s = Math.round(Math.max(W, H) / 22); g.fillStyle = '#efeeeb';
    for (let y = 0; y < H; y += s) for (let x = ((y / s) % 2) * s; x < W; x += s * 2) g.fillRect(x, y, s, s);
    const v = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,0,.05)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
    return;
  }
  const [a, b] = bg === 'gray' ? ['#efeeeb', '#dcdad5'] : ['#ffffff', '#eeece8'];
  const gr = g.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.05, W / 2, H / 2, Math.max(W, H) * 0.75);
  gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
// 배경만 따로 정리 (서비스 호출 1회). 결과(물건+투명 배경)를 보관해 두면 배경색을 바꿔도 다시 부르지 않음.
async function enhCut(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const sc = Math.min(1, ENH.out / Math.max(bmp.width, bmp.height)), W = Math.round(bmp.width * sc), H = Math.round(bmp.height * sc);
  const src = enhCanvas(W, H), sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  const img = sx.getImageData(0, 0, W, H);
  let alpha = null, note = '';
  try {
    if (typeof sb === 'undefined' || !sb) throw new Error('로그인이 필요합니다');
    const { data, error } = await sb.functions.invoke('cutout-photo', { body: { image: await enhB64(await enhBlob(src, 'image/jpeg', 0.92)) } });
    if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message || '배경 정리 실패');
    if (!data?.png) throw new Error(data?.error || '배경 정리 실패');
    if (data.studio) { // 스튜디오 모드: 조명·그림자·구도까지 맞춰진 정사각형(투명 배경)
      const st = await createImageBitmap(enhUnB64(data.png, data.type || 'image/png'));
      const sc2 = enhCanvas(st.width, st.height); sc2.getContext('2d').drawImage(st, 0, 0); st.close?.();
      return { W, H, img, alpha: null, note: '', studio: sc2 };
    }
    const cut = await createImageBitmap(enhUnB64(data.png, 'image/png'));
    const mc = enhCanvas(W, H), mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(cut, 0, 0, W, H); cut.close?.();
    alpha = mx.getImageData(0, 0, W, H).data;
  } catch (e) { note = e.message || String(e); }
  return { W, H, img, alpha, note };
}
// 고른 배경으로 보정본 만들기 (서비스 호출 없음)
async function enhCompose(cut, bg) {
  if (cut.studio) { const S = cut.studio, out = enhCanvas(S.width, S.height), g = out.getContext('2d'); enhPaintBg(g, S.width, S.height, bg); g.drawImage(S, 0, 0); return { blob: await enhBlob(out), cutout: true }; }
  const { W, H, alpha } = cut, img = new ImageData(new Uint8ClampedArray(cut.img.data), W, H);
  let cnt = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
  if (alpha) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[(y * W + x) * 4 + 3] > 128) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const ok = !!alpha && cnt / (W * H) > 0.02 && x1 > x0 && y1 > y0;
  enhTone(img, ok ? alpha : null);
  if (!ok) { const c = enhCanvas(W, H); c.getContext('2d').putImageData(img, 0, 0); return { blob: await enhBlob(c), cutout: false }; }
  // 털·니트처럼 반투명하게 잡힌 부분은 단단하게(속은 불투명, 끝만 부드럽게) — 밝은 배경이 비쳐 '바래' 보이는 것 방지
  for (let i = 0; i < W * H; i++) { const v = alpha[i * 4 + 3]; img.data[i * 4 + 3] = v <= 16 ? 0 : v >= 150 ? 255 : Math.round((v - 16) / 134 * 255); }
  const obj = enhCanvas(W, H); obj.getContext('2d').putImageData(img, 0, 0);
  // 물건이 사진 가장자리에 걸려 있으면(가까이서 찍은 사진) 구도는 그대로 두고 배경만 바꿈. 아니면 정사각형 가운데 정렬.
  const edge = (len, at) => { let k = 0; for (let j = 0; j < len; j++) if (alpha[at(j) * 4 + 3] > 128) k++; return k / len; };
  const touches = Math.max(edge(W, x => x), edge(W, x => (H - 1) * W + x), edge(H, y => y * W), edge(H, y => y * W + W - 1)) > 0.03;
  let out;
  if (touches) {
    out = enhCanvas(W, H); const g = out.getContext('2d'); enhPaintBg(g, W, H, bg);
    g.save(); g.shadowColor = 'rgba(40,34,28,.18)'; g.shadowBlur = Math.max(W, H) * 0.025; g.shadowOffsetY = Math.max(W, H) * 0.01; g.drawImage(obj, 0, 0); g.restore();
  } else {
    const O = ENH.out; out = enhCanvas(O, O); const g = out.getContext('2d'); enhPaintBg(g, O, O, bg);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(O * 0.8 / bw, O * 0.8 / bh, 3), dw = bw * k, dh = bh * k;
    g.save(); g.shadowColor = 'rgba(40,34,28,.22)'; g.shadowBlur = O * 0.035; g.shadowOffsetY = O * 0.018; g.imageSmoothingQuality = 'high';
    // 세탁플랜 벽지는 물건 밑단이 바닥선에 살짝 닿게(서 있는 느낌), 나머지는 가운데
    const dy = bg === 'brand' ? Math.min(O - dh - O * 0.04, Math.max(O * 0.04, O * (ENH_FLOOR + 0.06) - dh)) : (O - dh) / 2;
    g.drawImage(obj, x0, y0, bw, bh, (O - dw) / 2, dy, dw, dh); g.restore();
  }
  return { blob: await enhBlob(out), cutout: true };
}
function enhWrap(file, r) {
  const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
  return { file: new File([r.blob], base + '-enh.jpg', { type: 'image/jpeg' }), url: URL.createObjectURL(r.blob), cutout: r.cutout };
}
// 사진 한 장 보정 (여러 장이면 순서대로 하나씩 처리)
function enhancePhoto(file, bg = enhBg()) {
  const job = ENH.queue.then(async () => { const cut = await enhCut(file); const r = await enhCompose(cut, bg); return { ...enhWrap(file, r), cut, note: cut.note }; });
  ENH.queue = job.catch(() => {});
  return job;
}
// 배경만 바꿔 다시 만들기 (추가 비용 없음)
async function enhRecompose(file, cut, bg) { return enhWrap(file, await enhCompose(cut, bg)); }
// 저장 직전: 보정이 끝나길 기다린 뒤, 올릴 사진(보정본 또는 원본)과 따로 보관할 원본을 나눔
async function carePrepare(pending) {
  await Promise.allSettled(pending.map(f => f._enhP).filter(Boolean));
  const show = pending.map(f => (f._enhOn && f._enh ? f._enh : f));
  const orig = pending.filter(f => f._enhOn && f._enh);
  return { show, orig };
}
