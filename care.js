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
  app.innerHTML=`<div class="care-public"><section class="care-hero"><p class="eyebrow">세탁플랜 · 케어 이력</p><h1>${esc(item.brand||'브랜드 미등록')}</h1><p class="model">${careText(item.item_type)}</p><p class="care-code">관리번호 <strong>${esc(item.public_code)}</strong></p><dl class="care-stats"><div><dt>누적 케어</dt><dd>${records.length}<small>회</small></dd></div><div><dt>첫 케어</dt><dd class="stat-text">${first?careFmt(first):'—'}</dd></div><div><dt>최근 케어</dt><dd class="stat-text">${records[0]?careFmt(records[0].received_on):'—'}</dd></div></dl>${settings.warranty_text?`<div class="greeting"><p>${esc(settings.warranty_text)}</p><span>— ${esc(settings.business_name||'세탁플랜')}</span></div>`:''}</section><section class="care-section"><div class="section-heading"><h2>케어 기록</h2><span class="muted">${records.length}건</span></div><ul class="care-list">${records.map(r=>{const photos=carePhotoList(r).slice(0,3);const services=careServices(r);return `<li><time>${careFmt(r.received_on)}</time><div class="care-body"><p class="care-services">${services.length?esc(services.join(' · ')):'케어 완료'}</p>${r.staff_comment?`<p class="care-comment">${esc(r.staff_comment)}</p>`:''}${careGallery(photos,'케어 사진')}</div></li>`}).join('')||'<li class="muted">아직 등록된 케어가 없습니다.</li>'}</ul></section><footer class="care-footer"><p class="eyebrow">NEXT CARE</p><h2>다음 케어도, 안심하고.</h2>${booking?`<a class="booking" href="${esc(booking)}" target="_blank" rel="noopener noreferrer">네이버로 예약하기 ↗</a>`:`<div class="store-block"><p class="store-label">맡기신 매장</p><p class="store-line">${esc(store.name||'세탁플랜')}</p>${store.phone?`<a class="booking store-call" href="tel:${esc(String(store.phone).replace(/[^0-9+]/g,''))}">전화하기 ${esc(store.phone)}</a>`:''}</div>`}<div class="business">${settings.business_name?`<strong>${esc(settings.business_name)}</strong>`:''}${settings.business_owner?`<p>대표 ${esc(settings.business_owner)}</p>`:''}${settings.business_number?`<p>사업자등록번호 ${esc(settings.business_number)}</p>`:''}${settings.business_address?`<p>${esc(settings.business_address)}</p>`:''}</div></footer></div>`;
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
// Admin photos: existing photos (X = delete now) + pending photos picked one by one (X = remove before saving).
function carePhotoPicker(urls) {
  const safe=(urls||[]).map(careUrl).filter(Boolean);
  return `<div class="photo-picker" id="existing-photos">${safe.map((url,i)=>`<figure data-url="${esc(url)}"><img src="${esc(url)}" alt="기존 사진 ${i+1}" loading="lazy"><button type="button" class="photo-x del-existing" data-url="${esc(url)}" aria-label="사진 삭제">×</button></figure>`).join('')}</div>`;
}
function carePhotoInput(id) {
  return `<div class="photo-add"><label class="button secondary photo-add-btn" for="${id}">＋ 사진 추가</label><input type="file" accept="image/*" multiple id="${id}" hidden><span class="muted" id="${id}-count"></span></div><div class="photo-picker pending" id="${id}-pending"></div>`;
}
function bindPhotoInput(scope,id,pending) {
  const input=scope.querySelector('#'+id), grid=scope.querySelector('#'+id+'-pending'), count=scope.querySelector('#'+id+'-count');
  const draw=()=>{grid.innerHTML=pending.map((f,i)=>`<figure><img src="${f._url}" alt="새 사진 ${i+1}"><button type="button" class="photo-x del-pending" data-i="${i}" aria-label="사진 빼기">×</button></figure>`).join('');count.textContent=pending.length?`새 사진 ${pending.length}장 (저장 시 업로드)`:'';grid.querySelectorAll('.del-pending').forEach(b=>b.onclick=()=>{const f=pending.splice(+b.dataset.i,1)[0];try{URL.revokeObjectURL(f._url)}catch{}draw();});};
  input.onchange=()=>{for(const f of input.files){f._url=URL.createObjectURL(f);pending.push(f);}input.value='';draw();};
  draw();
}
function careExisting(item,out) {
  const records=careSort(item.service_records||[]);
  out.innerHTML=`<article class="record"><strong>${esc(item.public_code)}</strong><p>${careText(item.brand)} · ${careText(item.item_type)}</p><p class="muted">관리자용 고객 정보: ${careText(item.customer_name)} · ${careText(item.customer_phone)} · 지점 ${esc((storeList.find(s=>s.code===item.store_code)||{}).name||item.store_code||'HQ')}</p>${records.length?`<ul class="record-list">${records.map((r,i)=>`<li><span>${careFmt(r.received_on)} · ${esc(careServices(r).join(', ')||'작업 미등록')}${carePhotoList(r).length?` · 사진 ${carePhotoList(r).length}장`:''}${r.staff_comment?' · 코멘트':''}</span><button data-edit-care="${i}">수정</button></li>`).join('')}</ul>`:'<p class="muted">아직 케어 기록이 없습니다.</p>'}<button id="add-care">새 케어 추가</button>${labelButton(item.public_code)}<button class="secondary danger" id="delete-item">물건 삭제 (QR 폐기)</button></article>`;
  out.querySelector('#delete-item').onclick=async()=>{if(!confirm(`${item.public_code} 물건과 케어 기록 ${records.length}건을 모두 삭제할까요? 되돌릴 수 없습니다.`))return;const r1=await sb.from('service_records').delete().eq('item_id',item.id);if(r1.error){alert('삭제 실패: '+r1.error.message);return;}const r2=await sb.from('items').delete().eq('id',item.id);if(r2.error){alert('삭제 실패: '+r2.error.message);return;}out.innerHTML='<p class="success" role="status">물건을 삭제했습니다. 해당 QR은 더 이상 조회되지 않습니다.</p>';};
  out.querySelectorAll('[data-edit-care]').forEach(b=>b.onclick=()=>careEditor(item,records[Number(b.dataset.editCare)]));
  out.querySelector('#add-care').onclick=()=>careEditor(item);bindLabelButtons(out);
}
function careEditor(item,r={}) {
  const out=document.querySelector('#found');
  out.innerHTML=`<section class="card"><h2>${esc(item.public_code)} · ${r.id?'케어 수정':'새 케어 추가'}</h2><div class="grid"><div>${careInput('care-received','케어일',r.received_on||careDate(),'date')}</div><div>${careInput('edit-brand','브랜드',item.brand)}</div></div>${storeSelect('edit-store',item.store_code||'HQ')}<label>작업 내용</label>${careChecks(careServices(r))}<label>사진 (선택 · 찍을 때마다 추가됨)</label>${carePhotoPicker(carePhotoList(r))}${carePhotoInput('care-photos')}<label for="care-comment">고객에게 보이는 코멘트 (선택)</label>${carePresetChips('care-comment')}<textarea id="care-comment" placeholder="위 버튼을 누르거나 직접 입력">${esc(r.staff_comment||'')}</textarea>${careArea('care-private','내부 메모 (관리자 전용)',r.notes)}<button id="save-care">저장</button><button class="secondary" id="cancel-care">돌아가기</button>${r.id?'<button class="secondary danger" id="delete-care">이 케어 기록 삭제</button>':''}<p id="care-message" role="status"></p></section>`;
  out.querySelector('#cancel-care').onclick=()=>careExisting(item,out);bindPresetChips(out);bindStorePick(out);
  const pending=[];bindPhotoInput(out,'care-photos',pending);
  let existing=carePhotoList(r);
  out.querySelectorAll('.del-existing').forEach(b=>b.onclick=async()=>{if(!confirm('이 사진을 지금 바로 삭제할까요?'))return;const url=b.dataset.url;const next=existing.filter(u=>u!==url);if(r.id){const res=await sb.from('service_records').update({photos:next,before_photos:[],after_photos:[]}).eq('id',r.id);if(res.error){alert('삭제 실패: '+res.error.message);return;}r.photos=next;r.before_photos=[];r.after_photos=[];}existing=next;b.closest('figure').remove();});
  out.querySelector('#delete-care')&&(out.querySelector('#delete-care').onclick=async()=>{if(!confirm(`${careFmt(r.received_on)} 케어 기록을 삭제할까요? 되돌릴 수 없습니다.`))return;const res=await sb.from('service_records').delete().eq('id',r.id);if(res.error){alert('삭제 실패: '+res.error.message);return;}item.service_records=(item.service_records||[]).filter(x=>x.id!==r.id);careExisting(item,out);out.insertAdjacentHTML('afterbegin','<p class="success" role="status">케어 기록을 삭제했습니다.</p>');});
  out.querySelector('#save-care').onclick=async()=>{
    const button=out.querySelector('#save-care'),msg=out.querySelector('#care-message');button.disabled=true;msg.className='muted';msg.textContent='저장 중…';
    try {
      const received=out.querySelector('#care-received').value;
      if(!received)throw Error('케어일을 입력하세요.');
      const staff_comment=out.querySelector('#care-comment').value.trim();careValidateComment(item,staff_comment);
      const added=await upload(pending,item.public_code,'care');
      const record={item_id:item.id,received_on:received,completed_on:received,status:'완료',services:careChecked(out),processes:[],photos:[...existing,...added],before_photos:[],after_photos:[],staff_comment,notes:out.querySelector('#care-private').value};
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
    const {data:stores,error}=await sb.from('stores').select('code,name,booking_url,is_hq,phone').order('is_hq',{ascending:false}).order('code');
    if(error){panel.textContent='지점 목록을 불러오지 못했습니다: '+error.message;return;}
    storeList=stores||storeList;
    panel.innerHTML=`<details><summary>지점 관리</summary><p class="muted">지점 물건은 고객 화면 맨 아래에 예약 버튼 대신 “맡기신 매장 · 지점 이름 · 전화하기”가 표시됩니다. 지점은 로그인 없이 고객처럼 QR로 이력을 봅니다.</p><ul class="record-list">${(stores||[]).map(st=>`<li><span><strong>${esc(st.code)}</strong> · ${esc(st.name)}${st.is_hq?' · 본사(예약 버튼 표시)':''}${st.phone?` · ${esc(st.phone)}`:''}</span></li>`).join('')}</ul><h3>지점 추가</h3><div class="grid"><div>${careInput('store-code','지점 코드 (영문 대문자·숫자, 예: SINGIL)')}</div><div>${careInput('store-name','지점 이름 (예: 세탁플랜 신길점)')}</div></div>${careInput('store-phone','지점 전화번호 (고객 화면 전화하기 버튼, 예: 031-000-0000)','','tel')}<button id="add-store">지점 추가</button><p id="store-message" role="status"></p></details>`;
    const msg=panel.querySelector('#store-message');
    panel.querySelector('#add-store').onclick=async()=>{const code=panel.querySelector('#store-code').value.trim().toUpperCase(),name=panel.querySelector('#store-name').value.trim(),phone=panel.querySelector('#store-phone').value.trim();if(!/^[A-Z0-9_-]{2,20}$/.test(code)||!name){msg.className='error';msg.textContent='지점 코드(영문 대문자·숫자 2~20자)와 이름을 입력하세요.';return;}const r=await sb.from('stores').insert({code,name,phone:phone||null}).select('code').single();if(r.error){msg.className='error';msg.textContent=r.error.message;return;}await render();panel.querySelector('details').open=true;const m=panel.querySelector('#store-message');m.className='success';m.textContent='지점을 추가했습니다: '+code+'. 신규 등록 화면의 “접수 지점”에서 고를 수 있습니다.';const ni=document.querySelector('#new-item');if(ni){const old=ni.querySelector('#new-store');const lab=old?.previousElementSibling;if(lab&&lab.tagName==='LABEL'&&lab.textContent==='접수 지점')lab.remove();old?.insertAdjacentHTML('beforebegin',storeSelect('new-store'));old?.remove();bindStorePick(ni);}};
  };
  await render();
}
// Comment preset phrases: add / edit / delete, saved to care_settings.comment_presets
async function presetAdmin() {
  const panel=document.createElement('section');panel.className='card';panel.id='preset-admin';app.append(panel);
  let draft=JSON.parse(JSON.stringify(commentPresets));
  const render=()=>{
    panel.dataset.open=panel.querySelector('details')?.open?'1':'';
    panel.innerHTML=`<details${panel.dataset.open?" open":""}><summary>코멘트 문구 관리</summary><p class="muted">케어 등록할 때 누르는 문구 버튼입니다. 고쳐 쓰고 <strong>문구 저장</strong>을 누르면 바로 반영됩니다.</p>${Object.entries(draft).map(([g,list],gi)=>`<div class="preset-edit-group"><div class="preset-edit-head"><input class="group-name" data-g="${gi}" value="${esc(g)}" aria-label="그룹 이름"><button type="button" class="secondary del-group" data-g="${gi}">그룹 삭제</button></div>${list.map((t,ti)=>`<div class="preset-edit-row"><input class="phrase" data-g="${gi}" data-t="${ti}" value="${esc(t)}"><button type="button" class="secondary del-phrase" data-g="${gi}" data-t="${ti}">삭제</button></div>`).join('')}<button type="button" class="secondary add-phrase" data-g="${gi}">+ 문구 추가</button></div>`).join('')}<div class="preset-edit-foot"><button type="button" class="secondary" id="add-group">+ 그룹 추가</button><button type="button" id="save-presets">문구 저장</button><button type="button" class="secondary" id="reset-presets">기본 문구로 되돌리기</button></div><p id="preset-message" role="status"></p></details>`;
    const sync=()=>{const next={};panel.querySelectorAll('.preset-edit-group').forEach(grp=>{const name=grp.querySelector('.group-name').value.trim()||'기타';const list=[...grp.querySelectorAll('.phrase')].map(i=>i.value.trim()).filter(Boolean);next[name]=(next[name]||[]).concat(list);});draft=next;};
    panel.querySelectorAll('.del-phrase').forEach(b=>b.onclick=()=>{sync();const g=Object.keys(draft)[+b.dataset.g];draft[g].splice(+b.dataset.t,1);render();});
    panel.querySelectorAll('.add-phrase').forEach(b=>b.onclick=()=>{sync();const g=Object.keys(draft)[+b.dataset.g];draft[g].push('');render();panel.querySelectorAll(`.phrase[data-g="${b.dataset.g}"]`)[draft[g].length-1]?.focus();});
    panel.querySelectorAll('.del-group').forEach(b=>b.onclick=()=>{sync();const g=Object.keys(draft)[+b.dataset.g];if(!confirm(`'${g}' 그룹과 문구 ${draft[g].length}개를 삭제할까요?`))return;delete draft[g];render();});
    panel.querySelector('#add-group').onclick=()=>{sync();let n='새 그룹',i=2;while(draft[n])n='새 그룹 '+i++;draft[n]=[''];render();};
    panel.querySelector('#reset-presets').onclick=()=>{if(!confirm('기본 문구로 되돌릴까요? 저장을 눌러야 반영됩니다.'))return;draft=JSON.parse(JSON.stringify(defaultPresets));render();};
    panel.querySelector('#save-presets').onclick=async()=>{sync();const msg=panel.querySelector('#preset-message');const clean={};for(const [g,list] of Object.entries(draft)){const l=list.filter(Boolean);if(l.length)clean[g]=l;}if(!Object.keys(clean).length){msg.className='error';msg.textContent='문구가 하나도 없습니다.';return;}const r=await sb.from('care_settings').upsert({id:1,comment_presets:clean}).select('id').single();if(r.error){msg.className='error';msg.textContent=r.error.message;return;}commentPresets=clean;draft=JSON.parse(JSON.stringify(clean));render();const m=panel.querySelector('#preset-message');m.className='success';m.textContent='저장했습니다. 등록 화면의 버튼이 바뀌었습니다.';document.querySelectorAll('.preset-groups').forEach(g=>{const id=g.dataset.target;g.outerHTML=carePresetChips(id);});document.querySelectorAll('#new-item, #found').forEach(sc=>bindPresetChips(sc));};
  };
  render();
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
