// 사진 자동 보정
// 1) 배경 정리: 기본은 휴대폰 안에서 무료로 처리(ISNet 모델). Photoroom 유료를 쓰려면 ENH_ENGINE 을 'photoroom' 으로
//    (Photoroom은 서버 함수 cutout-photo 경유, 키는 서버에만 있음. 실패하면 무료 방식으로 자동 전환)
// 2) 고른 배경(흰색 / 연회색 / 체크 무늬) 위에 물건 + 은은한 그림자 + 밝기·색 살짝 보정
// 물건 자체는 다시 그리지 않습니다. 원본은 따로 저장되고, 고객 화면에는 보정본이 올라갑니다.
const ENH = { out: 1600, queue: Promise.resolve(), ses: null, loading: null };
const ENH_ENGINE = window.ENH_ENGINE || 'photoroom'; // 'local'(무료, 휴대폰에서 처리) | 'photoroom'(유료)
// 무료 배경 정리 모델: ISNet(일반 물체용) 경량판 44MB — 처음 한 번만 받고 휴대폰에 보관
const ENH_LOCAL = {
  ort: window.ENH_ORT_BASE || 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',
  base: window.ENH_MODEL_BASE || 'https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/',
  size: 44342436, res: 1024,
  chunks: ['b34a3e9350ad77140964b6a2e1e32cd9738acd9d01e5899b96be71901a22ef47', '8a85c22e472bed10198298a3d57480a5a90946dba88bddecf8b0bf0eafc06e70',
    '5faec25d2338ae8ca2c7bff72e954cebd40a04c5f34c4b6bb8ca6720fae40996', 'b9861d932a549be455fc8ebd8ce5d413049515bfdd3edd55e136dbe05dd34ef5',
    'f070b4c4f512cfe8dd6936c3cb9a616f132894867d3d33304d83599eb6b55636', '10d02652d10fbc47bf93732ff9e8ad53eefbd3bd89ab3c1fbc15ddd740bea672',
    '014c9e0229363137e92b85ed3c6f56b1386c279cdd9af2d7f1960ed8428b5e94', '34dd3ad760f7e31b5e9144b8c387b8ecd6dc43116248c93c56dd7051ab525e3b',
    'e7ca5cc3e0afd65581642a05ac91eb8ea4d0deb868df94b8981c910212526476', '0ad4ebb86cfdd847901427181b7a7804dba93d868c3cd5f11a294acf36c9413f',
    '9582c0375aed822c5577a814766c4afc6c096f4ccd3b0d08af6a1794987206a1'],
};
const ENH_BGS = { brand: '세탁플랜 포토월', white: '흰색', gray: '연회색', check: '체크 무늬' };
function enhEnabled() { try { return localStorage.getItem('enh-off') !== '1'; } catch { return true; } }
function enhSetEnabled(on) { try { on ? localStorage.removeItem('enh-off') : localStorage.setItem('enh-off', '1'); } catch {} }
function enhBg() { try { const v = localStorage.getItem('enh-bg'); return ENH_BGS[v] ? v : 'brand'; } catch { return 'brand'; } }
function enhSetBg(v) { try { localStorage.setItem('enh-bg', ENH_BGS[v] ? v : 'brand'); } catch {} }
const ENH_FLOOR = 0.72; // (예전 바닥선 높이, 지금은 안 씀)
// 세탁플랜 포토월: 로고(물방울 아이콘 + 세탁플랜 + SETAKPLAN) 반복 벽지를 사진 전체에 + 가운데 은은한 조명
const ENH_DROP = new Path2D('M50 14 C50 14 25 44 25 62 A25 25 0 0 0 75 62 C75 44 50 14 50 14Z');
function enhIcon(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
  const bgr = g.createLinearGradient(0, 0, 0, 100); bgr.addColorStop(0, '#1b2338'); bgr.addColorStop(1, '#0a0f1c');
  g.fillStyle = bgr; g.beginPath(); g.roundRect ? g.roundRect(2, 2, 96, 96, 24) : g.rect(2, 2, 96, 96); g.fill();
  const dg = g.createLinearGradient(0, 14, 0, 87); dg.addColorStop(0, '#6fa2f0'); dg.addColorStop(1, '#3f6ff0'); g.fillStyle = dg; g.fill(ENH_DROP);
  g.fillStyle = '#0d1322'; g.beginPath(); g.arc(61, 70, 6, 0, 7); g.fill(); g.fillStyle = '#4a7cf0'; g.beginPath(); g.arc(76, 80, 5, 0, 7); g.fill();
  g.restore();
}
function enhPaintBrand(g0, W0, H0) {
  // 벽지 무늬는 작게 그린 뒤 키워서 살짝 흐리게(초점 밖 느낌) → 물건이 벽에서 떨어져 보이게
  const sc = 0.42, W = Math.round(W0 * sc), H = Math.round(H0 * sc), pc = enhCanvas(W, H), g = pc.getContext('2d');
  const N = Math.max(W, H);
  g.fillStyle = '#f7f9fc'; g.fillRect(0, 0, W, H);
  // 로고 반복 (줄마다 반 칸씩 엇갈리게)
  const rowp = N * 0.095, ic = N * 0.038, fs1 = N * 0.028, fs2 = N * 0.017;
  const font = '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif', ls = g.letterSpacing !== undefined;
  g.font = `800 ${fs1}px ${font}`; const w1 = g.measureText('세탁플랜').width;
  g.font = `700 ${fs2}px ${font}`; if (ls) g.letterSpacing = `${fs2 * 0.14}px`; const w2 = g.measureText('SETAKPLAN').width; if (ls) g.letterSpacing = '0px';
  const t1 = ic * 1.25, t2 = t1 + w1 + fs1 * 0.9, colp = t2 + w2 + fs1 * 1.6;
  // 사선(-25도)으로 기울여 사진 전체에 반복
  g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); g.translate(W / 2, H / 2); g.rotate(-25 * Math.PI / 180); g.textBaseline = 'middle';
  for (let r = 0, y = -N; y < N; y += rowp, r++) {
    for (let x = -N - (r % 2) * colp / 2; x < N; x += colp) {
      enhIcon(g, x, y - ic / 2, ic);
      g.font = `800 ${fs1}px ${font}`; g.fillStyle = 'rgba(42,61,99,.82)'; g.fillText('세탁플랜', x + t1, y + fs1 * 0.04);
      g.font = `700 ${fs2}px ${font}`; g.fillStyle = 'rgba(74,124,240,.8)'; if (ls) g.letterSpacing = `${fs2 * 0.14}px`;
      g.fillText('SETAKPLAN', x + t2, y + fs1 * 0.04); if (ls) g.letterSpacing = '0px';
    }
  }
  g.restore();
  g0.fillStyle = '#f7f9fc'; g0.fillRect(0, 0, W0, H0);
  g0.save(); g0.globalAlpha = 0.62; g0.imageSmoothingEnabled = true; g0.imageSmoothingQuality = 'high'; g0.drawImage(pc, 0, 0, W0, H0); g0.restore();
  // 아래쪽은 은은한 바닥 톤(카펫 무늬 없이 색만) — 물건이 바닥에 놓인 느낌
  const fl = g0.createLinearGradient(0, H0 * 0.6, 0, H0);
  fl.addColorStop(0, 'rgba(226,230,237,0)'); fl.addColorStop(0.55, 'rgba(222,226,234,.55)'); fl.addColorStop(1, 'rgba(208,213,222,.9)');
  g0.fillStyle = fl; g0.fillRect(0, H0 * 0.6, W0, H0 * 0.4);
  const N0 = Math.max(W0, H0), hi = g0.createRadialGradient(W0 / 2, H0 * 0.42, 0, W0 / 2, H0 * 0.42, N0 * 0.8);
  hi.addColorStop(0, 'rgba(255,255,255,.35)'); hi.addColorStop(0.55, 'rgba(255,255,255,0)'); hi.addColorStop(1, 'rgba(0,0,0,.16)');
  g0.fillStyle = hi; g0.fillRect(0, 0, W0, H0);
}
// 물건 아래 바닥 그림자 (타원형, 가운데 진하고 바깥으로 흐려짐)
function enhGroundShadow(g, cx, by, w) {
  g.save(); g.translate(cx, by); g.scale(1, 0.13);
  const r = w * 0.56, gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, 'rgba(25,28,38,.38)'); gr.addColorStop(0.55, 'rgba(25,28,38,.16)'); gr.addColorStop(1, 'rgba(25,28,38,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
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
  let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
  const meanL = sum / cnt; // 밝은 옷(흰·아이보리) / 어두운 옷(검정·퍼)에 따라 다르게
  const light = meanL > 140, dark = meanL < 100;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const s = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    let t = light ? v / 255 * 0.4 + s * 0.6 : v / 255 * 0.6 + s * 0.4; // 구간 펴기 (밝은 옷은 60%)
    if (light) t = Math.pow(t, 0.82);                  // 밝은 옷: 그늘진 부분을 살짝 밝혀 얼룩져 보이지 않게
    else t = t + (dark ? 0.10 : 0.05) * Math.sin((t - 0.5) * Math.PI) * (1 - Math.abs(t - 0.5) * 2); // 어두운 옷: 은은한 대비
    lut[v] = Math.round(Math.min(1, Math.max(0, t)) * 255);
  }
  const k = light ? 1.0 : 1.05; // 밝은 옷은 채도를 올리지 않음(누렇게 보이는 것 방지)
  for (let i = 0; i < n; i++) {
    if (alpha && alpha[i * 4 + 3] < 8) continue;
    const r = lut[d[i * 4]], g = lut[d[i * 4 + 1]], b = lut[d[i * 4 + 2]];
    const l = r * 0.299 + g * 0.587 + b * 0.114;
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
function enhLoadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('보정 프로그램을 불러오지 못했습니다 (인터넷 확인)')); document.head.appendChild(s); }); }
async function enhModelBytes() {
  const key = 'isnet-quint8-' + ENH_LOCAL.size;
  let cache = null; try { cache = await caches.open('enh-model-v1'); const hit = await cache.match(key); if (hit) { const b = await hit.arrayBuffer(); if (b.byteLength === ENH_LOCAL.size) return new Uint8Array(b); } } catch {}
  const parts = await Promise.all(ENH_LOCAL.chunks.map(async h => { const r = await fetch(ENH_LOCAL.base + h); if (!r.ok) throw new Error('보정 모델을 받지 못했습니다 (' + r.status + ')'); return new Uint8Array(await r.arrayBuffer()); }));
  const all = new Uint8Array(ENH_LOCAL.size); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  if (o !== ENH_LOCAL.size) throw new Error('보정 모델이 손상되었습니다');
  try { await cache?.put(key, new Response(all, { headers: { 'content-type': 'application/octet-stream' } })); } catch {}
  return all;
}
async function enhSession() {
  if (ENH.ses) return ENH.ses;
  if (!ENH.loading) ENH.loading = (async () => {
    if (!window.ort) await enhLoadScript(ENH_LOCAL.ort + 'ort.min.js');
    ort.env.wasm.wasmPaths = ENH_LOCAL.ort; ort.env.wasm.numThreads = 1;
    ENH.ses = await ort.InferenceSession.create(await enhModelBytes(), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return ENH.ses;
  })().catch(e => { ENH.loading = null; throw e; });
  return ENH.loading;
}
// 무료 방식 뒷정리: 흐릿하게 남은 배경(유령 자국) 지우고, 옷과 떨어져 있는 작은 물건(받침대 등)은 버림
// (가방끈처럼 가는 부분이 잘리지 않게 물건을 깎지는 않음)
function enhCleanMask(m, R) {
  const N = R * R, a = new Float32Array(N), b = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const v = Math.min(1, Math.max(0, (m[i] - 0.3) / 0.4)); a[i] = v; b[i] = v > 0.5 ? 1 : 0; }
  const e = b;
  const lab = new Int32Array(N), sizes = [0], st = new Int32Array(N);
  for (let i = 0; i < N; i++) if (e[i] && !lab[i]) { const id = sizes.length; let n = 0, top = 0; st[top++] = i; lab[i] = id;
    while (top) { const j = st[--top]; n++; const x = j % R, y = (j / R) | 0;
      if (x > 0 && e[j - 1] && !lab[j - 1]) { lab[j - 1] = id; st[top++] = j - 1; } if (x < R - 1 && e[j + 1] && !lab[j + 1]) { lab[j + 1] = id; st[top++] = j + 1; }
      if (y > 0 && e[j - R] && !lab[j - R]) { lab[j - R] = id; st[top++] = j - R; } if (y < R - 1 && e[j + R] && !lab[j + R]) { lab[j + R] = id; st[top++] = j + R; } }
    sizes.push(n); }
  if (sizes.length < 2) return a;
  const big = Math.max(...sizes), keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (lab[i] && sizes[lab[i]] >= big * 0.25) keep[i] = 1;
  for (let i = 0; i < N; i++) if (!keep[i] && a[i] > 0) { const x = i % R, y = (i / R) | 0; let near = 0; for (let d = -2; d <= 2 && !near; d++) { const xx = x + d, yy = y + d; if (xx >= 0 && xx < R && keep[y * R + xx]) near = 1; if (yy >= 0 && yy < R && keep[yy * R + x]) near = 1; } if (!near) a[i] = 0; }
  return a;
}
// 무료 배경 정리: 물건 부분의 투명도(알파) 계산 — 사진은 밖으로 나가지 않음
async function enhLocalAlpha(src, W, H) {
  const ses = await enhSession(), R = ENH_LOCAL.res;
  const t = enhCanvas(R, R), tx = t.getContext('2d', { willReadFrequently: true }); tx.imageSmoothingQuality = 'high'; tx.drawImage(src, 0, 0, R, R);
  const px = tx.getImageData(0, 0, R, R).data, f = new Float32Array(3 * R * R);
  for (let i = 0; i < R * R; i++) for (let c = 0; c < 3; c++) f[c * R * R + i] = (px[i * 4 + c] - 128) / 256;
  const out = await ses.run({ [ses.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, R, R]) });
  const m = out[ses.outputNames[0]].data, mc = enhCanvas(R, R), mx = mc.getContext('2d'), md = mx.createImageData(R, R);
  const a = window.ENH_NO_CLEAN ? Float32Array.from(m, v => Math.min(1, Math.max(0, v))) : enhCleanMask(m, R);
  for (let i = 0; i < R * R; i++) md.data[i * 4 + 3] = Math.round(a[i] * 255);
  mx.putImageData(md, 0, 0);
  const big = enhCanvas(W, H), bx = big.getContext('2d', { willReadFrequently: true }); bx.imageSmoothingQuality = 'high'; bx.drawImage(mc, 0, 0, W, H);
  return bx.getImageData(0, 0, W, H).data;
}
async function enhPhotoroom(src, W, H) {
  if (typeof sb === 'undefined' || !sb) throw new Error('로그인이 필요합니다');
  const { data, error } = await sb.functions.invoke('cutout-photo', { body: { image: await enhB64(await enhBlob(src, 'image/jpeg', 0.92)) } });
  if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message || '배경 정리 실패');
  if (!data?.png) throw new Error(data?.error || '배경 정리 실패');
  const cut = await createImageBitmap(enhUnB64(data.png, 'image/png'));
  const mc = enhCanvas(W, H), mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(cut, 0, 0, W, H); cut.close?.();
  return mx.getImageData(0, 0, W, H).data;
}
// 배경만 따로 정리 (서비스 호출 1회). 결과(물건+투명 배경)를 보관해 두면 배경색을 바꿔도 다시 부르지 않음.
async function enhCut(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const sc = Math.min(1, ENH.out / Math.max(bmp.width, bmp.height)), W = Math.round(bmp.width * sc), H = Math.round(bmp.height * sc);
  const src = enhCanvas(W, H), sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  const img = sx.getImageData(0, 0, W, H);
  let alpha = null, note = '';
  if (ENH_ENGINE === 'photoroom') { try { alpha = await enhPhotoroom(src, W, H); } catch (e) { note = e.message || String(e); } }
  if (!alpha) { try { alpha = await enhLocalAlpha(src, W, H); note = ''; } catch (e) { note = (note ? note + ' / ' : '') + (e.message || String(e)); } }
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
  // 가까이서 찍어 물건이 화면을 거의 채운 사진(클로즈업)은 배경을 바꾸지 않음 — 털·옷 사이 틈이 구멍처럼 뚫려 보이는 것 방지. 밝기·색만 보정.
  {
    const ed = (len, at) => { let k = 0; for (let j = 0; j < len; j++) if (alpha[at(j) * 4 + 3] > 128) k++; return k / len; };
    const sides = [ed(W, x => x), ed(W, x => (H - 1) * W + x), ed(H, y => y * W), ed(H, y => y * W + W - 1)].filter(v => v > 0.1).length;
    let inS = 0, inF = 0; // 물건 안쪽이 얼마나 꽉 찼는지(가로줄마다 왼쪽 끝~오른쪽 끝 사이 채워진 비율)
    for (let y = y0; y <= y1; y += 2) { let l = -1, r = -1, f = 0; for (let x = 0; x < W; x++) if (alpha[(y * W + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; f++; } if (l >= 0) { inS += r - l + 1; inF += f; } }
    if (cnt / (W * H) > 0.45 && sides >= 2 && inF / Math.max(1, inS) < 0.86) { const c = enhCanvas(W, H); c.getContext('2d').putImageData(img, 0, 0); return { blob: await enhBlob(c), cutout: false }; }
  }
  // 털·니트처럼 반투명하게 잡힌 부분은 단단하게(속은 불투명, 끝만 부드럽게) — 밝은 배경이 비쳐 '바래' 보이는 것 방지
  for (let i = 0; i < W * H; i++) { const v = alpha[i * 4 + 3]; img.data[i * 4 + 3] = v <= 16 ? 0 : v >= 150 ? 255 : Math.round((v - 16) / 134 * 255); }
  const obj = enhCanvas(W, H); obj.getContext('2d').putImageData(img, 0, 0);
  // 물건이 사진 가장자리에 걸려 있으면(가까이서 찍은 사진) 구도는 그대로 두고 배경만 바꿈. 아니면 정사각형 가운데 정렬.
  const edge = (len, at) => { let k = 0; for (let j = 0; j < len; j++) if (alpha[at(j) * 4 + 3] > 128) k++; return k / len; };
  const touches = Math.max(edge(W, x => x), edge(W, x => (H - 1) * W + x), edge(H, y => y * W), edge(H, y => y * W + W - 1)) > 0.03;
  let out;
  if (touches) {
    out = enhCanvas(W, H); const g = out.getContext('2d'); enhPaintBg(g, W, H, bg);
    if (y1 < H - 2) enhGroundShadow(g, (x0 + x1) / 2, y1, x1 - x0);
    g.save(); g.shadowColor = 'rgba(30,30,40,.22)'; g.shadowBlur = Math.max(W, H) * 0.03; g.shadowOffsetY = Math.max(W, H) * 0.012; g.drawImage(obj, 0, 0); g.restore();
  } else {
    // 원본 사진과 같은 비율의 틀에, 물건이 화면을 꽉 채우게(가장자리 여백 4%)
    const r = ENH.out / Math.max(W, H), CW = Math.round(W * r), CH = Math.round(H * r), N = Math.max(CW, CH), m = N * 0.04;
    out = enhCanvas(CW, CH); const g = out.getContext('2d'); enhPaintBg(g, CW, CH, bg);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, k = Math.min((CW - 2 * m) / bw, (CH - 2 * m) / bh, 3), dw = bw * k, dh = bh * k;
    // 물건은 가운데, 발밑에 바닥 그림자
    const dy = (CH - dh) / 2;
    enhGroundShadow(g, CW / 2, dy + dh, dw);
    g.save(); g.shadowColor = 'rgba(30,30,40,.24)'; g.shadowBlur = N * 0.04; g.shadowOffsetY = N * 0.02; g.imageSmoothingQuality = 'high';
    g.drawImage(obj, x0, y0, bw, bh, (CW - dw) / 2, dy, dw, dh); g.restore();
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
