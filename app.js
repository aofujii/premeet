// ==== PreMeet v2 (defer) ====
var STORE_KEY = 'premeet/current';
var defaultData = {
  version: '2.0.0',
  meeting: {
    title: 'Sprint Planning',
    subtitle: 'Q3 Week 10',
    startDateTime: new Date(Date.now() + 5*60*1000).toISOString(),
    countdownMode: 'toStart',
    manualSeconds: 300,
    timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo'),
    agenda: [
      { id: 'a1', text: 'Goal & Scope', durationMin: 5 },
      { id: 'a2', text: 'Backlog Review', durationMin: 15 }
    ],
    participants: [
      { id: 'p1', name: 'Host Taro', role: 'Host' },
      { id: 'p2', name: 'Hanako', role: 'Presenter' }
    ],
    notices: [
      'This meeting may be recorded.',
      'Please stay on mute unless speaking.'
    ],
    rules: { handRaise: true, timeBox: true, noMultitask: true, chatQueue: false },
    qr: { enabled: false, url: '', size: 156, margin: 2 },
    branding: { theme: 'dark', primaryColor: '#6d5ef5', accentColor: '#22c55e', logoSrc: '' },
    ui: { fontScale: 1.0, clockFormat: '24h' },
    i18n: 'ja',
    youtube: { enabled: false, url: '', startSeconds: 0, mute: true, loop: false, controls: true },
    _agendaIndex: 0
  }
};

// State
function load(){ try{ var raw = localStorage.getItem(STORE_KEY); return raw? JSON.parse(raw): JSON.parse(JSON.stringify(defaultData)); }catch(e){ return JSON.parse(JSON.stringify(defaultData)); } }
function save(d){ localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

// Utils
function el(tag, attrs, children){ attrs=attrs||{}; children=children||[]; var n=document.createElement(tag);
  for (var k in attrs){ var v=attrs[k]; if(k==='class') n.className=v; else if(k==='html') n.innerHTML=v; else if(k.indexOf('on')===0&&typeof v==='function') n.addEventListener(k.slice(2),v); else n.setAttribute(k,v); }
  for (var i=0;i<children.length;i++){ var c=children[i]; if(c!=null) n.appendChild(typeof c==='string'? document.createTextNode(c): c); } return n; }
function fmtTime(ms){ var s=Math.max(0,Math.floor(ms/1000)); var hh=('0'+Math.floor(s/3600)).slice(-2); var mm=('0'+Math.floor((s%3600)/60)).slice(-2); var ss=('0'+(s%60)).slice(-2); return (hh!=='00'?hh+':':'')+mm+':'+ss; }
function parseYouTubeId(url){ if(!url) return null; try{ var u=new URL(url); if(u.hostname.indexOf('youtu.be')>-1) return u.pathname.replace(/^\/?/,''); if(u.hostname.indexOf('youtube.com')>-1){ var id=u.searchParams.get('v'); if(id) return id; var m=u.pathname.match(/\/embed\/([\w-]{11})/); if(m) return m[1]; } var m2=url.match(/[\w-]{11}/); return m2?m2[0]:null; }catch(e){ return null; } }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }

