const careDate = () => new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const careText = value => esc(value || '미입력');
const careFmt = d => d ? String(d).slice(0,10).replaceAll('-','.') : '날짜 미등록';
function careUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
// One photo list per care record. Older records keep their before/after arrays; they are merged here.
function carePhotoList(r) { const list = Array.isArray(r.photos) && r.photos.length ? r.photos : [...(r.before_photos||[]),...(r.after_photos||[])]; return list.map(careUrl).filter(Boolean); }
function careServices(r) { const list = Array.isArray(r.processes)&&r.processes.length ? r.processes.map(p=>p.name) : (r.services||[]); return list.filter(Boolean); }
function careGallery(urls,label='케어 사진') {
  const safe = (urls || []).map(careUrl).filter(Boolean);
  return safe.length ? `<div class="care-photos">${safe.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${label} ${i+1}" loading="lazy"></a>`).join('')}</div>` : '';
}
function careSort(records) { return [...records].sort((a,b)=>String(b.received_on||'').localeCompare(String(a.received_on||''))||String(b.created_at||'').localeCompare(String(a.created_at||''))); }
function renderCarePage(payload) {
  const item=payload.item, records=careSort(payload.records||[]), settings={...(payload.settings||{})};
  settings.booking_url=settings.booking_url??settings.kakao_url??C.bookingUrl;
  settings.business_name=settings.business_name??C.businessName;
  const store=payload.store||{};
  const bookingSrc=('booking_url' in store)?store.booking_url:settings.booking_url;
  const url=careUrl(bookingSrc); const booking=url&&new URL(url).hostname==='booking.naver.com'?url:'';
  const first=records.at(-1)?.received_on;
  app.innerHTML=`<div class="care-public"><section class="care-hero"><p class="eyebrow">세탁플랜 · 케어 이력</p><h1>${esc(item.brand||'브랜드 미등록')}</h1><p class="model">${careText(item.item_type)}</p><p class="care-code">관리번호 <strong>${esc(item.public_code)}</strong></p><dl class="care-stats"><div><dt>누적 케어</dt><dd>${records.length}<small>회</small></dd></div><div><dt>첫 케어</dt><dd class="stat-text">${first?careFmt(first):'—'}</dd></div><div><dt>최근 케어</dt><dd class="stat-text">${records[0]?careFmt(records[0].received_on):'—'}</dd></div></dl>${settings.warranty_text?`<div class="greeting"><p>${esc(settings.warranty_text)}</p><span>— ${esc(settings.business_name||'세탁플랜')}</span></div>`:''}</section><section class="care-section"><div class="section-heading"><h2>케어 기록</h2><span class="muted">${records.length}건</span></div><ul class="care-list">${records.map(r=>{const photos=carePhotoList(r).slice(0,3);const services=careServices(r);return `<li><time>${careFmt(r.received_on)}</time><div class="care-body"><p class="care-services">${services.length?esc(services.join(' · ')):'케어 완료'}</p>${r.staff_comment?`<p class="care-comment">${esc(r.staff_comment)}</p>`:''}${careGallery(photos,'케어 사진')}</div></li>`}).join('')||'<li class="muted">아직 등록된 케어가 없습니다.</li>'}</ul></section><footer class="care-footer"><p class="eyebrow">NEXT CARE</p><h2>다음 케어도, 안심하고.</h2>${booking?`<a class="booking" href="${esc(booking)}" target="_blank" rel="noopener noreferrer">네이버로 예약하기 ↗</a>`:`<p class="store-line">${esc(store.name||'세탁플랜')}</p>`}<div class="business">${settings.business_name?`<strong>${esc(settings.business_name)}</strong>`:''}${settings.business_owner?`<p>대표 ${esc(settings.business_owner)}</p>`:''}${settings.business_number?`<p>사업자등록번호 ${esc(settings.business_number)}</p>`:''}${settings.business_address?`<p>${esc(settings.business_address)}</p>`:''}</div></footer></div>`;
}
async function careCustomer(code) {
  document.body.classList.toggle('public-page',!!code);
  if(!code){app.innerHTML='<section class="care-hero"><p class="eyebrow">세탁플랜</p><h1>케어의 모든 기록.</h1><p class="muted">제품의 QR 코드를 스캔하면 케어 이력을 확인할 수 있습니다.</p><a class="button" href="#admin">관리자 화면으로</a></section>';return;}
  app.innerHTML='<p role="status" class="muted">케어 이력을 불러오고 있습니다…</p>';
  const {data,error}=await sb.rpc('get_care_history',{lookup_code:code});
  if(location.hash==='#admin')return;
  if(error){app.innerHTML='<section class="card"><h1>이력을 불러오지 못했습니다</h1><p class="muted">잠시 후 다시 시도해 주세요.</p><button id="retry-care">다시 시도</button></section>';document.querySelector('#retry-care').onclick=()=>careCustomer(code);return;}
  if(!data?.item){app.innerHTML='<section class="care-hero"><h1>등록된 이력이 없습니다</h1><p class="muted">QR의 관리번호를 확인해 주세요.</p></section>';return;}
  renderCarePage(data);
  careStaffLink();
}
// Logged-in staff (the shop) get a small link back to the admin screen; customers never see it.
async function careStaffLink() {
  try { const {data:{session}}=await sb.auth.getSession(); if(!session||location.hash==='#admin') return;
    document.querySelector('.care-footer')?.insertAdjacentHTML('beforeend','<p class="staff-link"><a href="#admin">관리자 화면으로 →</a></p>'); } catch {}
}
function careInput(id,label,value='',type='text') {return `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value||'')}">`;}
function careArea(id,label,value='') {return `<label for="${id}">${label}</label><textarea id="${id}">${esc(value||'')}</textarea>`;}
function careChecks(selected=[]) { return `<div class="checks">${services.map(x=>`<label><input type="checkbox" value="${esc(x)}" ${selected.includes(x)?'checked':''}>${esc(x)}</label>`).join('')}</div>`; }
function careValidateComment(item,text) {
  const name=String(item.customer_name||'').trim(), phone=String(item.customer_phone||'').replace(/\D/g,'');
  if((name&&text.includes(name))||(phone&&text.replace(/\D/g,'').includes(phone))||/01[016789][ -]?\d{3,4}[ -]?\d{4}/.test(text)) throw Error('고객에게 보이는 코멘트에 이름이나 전화번호를 넣을 수 없습니다.');
}
function carePresetChips(targetId) {
  return `<div class="preset-groups" data-target="${targetId}">${Object.entries(commentPresets).map(([g,list])=>`<div class="preset-group"><span class="preset-name">${esc(g)}</span>${list.map(t=>`<button type="button" class="chip" data-text="${esc(t)}">${esc(t)}</button>`).join('')}</div>`).join('')}</div>`;
}
function bindPresetChips(scope) {
  scope.querySelectorAll('.preset-groups').forEach(g=>{const ta=scope.querySelector('#'+g.dataset.target);g.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{const t=b.dataset.text;if(ta.value.includes(t))return;ta.value=(ta.value.trim()?ta.value.trim()+'\n':'')+t;ta.dispatchEvent(new Event('input'));});});
}
function careChecked(scope) { return [...scope.querySelectorAll('.checks input:checked')].map(x=>x.value); }
// Admin: existing photos shown as a selectable grid (checked = keep). Unchecking removes the photo on save.
function carePhotoPicker(urls) {
  const safe=(urls||[]).map(careUrl).filter(Boolean);
  return safe.length?`<p class="muted">기존 사진 ${safe.length}장 · 체크를 해제하면 저장할 때 삭제됩니다.</p><div class="photo-picker">${safe.map((url,i)=>`<label><input type="checkbox" class="keep-photo" value="${esc(url)}" checked><img src="${esc(url)}" alt="기존 사진 ${i+1}" loading="lazy"></label>`).join('')}</div>`:'';
}
function careExisting(item,out) {
  const records=careSort(item.service_records||[]);
  out.innerHTML=`<article class="record"><strong>${esc(item.public_code)}</strong><p>${careText(item.brand)} · ${careText(item.item_type)}</p><p class="muted">관리자용 고객 정보: ${careText(item.customer_name)} · ${careText(item.customer_phone)} · 지점 ${esc((storeList.find(s=>s.code===item.store_code)||{}).name||item.store_code||'HQ')}</p>${records.length?`<ul class="record-list">${records.map((r,i)=>`<li><span>${careFmt(r.received_on)} · ${esc(careServices(r).join(', ')||'작업 미등록')}${carePhotoList(r).length?` · 사진 ${carePhotoList(r).length}장`:''}${r.staff_comment?' · 코멘트':''}</span><button data-edit-care="${i}">수정</button></li>`).join('')}</ul>`:'<p class="muted">아직 케어 기록이 없습니다.</p>'}<button id="add-care">새 케어 추가</button>${labelButton(item.public_code)}</article>`;
  out.querySelectorAll('[data-edit-care]').forEach(b=>b.onclick=()=>careEditor(item,records[Number(b.dataset.editCare)]));
  out.querySelector('#add-care').onclick=()=>careEditor(item);bindLabelButtons(out);
}
function careEditor(item,r={}) {
  const out=document.querySelector('#found');
  out.innerHTML=`<section class="card"><h2>${esc(item.public_code)} · ${r.id?'케어 수정':'새 케어 추가'}</h2><div class="grid"><div>${careInput('care-received','케어일',r.received_on||careDate(),'date')}</div><div>${careInput('edit-brand','브랜드',item.brand)}</div></div>${storeSelect('edit-store',item.store_code||'HQ')}<label>작업 내용</label>${careChecks(careServices(r))}<label>사진 (선택, 여러 장 가능)</label>${carePhotoPicker(carePhotoList(r))}<input type="file" accept="image/*" multiple id="care-photos"><p id="photo-preview" class="muted"></p><label for="care-comment">고객에게 보이는 코멘트 (선택)</label>${carePresetChips('care-comment')}<textarea id="care-comment" placeholder="위 버튼을 누르거나 직접 입력">${esc(r.staff_comment||'')}</textarea>${careArea('care-private','내부 메모 (관리자 전용)',r.notes)}<button id="save-care">저장</button><button class="secondary" id="cancel-care">돌아가기</button><p id="care-message" role="status"></p></section>`;
  out.querySelector('#cancel-care').onclick=()=>careExisting(item,out);bindPresetChips(out);
  out.querySelector('#care-photos').onchange=e=>{out.querySelector('#photo-preview').textContent=e.target.files.length?`새 사진 ${e.target.files.length}장 선택됨`:'';};
  out.querySelector('#save-care').onclick=async()=>{
    const button=out.querySelector('#save-care'),msg=out.querySelector('#care-message');button.disabled=true;msg.className='muted';msg.textContent='저장 중…';
    try {
      const received=out.querySelector('#care-received').value;
      if(!received)throw Error('케어일을 입력하세요.');
      const staff_comment=out.querySelector('#care-comment').value.trim();careValidateComment(item,staff_comment);
      const keep=[...out.querySelectorAll('.keep-photo:checked')].map(x=>x.value);
      const added=await upload(out.querySelector('#care-photos').files,item.public_code,'care');
      const record={item_id:item.id,received_on:received,completed_on:received,status:'완료',services:careChecked(out),processes:[],photos:[...keep,...added],before_photos:[],after_photos:[],staff_comment,notes:out.querySelector('#care-private').value};
      const result=r.id?await sb.from('service_records').update(record).eq('id',r.id).select().single():await sb.from('service_records').insert(record).select().single();if(result.error)throw result.error;
      const itemValues={brand:out.querySelector('#edit-brand').value.trim(),store_code:out.querySelector('#edit-store').value};const update=await sb.from('items').update(itemValues).eq('id',item.id).select('id').single();if(update.error)throw update.error;
      Object.assign(item,itemValues);item.service_records=[...(item.service_records||[]).filter(x=>x.id!==result.data.id),result.data];
      careExisting(item,out);out.insertAdjacentHTML('afterbegin','<p class="success" role="status">저장했습니다.</p>');
    } catch(e){msg.className='error';msg.textContent=e.message;} finally{button.disabled=false;}
  };
}
async function storeAdmin() {
  const panel=document.createElement('section');panel.className='card';panel.id='store-admin';app.append(panel);
  const render=async()=>{
    const {data:stores,error}=await sb.from('stores').select('code,name,booking_url,is_hq').order('is_hq',{ascending:false}).order('code');
    if(error){panel.textContent='지점 목록을 불러오지 못했습니다: '+error.message;return;}
    storeList=stores||storeList;
    panel.innerHTML=`<details><summary>지점 관리</summary><p class="muted">지점 물건은 고객 화면에 예약 버튼 없이 지점 이름만 표시됩니다. 지점은 로그인 없이 고객처럼 QR로 이력을 봅니다.</p><ul class="record-list">${(stores||[]).map(st=>`<li><span><strong>${esc(st.code)}</strong> · ${esc(st.name)}${st.is_hq?' · 본사(예약 버튼 표시)':''}</span></li>`).join('')}</ul><h3>지점 추가</h3><div class="grid"><div>${careInput('store-code','지점 코드 (영문 대문자·숫자, 예: SINGIL)')}</div><div>${careInput('store-name','지점 이름 (예: 세탁플랜 신길점)')}</div></div><button id="add-store">지점 추가</button><p id="store-message" role="status"></p></details>`;
    const msg=panel.querySelector('#store-message');
    panel.querySelector('#add-store').onclick=async()=>{const code=panel.querySelector('#store-code').value.trim().toUpperCase(),name=panel.querySelector('#store-name').value.trim();if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name){msg.className='error';msg.textContent='지점 코드(영문 대문자·숫자 2~20자)와 이름을 입력하세요.';return;}const r=await sb.from('stores').insert({code,name}).select('code').single();if(r.error){msg.className='error';msg.textContent=r.error.message;return;}await render();panel.querySelector('details').open=true;const m=panel.querySelector('#store-message');m.className='success';m.textContent='지점을 추가했습니다: '+code+'. 신규 등록 화면의 “접수 지점”에서 고를 수 있습니다.';document.querySelectorAll('#new-store').forEach(sel=>sel.outerHTML=storeSelect('new-store').replace(/^<label[^>]*>[^<]*<\/label>/,''));};
  };
  await render();
}
async function careSettings() {
  const {data,error}=await sb.from('care_settings').select('*').eq('id',1).maybeSingle();
  const panel=document.createElement('section');panel.className='card';panel.id='care-settings';app.append(panel);
  if(error){panel.textContent='사업자 설정을 불러오지 못했습니다: '+error.message;return;}
  const s=data||{};
  s.booking_url=s.kakao_url??C.bookingUrl;
  s.business_name=s.business_name??C.businessName;
  panel.innerHTML=`<details><summary>예약 · 사업자 정보 설정</summary>${careInput('setting-booking_url','네이버 예약 주소 (https://booking.naver.com/...)',s.booking_url,'url')}${careArea('setting-warranty_text','고객 인사말 (모든 고객 화면 상단에 표시) — 예: 소중한 물건을 맡겨주셔서 감사합니다. 세탁플랜은 20년 경력의 전문가가 한 점 한 점 직접 관리합니다.',s.warranty_text)}${careInput('setting-business_name','상호',s.business_name)}${careInput('setting-business_owner','대표자',s.business_owner)}${careInput('setting-business_number','사업자등록번호',s.business_number)}${careInput('setting-business_address','사업장 주소',s.business_address)}<button id="save-settings">설정 저장</button><p id="settings-message" role="status"></p></details>`;
  panel.querySelector('#save-settings').onclick=async()=>{const msg=panel.querySelector('#settings-message'),button=panel.querySelector('#save-settings');button.disabled=true;try{const values={id:1};panel.querySelectorAll('[id^="setting-"]').forEach(e=>values[e.id.replace('setting-','')]=e.value.trim());if(values.booking_url&&(!careUrl(values.booking_url)||new URL(values.booking_url).hostname!=='booking.naver.com'))throw Error('네이버 예약의 https://booking.naver.com/ 주소를 입력하세요.');values.kakao_url=values.booking_url;delete values.booking_url;const result=await sb.from('care_settings').upsert(values).select('id').single();if(result.error)throw result.error;msg.textContent='저장했습니다.';msg.className='success';}catch(e){msg.textContent=e.message;msg.className='error';}finally{button.disabled=false;}};
}
