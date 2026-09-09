const CARE_STEPS = ['접수','검수','세탁','건조','검품','출고'];
const careDate = () => new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'});
const careText = value => esc(value || '미입력');
function careUrl(value) { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
function careStage(r) { return CARE_STEPS.includes(r.stage) ? r.stage : r.status === '완료' ? '출고' : '접수'; }
function carePhotos(urls,label) {
  const safe = (urls || []).map(careUrl).filter(Boolean);
  return safe.length ? `<div class="care-photos">${safe.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${label} ${i+1}" loading="lazy"></a>`).join('')}</div>` : `<p class="empty-photo">${label}이 아직 등록되지 않았습니다.</p>`;
}
function recordPhotos(r) {return [...new Set([...(r.before_photos||[]),...(r.after_photos||[])])];}
function careCompare(r) {return carePhotos(recordPhotos(r),'케어 사진');}
function careDetails(r,id,withPhotos=true) {
  const checks=Array.isArray(r.inspection)?r.inspection:[];
  const processes=Array.isArray(r.processes)&&r.processes.length?r.processes:(r.services||[]).map(name=>({name,description:''}));
  return `${withPhotos?careCompare(r,id):''}<div class="detail-grid"><section><h3>제품 확인</h3>${checks.length?`<ul class="inspection">${checks.map(c=>`<li><div><strong>${esc(c.name)}</strong><span class="tag">${esc(c.status)}</span></div>${c.memo?`<p>${esc(c.memo)}</p>`:''}</li>`).join('')}</ul>`:'<p class="muted">검수 내용이 아직 등록되지 않았습니다.</p>'}</section><section><h3>적용 공정</h3>${processes.length?`<ol class="processes">${processes.map(p=>`<li><strong>${esc(p.name)}</strong>${p.description?`<p>${esc(p.description)}</p>`:''}</li>`).join('')}</ol>`:'<p class="muted">공정 등록 예정</p>'}</section></div><section class="safety"><h3>사용 세제 · 안전 정보</h3><p>${careText(r.detergent_info)}</p><p class="muted">${r.safety_info?esc(r.safety_info):'안전 정보가 아직 등록되지 않았습니다.'}</p></section><section class="comment"><h3>담당자 코멘트</h3><p>${r.staff_comment?esc(r.staff_comment):'담당자가 케어 내용을 확인하고 있습니다.'}</p><span class="muted">담당 ${careText(r.staff_name)}</span></section><div class="next-care"><span>다음 권장 케어일</span><strong>${r.next_care_on?esc(r.next_care_on):'상담 후 안내'}</strong></div>`;
}
function renderCarePage(payload) {
  const item=payload.item, records=[...(payload.records||[])].sort((a,b)=>String(b.received_on||'').localeCompare(String(a.received_on||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const current=records[0]||{}, settings={...(payload.settings||{})}, stage=careStage(current);
  settings.booking_url=settings.booking_url??settings.kakao_url??C.bookingUrl;
  settings.business_name=settings.business_name??C.businessName;
  const completed=records;
  const recent=completed.map(r=>r.completed_on||r.received_on).filter(Boolean).sort().at(-1);
  const url=careUrl(settings.booking_url); const booking=url&&new URL(url).hostname==='booking.naver.com'?url:'';
  app.innerHTML=`<div class="care-public"><section class="care-hero"><p class="eyebrow">CARE RECORD · 케어 이력</p><div class="hero-top"><span class="category">${careText(item.item_type)}</span><span class="grade">${item.care_grade?esc(item.care_grade):'케어등급 미등록'}</span></div><h1>${esc(item.brand||item.item_type+' 케어 기록')}</h1><p class="model">${esc(item.model_name||'브랜드 · 모델명 미등록')}</p><p class="care-code">관리번호 <strong>${esc(item.public_code)}</strong></p><dl class="care-stats"><div><dt>누적 케어</dt><dd>${completed.length}<small>회</small></dd></div><div><dt>최근 케어일</dt><dd class="stat-text">${recent?esc(recent):'이력 없음'}</dd></div><div><dt>담당자</dt><dd class="stat-text">${esc(current.staff_name||'담당자 배정 전')}</dd></div></dl></section><section class="care-section"><div class="section-heading"><h2>사진</h2><span class="muted">${(payload.photos||[]).length}장</span></div>${carePhotos(payload.photos||records.flatMap(recordPhotos),'케어 사진')}</section><section class="care-section"><div class="section-heading"><h2>최근 케어 기록</h2><span class="muted">${esc(current.received_on||'')}</span></div>${records.length?careDetails(current,'current',false):'<p class="muted">아직 등록된 케어가 없습니다.</p>'}</section><section class="care-section"><div class="section-heading"><h2>누적 이력</h2><span class="muted">${records.length}건의 기록</span></div><div class="timeline">${records.map((r,i)=>`<details><summary><span class="timeline-dot"></span><time>${esc(r.received_on||'날짜 미등록')}</time><span class="timeline-summary">${esc((r.processes?.length?r.processes.map(p=>p.name):r.services||[]).join(' · ')||'공정 등록 예정')}</span><span class="muted">담당 ${careText(r.staff_name)}</span>${carePhotos(recordPhotos(r).slice(0,1),'케어 썸네일')}</summary><div class="timeline-detail">${careDetails(r,`history-${i}`)}</div></details>`).join('')||'<p class="muted">누적 이력이 없습니다.</p>'}</div></section><footer class="care-footer"><p class="eyebrow">NEXT CARE</p><h2>다음 케어도, 안심하고.</h2>${booking?`<a class="booking" href="${esc(booking)}" target="_blank" rel="noopener noreferrer">네이버로 예약하기 ↗</a>`:'<p class="muted">예약 채널 준비 중</p>'}${settings.warranty_text?`<p class="warranty">${esc(settings.warranty_text)}</p>`:''}<div class="business">${settings.business_name?`<strong>${esc(settings.business_name)}</strong>`:''}${settings.business_owner?`<p>대표 ${esc(settings.business_owner)}</p>`:''}${settings.business_number?`<p>사업자등록번호 ${esc(settings.business_number)}</p>`:''}${settings.business_address?`<p>${esc(settings.business_address)}</p>`:''}</div><p class="privacy-note">고객 이름과 전화번호는 공개하지 않습니다.</p></footer></div>`;

}
async function careCustomer(code) {
  document.body.classList.add('public-page');
  if(!code){app.innerHTML='<section class="care-hero"><p class="eyebrow">QR LAUNDRY</p><h1>케어의 모든 기록.</h1><p class="muted">제품의 QR 코드를 스캔하면 케어 이력을 확인할 수 있습니다.</p></section>';return;}
  app.innerHTML='<p role="status" class="muted">케어 이력을 불러오고 있습니다…</p>';
  const [history,photos]=await Promise.all([
    sb.rpc('get_care_history',{lookup_code:code}),
    sb.rpc('get_qr_history',{lookup_code:code}).select('before_photos,after_photos')
  ]);
  const {data,error}=history;
  if(data){data.photos=[...new Set((photos.data||[]).flatMap(recordPhotos))];if(photos.error){data.photos=(data.records||[]).flatMap(recordPhotos);data.photoError=true;}}
  if(location.hash==='#admin')return;
  if(error){app.innerHTML='<section class="card"><h1>이력을 불러오지 못했습니다</h1><p class="muted">잠시 후 다시 시도해 주세요.</p><button id="retry-care">다시 시도</button></section>';document.querySelector('#retry-care').onclick=()=>careCustomer(code);return;}
  if(!data?.item){app.innerHTML='<section class="care-hero"><h1>등록된 이력이 없습니다</h1><p class="muted">QR의 관리번호를 확인해 주세요.</p></section>';return;}
  renderCarePage(data);if(data.photoError)app.insertAdjacentHTML('afterbegin','<p class="error">사진 일부를 불러오지 못했습니다. 새로고침해 주세요.</p>');
}
function careInput(id,label,value='',type='text') {return `<label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value||'')}">`;}
function careArea(id,label,value='') {return `<label for="${id}">${label}</label><textarea id="${id}">${esc(value||'')}</textarea>`;}
function careExtraFields(r={},prefix='new') {
  return `<div class="grid"><div>${careInput('care-staff','담당자명 (공개)',r.staff_name)}</div><div>${careInput('care-next','다음 권장 케어일',r.next_care_on,'date')}</div></div>${careArea('care-inspection','제품 확인: 한 줄에 항목명 | 상태 | 메모',(r.inspection||[]).map(c=>`${c.name} | ${c.status} | ${c.memo||''}`).join('\n'))}${careArea('care-processes','적용 공정: 한 줄에 공정명 | 한 줄 설명',(r.processes||[]).map(p=>`${p.name} | ${p.description||''}`).join('\n'))}${careArea('care-detergent','사용 세제 (공개)',r.detergent_info)}${careArea('care-safety','안전 정보 (공개 · 확인된 내용만 입력)',r.safety_info)}${careArea('care-comment','담당자 코멘트 (공개 · 고객 개인정보 입력 금지)',r.staff_comment)}`.replace(/(id|for)="care-/g, '$1="'+prefix+'-care-');
}
function careExtraValues(scope=document.querySelector('#new-item'),prefix='new') {
  const val=id=>scope.querySelector('#'+prefix+'-'+id).value.trim();
  const lines=id=>val(id).split('\n').map(s=>s.trim()).filter(Boolean);
  const inspection=lines('care-inspection').map(s=>{const [name,status,...memo]=s.split('|').map(x=>x.trim());if(!name||!status)throw Error('검수는 항목명 | 상태 | 메모 형식으로 입력하세요.');return {name,status,memo:memo.join(' | ')};});
  const processes=lines('care-processes').map(s=>{const [name,...d]=s.split('|').map(x=>x.trim());return {name,description:d.join(' | ')};});
  return {staff_name:val('care-staff'),next_care_on:val('care-next')||null,inspection,processes,detergent_info:val('care-detergent'),safety_info:val('care-safety'),staff_comment:val('care-comment')};
}
function careValidatePublic(item,record) {
  const content=JSON.stringify([record.inspection,record.processes,record.detergent_info,record.safety_info,record.staff_comment,record.staff_name]);
  const name=String(item.customer_name||'').trim(), phone=String(item.customer_phone||'').replace(/\D/g,'');
  if((name&&content.includes(name))||(phone&&content.replace(/\D/g,'').includes(phone))||/01[016789][ -]?\d{3,4}[ -]?\d{4}/.test(content)) throw Error('공개 입력 내용에 고객 이름 또는 전화번호가 포함되어 있습니다. 제거한 후 저장하세요.');
}
function careExisting(item,out) {
  const records=[...(item.service_records||[])].sort((a,b)=>String(b.received_on).localeCompare(String(a.received_on))||String(b.created_at).localeCompare(String(a.created_at)));
  out.innerHTML=`<article class="record"><strong>${esc(item.public_code)}</strong><p>${careText(item.item_type)} · ${careText(item.brand)}</p><p class="muted">관리자용 고객 정보: ${careText(item.customer_name)} · ${careText(item.customer_phone)}</p>${records.map((r,i)=>`<div><p>${esc(r.received_on)}</p><button data-edit-care="${i}">사진 / 기록 수정</button></div>`).join('')}<button id="add-care">케어 기록 추가</button>${labelButton(item.public_code)}</article>`;
  out.querySelectorAll('[data-edit-care]').forEach(b=>b.onclick=()=>careEditor(item,records[Number(b.dataset.editCare)]));
  out.querySelector('#add-care').onclick=()=>careEditor(item);bindLabelButtons(out);
}
function careEditor(item,r={}) {
  const out=document.querySelector('#found');
  out.innerHTML=`<section class="card"><h2>${esc(item.public_code)} · ${r.id?'케어 수정':'케어 기록 추가'}</h2><p class="notice">공개 항목에 고객 이름·전화번호를 적지 마세요. 사진도 개인정보가 없는 이미지를 사용하세요.</p>${careInput('care-received','케어일',r.completed_on||r.received_on||careDate(),'date')}${careInput('edit-category','카테고리 (유모차 / 카시트)',item.item_type)}${careInput('edit-brand','브랜드',item.brand)}${careInput('edit-model','모델명',item.model_name)}${careInput('care-grade','케어등급 (제품 전체에 적용)',item.care_grade)}${careExtraFields(r,'edit')}<label for="care-photos">사진 추가 (여러 장 선택 가능)</label><input type="file" accept="image/*" multiple id="care-photos"><p class="muted">원하는 사진을 추가하세요. 기존 사진은 유지됩니다.</p>${carePhotos(recordPhotos(r),'등록된 사진')}${careArea('care-private','내부 메모 (관리자 전용)',r.notes)}<button id="save-care">저장</button><button class="secondary" id="cancel-care">돌아가기</button><p id="care-message" role="status"></p></section>`;
  out.querySelector('#cancel-care').onclick=()=>careExisting(item,out);
  out.querySelector('#save-care').onclick=async()=>{
    const button=out.querySelector('#save-care'),msg=out.querySelector('#care-message');button.disabled=true;
    try {
      const extra=careExtraValues(out,'edit');careValidatePublic(item,extra);
      const received=document.querySelector('#care-received').value,stage='출고',completed=received;
      if(!received)throw Error('케어일을 입력하세요.');
      const files=document.querySelector('#care-photos').files;
      const before=[...(r.before_photos||[]),...await upload(files,item.public_code,'photo')],after=[...(r.after_photos||[])];
      const record={...extra,item_id:item.id,received_on:received,completed_on:completed,stage,status:stage==='출고'?'완료':'접수',notes:document.querySelector('#care-private').value,before_photos:before,after_photos:after,services:extra.processes.length?extra.processes.map(p=>p.name):(r.services||[])};
      const result=r.id?await sb.from('service_records').update(record).eq('id',r.id).select().single():await sb.from('service_records').insert(record).select().single();if(result.error)throw result.error;
      const grade=document.querySelector('#care-grade').value.trim();const itemValues={care_grade:grade,item_type:document.querySelector('#edit-category').value.trim(),brand:document.querySelector('#edit-brand').value.trim(),model_name:document.querySelector('#edit-model').value.trim()};const update=await sb.from('items').update(itemValues).eq('id',item.id).select('id').single();if(update.error)throw update.error;
      Object.assign(item,itemValues);item.service_records=[...(item.service_records||[]).filter(x=>x.id!==result.data.id),result.data];
      careExisting(item,out);out.insertAdjacentHTML('afterbegin','<p class="success" role="status">저장했습니다.</p>');
    } catch(e){msg.className='error';msg.textContent=e.message;} finally{button.disabled=false;}
  };
}
async function careSettings() {
  const {data,error}=await sb.from('care_settings').select('*').eq('id',1).maybeSingle();
  const panel=document.createElement('section');panel.className='card';panel.id='care-settings';app.append(panel);
  if(error){panel.textContent='사업자 설정을 불러오지 못했습니다: '+error.message;return;}
  const s=data||{};
  s.booking_url=s.kakao_url??C.bookingUrl;
  s.business_name=s.business_name??C.businessName;
  panel.innerHTML=`<details><summary>예약 · 보증 · 사업자 정보 설정</summary>${careInput('setting-booking_url','네이버 예약 주소 (https://booking.naver.com/...)',s.booking_url,'url')}${careArea('setting-warranty_text','보증 문구 (확정된 문구만 입력)',s.warranty_text)}${careInput('setting-business_name','상호',s.business_name)}${careInput('setting-business_owner','대표자',s.business_owner)}${careInput('setting-business_number','사업자등록번호',s.business_number)}${careInput('setting-business_address','사업장 주소',s.business_address)}<button id="save-settings">설정 저장</button><p id="settings-message" role="status"></p></details>`;
  panel.querySelector('#save-settings').onclick=async()=>{const msg=panel.querySelector('#settings-message'),button=panel.querySelector('#save-settings');button.disabled=true;try{const values={id:1};panel.querySelectorAll('[id^="setting-"]').forEach(e=>values[e.id.replace('setting-','')]=e.value.trim());if(values.booking_url&&(!careUrl(values.booking_url)||new URL(values.booking_url).hostname!=='booking.naver.com'))throw Error('네이버 예약의 https://booking.naver.com/ 주소를 입력하세요.');values.kakao_url=values.booking_url;delete values.booking_url;const result=await sb.from('care_settings').upsert(values).select('id').single();if(result.error)throw result.error;msg.textContent='저장했습니다.';msg.className='success';}catch(e){msg.textContent=e.message;msg.className='error';}finally{button.disabled=false;}};
}
