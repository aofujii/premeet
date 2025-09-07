// ==== PreMeet app.js (defer) ====
// Storage keys
var STORE_KEY = 'premeet/current';
var PRESETS_KEY = 'premeet/presets';

// Default data
var defaultData = {
  version: '1.2.1',
  meeting: {
    title: 'Sprint Planning',
    subtitle: 'Q3 Week 10',
    startDateTime: new Date(Date.now() + 5*60*1000).toISOString(),
    countdownMode: 'toStart', // 'toStart' | 'manualDown' | 'elapsed'
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
    qr: { enabled: false, url: '', size: 156, margin: 2, provider: 'external' },
    branding: { theme: 'dark', primaryColor: '#4F46E5', accentColor: '#22C55E', logoSrc: '' },
    ui: { fontScale: 1.0, clockFormat: '24h' },
    i18n: 'ja',
    youtube: { enabled: false, url: '', startSeconds: 0, mute: true, loop: false, controls: true }
  }
};

// Utilities
function load() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultData));
    var data = JSON.parse(raw);
    if (!data.meeting.youtube) data.meeting.youtube = JSON.parse(JSON.stringify(defaultData.meeting.youtube));
    if (!data.meeting.qr) data.meeting.qr = JSON.parse(JSON.stringify(defaultData.meeting.qr));
    return data;
  } catch (e) { return JSON.parse(JSON.stringify(defaultData)); }
}
function save(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
function loadPresets(){ try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); } catch(e){ return []; } }
function savePresets(arr){ localStorage.setItem(PRESETS_KEY, JSON.stringify(arr)); }