// Display render
var rafId = null;
function renderDisplay(root, state){
  var m = state.meeting;
  document.body.dataset.theme = (m.branding.theme==='light'?'light':'dark');
  document.documentElement.style.setProperty('--primary', m.branding.primaryColor);
  document.documentElement.style.setProperty('--accent', m.branding.accentColor);
  document.documentElement.style.fontSize = (m.ui.fontScale*100)+'%';
  document.getElementById('logo').src = m.branding.logoSrc || '';
  document.getElementById('pageTitle').textContent = m.title || 'PreMeet';

  // Pills
  var pill = document.getElementById('meetingTitlePill');
  pill.textContent = m.title ? m.title : 'Untitled';

  // Timer
  var timerText = document.getElementById('timerText');
  var when = document.getElementById('when');
  var prog = document.getElementById('prog');
  function updateTimer(){
    var now=Date.now(), start=new Date(m.startDateTime).getTime();
    if (m.countdownMode==='toStart'){
      var diff = start - now;
      timerText.textContent = (diff>=0? '開始まで '+fmtTime(diff): '開始済み +'+fmtTime(-diff));
      var dtf = new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:m.timezone});
      when.textContent = '開始時刻: '+ dtf.format(start);
      // progress towards start within 15 min window for visual appeal
      var windowMs = 15*60*1000; var p = clamp(1-(diff/windowMs),0,1); prog.style.width = (p*100)+'%';
    } else if (m.countdownMode==='manualDown'){
      var remain = Math.max(0, (m._manualEnd||0)-now);
      timerText.textContent = '残り '+fmtTime(remain);
      when.textContent = '手動カウントダウン ('+Math.floor(m.manualSeconds)+' 秒)';
      var p2 = (m.manualSeconds>0)? (1 - (remain/ (m.manualSeconds*1000))): 0; prog.style.width = (clamp(p2,0,1)*100)+'%';
    } else {
      var diff2 = now - start;
      timerText.textContent = '経過 '+fmtTime(diff2);
      when.textContent = '';
      prog.style.width='0%';
    }
  }
  if (rafId) cancelAnimationFrame(rafId);
  (function loop(){ updateTimer(); rafId = requestAnimationFrame(loop); })();

  // Agenda list with highlight
  var ol = document.getElementById('agendaList'); ol.innerHTML='';
  for (var i=0;i<m.agenda.length;i++){
    (function(idx){
      var a=m.agenda[idx]; var li=el('li',{},[ (idx+1)+'. '+a.text+(a.durationMin? '（'+a.durationMin+'分）':'' ) ]);
      if (idx === (m._agendaIndex||0)) li.style.fontWeight='900';
      ol.appendChild(li);
    })(i);
  }
  document.getElementById('prevAgenda').onclick=function(){ m._agendaIndex = clamp((m._agendaIndex||0)-1,0,Math.max(0,m.agenda.length-1)); save(state); renderDisplay(root,state); };
  document.getElementById('nextAgenda').onclick=function(){ m._agendaIndex = clamp((m._agendaIndex||0)+1,0,Math.max(0,m.agenda.length-1)); save(state); renderDisplay(root,state); };
  document.getElementById('resetAgenda').onclick=function(){ m._agendaIndex = 0; save(state); renderDisplay(root,state); };

  // Participants
  var ps = document.getElementById('participants'); ps.innerHTML='';
  m.participants.forEach(function(p){ ps.appendChild(el('span',{class:'badge role-'+(p.role||'')},[p.name+(p.role?' / '+p.role:'')])); });

  // Notices
  var ul = document.getElementById('notices'); ul.innerHTML='';
  m.notices.forEach(function(n){ ul.appendChild(el('li',{},[n])); });

  // QR
  var qrSec = document.getElementById('qrSection');
  if (m.qr && m.qr.enabled && m.qr.url){
    qrSec.style.display='block';
    var api='https://api.qrserver.com/v1/create-qr-code/';
    var src= api+'?size='+(m.qr.size||156)+'x'+(m.qr.size||156)+'&margin='+(m.qr.margin||2)+'&data='+encodeURIComponent(m.qr.url);
    document.getElementById('qrImg').src=src;
    document.getElementById('qrUrl').textContent = m.qr.url;
  } else qrSec.style.display='none';

  // YouTube
  var ytSec = document.getElementById('ytSection');
  var vid = parseYouTubeId(m.youtube && m.youtube.url);
  if (m.youtube && m.youtube.enabled && vid){
    ytSec.style.display='block';
    var p = new URLSearchParams(); p.set('autoplay','1'); p.set('mute', m.youtube.mute?'1':'0');
    p.set('start', String(Math.max(0, Number(m.youtube.startSeconds)||0)));
    p.set('loop', m.youtube.loop?'1':'0'); if (m.youtube.loop) p.set('playlist', vid);
    p.set('controls', m.youtube.controls!==false? '1':'0'); p.set('rel','0'); p.set('modestbranding','1');
    document.getElementById('ytFrame').src = 'https://www.youtube-nocookie.com/embed/'+vid+'?'+p.toString();
  } else { ytSec.style.display='none'; document.getElementById('ytFrame').src=''; }
}

