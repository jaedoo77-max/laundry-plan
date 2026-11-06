// 사진 자동 보정 (기기 안에서 처리, 무료)
// 배경 분리(U2Net-p) → 밝은 스튜디오 배경 + 은은한 그림자 + 밝기·색 보정. 물건 모양은 바꾸지 않습니다.
// 원본은 따로 저장되고, 고객 화면에는 보정본이 올라갑니다.
const ENH = {
  ortBase: window.ENH_ORT_BASE || 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
  modelUrl: window.ENH_MODEL_URL || 'https://cdn.jsdelivr.net/npm/@rmbg/model-u2netp@0.0.1/u2netp.onnx',
  modelSha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  size: 320, out: 1600, session: null, loading: null, queue: Promise.resolve(),
};
function enhEnabled() { try { return localStorage.getItem('enh-off') !== '1'; } catch { return true; } }
function enhSetEnabled(on) { try { on ? localStorage.removeItem('enh-off') : localStorage.setItem('enh-off', '1'); } catch {} }
function enhLoadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('보정 엔진을 불러오지 못했습니다')); document.head.appendChild(s); });
}
async function enhSession() {
  if (ENH.session) return ENH.session;
  if (!ENH.loading) ENH.loading = (async () => {
    if (!window.ort) await enhLoadScript(ENH.ortBase + 'ort.min.js');
    ort.env.wasm.wasmPaths = ENH.ortBase; ort.env.wasm.numThreads = 1;
    const r = await fetch(ENH.modelUrl); if (!r.ok) throw new Error('보정 모델을 불러오지 못했습니다');
    const buf = await r.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (hash !== ENH.modelSha256) throw new Error('보정 모델 확인에 실패했습니다');
    ENH.session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
    return ENH.session;
  })().catch(e => { ENH.loading = null; throw e; });
  return ENH.loading;
}
function enhCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// 밝기·색 보정: 물건 부분만 보고 1~99% 구간을 살짝 펴고, 색 틀어짐을 절반만 바로잡고, 아주 조금 밝게.
function enhTone(img, alpha) {
  const d = img.data, n = d.length / 4, hist = new Uint32Array(256); let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (alpha && alpha[i * 4 + 3] < 128) continue;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; hist[(r * 77 + g * 150 + b * 29) >> 8]++; sr += r; sg += g; sb += b; cnt++;
  }
  if (cnt < 100) return;
  let lo = 0, hi = 255, acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= cnt * 0.01) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= cnt * 0.01) { hi = v; break; } }
  if (hi - lo < 40) { lo = 0; hi = 255; }
  const mr = sr / cnt, mg = sg / cnt, mb = sb / cnt, gray = (mr + mg + mb) / 3;
  const gain = m => 1 + (Math.min(1.12, Math.max(0.9, gray / (m || 1))) - 1) * 0.5;
  const gr = gain(mr), gg = gain(mg), gb = gain(mb);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) { const s = Math.min(1, Math.max(0, (v - lo) / (hi - lo))); const st = v / 255 * 0.4 + s * 0.6; lut[v] = Math.round(Math.pow(st, 0.93) * 255); }
  for (let i = 0; i < n; i++) {
    d[i * 4] = lut[Math.min(255, Math.round(d[i * 4] * gr))];
    d[i * 4 + 1] = lut[Math.min(255, Math.round(d[i * 4 + 1] * gg))];
    d[i * 4 + 2] = lut[Math.min(255, Math.round(d[i * 4 + 2] * gb))];
  }
}
async function enhRun(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const sc = Math.min(1, ENH.out / Math.max(bmp.width, bmp.height)), W = Math.round(bmp.width * sc), H = Math.round(bmp.height * sc);
  const src = enhCanvas(W, H), sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  // 1) 배경 분리
  const S = ENH.size, t = enhCanvas(S, S), tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(src, 0, 0, S, S);
  const px = tx.getImageData(0, 0, S, S).data, f = new Float32Array(3 * S * S), mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) f[c * S * S + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
  const ses = await enhSession();
  const res = await ses.run({ [ses.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) });
  const m = res[ses.outputNames[0]].data; let mn = Infinity, mx = -Infinity; for (const v of m) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const mc = enhCanvas(S, S), mctx = mc.getContext('2d'), md = mctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { let a = (m[i] - mn) / (mx - mn + 1e-8); a = Math.min(1, Math.max(0, (a - 0.12) / 0.76)); md.data[i * 4 + 3] = Math.round(a * 255); }
  mctx.putImageData(md, 0, 0);
  const fm = enhCanvas(W, H), fx = fm.getContext('2d', { willReadFrequently: true }); fx.imageSmoothingQuality = 'high'; fx.drawImage(mc, 0, 0, W, H);
  const ma = fx.getImageData(0, 0, W, H).data;
  let cnt = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ma[(y * W + x) * 4 + 3] > 128) { cnt++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  // 물건이 사진 가장자리에 걸려 잘려 있으면(가까이서 찍은 사진) 오려내면 어색하므로 색감만 보정
  const edge = (len, at) => { let k = 0; for (let j = 0; j < len; j++) if (ma[at(j) * 4 + 3] > 128) k++; return k / len; };
  const cutEdge = Math.max(edge(W, x => x), edge(W, x => (H - 1) * W + x), edge(H, y => y * W), edge(H, y => y * W + W - 1)) > 0.2;
  const cov = cnt / (W * H), ok = cov > 0.03 && cov < 0.93 && x1 > x0 && y1 > y0 && !cutEdge;
  // 2) 밝기·색 보정
  const img = sx.getImageData(0, 0, W, H); enhTone(img, ok ? ma : null);
  let out;
  if (ok) {
    for (let i = 0; i < W * H; i++) img.data[i * 4 + 3] = ma[i * 4 + 3];
    const obj = enhCanvas(W, H); obj.getContext('2d').putImageData(img, 0, 0);
    // 3) 스튜디오 배경 + 그림자, 물건을 가운데 정렬
    const O = ENH.out; out = enhCanvas(O, O); const g = out.getContext('2d');
    const grad = g.createRadialGradient(O / 2, O * 0.42, O * 0.05, O / 2, O / 2, O * 0.75);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#ebe8e3'); g.fillStyle = grad; g.fillRect(0, 0, O, O);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min(O * 0.8 / bw, O * 0.8 / bh, 3), dw = bw * k, dh = bh * k, dx = (O - dw) / 2, dy = (O - dh) / 2;
    g.save(); g.shadowColor = 'rgba(40,34,28,.22)'; g.shadowBlur = O * 0.035; g.shadowOffsetY = O * 0.018; g.imageSmoothingQuality = 'high';
    g.drawImage(obj, x0, y0, bw, bh, dx, dy, dw, dh); g.restore();
  } else {
    // 배경 분리가 어려운 사진(물건이 화면을 꽉 채우거나 너무 작음): 색감만 보정
    out = enhCanvas(W, H); out.getContext('2d').putImageData(img, 0, 0);
  }
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.9));
  if (!blob) throw new Error('보정본을 만들지 못했습니다');
  return { blob, cutout: ok };
}
// 사진 한 장 보정 (여러 장이면 순서대로 하나씩 처리해서 휴대폰 메모리 부담을 줄임)
function enhancePhoto(file) {
  const job = ENH.queue.then(() => enhRun(file));
  ENH.queue = job.catch(() => {});
  return job.then(r => {
    const base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
    return { file: new File([r.blob], base + '-enh.jpg', { type: 'image/jpeg' }), url: URL.createObjectURL(r.blob), cutout: r.cutout };
  });
}
// 저장 직전: 보정이 끝나길 기다린 뒤, 올릴 사진(보정본 또는 원본)과 따로 보관할 원본을 나눔
async function carePrepare(pending) {
  await Promise.allSettled(pending.map(f => f._enhP).filter(Boolean));
  const show = pending.map(f => (f._enhOn && f._enh ? f._enh : f));
  const orig = pending.filter(f => f._enhOn && f._enh);
  return { show, orig };
}