function el(tag, attrs, children){
  attrs = attrs || {}; children = children || [];
  var node = document.createElement(tag);
  for (var k in attrs) if (attrs.hasOwnProperty(k)) {
    var v = attrs[k];
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (var i=0;i<children.length;i++){
    var c = children[i];
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
function fmtTime(ms){
  var s = Math.max(0, Math.floor(ms/1000));
  var hh = String(Math.floor(s/3600)); if (hh.length<2) hh='0'+hh;
  var mm = String(Math.floor((s%3600)/60)); if (mm.length<2) mm='0'+mm;
  var ss = String(s%60); if (ss.length<2) ss='0'+ss;
  return (hh!=='00'? hh+':' : '') + mm + ':' + ss;
}
function parseYouTubeId(url){
  if (!url) return null;
  try {
    var u = new URL(url);
    if (u.hostname.indexOf('youtu.be')>-1) return u.pathname.replace(/^\//,'') || null;
    if (u.hostname.indexOf('youtube.com')>-1) {
      var id = u.searchParams.get('v'); if (id) return id;
      var m = u.pathname.match(/\/embed\/([\w-]{11})/);
      if (m) return m[1];
    }
    var m2 = url.match(/[\w-]{11}/);
    return m2 ? m2[0] : null;
  } catch(e){ return null; }
}
function download(filename, text){
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'application/json'}));
  a.download = filename; a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
}
function ts(){ return new Date().toISOString().replace(/[-:]/g,'').slice(0,13).replace('T','-'); }

// Timer loop
var rafId = null;
function startTicker(update){
  function loop(){ update(); rafId = requestAnimationFrame(loop); }
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}
function stopTicker(){ if (rafId) cancelAnimationFrame(rafId); rafId = null; }

// Views
function renderDisplay(state){
  var meeting = state.meeting;
  document.documentElement.style.fontSize = (meeting.ui.fontScale*100) + '%';

  var header = el('header', {}, [
    el('div', {class:'brand'}, [
      meeting.branding.logoSrc ? el('img',{src:meeting.branding.logoSrc, alt:'logo'},[]) : null,
      el('div', {class:'title-wrap'}, [
        el('h1', {class:'title'}, [meeting.title||'Untitled Meeting']),
        el('p', {class:'subtitle'}, [meeting.subtitle||''])
      ])
    ]),
    el('div', {class:'toolbar'}, [
      el('button', {class:'btn', onClick:function(){ location.hash = '#/edit'; }}, ['編集']),
      el('button', {class:'btn', onClick:function(){ if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }}, ['全画面'])
    ])
  ]);

  var timerText = el('div', {class:'timer'}, ['--:--']);
  var when = el('div', {class:'when'}, []);

  function updateTimer(){
    var now = Date.now();
    var start = new Date(meeting.startDateTime).getTime();
    if (meeting.countdownMode === 'toStart') {
      var diff = start - now;
      timerText.textContent = (diff>=0 ? '開始まで '+fmtTime(diff) : '開始済み +'+fmtTime(-diff));
      var dtf = new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', timeZone: meeting.timezone });
      when.textContent = '開始時刻: ' + dtf.format(start);
    } else if (meeting.countdownMode === 'manualDown') {
      var remain = Math.max(0, (meeting._manualEnd||0) - now);
      timerText.textContent = '残り ' + fmtTime(remain);
      when.textContent = '手動カウントダウン (' + Math.floor(meeting.manualSeconds) + ' 秒)';
    } else {
      var diff2 = now - start;
      timerText.textContent = '経過 ' + fmtTime(diff2);
      when.textContent = '';
    }
  }

  var leftCard = el('div', {class:'card'}, [
    el('h2', {style:'margin:0 0 6px 0'}, ['タイマー']),
    timerText, when,
    el('h2', {style:'margin:14px 0 8px'}, ['アジェンダ']),
    el('ul', {}, meeting.agenda.map(function(a){
      return el('li', {}, ['• '+ a.text + (a.durationMin ? '（'+a.durationMin+'分）':'' )]);
    }))
  ]);

  var rightKids = [
    el('h2', {style:'margin:0 0 8px'}, ['参加者']),
    el('div', {class:'badges'}, meeting.participants.map(function(p){
      return el('span', {class:'badge role-'+(p.role||'')}, [p.name + (p.role? ' / '+p.role : '')]);
    })),
    el('h2', {style:'margin:14px 0 8px'}, ['注意事項']),
    el('ul', {}, meeting.notices.map(function(n){ return el('li', {}, [n]); }))
  ];

  if (meeting.qr && meeting.qr.enabled && meeting.qr.url) {
    var size = Number(meeting.qr.size)||156; var margin = Number(meeting.qr.margin)||2;
    var api = 'https://api.qrserver.com/v1/create-qr-code/';
    var src = api + '?size='+size+'x'+size+'&margin='+margin+'&data='+encodeURIComponent(meeting.qr.url);
    rightKids.push(el('h2', {style:'margin:14px 0 8px'}, ['QRコード']));
    rightKids.push(el('div', {class:'qr-wrap'}, [
      el('img', {class:'qr-img', src: src, alt:'QR'}, []),
      el('div', {class:'muted'}, ['URL: '+meeting.qr.url])
    ]));
  }

  var rightCard = el('div', {class:'card'}, rightKids);

  var ytCard = null;
  var vid = parseYouTubeId(meeting.youtube && meeting.youtube.url);
  if (meeting.youtube && meeting.youtube.enabled && vid) {
    var params = new URLSearchParams();
    params.set('autoplay','1');
    params.set('mute', meeting.youtube.mute ? '1':'0');
    params.set('start', String(Math.max(0, Number(meeting.youtube.startSeconds)||0)));
    params.set('loop', meeting.youtube.loop ? '1':'0');
    params.set('controls', meeting.youtube.controls !== false ? '1':'0');
    if (meeting.youtube.loop) params.set('playlist', vid);
    params.set('rel','0'); params.set('modestbranding','1');
    var src = 'https://www.youtube-nocookie.com/embed/'+vid+'?'+params.toString();
    ytCard = el('div', {class:'card'}, [
      el('h2', {style:'margin:0 0 8px'}, ['YouTube']),
      el('div', {class:'yt-wrap'}, [
        el('iframe', {src: src, title: 'YouTube video', allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: ''}, [])
      ])
    ]);
  }

  var main = el('main', {}, [leftCard, rightCard]);
  var root = el('div', {}, [header, main]);

  if (ytCard) main.insertBefore(ytCard, main.firstChild);

  startTicker(updateTimer);
  updateTimer();
  return root;
}

function renderEditor(state){
  stopTicker();
  var meeting = state.meeting;

  function set(path, value){
    var keys = path.split('.');
    var obj = state;
    for (var i=0;i<keys.length-1;i++) obj = obj[keys[i]];
    obj[keys[keys.length-1]] = value;
    save(state);
  }
  function on(input, path, cast){
    input.addEventListener('input', function(){
      set(path, cast ? cast(input.value) : input.value);
    });
  }
  function splitLines(text){
    return text.split(/\n+/).map(function(s){return s.trim();}).filter(function(s){return s;});
  }

  var fTitle = el('input', {type:'text', value: meeting.title, placeholder:'会議タイトル'}, []);
  var fSubtitle = el('input', {type:'text', value: meeting.subtitle, placeholder:'サブタイトル'}, []);
  var fStart = el('input', {type:'datetime-local', value: new Date(meeting.startDateTime).toISOString().slice(0,16)}, []);
  var fMode = el('select', {}, [
    el('option', {value:'toStart', selected: meeting.countdownMode==='toStart'}, ['開始時刻まで']),
    el('option', {value:'manualDown', selected: meeting.countdownMode==='manualDown'}, ['手動カウントダウン']),
    el('option', {value:'elapsed', selected: meeting.countdownMode==='elapsed'}, ['経過タイマー'])
  ]);
  var fManual = el('input', {type:'text', value:String(meeting.manualSeconds), placeholder:'秒（例：300）'}, []);
  var fLogo = el('input', {type:'text', value: meeting.branding.logoSrc, placeholder:'ロゴ画像URL（任意）'}, []);

  var fYtEnabled = el('input', {type:'checkbox'}, []); fYtEnabled.checked = !!(meeting.youtube && meeting.youtube.enabled);
  var fYtUrl = el('input', {type:'text', value:(meeting.youtube? meeting.youtube.url:''), placeholder:'YouTube URL（任意）'}, []);
  var fYtStart = el('input', {type:'text', value:String((meeting.youtube? meeting.youtube.startSeconds:0)||0), placeholder:'開始秒（任意）'}, []);
  var fYtMute = el('input', {type:'checkbox'}, []); fYtMute.checked = !!(meeting.youtube && meeting.youtube.mute);
  var fYtLoop = el('input', {type:'checkbox'}, []); fYtLoop.checked = !!(meeting.youtube && meeting.youtube.loop);
  var fYtControls = el('input', {type:'checkbox'}, []); fYtControls.checked = !(meeting.youtube && meeting.youtube.controls === false);

  on(fTitle,'meeting.title');
  on(fSubtitle,'meeting.subtitle');
  on(fStart,'meeting.startDateTime', function(v){ return new Date(v).toISOString(); });
  on(fMode,'meeting.countdownMode');
  on(fManual,'meeting.manualSeconds', function(v){ return Number(v)||0; });
  on(fLogo,'meeting.branding.logoSrc');

  fYtEnabled.addEventListener('change', function(){ set('meeting.youtube.enabled', fYtEnabled.checked); });
  on(fYtUrl,'meeting.youtube.url');
  on(fYtStart,'meeting.youtube.startSeconds', function(v){ return Number(v)||0; });
  fYtMute.addEventListener('change', function(){ set('meeting.youtube.mute', fYtMute.checked); });
  fYtLoop.addEventListener('change', function(){ set('meeting.youtube.loop', fYtLoop.checked); });
  fYtControls.addEventListener('change', function(){ set('meeting.youtube.controls', fYtControls.checked); });

  var fAgenda = el('textarea', {rows:'6'}, []); fAgenda.value = meeting.agenda.map(function(a){return a.text;}).join('\n');
  fAgenda.addEventListener('input', function(){
    var lines = splitLines(fAgenda.value);
    state.meeting.agenda = lines.map(function(t,i){ return {id:'a'+(i+1), text:t}; });
    save(state);
  });

  var fParts = el('textarea', {rows:'4'}, []); fParts.value = meeting.participants.map(function(p){ return (p.name+' / '+(p.role||'')).trim(); }).join('\n');
  fParts.addEventListener('input', function(){
    var lines = splitLines(fParts.value);
    state.meeting.participants = lines.map(function(t,i){
      var sp = t.split('/');
      var name = (sp[0]||'').trim(); var role = (sp[1]||'').trim();
      return {id:'p'+(i+1), name:name, role:role};
    });
    save(state);
  });

  var fNotices = el('textarea', {rows:'4'}, []); fNotices.value = meeting.notices.join('\n');
  fNotices.addEventListener('input', function(){
    state.meeting.notices = splitLines(fNotices.value);
    save(state);
  });

  // QR
  var fQrEnabled = el('input', {type:'checkbox'}, []); fQrEnabled.checked = !!(meeting.qr && meeting.qr.enabled);
  var fQrUrl = el('input', {type:'text', value:(meeting.qr?meeting.qr.url:''), placeholder:'QRにするURL（任意）'}, []);
  var fQrSize = el('input', {type:'text', value:String(meeting.qr?meeting.qr.size:156), placeholder:'サイズ(px)'}, []);
  var fQrMargin = el('input', {type:'text', value:String(meeting.qr?meeting.qr.margin:2), placeholder:'余白(px)'}, []);
  fQrEnabled.addEventListener('change', function(){ set('meeting.qr.enabled', fQrEnabled.checked); });
  on(fQrUrl,'meeting.qr.url');
  on(fQrSize,'meeting.qr.size', function(v){ return Number(v)||156; });
  on(fQrMargin,'meeting.qr.margin', function(v){ return Number(v)||2; });

  // Presets
  var fPresetName = el('input', {type:'text', placeholder:'プリセット名（例：週次定例）'}, []);
  var btnSavePreset = el('button', {class:'btn'}, ['プリセット保存']);
  var listWrap = el('div', {class:'preset-list'}, []);
  function renderPresetList(){
    listWrap.innerHTML = '';
    var presets = loadPresets();
    if (!presets.length) { listWrap.appendChild(el('div',{class:'muted'},['（プリセットなし）'])); return; }
    presets.forEach(function(p, idx){
      var loadBtn = el('button',{class:'btn', onClick:function(){
        localStorage.setItem(STORE_KEY, JSON.stringify(p.data));
        location.hash = '#/'; location.reload();
      }},['読み込み']);
      var delBtn = el('button',{class:'btn', onClick:function(){
        if (confirm('削除しますか？: '+p.name)){
          var arr = loadPresets(); arr.splice(idx,1); savePresets(arr); renderPresetList();
        }
      }},['削除']);
      listWrap.appendChild(el('div', {class:'preset-item'}, [ el('span',{},[p.name]), loadBtn, delBtn ]));
    });
  }
  renderPresetList();
  btnSavePreset.addEventListener('click', function(){
    var name = fPresetName.value.trim();
    if (!name) { alert('プリセット名を入力してください'); return; }
    var arr = loadPresets(); arr.push({ id:'ps_'+Date.now(), name:name, data: load() });
    savePresets(arr); renderPresetList(); fPresetName.value=''; alert('保存しました');
  });

  var btnExport = el('button', {class:'btn'}, ['JSONエクスポート']);
  btnExport.addEventListener('click', function(){
    download('premeet-'+ts()+'.json', JSON.stringify(load(), null, 2));
  });
  var fileImport = el('input', {type:'file', accept:'application/json'}, []);
  fileImport.addEventListener('change', function(){
    var file = fileImport.files[0]; if (!file) return;
    file.text().then(function(text){
      try{
        var data = JSON.parse(text);
        if (!data || !data.meeting) throw new Error('Invalid JSON');
        if (!confirm('現在の設定をインポートした内容で置き換えます。よろしいですか？')) return;
        save(data); alert('インポートしました'); location.hash = '#/'; location.reload();
      }catch(e){ alert('読み込みに失敗しました: '+e.message); }
    });
  });

  var btnPreview = el('button', {class:'btn', onClick:function(){ location.hash = '#/'; }}, ['プレビューへ']);
  var btnStartManual = el('button', {class:'btn', onClick:function(){
    var end = Date.now() + (Number(state.meeting.manualSeconds)||0)*1000;
    state.meeting._manualEnd = end; save(state);
    alert('手動カウントダウンを開始しました');
  }}, ['手動カウント開始']);

  var wrap = el('div', {class:'editor'}, [
    el('h1', {}, ['PreMeet 設定']),
    el('div', {class:'grid-3'}, [
      el('div', {class:'field'}, [el('label',{},['タイトル']), fTitle]),
      el('div', {class:'field'}, [el('label',{},['サブタイトル']), fSubtitle]),
      el('div', {class:'field'}, [el('label',{},['開始日時']), fStart])
    ]),
    el('div', {class:'grid-3'}, [
      el('div', {class:'field'}, [el('label',{},['タイマーモード']), fMode]),
      el('div', {class:'field'}, [el('label',{},['手動カウントダウン（秒）']), fManual, el('div', {class:'muted'}, ['手動モードのみ有効'])]),
      el('div', {class:'field'}, [el('label',{},['ロゴURL（任意）']), fLogo])
    ]),
    el('div', {class:'grid-two'}, [
      el('div', {class:'field'}, [el('label',{},['アジェンダ（1行=1項目）']), fAgenda]),
      el('div', {class:'field'}, [el('label',{},['参加者（例：山田太郎 / Host）']), fParts])
    ]),
    el('div', {class:'field'}, [el('label',{},['注意事項（1行=1項目）']), fNotices]),
    el('div', {class:'card', style:'margin-top:12px'}, [
      el('h2', {style:'margin:0 0 8px'}, ['YouTube 埋め込み（任意）']),
      el('div', {class:'row'}, [ fYtEnabled, el('label',{style:'user-select:none'},[' 有効にする ']) ]),
      el('div', {class:'grid-3'}, [
        el('div',{class:'field'}, [el('label',{},['URL']), fYtUrl]),
        el('div',{class:'field'}, [el('label',{},['開始秒']), fYtStart]),
        el('div',{class:'field'}, [el('label',{},['オプション']), el('div',{},[
          el('label',{class:'row'}, [fYtMute, el('span',{},['ミュート'])]),
          el('label',{class:'row'}, [fYtLoop, el('span',{},['ループ'])]),
          el('label',{class:'row'}, [fYtControls, el('span',{},['コントロール表示'])])
        ])])
      ])
    ]),
    el('div', {class:'card', style:'margin-top:12px'}, [
      el('h2', {style:'margin:0 0 8px'}, ['QRコード（任意・外部API）']),
      el('div', {class:'row'}, [ fQrEnabled, el('label',{style:'user-select:none'},[' 有効にする ']) ]),
      el('div', {class:'grid-3'}, [
        el('div',{class:'field'}, [el('label',{},['URL']), fQrUrl]),
        el('div',{class:'field'}, [el('label',{},['サイズ(px)']), fQrSize]),
        el('div',{class:'field'}, [el('label',{},['余白(px)']), fQrMargin])
      ])
    ]),
    el('div', {class:'card', style:'margin-top:12px'}, [
      el('h2', {style:'margin:0 0 8px'}, ['プリセット管理 / エクスポート・インポート']),
      el('div', {class:'grid-3'}, [
        el('div',{class:'field'}, [el('label',{},['プリセット名']), fPresetName]),
        el('div',{class:'field'}, [el('label',{},['保存']), btnSavePreset]),
        el('div',{class:'field'}, [el('label',{},['一覧']), listWrap])
      ]),
      el('div', {class:'row', style:'gap:8px;flex-wrap:wrap'}, [btnExport, fileImport])
    ]),
    el('div', {style:'display:flex;gap:8px;margin-top:12px'}, [btnPreview, btnStartManual])
  ]);

  return wrap;
}

// Router
function mount(){
  try {
    var state = load();
    var container = document.getElementById('app');
    container.innerHTML = '';
    var route = location.hash.replace('#','');
    var view = (route === '/edit') ? renderEditor(state) : renderDisplay(state);
    container.appendChild(view);
  } catch (err) {
    var container2 = document.getElementById('app');
    container2.innerHTML = '<div style="background:#fef3c7;color:#7c2d12;border:1px solid #f59e0b;padding:12px;border-radius:12px;max-width:960px;margin:16px auto;">'
      + '<strong>初期化エラー</strong><br/>' + (err && err.message ? err.message : String(err)) + '</div>';
    console.error(err);
  }
}
window.addEventListener('hashchange', mount);
window.addEventListener('DOMContentLoaded', function(){
  if (!location.hash) location.hash = '#/';
  mount();
});

// Keyboard shortcuts
window.addEventListener('keydown', function(e){
  if (e.key === 'F' || e.key === 'f') {
    e.preventDefault();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen();
  }
  if (e.key === '+') { var d = load(); d.meeting.ui.fontScale = Math.min(1.4, (d.meeting.ui.fontScale||1)+0.05); save(d); mount(); }
  if (e.key === '-') { var d2 = load(); d2.meeting.ui.fontScale = Math.max(0.8, (d2.meeting.ui.fontScale||1)-0.05); save(d2); mount(); }
});