// Editor wiring
function listItemAgenda(a, idx, onChange, onDel, onUp, onDown){
  var name = el('input',{type:'text', value:a.text},[]);
  var dur = el('input',{type:'text', value: (a.durationMin||'') , placeholder:'分', style:'width:90px'},[]);
  name.addEventListener('input', function(){ onChange(idx, {text:name.value, durationMin: Number(dur.value)||null}); });
  dur.addEventListener('input', function(){ onChange(idx, {text:name.value, durationMin: Number(dur.value)||null}); });
  return el('div',{class:'list-item'},[
    el('div',{},[name, el('div',{class:'muted', style:'font-size:12px;margin-top:6px'},['Enter不要。入力で即保存'])]),
    el('div',{class:'actions'},[
      el('button',{class:'btn tiny', onClick:function(){ onUp(idx); }},['↑']),
      el('button',{class:'btn tiny', onClick:function(){ onDown(idx); }},['↓']),
      el('button',{class:'btn tiny', onClick:function(){ onDel(idx); }},['削除'])
    ])
  ]);
}
function listItemPart(p, idx, onChange, onDel, onUp, onDown){
  var name = el('input',{type:'text', value:p.name, placeholder:'お名前'},[]);
  var role = el('input',{type:'text', value:p.role||'', placeholder:'役割'},[]);
  name.addEventListener('input', function(){ onChange(idx, {name:name.value, role:role.value}); });
  role.addEventListener('input', function(){ onChange(idx, {name:name.value, role:role.value}); });
  return el('div',{class:'list-item'},[
    el('div',{},[name, role]),
    el('div',{class:'actions'},[
      el('button',{class:'btn tiny', onClick:function(){ onUp(idx); }},['↑']),
      el('button',{class:'btn tiny', onClick:function(){ onDown(idx); }},['↓']),
      el('button',{class:'btn tiny', onClick:function(){ onDel(idx); }},['削除'])
    ])
  ]);
}

function renderEditor(root, state){
  var m = state.meeting;
  // bind basics
  var fTitle = document.getElementById('fTitle'); fTitle.value=m.title||''; fTitle.oninput=function(){ m.title=fTitle.value; save(state); syncPreview(); };
  var fSubtitle=document.getElementById('fSubtitle'); fSubtitle.value=m.subtitle||''; fSubtitle.oninput=function(){ m.subtitle=fSubtitle.value; save(state); syncPreview(); };
  var fStart=document.getElementById('fStart'); fStart.value=new Date(m.startDateTime).toISOString().slice(0,16); fStart.oninput=function(){ m.startDateTime=new Date(fStart.value).toISOString(); save(state); };
  var fMode=document.getElementById('fMode'); fMode.value=m.countdownMode; fMode.onchange=function(){ m.countdownMode=fMode.value; save(state); };
  var fManual=document.getElementById('fManual'); fManual.value=m.manualSeconds; fManual.oninput=function(){ m.manualSeconds=Number(fManual.value)||0; save(state); };
  var fLogo=document.getElementById('fLogo'); fLogo.value=m.branding.logoSrc||''; fLogo.oninput=function(){ m.branding.logoSrc=fLogo.value; save(state); syncPreview(); };

  // notices
  var fNotices=document.getElementById('fNotices'); fNotices.value=(m.notices||[]).join('\\n'); fNotices.oninput=function(){ m.notices=fNotices.value.split(/\\n+/).map(function(t){return t.trim();}).filter(Boolean); save(state); };

  // QR
  var fQrEnabled=document.getElementById('fQrEnabled'); fQrEnabled.checked=!!(m.qr&&m.qr.enabled); fQrEnabled.onchange=function(){ m.qr.enabled=fQrEnabled.checked; save(state); syncPreview(); };
  var fQrUrl=document.getElementById('fQrUrl'); fQrUrl.value=m.qr.url||''; fQrUrl.oninput=function(){ m.qr.url=fQrUrl.value; save(state); };
  var fQrSize=document.getElementById('fQrSize'); fQrSize.value=String(m.qr.size||156); fQrSize.oninput=function(){ m.qr.size=Number(fQrSize.value)||156; save(state); };
  var fQrMargin=document.getElementById('fQrMargin'); fQrMargin.value=String(m.qr.margin||2); fQrMargin.oninput=function(){ m.qr.margin=Number(fQrMargin.value)||2; save(state); };

  // YT
  var fYtEnabled=document.getElementById('fYtEnabled'); fYtEnabled.checked=!!(m.youtube&&m.youtube.enabled); fYtEnabled.onchange=function(){ m.youtube.enabled=fYtEnabled.checked; save(state); syncPreview(); };
  var fYtUrl=document.getElementById('fYtUrl'); fYtUrl.value=m.youtube.url||''; fYtUrl.oninput=function(){ m.youtube.url=fYtUrl.value; save(state); };
  var fYtStart=document.getElementById('fYtStart'); fYtStart.value=String(m.youtube.startSeconds||0); fYtStart.oninput=function(){ m.youtube.startSeconds=Number(fYtStart.value)||0; save(state); };
  var fYtMute=document.getElementById('fYtMute'); fYtMute.checked=!!m.youtube.mute; fYtMute.onchange=function(){ m.youtube.mute=fYtMute.checked; save(state); };
  var fYtLoop=document.getElementById('fYtLoop'); fYtLoop.checked=!!m.youtube.loop; fYtLoop.onchange=function(){ m.youtube.loop=fYtLoop.checked; save(state); };
  var fYtControls=document.getElementById('fYtControls'); fYtControls.checked=(m.youtube.controls!==false); fYtControls.onchange=function(){ m.youtube.controls=fYtControls.checked; save(state); };

  // Appearance
  var fAccent=document.getElementById('fAccent'); fAccent.value=m.branding.accentColor; fAccent.oninput=function(){ m.branding.accentColor=fAccent.value; document.documentElement.style.setProperty('--accent', fAccent.value); save(state); };
  var fPrimary=document.getElementById('fPrimary'); fPrimary.value=m.branding.primaryColor; fPrimary.oninput=function(){ m.branding.primaryColor=fPrimary.value; document.documentElement.style.setProperty('--primary', fPrimary.value); save(state); };
  var fScale=document.getElementById('fScale'); fScale.value=String(m.ui.fontScale||1.0); fScale.oninput=function(){ m.ui.fontScale=clamp(Number(fScale.value)||1.0,0.8,1.5); save(state); syncPreview(); };

  // Agenda list
  var listA=document.getElementById('agendaItems');
  function redrawAgenda(){
    listA.innerHTML='';
    m.agenda.forEach(function(a,idx){
      listA.appendChild(listItemAgenda(a, idx,
        function(i, patch){ m.agenda[i].text=patch.text; m.agenda[i].durationMin=patch.durationMin; save(state); syncPreview(); },
        function(i){ m.agenda.splice(i,1); save(state); redrawAgenda(); syncPreview(); },
        function(i){ if(i>0){ var tmp=m.agenda[i-1]; m.agenda[i-1]=m.agenda[i]; m.agenda[i]=tmp; save(state); redrawAgenda(); syncPreview(); } },
        function(i){ if(i<m.agenda.length-1){ var tmp=m.agenda[i+1]; m.agenda[i+1]=m.agenda[i]; m.agenda[i]=tmp; save(state); redrawAgenda(); syncPreview(); } }
      ));
    });
  }
  redrawAgenda();
  var agendaText=document.getElementById('agendaText'), agendaDur=document.getElementById('agendaDur');
  function addAgenda(){ var t=agendaText.value.trim(); if(!t) return; m.agenda.push({id:'a'+Date.now(), text:t, durationMin: Number(agendaDur.value)||null}); agendaText.value=''; agendaDur.value=''; save(state); redrawAgenda(); syncPreview(); }
  document.getElementById('agendaAdd').onclick=addAgenda;
  agendaText.addEventListener('keyup', function(e){ if(e.key==='Enter') addAgenda(); });

  // Participants list
  var listP=document.getElementById('partItems');
  function redrawPart(){
    listP.innerHTML='';
    m.participants.forEach(function(p,idx){
      listP.appendChild(listItemPart(p, idx,
        function(i, patch){ m.participants[i].name=patch.name; m.participants[i].role=patch.role; save(state); syncPreview(); },
        function(i){ m.participants.splice(i,1); save(state); redrawPart(); syncPreview(); },
        function(i){ if(i>0){ var tmp=m.participants[i-1]; m.participants[i-1]=m.participants[i]; m.participants[i]=tmp; save(state); redrawPart(); syncPreview(); } },
        function(i){ if(i<m.participants.length-1){ var tmp=m.participants[i+1]; m.participants[i+1]=m.participants[i]; m.participants[i]=tmp; save(state); redrawPart(); syncPreview(); } }
      ));
    });
  }
  redrawPart();
  function addPart(){ var name=document.getElementById('partName'), role=document.getElementById('partRole');
    if(!name.value.trim()) return; m.participants.push({id:'p'+Date.now(), name:name.value.trim(), role: role.value.trim()}); name.value=''; role.value=''; save(state); redrawPart(); syncPreview(); }
  document.getElementById('partAdd').onclick=addPart;

  // Export/Import
  document.getElementById('exportBtn').onclick=function(){
    var a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
    a.download='premeet-'+new Date().toISOString().slice(0,16).replace(/[:T]/g,'')+'.json'; a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  };
  document.getElementById('importFile').addEventListener('change', function(){
    var f=this.files[0]; if(!f) return;
    f.text().then(function(t){
      try{ var data=JSON.parse(t); if(!data||!data.meeting) throw new Error('Invalid JSON'); save(data); state=data; syncPreview(); alert('インポートしました'); }
      catch(e){ alert('失敗: '+e.message); }
    });
  });

  // Bottom buttons
  document.getElementById('goDisplay').onclick=function(){ showDisplay(); };
  document.getElementById('startManual').onclick=function(){ m._manualEnd = Date.now() + (Number(m.manualSeconds)||0)*1000; save(state); alert('手動カウントダウンを開始しました'); };

  // Live preview
  function syncPreview(){ renderDisplay(document.getElementById('livePreview'), state); }
  syncPreview();
}

// Routing & top-level controls
function showDisplay(){ document.getElementById('editorPage').hidden=true; document.getElementById('displayPage').hidden=false; localStorage.setItem('premeet/route','#/'); renderDisplay(document.getElementById('displayPage'), load()); }
function showEditor(){ document.getElementById('displayPage').hidden=true; document.getElementById('editorPage').hidden=false; localStorage.setItem('premeet/route','#/edit'); renderEditor(document.getElementById('editorPage'), load()); }
window.addEventListener('DOMContentLoaded', function(){
  // toolbar
  document.getElementById('editBtn').onclick=showEditor;
  document.getElementById('fsBtn').onclick=function(){ if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
  document.getElementById('themeBtn').onclick=function(){ var d=document.body.dataset.theme; document.body.dataset.theme = (d==='light'?'dark':'light'); var st=load(); st.meeting.branding.theme=(document.body.dataset.theme==='light'?'light':'dark'); save(st); };
  document.getElementById('fontPlus').onclick=function(){ var st=load(); st.meeting.ui.fontScale = clamp((st.meeting.ui.fontScale||1)+0.05, .8, 1.5); save(st); renderDisplay(document.getElementById('displayPage'), st); };
  document.getElementById('fontMinus').onclick=function(){ var st=load(); st.meeting.ui.fontScale = clamp((st.meeting.ui.fontScale||1)-0.05, .8, 1.5); save(st); renderDisplay(document.getElementById('displayPage'), st); };

  // initial route
  var route = localStorage.getItem('premeet/route') || '#/edit';
  if (route==='#/edit') showEditor(); else showDisplay();
});

// Keyboard shortcuts
window.addEventListener('keydown', function(e){
  if (e.key==='F' || e.key==='f'){ e.preventDefault(); if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  if (e.key==='+'){ var st=load(); st.meeting.ui.fontScale = clamp((st.meeting.ui.fontScale||1)+0.05, .8, 1.5); save(st); renderDisplay(document.getElementById('displayPage'), st); }
  if (e.key==='-'){ var st2=load(); st2.meeting.ui.fontScale = clamp((st2.meeting.ui.fontScale||1)-0.05, .8, 1.5); save(st2); renderDisplay(document.getElementById('displayPage'), st2); }
});
