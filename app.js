/* 좋아회 — 화면
 * 데이터는 DATA(data.js)만 통해서 읽고 쓴다.
 * 관리자(로그인)만 우표를 발행하고 사진·그림을 올린다.
 * 가고 싶은 곳 추가, 👍, 한 줄은 누구나.
 */
(function(){
"use strict";

var MEMBERS = [{id:"m1",v:"--m1"},{id:"m2",v:"--m2"},{id:"m3",v:"--m3"}];
var COLORS = [
  {key:"brick",   ko:"벽돌색",     en:"brick red",     hex:"#B6422F"},
  {key:"mustard", ko:"머스터드",   en:"mustard yellow",hex:"#C99A2E"},
  {key:"olive",   ko:"올리브",     en:"olive green",   hex:"#6E7F3A"},
  {key:"teal",    ko:"딥틸",       en:"deep teal",     hex:"#2A6B70"},
  {key:"orange",  ko:"번트오렌지", en:"burnt orange",  hex:"#C4652A"},
  {key:"plum",    ko:"플럼",       en:"plum purple",   hex:"#7A4A74"}
];
var LS_ME = "joahoe.me";
var AREA_UNSET = "동네 미지정";

var me = null;
var tab = "album", year = null, onlyTemp = false, showFolded = false;
var sheet = null, busy = false;
var selPin = null, showNames = false, mapWhole = false;

/* ── 유틸 ───────────────────────────────────────────────── */
function $(s){ return document.querySelector(s); }
function el(t,c,x){ var n=document.createElement(t); if(c)n.className=c; if(x!=null)n.textContent=x; return n; }
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function todayISO(){
  var d=new Date(), p=function(n){ return String(n).padStart(2,"0"); };
  return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
}
function fmtMD(iso){
  if(!iso) return "";
  var a=String(iso).split("-");
  return (a[1]||"").replace(/^0/,"")+"."+(a[2]||"");
}
function daysSince(iso){
  if(!iso) return 0;
  var t=Date.parse(iso);
  if(isNaN(t)) return 0;
  return Math.floor((Date.now()-t)/86400000);
}
function toast(msg){
  var t=el("div","toast",msg);
  $("#toasts").appendChild(t);
  setTimeout(function(){ t.remove(); }, 2600);
}
function colorOf(k){ return COLORS.filter(function(c){ return c.key===k; })[0] || null; }
function settings(){ return DATA.settings || {style:"B",members:[],refStampIds:[],areaPos:{}}; }
function memberName(id){
  var m=(settings().members||[]).filter(function(x){ return x.id===id; })[0];
  return (m && m.name) || "";
}
function memberVar(id){
  var m=MEMBERS.filter(function(x){ return x.id===id; })[0];
  return m ? "var("+m.v+")" : "var(--ink-soft)";
}
function isAdmin(){ return !!DATA.isAdmin; }

function safeUrl(u){
  u=String(u==null?"":u).trim();
  if(!u) return "";
  if(!/^https?:\/\//i.test(u)){
    if(/^[\w.-]+\.[a-z]{2,}/i.test(u)) u="https://"+u; else return "";
  }
  try{
    var x=new URL(u);
    return (x.protocol==="http:"||x.protocol==="https:") ? x.href : "";
  }catch(e){ return ""; }
}
function hostOf(u){ try{ return new URL(u).hostname.replace(/^www\./,""); }catch(e){ return "링크"; } }
function linkEl(u){
  var href=safeUrl(u);
  if(!href) return null;
  var a=document.createElement("a");
  a.className="ext"; a.href=href; a.target="_blank"; a.rel="noopener noreferrer";
  a.textContent="↗ "+hostOf(href);
  a.onclick=function(e){ e.stopPropagation(); };
  return a;
}
function saveLink(path,filename,label){
  var a=document.createElement("a");
  a.className="btn ghost sm"; a.style.textAlign="center"; a.style.textDecoration="none";
  a.href=DATA.photoUrl(path); a.download=filename; a.target="_blank"; a.rel="noopener";
  a.textContent=label;
  return a;
}

/* ── 쓰기 래퍼 ──────────────────────────────────────────── */
function guard(fn){
  if(busy) return;
  busy=true;
  Promise.resolve().then(fn).catch(function(e){
    var msg=(e && (e.message||e.error_description)) || "";
    if(/row-level security|permission|42501/i.test(msg)) toast("관리자만 할 수 있어요.");
    else if(/Failed to fetch|NetworkError/i.test(msg)) toast("인터넷 연결을 확인해주세요.");
    else toast("저장하지 못했어요. 다시 해주세요.");
  }).then(function(){ busy=false; });
}

/* ── 프롬프트 ───────────────────────────────────────────── */
function buildPrompt(st){
  var style=settings().style||"B";
  var food=(st.foodEn||"").trim()||"{음식 영문 설명}";
  var c=colorOf(st.color), col=c?c.en:"{색}";
  var hasRef=(settings().refStampIds||[]).length>0;
  var hasPhoto=(st.photoPaths||[]).length>0;
  var yr=(String(st.date||"").match(/^\d{4}/)||[String(new Date().getFullYear())])[0];
  // 글자는 장식이다. 영문으로만 쓰되 배치는 디자이너에게 맡긴다.
  var letters=
    "Lettering is part of the design, printed as crisply as everything else, the way old collectible "+
    "stamps carry type:\n"+
    "  - JOAHOE in serif capitals, generously letter-spaced, as the issuing name.\n"+
    "  - A short title for the dish in serif capitals, two or three words, invented from the dish itself.\n"+
    "  - Under it a small line in italic script, a few words, like a series name.\n"+
    "  - A face value reading 1 MEAL, set in a corner the way a denomination is.\n"+
    "  - The year "+yr+", small, in an opposite corner.\n"+
    "Arrange these as a period stamp designer would — clear hierarchy, balanced weight, generous "+
    "letter-spacing, thin printed rules to divide. A faint circular cancellation postmark overlapping one "+
    "corner is welcome. All lettering in English, correctly spelled.";
  var p;
  if(style==="A"){
    p="Draw one complete vintage postage stamp, portrait orientation, 3:4 — taller than it is wide. The "+
      "stamp fills the whole image, its perforated edge running along the image borders; the small gaps "+
      "between the perforations are plain off-white.\n\n"+
      "The stamp shows: "+food+".\n\n"+
      "Style: flat illustration with visible linework on faded aged paper. Limited palette of exactly three "+
      "inks — "+col+", cream, and dark brown. Simple bold shapes, no gradient shading.\n\n"+
      "Layout: a cream paper border frames the design, with a thin printed rule just inside it. The dish "+
      "sits in the middle as a bold silhouette, strong figure against ground. Period stamp devices are "+
      "welcome where they help: a framed panel, radiating rays, a band of flat color, a decorative "+
      "corner.\n\n"+
      letters+"\n\n"+
      "No people, no faces, no hands.";
  }else{
    p="Draw one complete vintage postage stamp, portrait orientation, 3:4 — taller than it is wide. The "+
      "stamp fills the whole image, its perforated edge running along the image borders; the small gaps "+
      "between the perforations are plain off-white.\n\n"+
      "The stamp shows: "+food+".\n\n"+
      "Style: flat shapes printed on aged paper. A limited set of inks, screen-printed or risograph look — "+
      "visible paper grain, fine speckle and slightly mottled ink, as if printed decades ago and faded "+
      "since. The edges of colored areas are a little imperfect, as printed ink is. No gradients, no "+
      "shading, no gloss, no 3D rendering. Not photorealistic.\n\n"+
      "Color: muted, faded inks — nothing bright or saturated. A cream paper border frames the design. "+
      col+", dulled and deepened, is the flat background behind the food. The dish uses softened versions "+
      "of its real colors. Six ink colors at most.\n\n"+
      "Layout: a cream paper border, a thin printed rule just inside it, and the dish held within that "+
      "frame — a high three-quarter view, simplified to a bold silhouette with strong figure and ground. "+
      "Period stamp devices are welcome where they help: a framed panel, radiating rays behind the "+
      "subject, a band of flat color, a small decorative corner.\n\n"+
      letters+"\n\n"+
      "No people, no faces, no hands.";
  }
  if(hasRef) p+="\n\nMatch the style of the attached reference stamps exactly.";
  if(hasPhoto) p+="\n\nUse the attached photo only to understand the dish — do not copy it photographically.";
  return p;
}

/* ── 이미지 ─────────────────────────────────────────────── */
function shrink(file){
  return new Promise(function(res){
    var url=URL.createObjectURL(file);
    var img=new Image();
    img.onload=function(){
      try{
        var max=1400, w=img.width, h=img.height;
        var s=Math.min(1, max/Math.max(w,h));
        var cv=document.createElement("canvas");
        cv.width=Math.round(w*s); cv.height=Math.round(h*s);
        cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
        cv.toBlob(function(b){
          URL.revokeObjectURL(url);
          res(b && b.size ? b : file);
        },"image/jpeg",0.85);
      }catch(e){ URL.revokeObjectURL(url); res(file); }
    };
    img.onerror=function(){ URL.revokeObjectURL(url); res(file); };
    img.src=url;
  });
}
function uploadImage(file,kind){
  return shrink(file).then(function(blob){
    return DATA.upload(blob,kind);
  }).catch(function(e){
    var msg=(e && e.message)||"";
    if(/row-level security|Unauthorized|403/i.test(msg)) toast("사진은 관리자만 올릴 수 있어요.");
    else if(/exceeded|too large|413/i.test(msg)) toast("사진이 너무 커요.");
    else toast("사진을 올리지 못했어요.");
    return null;
  });
}

/* ── 장소 검색 (카카오) ─────────────────────────────────────
 * 카카오 JavaScript 키는 브라우저에 드러나는 것을 전제로 만든 키라 config.js 에 둔다.
 * 보호는 카카오 개발자 콘솔의 도메인 등록이 한다 (README 참고).
 * 키가 없으면 검색 칸이 아예 안 뜨고, 지금처럼 직접 입력하면 된다.
 */
var KAKAO={state:"none",p:null};
function kakaoKey(){ return (window.JOAHOE_CONFIG||{}).KAKAO_JS_KEY||""; }
function loadKakao(){
  if(KAKAO.p) return KAKAO.p;
  var key=kakaoKey();
  if(!key){ KAKAO.state="nokey"; KAKAO.p=Promise.resolve(false); return KAKAO.p; }
  KAKAO.state="loading";
  KAKAO.p=new Promise(function(res){
    var s=document.createElement("script");
    s.src="https://dapi.kakao.com/v2/maps/sdk.js?appkey="+encodeURIComponent(key)+
          "&libraries=services&autoload=false";
    s.onload=function(){
      try{ window.kakao.maps.load(function(){ KAKAO.state="ready"; res(true); }); }
      catch(e){ KAKAO.state="fail"; res(false); }
    };
    s.onerror=function(){ KAKAO.state="fail"; res(false); };
    document.head.appendChild(s);
  });
  return KAKAO.p;
}
function searchPlaces(q){
  return loadKakao().then(function(ok){
    if(!ok) return null;
    return new Promise(function(res){
      try{
        var ps=new window.kakao.maps.services.Places();
        ps.keywordSearch(q,function(data,status){
          res(status===window.kakao.maps.services.Status.OK ? data.slice(0,8) : []);
        });
      }catch(e){ res(null); }
    });
  });
}
/* "서울 성동구 성수동2가 …" → "성수" */
function areaFromAddr(addr){
  var p=String(addr||"").trim().split(/\s+/);
  var d=(p[2]||"").replace(/\d+가$/,"").replace(/\d+동$/,"").replace(/동$/,"").replace(/가$/,"");
  return d || p[1] || "";
}
function naverSearchUrl(name){
  return "https://map.naver.com/p/search/"+encodeURIComponent(name);
}
/* onPick({name,url,area,lat,lng}) — 키가 없으면 null 을 돌려준다 */
function placeSearch(onPick,hintText){
  if(!kakaoKey()) return null;
  var box=el("div","fld");
  box.appendChild(el("span",null,"가게 찾기"));
  var row=el("div","row2");
  var q=document.createElement("input");
  q.type="search"; q.placeholder="상호로 검색 — 예: 을지면옥";
  var go=el("button","btn ghost sm","찾기"); go.type="button"; go.style.flex="0 0 74px";
  row.appendChild(q); row.appendChild(go);
  box.appendChild(row);
  var list=el("div","psr"); box.appendChild(list);
  box.appendChild(el("div","hint",
    hintText||"고르면 이름·링크·동네가 채워집니다. 링크는 네이버 지도로 걸립니다."));

  function run(){
    var s=q.value.trim();
    if(!s) return;
    list.innerHTML=""; list.appendChild(el("div","hint","찾는 중…"));
    searchPlaces(s).then(function(rs){
      list.innerHTML="";
      if(rs===null){ list.appendChild(el("div","hint","검색을 불러오지 못했어요. 직접 적어주세요.")); return; }
      if(!rs.length){ list.appendChild(el("div","hint","결과가 없어요. 이름을 줄여서 다시 찾아보세요.")); return; }
      rs.forEach(function(r){
        var b=el("button","psrow"); b.type="button";
        b.appendChild(el("span","nm",r.place_name));
        b.appendChild(el("span","ad",r.road_address_name||r.address_name||""));
        b.onclick=function(){
          onPick({
            name:r.place_name,
            url:naverSearchUrl(r.place_name),
            area:areaFromAddr(r.address_name||r.road_address_name),
            lat:Number(r.y),   // 카카오는 y 가 위도, x 가 경도
            lng:Number(r.x)
          });
          list.innerHTML="";
          toast("채웠어요. 틀리면 고치면 됩니다.");
        };
        list.appendChild(b);
      });
    });
  }
  go.onclick=run;
  q.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); run(); } };
  return box;
}

/* ── 데이터 뷰 ──────────────────────────────────────────── */
function stamps(){ return DATA.stamps; }
function shops(){ return DATA.shops; }
function likeScore(s){ return DATA.likesOf(s.id).length; }
function currentYears(){
  var ys={}, out=[];
  stamps().forEach(function(s){ var y=String(s.date||"").slice(0,4); if(y) ys[y]=1; });
  ys[String(new Date().getFullYear())]=1;
  for(var k in ys) out.push(k);
  return out.sort();
}
function stampsOfYear(y){
  return stamps().filter(function(s){ return String(s.date||"").slice(0,4)===y; })
    .sort(function(a,b){
      return String(a.date||"").localeCompare(String(b.date||"")) ||
             String(a.createdAt||"").localeCompare(String(b.createdAt||""));
    });
}
function tempCount(){ return stamps().filter(function(s){ return !s.artPath; }).length; }
function wishList(){ return shops().filter(function(s){ return s.wish && !s.folded; }); }
function foldedList(){ return shops().filter(function(s){ return s.wish && s.folded; }); }
function visitedShops(){ return shops().filter(function(s){ return !s.wish; }); }
function areaOf(s){ return (s.area||"").trim() || AREA_UNSET; }

/* ── 렌더 ───────────────────────────────────────────────── */
function render(){
  var main=$("#main");
  var st=DATA.state;

  if(st!=="ok"){
    $("#hdr").hidden=true; $("#fab").hidden=true;
    main.innerHTML="";
    main.appendChild(viewBoot(st));
    return;
  }

  var named=(settings().members||[]).some(function(m){ return m.name; });
  var usable=named && me && MEMBERS.some(function(m){ return m.id===me; });
  $("#hdr").hidden=!usable;
  $("#fab").hidden=!usable || tab!=="album" || !isAdmin();

  main.innerHTML="";
  if(!named){ main.appendChild(viewSetup()); return; }
  if(!usable){ main.appendChild(viewWho()); return; }

  $("#whoNm").textContent=memberName(me);
  $("#whoSw").style.background=memberVar(me);
  $("#tabAlbum").setAttribute("aria-selected",String(tab==="album"));
  $("#tabWish").setAttribute("aria-selected",String(tab==="wish"));
  $("#tabMap").setAttribute("aria-selected",String(tab==="map"));
  var wn=wishList().length;
  $("#wishN").textContent=wn?String(wn):"";

  main.appendChild(tab==="album"?viewAlbum():tab==="wish"?viewWish():viewMap());
}

function viewBoot(st){
  var d=el("div","center");
  if(st==="boot"){
    d.appendChild(el("h2",null,"좋아회"));
    d.appendChild(el("p",null,"우표첩을 펴고 있어요…"));
    return d;
  }
  d.appendChild(el("h2",null,"설정이 필요해요"));
  var box=el("div","setupbox");
  if(st==="noconfig"){
    box.appendChild(el("div",null,"config.js 에 Supabase 주소와 키를 넣어주세요."));
    var c1=el("div","hint");
    c1.innerHTML="Supabase 대시보드 → <code>Project Settings</code> → <code>Data API</code> 에서 "+
                 "<code>Project URL</code> 과 <code>anon public</code> 키를 복사합니다.";
    box.appendChild(c1);
    box.appendChild(el("div","hint","자세한 순서는 저장소의 README.md 에 있습니다."));
  }else if(st==="nolib"){
    box.appendChild(el("div",null,"Supabase 라이브러리를 불러오지 못했어요."));
    box.appendChild(el("div","hint","인터넷 연결을 확인하고 새로고침해주세요."));
  }else{
    box.appendChild(el("div",null,"데이터를 불러오지 못했어요."));
    box.appendChild(el("div","hint",DATA.error||""));
    box.appendChild(el("div","hint","supabase/schema.sql 을 아직 실행하지 않았다면 그것부터 해주세요."));
  }
  d.appendChild(box);
  return d;
}

function viewSetup(){
  var d=el("div","center");
  if(!isAdmin()){
    d.appendChild(el("h2",null,"아직 준비 중이에요"));
    d.appendChild(el("p",null,"관리자가 셋의 이름을 넣으면 우표첩이 열립니다."));
    var lb=el("button","btn ghost","관리자 로그인");
    lb.onclick=function(){ openSheet({k:"login"}); };
    d.appendChild(lb);
    return d;
  }
  d.appendChild(el("h2",null,"셋의 이름을 적어주세요"));
  d.appendChild(el("p",null,"우표에 참석 표시로 들어갑니다. 나중에 바꿀 수 있어요."));
  var f=el("div","form");
  var ins=MEMBERS.map(function(m,i){
    var l=el("label","fld");
    l.appendChild(el("span",null,"멤버 "+(i+1)));
    var inp=document.createElement("input");
    inp.id="su_"+m.id; inp.maxLength=8; inp.placeholder=["나","민","수"][i];
    l.appendChild(inp); f.appendChild(l);
    return inp;
  });
  var b=el("button","btn","시작하기");
  b.onclick=function(){
    var names=ins.map(function(x){ return x.value.trim(); });
    if(names.filter(Boolean).length<3){ toast("세 명 모두 적어주세요."); return; }
    guard(function(){
      return DATA.saveSettings({ members: MEMBERS.map(function(m,i){ return {id:m.id,name:names[i]}; }) });
    });
  };
  f.appendChild(b);
  d.appendChild(f);
  return d;
}

function viewWho(){
  var d=el("div","center");
  d.appendChild(el("h2",null,"누구세요?"));
  d.appendChild(el("p",null,"이 기기에만 저장돼요."));
  var w=el("div","who3");
  MEMBERS.forEach(function(m){
    var b=el("button");
    var sw=el("span","swatch"); sw.style.background=memberVar(m.id);
    b.appendChild(sw);
    b.appendChild(el("span",null,memberName(m.id)||m.id));
    b.onclick=function(){ me=m.id; lsSet(LS_ME,m.id); render(); };
    w.appendChild(b);
  });
  d.appendChild(w);
  return d;
}

function viewAlbum(){
  var frag=document.createDocumentFragment();
  var years=currentYears();
  if(!year||years.indexOf(year)<0) year=years[years.length-1];
  var yi=years.indexOf(year);

  var yb=el("div","yearbar");
  yb.appendChild(el("h2",null,year+"년 좋아회"));
  var nav=el("div","yearnav");
  var prev=el("button",null,"‹"); prev.setAttribute("aria-label","지난 해");
  var next=el("button",null,"›"); next.setAttribute("aria-label","다음 해");
  if(yi<=0) prev.disabled=true; else prev.onclick=function(){ year=years[yi-1]; render(); };
  if(yi>=years.length-1) next.disabled=true; else next.onclick=function(){ year=years[yi+1]; render(); };
  nav.appendChild(prev); nav.appendChild(next); yb.appendChild(nav);
  frag.appendChild(yb);

  var tc=tempCount();
  if(tc){
    var b=el("button","banner");
    b.setAttribute("aria-pressed",String(onlyTemp));
    var s=el("span");
    s.appendChild(document.createTextNode("🎨 그림 기다리는 우표 "));
    s.appendChild(el("strong",null,tc+"장"));
    b.appendChild(s);
    b.appendChild(el("span",null,onlyTemp?"  전체 보기":"  모아 보기"));
    b.onclick=function(){ onlyTemp=!onlyTemp; render(); };
    frag.appendChild(b);
  }

  var list=stampsOfYear(year);
  if(onlyTemp) list=list.filter(function(s){ return !s.artPath; });

  if(!list.length){
    var e=el("div","empty");
    if(onlyTemp){
      e.appendChild(el("div","t","그림을 기다리는 우표가 없어요"));
    }else{
      e.appendChild(el("div","t","우표첩이 비어 있어요"));
      e.appendChild(el("div","s", isAdmin()
        ? "먹으러 간 날 사진 한 장과 가게 이름만 넣으면 첫 우표가 발행됩니다."
        : "관리자가 첫 우표를 발행하면 여기 꽂힙니다. 가고 싶은 곳은 지금도 추가할 수 있어요."));
    }
    frag.appendChild(e);
    return frag;
  }

  var g=el("div","grid");
  list.forEach(function(st){ g.appendChild(cellFor(st)); });
  if(!onlyTemp){
    var c=el("div","cell");
    var slot=el("button","slot");
    slot.appendChild(el("span","big","다음 한 끼"));
    slot.appendChild(el("span","sm", isAdmin()?"＋ 우표 발행":"기다리는 칸"));
    if(isAdmin()) slot.onclick=function(){ openSheet({k:"new"}); };
    else slot.disabled=true;
    c.appendChild(slot);
    g.appendChild(c);
  }
  frag.appendChild(g);
  return frag;
}

function stampEl(st,flat){
  var b=el("button","stamp"+(st.artPath?"":" temp"));
  b.setAttribute("aria-label",(st.foodKo||"우표")+" 우표");
  var inner=el("div","inner");
  var path=st.artPath || (st.photoPaths && st.photoPaths[0]);
  if(path){
    var im=document.createElement("img");
    im.src=DATA.photoUrl(path); im.alt=st.foodKo||""; im.loading="lazy";
    inner.appendChild(im);
  }else{
    inner.appendChild(el("div","ph",st.foodKo||"사진 없음"));
  }
  b.appendChild(inner);
  if(!st.artPath) b.appendChild(el("div","mark","임시"));
  if(flat) b.style.pointerEvents="none";
  return b;
}

function cellFor(st){
  var c=el("div","cell");
  var s=stampEl(st,false);
  s.onclick=function(){ openSheet({k:"detail",id:st.id}); };
  c.appendChild(s);
  var cap=el("div","cap");
  cap.appendChild(el("div","food",st.foodKo||"이름 없음"));
  if(st.shopName) cap.appendChild(el("div","shop",st.shopName));
  var row=el("div","row");
  row.appendChild(el("span","d",fmtMD(st.date)));
  row.appendChild(dotsEl(st.attendees||[]));
  cap.appendChild(row);
  c.appendChild(cap);
  return c;
}

function dotsEl(att){
  var d=el("div","dots");
  MEMBERS.forEach(function(m){
    var on=att.indexOf(m.id)>=0;
    var x=el("span","dot"+(on?" on":""));
    if(on) x.style.background=memberVar(m.id);
    x.title=memberName(m.id);
    d.appendChild(x);
  });
  return d;
}

/* ── 가고 싶은 곳 ───────────────────────────────────────── */
function viewWish(){
  var frag=document.createDocumentFragment();
  var all=wishList().slice().sort(function(a,b){
    return likeScore(b)-likeScore(a) ||
           String(b.createdAt||"").localeCompare(String(a.createdAt||""));
  });
  var hit=all.filter(function(s){ return likeScore(s)>=3; });
  var rest=all.filter(function(s){ return likeScore(s)<3; });

  if(!all.length){
    var e=el("div","empty");
    e.appendChild(el("div","t","가고 싶은 곳이 없어요"));
    e.appendChild(el("div","s","셋 다 👍 하면 맨 위에서 반짝입니다. 그게 다음 약속이 돼요."));
    var ab=el("button","btn sm","＋ 추가");
    ab.onclick=function(){ openSheet({k:"wish"}); };
    e.appendChild(ab);
    frag.appendChild(e);
  }else{
    if(hit.length){
      frag.appendChild(el("div","sect","★ 셋 다 가고 싶은 곳"));
      var w1=el("div","wish");
      hit.forEach(function(s){ w1.appendChild(wishCard(s,true)); });
      frag.appendChild(w1);
    }
    if(rest.length){
      if(hit.length) frag.appendChild(el("hr","disc"));
      var w2=el("div","wish");
      rest.forEach(function(s){ w2.appendChild(wishCard(s,false)); });
      frag.appendChild(w2);
    }
  }

  var fl=foldedList();
  if(fl.length){
    var fb=el("button","foldlink",(showFolded?"▾":"›")+" 접어둔 곳 "+fl.length);
    fb.onclick=function(){ showFolded=!showFolded; render(); };
    frag.appendChild(fb);
    if(showFolded){
      var w3=el("div","wish");
      fl.forEach(function(s){ w3.appendChild(wishCard(s,false)); });
      frag.appendChild(w3);
    }
  }
  var vs=visitedShops();
  if(vs.length){
    var vb=el("button","foldlink","› 다녀온 곳 "+vs.length);
    vb.onclick=function(){ openSheet({k:"visited"}); };
    frag.appendChild(vb);
  }

  var add=el("div","row2"); add.style.marginTop="18px";
  var a=el("button","btn ghost","＋ 추가");
  a.onclick=function(){ openSheet({k:"wish"}); };
  add.appendChild(a);
  frag.appendChild(add);
  return frag;
}

function wishCard(s,isHit){
  var c=el("div","wcard"+(isHit?" hit":""));
  var b=el("div","body");
  b.appendChild(el("div","nm",s.name));
  if(s.reason) b.appendChild(el("div","why",(memberName(s.proposer)||"")+": "+s.reason));
  else if(s.proposer) b.appendChild(el("div","why",(memberName(s.proposer)||"")+" 추천"));
  var d=daysSince(s.createdAt);
  if(!s.folded && d>=90) b.appendChild(el("div","stale",Math.floor(d/30)+"개월째 안 감"));
  var mr=el("div","meta-row");
  if((s.area||"").trim()) mr.appendChild(el("span","area",s.area.trim()));
  var ln=linkEl(s.url);
  if(ln) mr.appendChild(ln);
  if(mr.childNodes.length) b.appendChild(mr);
  c.appendChild(b);

  var col=el("div");
  col.style.display="flex"; col.style.flexDirection="column";
  col.style.gap="6px"; col.style.alignItems="flex-end";
  var mine=DATA.likesOf(s.id).indexOf(me)>=0;
  var lk=el("button","likebtn");
  lk.appendChild(dotsEl(DATA.likesOf(s.id)));
  lk.setAttribute("aria-label",mine?"가고 싶음 취소":"가고 싶음");
  lk.title=mine?"내 👍 빼기":"나도 가고 싶음";
  lk.onclick=function(){ toggleLike(s); };
  col.appendChild(lk);
  var more=el("button","btn ghost sm","⋯");
  more.setAttribute("aria-label","더보기");
  more.onclick=function(){ openSheet({k:"shop",id:s.id}); };
  col.appendChild(more);
  c.appendChild(col);
  return c;
}

function toggleLike(s){
  var cur=DATA.likesOf(s.id);
  var on=cur.indexOf(me)<0;
  guard(function(){
    return DATA.setLike(s.id,me,on).then(function(){
      if(on && cur.length===2) toast("셋 다 가고 싶은 집이 생겼어요. 단톡방에 알리세요!");
    });
  });
}

/* ── 지도 ───────────────────────────────────────────────── */
var SVGNS="http://www.w3.org/2000/svg";
function svgEl(t,attrs){
  var n=document.createElementNS(SVGNS,t);
  for(var k in attrs) n.setAttribute(k,attrs[k]);
  return n;
}
/* ── 지도 ───────────────────────────────────────────────────
 * korea.js 가 들고 있는 시군구 경계 위에 가게 좌표를 찍는다.
 * 투영은 korea.js 를 만든 것과 반드시 같아야 한다: x = 경도 × k, y = -위도.
 * 좌표는 가게 검색(카카오)으로 고를 때만 들어온다. 없는 가게는 지도에 안 찍히고
 * 아래 동네 목록에만 남는다.
 */
function projXY(lat,lng){
  var k=(window.KOREA&&window.KOREA.k)||0.809017;
  return {x:lng*k, y:-lat};
}
function hasPos(s){ return typeof s.lat==="number" && typeof s.lng==="number"; }

/* 점이 모인 범위에 맞춘 정사각 viewBox. 점이 없거나 「전국 보기」면 나라 전체. */
function mapViewBox(pts){
  var kb=(window.KOREA&&window.KOREA.box)||[100.8,-38.7,105.9,-33.1];
  var whole={x:kb[0],y:kb[1],w:kb[2]-kb[0],h:kb[3]-kb[1]};
  var wholeSide=Math.max(whole.w,whole.h);
  whole={x:(kb[0]+kb[2])/2-wholeSide/2, y:(kb[1]+kb[3])/2-wholeSide/2, w:wholeSide, h:wholeSide};
  if(mapWhole || !pts.length) return whole;
  var minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  pts.forEach(function(p){
    if(p.x<minx) minx=p.x;
    if(p.x>maxx) maxx=p.x;
    if(p.y<miny) miny=p.y;
    if(p.y>maxy) maxy=p.y;
  });
  var cx=(minx+maxx)/2, cy=(miny+maxy)/2;
  // 한 점뿐이어도 너무 깊이 들어가지 않게 최소 폭을 둔다 (약 7km)
  var side=Math.max(maxx-minx, maxy-miny, 0.06)*1.45;
  side=Math.min(side, wholeSide);
  return {x:cx-side/2, y:cy-side/2, w:side, h:side};
}

/* ── 가까이 보기 — 카카오 지도 ───────────────────────────────
 * 호수·강·도로가 보여야 동네가 읽힌다. 시군구 경계만으로는 시(市) 하나를
 * 확대했을 때 빈 면이 된다 (춘천처럼 구가 없는 곳).
 * 한 번 만든 지도 DOM 은 계속 다시 쓴다 — 화면을 다시 그릴 때마다 새로 만들면
 * 깜빡이고 쿼터만 먹는다.
 */
var kmapHost=null, kmapObj=null, kmapMarks=[], kmapSig="", kmapTried=false;

function kakaoFit(pts){
  var K=window.kakao.maps;
  if(pts.length===1){
    kmapObj.setCenter(new K.LatLng(pts[0].s.lat,pts[0].s.lng));
    kmapObj.setLevel(5);
    return;
  }
  var b=new K.LatLngBounds();
  pts.forEach(function(p){ b.extend(new K.LatLng(p.s.lat,p.s.lng)); });
  kmapObj.setBounds(b,34,34,34,34);
}
function kakaoMarks(pts){
  var K=window.kakao.maps;
  kmapMarks.forEach(function(o){ o.setMap(null); });
  kmapMarks=[];
  pts.forEach(function(p){
    var s=p.s;
    var d=el("div","kpin"+(s.wish?" wish":"")+(selPin===s.id?" on":""));
    d.appendChild(el("i"));
    d.appendChild(el("span",null,s.name));
    d.onclick=function(ev){ ev.stopPropagation(); selPin=(selPin===s.id?null:s.id); render(); };
    var o=new K.CustomOverlay({
      position:new K.LatLng(s.lat,s.lng), content:d, xAnchor:0, yAnchor:0.5, clickable:true
    });
    o.setMap(kmapObj);
    kmapMarks.push(o);
  });
}
function buildKakaoMap(pts){
  if(!kmapHost) kmapHost=el("div","kmap");
  var sig=pts.map(function(p){ return p.s.id+":"+p.s.lat+","+p.s.lng; }).join("|");
  // 지도는 DOM 에 붙고 크기가 생긴 뒤에 만들어야 한다.
  setTimeout(function(){
    if(!kmapHost.isConnected) return;
    try{
      if(!kmapObj){
        kmapObj=new window.kakao.maps.Map(kmapHost,{
          center:new window.kakao.maps.LatLng(pts[0].s.lat,pts[0].s.lng), level:6
        });
      }else{
        kmapObj.relayout();
      }
      kakaoMarks(pts);
      if(sig!==kmapSig){ kmapSig=sig; kakaoFit(pts); }
    }catch(e){}
  },0);
  return kmapHost;
}

function mapLegend(extra){
  var lg=el("div","maplegend");
  [["다녀온 곳","var(--postal)"],["가고 싶은 곳","var(--post)"]].forEach(function(pair){
    var k=el("span","k");
    var i2=document.createElement("i"); i2.style.background=pair[1];
    k.appendChild(i2); k.appendChild(el("span",null,pair[0]));
    lg.appendChild(k);
  });
  var wb=el("button",null, mapWhole?"가까이 보기":"전국 보기");
  wb.setAttribute("aria-pressed",String(mapWhole));
  wb.onclick=function(){ mapWhole=!mapWhole; render(); };
  lg.appendChild(wb);
  if(extra) lg.appendChild(extra);
  return lg;
}

function buildMap(list){
  var wrap=el("div","mapwrap");
  var pts=list.filter(hasPos).map(function(s){
    var p=projXY(s.lat,s.lng); p.s=s; return p;
  });

  // 가까이 볼 때는 카카오 지도. 키가 없거나 좌표가 없으면 아래 전국 지도로 떨어진다.
  if(!mapWhole && pts.length && kakaoKey()){
    if(KAKAO.state==="ready"){
      wrap.appendChild(buildKakaoMap(pts));
      wrap.appendChild(mapLegend(null));
      return wrap;
    }
    if(!kmapTried){
      kmapTried=true;
      loadKakao().then(function(ok){ if(ok) render(); });
    }
  }

  var vb=mapViewBox(pts);
  var svg=svgEl("svg",{
    viewBox:[vb.x,vb.y,vb.w,vb.h].map(function(n){ return n.toFixed(4); }).join(" "),
    "class":"mapsvg",role:"img","aria-label":"가게 지도"
  });
  svg.addEventListener("click",function(){ if(selPin){ selPin=null; render(); } });

  var areas=(window.KOREA&&window.KOREA.areas)||[];
  areas.forEach(function(a){
    svg.appendChild(svgEl("path",{"class":"ma",d:a[1]}));
  });

  // 점 크기는 viewBox 를 따라간다 — 확대해도 화면에서 같은 크기로 보이게.
  var u=vb.w, R=u*0.016;

  /* 확대해서 몇 개 안 보일 때만 시군구 이름을 적는다.
     전국 보기에서 251개를 다 적으면 글자밭이 된다. */
  var inView=areas.filter(function(a){
    return a[2]>=vb.x && a[2]<=vb.x+vb.w && a[3]>=vb.y && a[3]<=vb.y+vb.h;
  });
  if(inView.length && inView.length<=28){
    inView.forEach(function(a){
      var t=svgEl("text",{"class":"ml",x:a[2],y:a[3],"text-anchor":"middle"});
      t.style.fontSize=(u*0.033)+"px";
      t.textContent=a[0];
      svg.appendChild(t);
    });
  }
  pts.forEach(function(p){
    var s=p.s, wish=!!s.wish;
    if(wish && likeScore(s)>=3){
      var ring=svgEl("circle",{"class":"ring",cx:p.x,cy:p.y,r:R*1.9,"stroke-width":u*0.004});
      svg.appendChild(ring);
    }
    var c=svgEl("circle",{"class":"pin",cx:p.x,cy:p.y,r:R,tabindex:"0",role:"button","aria-label":s.name});
    c.style.fill=wish?"var(--post)":"var(--postal)";
    function open(ev){ ev.stopPropagation(); selPin=(selPin===s.id?null:s.id); render(); }
    c.addEventListener("click",open);
    c.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"||ev.key===" "){ ev.preventDefault(); open(ev); }
    });
    svg.appendChild(c);
    if(selPin===s.id){
      svg.appendChild(svgEl("circle",{"class":"sel",cx:p.x,cy:p.y,r:R*2.3,"stroke-width":u*0.005}));
    }
    if(showNames){
      var t=svgEl("text",{"class":"pn",x:p.x+R*1.7,y:p.y+R*0.9});
      t.style.fontSize=(u*0.03)+"px";
      t.textContent=s.name;
      svg.appendChild(t);
    }
  });
  wrap.appendChild(svg);

  var nb=el("button",null,"이름 보기");
  nb.setAttribute("aria-pressed",String(showNames));
  nb.onclick=function(){ showNames=!showNames; render(); };
  wrap.appendChild(mapLegend(nb));
  return wrap;
}
function pinCard(s){
  var c=el("div","pincard"+(s.wish?" wish":""));
  c.appendChild(el("div","nm",s.name));
  var bits=[];
  if((s.area||"").trim()) bits.push(s.area.trim());
  if(s.wish){
    bits.push("가고 싶은 곳 · 👍 "+likeScore(s)+"/3");
    if(s.reason) bits.push("“"+s.reason+"”");
  }else{
    bits.push("다녀온 곳 · 우표 "+stamps().filter(function(x){ return x.shopId===s.id; }).length+"장");
  }
  c.appendChild(el("div","st",bits.join(" · ")));
  var act=el("div","act");
  var ln=linkEl(s.url);
  if(ln) act.appendChild(ln);
  var ob=el("button","btn ghost sm","가게 열기");
  ob.onclick=function(){ openSheet({k:"shop",id:s.id}); };
  act.appendChild(ob);
  if(s.wish){
    var mine=DATA.likesOf(s.id).indexOf(me)>=0;
    var lk=el("button","btn ghost sm",mine?"👍 취소":"👍 나도");
    lk.onclick=function(){ toggleLike(s); };
    act.appendChild(lk);
  }
  c.appendChild(act);
  return c;
}
function shopRow(s){
  var row=el("div","mrow");
  var nb=el("button","nmbtn",s.name);
  nb.onclick=function(){ openSheet({k:"shop",id:s.id}); };
  row.appendChild(nb);
  var ln=linkEl(s.url);
  if(ln) row.appendChild(ln);
  var cnt=stamps().filter(function(x){ return x.shopId===s.id; }).length;
  row.appendChild(el("span","st",s.wish?("★ "+likeScore(s)+"/3"):("우표 "+cnt)));
  return row;
}

function viewMap(){
  var frag=document.createDocumentFragment();
  var list=shops().filter(function(s){ return !(s.wish && s.folded); });
  if(!list.length){
    var e=el("div","empty");
    e.appendChild(el("div","t","아직 가게가 없어요"));
    e.appendChild(el("div","s","우표를 발행하거나 가고 싶은 곳을 추가하면 지도에 점이 찍힙니다."));
    frag.appendChild(e);
    return frag;
  }
  var groups={}, keys=[];
  list.forEach(function(s){
    var k=areaOf(s);
    if(!groups[k]){ groups[k]=[]; keys.push(k); }
    groups[k].push(s);
  });
  keys.sort(function(a,b){
    if(a===AREA_UNSET) return 1;
    if(b===AREA_UNSET) return -1;
    return groups[b].length-groups[a].length || a.localeCompare(b,"ko");
  });

  var been=list.filter(function(s){ return !s.wish; }).length;
  var want=list.filter(function(s){ return s.wish; }).length;
  var top=el("div","yearbar");
  top.appendChild(el("h2",null,"동네 "+keys.filter(function(k){ return k!==AREA_UNSET; }).length+
    " · 다녀온 곳 "+been+" · 가고 싶은 곳 "+want));
  frag.appendChild(top);

  frag.appendChild(buildMap(list));
  var sel=selPin?list.filter(function(s){ return s.id===selPin; })[0]:null;
  if(sel) frag.appendChild(pinCard(sel));
  else{
    var noPos=list.filter(function(s){ return !hasPos(s); }).length;
    frag.appendChild(el("div","hint", noPos
      ? "점을 누르면 가게가 보입니다. 좌표가 없는 "+noPos+"곳은 아래 목록에만 있어요 — 가게를 열어 「가게 찾기」로 다시 고르면 지도에 찍힙니다."
      : "점을 누르면 가게가 보입니다."));
  }

  keys.forEach(function(k){
    var g=el("div","mgroup");
    var h3=el("h3");
    h3.appendChild(el("span",null,k));
    var arr=groups[k];
    h3.appendChild(el("span","c",arr.filter(function(s){ return !s.wish; }).length+
      "곳 · ★"+arr.filter(function(s){ return s.wish; }).length));
    g.appendChild(h3);
    arr.slice().sort(function(a,b){
      return (a.wish?1:0)-(b.wish?1:0) || String(a.name).localeCompare(String(b.name),"ko");
    }).forEach(function(s){ g.appendChild(shopRow(s)); });
    if(k===AREA_UNSET){
      var hint=el("div","mrow");
      hint.appendChild(el("span","st", isAdmin()
        ? "가게를 눌러 동네를 적으면 여기서 묶입니다"
        : "동네는 관리자가 적습니다"));
      g.appendChild(hint);
    }
    frag.appendChild(g);
  });
  frag.appendChild(el("div","hint","목록에서도 같은 가게를 누를 수 있어요."));
  return frag;
}

/* ── 시트 ───────────────────────────────────────────────── */
function openSheet(s){ sheet=s; drawSheet(); }
function closeSheet(){ sheet=null; drawSheet(); render(); }
function drawSheet(){
  var host=$("#sheets");
  host.innerHTML="";
  if(!sheet) return;
  var w=el("div","sheet"), inn=el("div","in");
  w.appendChild(inn); host.appendChild(w);
  var bar=el("div","bar");
  var h=el("h2",null,"");
  var x=el("button",null,"닫기"); x.onclick=closeSheet;
  bar.appendChild(h); bar.appendChild(x); inn.appendChild(bar);
  var body=el("div"); inn.appendChild(body);
  var map={"new":sheetNew,"detail":sheetDetail,"art":sheetArt,"wish":sheetWish,"shop":sheetShop,
           "visited":sheetVisited,"settings":sheetSettings,"login":sheetLogin};
  (map[sheet.k]||function(){})(h,body);
}

function sheetNew(h,body){
  h.textContent="우표 발행";
  var f=el("div","form");
  var photoPath=null;

  var drop=el("div","drop stampsize");
  var lbl=el("div","lbl");
  lbl.appendChild(el("span",null,"📷 사진 올리기"));
  lbl.appendChild(el("span",null,"음식만 찍으세요"));
  drop.appendChild(lbl);
  var fi=document.createElement("input");
  fi.type="file"; fi.accept="image/*"; fi.hidden=true; fi.id="newPhoto";
  drop.onclick=function(){ fi.click(); };
  fi.onchange=function(){
    var file=fi.files && fi.files[0];
    if(!file) return;
    lbl.textContent="올리는 중…";
    uploadImage(file,"photo").then(function(path){
      if(!path){ lbl.textContent="📷 다시 시도"; return; }
      photoPath=path;
      drop.innerHTML="";
      var im=document.createElement("img"); im.src=DATA.photoUrl(path); im.alt="";
      drop.appendChild(im);
    });
  };
  f.appendChild(drop); f.appendChild(fi);

  var lShop=el("label","fld");
  lShop.appendChild(el("span",null,"가게"));
  var shopIn=document.createElement("input");
  shopIn.id="newShop"; shopIn.setAttribute("list","shopList"); shopIn.placeholder="가게 이름";
  var dl=document.createElement("datalist"); dl.id="shopList";
  wishList().concat(visitedShops()).forEach(function(s){
    var o=document.createElement("option"); o.value=s.name; dl.appendChild(o);
  });
  lShop.appendChild(shopIn); lShop.appendChild(dl);
  if(wishList().length){
    lShop.appendChild(el("div","hint","★ 가고 싶은 곳: "+
      wishList().slice(0,3).map(function(s){ return s.name; }).join(" · ")));
  }
  f.appendChild(lShop);

  var shopPick=null;
  var psNew=placeSearch(function(p){
    shopIn.value=p.name; shopPick=p;
  },"고르면 가게 이름이 채워지고, 링크·동네·좌표도 함께 저장됩니다.");
  if(psNew) f.insertBefore(psNew,lShop);

  var lFood=el("label","fld");
  lFood.appendChild(el("span",null,"음식"));
  var foodIn=document.createElement("input");
  foodIn.id="newFood"; foodIn.placeholder="숙성 삼겹살";
  lFood.appendChild(foodIn); f.appendChild(lFood);

  var lDate=el("label","fld");
  lDate.appendChild(el("span",null,"날짜"));
  var dIn=document.createElement("input");
  dIn.type="date"; dIn.id="newDate"; dIn.value=todayISO();
  lDate.appendChild(dIn); f.appendChild(lDate);

  var lAtt=el("div","fld");
  lAtt.appendChild(el("span",null,"참석"));
  var pick=el("div","pick");
  var att=MEMBERS.map(function(m){ return m.id; });
  MEMBERS.forEach(function(m){
    var b=el("button"); b.type="button"; b.setAttribute("aria-pressed","true");
    var sw=el("span","swatch"); sw.style.background=memberVar(m.id);
    b.appendChild(sw); b.appendChild(el("span",null,memberName(m.id)||m.id));
    b.onclick=function(){
      var i=att.indexOf(m.id);
      if(i>=0) att.splice(i,1); else att.push(m.id);
      b.setAttribute("aria-pressed",String(att.indexOf(m.id)>=0));
    };
    pick.appendChild(b);
  });
  lAtt.appendChild(pick); f.appendChild(lAtt);

  var go=el("button","btn","발행하기");
  go.onclick=function(){
    var shopName=shopIn.value.trim(), foodKo=foodIn.value.trim(), date=dIn.value||todayISO();
    if(!shopName){ toast("가게 이름을 적어주세요."); return; }
    if(!foodKo){ toast("음식 이름을 적어주세요."); return; }
    guard(function(){
      var existing=shops().filter(function(s){ return s.name===shopName; })[0];
      // 검색으로 고른 가게일 때만 쓴다. 고른 뒤 이름을 바꿨으면 버린다.
      var pk=(shopPick && shopPick.name===shopName) ? shopPick : null;
      var p;
      if(existing){
        var patch={};
        if(existing.wish){ patch.wish=false; patch.folded=false; }
        // 이미 채워진 값은 건드리지 않는다. 빈 칸만 메운다.
        if(pk){
          if(!existing.url) patch.url=pk.url;
          if(!existing.area) patch.area=pk.area;
          if(existing.lat===null||existing.lat===undefined){ patch.lat=pk.lat; patch.lng=pk.lng; }
        }
        p=Object.keys(patch).length
          ? DATA.updateShop(existing.id,patch).then(function(){ return existing.id; })
          : Promise.resolve(existing.id);
      }else{
        p=DATA.addShop({
          name:shopName, wish:false, proposer:me,
          url:pk?pk.url:"", area:pk?pk.area:"",
          lat:pk?pk.lat:null, lng:pk?pk.lng:null
        });
      }
      return p.then(function(shopId){
        return DATA.addStamp({
          shopId:shopId, shopName:shopName, date:date, attendees:att.slice(),
          foodKo:foodKo, photoPaths:photoPath?[photoPath]:[],
          promptVer:settings().style||"B", by:me
        });
      }).then(function(){
        year=date.slice(0,4); onlyTemp=false; tab="album";
        closeSheet();
        toast("우표가 발행됐어요. 링크를 단톡방에 던지세요.");
      });
    });
  };
  f.appendChild(go);
  f.appendChild(el("div","hint","사진은 나중에 추가해도 됩니다. 밀린 날은 날짜만 바꿔서 발행하세요."));
  body.appendChild(f);
}

function sheetDetail(h,body){
  var st=stamps().filter(function(s){ return s.id===sheet.id; })[0];
  if(!st){ body.appendChild(el("div","empty","우표를 찾을 수 없어요.")); return; }
  h.textContent=st.shopName||"우표";
  var f=el("div","form");

  var box=el("div","detail-stamp");
  box.appendChild(stampEl(st,true));
  f.appendChild(box);

  var meta=el("div"); meta.style.textAlign="center";
  var dd=el("div",null,String(st.date||"").replace(/-/g,". "));
  dd.style.fontFamily="var(--f-mono)"; dd.style.fontSize="12px"; dd.style.color="var(--ink-soft)";
  meta.appendChild(dd);
  var food=el("div",null,st.foodKo||"");
  food.style.fontFamily="var(--f-disp)"; food.style.fontSize="18px"; food.style.fontWeight="700";
  meta.appendChild(food);
  var dw=dotsEl(st.attendees||[]);
  dw.style.justifyContent="center"; dw.style.marginTop="6px";
  meta.appendChild(dw);
  f.appendChild(meta);

  var lines=el("div","lines");
  MEMBERS.forEach(function(m){
    var it=el("div","lineitem");
    var who=el("div","who",memberName(m.id)||m.id);
    who.style.color=memberVar(m.id);
    it.appendChild(who);
    var txt=DATA.noteOf(st.id,m.id);
    if(m.id===me){
      var inp=document.createElement("input");
      inp.value=txt; inp.placeholder="한 줄 쓰기"; inp.maxLength=60; inp.id="line_"+st.id;
      var timer=null;
      inp.oninput=function(){
        clearTimeout(timer);
        timer=setTimeout(function(){
          guard(function(){ return DATA.setNote(st.id,m.id,inp.value.trim()); });
        },700);
      };
      it.appendChild(inp);
    }else{
      it.appendChild(el("div","txt"+(txt?"":" none"),txt||"—"));
    }
    lines.appendChild(it);
  });
  f.appendChild(lines);

  var r=el("div","row2");
  var art=el("button","btn", st.artPath?"그림 갈아끼우기":"🎨 그림 뽑기");
  art.onclick=function(){ openSheet({k:"art",id:st.id}); };
  r.appendChild(art);
  if((st.photoPaths||[]).length){
    var back=el("button","btn ghost","뒷면");
    back.onclick=function(){
      var pid=st.photoPaths[0];
      var d=el("div","drop");
      var im=document.createElement("img"); im.src=DATA.photoUrl(pid); im.alt="원본 사진";
      d.appendChild(im);
      back.replaceWith(d);
      d.after(saveLink(pid,"joahoe-photo.jpg","사진 저장"));
    };
    r.appendChild(back);
  }
  f.appendChild(r);

  if(isAdmin() && st.artPath){
    var isRef=(settings().refStampIds||[]).indexOf(st.id)>=0;
    var rb=el("button","btn ghost sm", isRef?"★ 기준 우표 해제":"☆ 기준 우표로 지정");
    rb.onclick=function(){
      var cur=(settings().refStampIds||[]).slice();
      if(isRef) cur=cur.filter(function(x){ return x!==st.id; });
      else { cur.push(st.id); if(cur.length>3) cur=cur.slice(-3); }
      guard(function(){
        return DATA.saveSettings({refStampIds:cur}).then(function(){
          toast(isRef?"기준에서 뺐어요.":"기준 우표로 지정했어요.");
          drawSheet();
        });
      });
    };
    f.appendChild(rb);
  }

  if(isAdmin()){
    var del=el("button","foldlink","이 우표 지우기");
    del.onclick=function(){
      del.textContent="정말 지울까요? 한 번 더 누르면 삭제됩니다";
      del.onclick=function(){
        guard(function(){
          return DATA.deleteStamp(st.id).then(function(){ closeSheet(); toast("지웠어요."); });
        });
      };
    };
    f.appendChild(del);
  }
  body.appendChild(f);
}

function sheetArt(h,body){
  var st=stamps().filter(function(s){ return s.id===sheet.id; })[0];
  if(!st){ body.appendChild(el("div","empty","우표를 찾을 수 없어요.")); return; }
  h.textContent="그림 뽑기";
  var f=el("div","form");
  var refs=(settings().refStampIds||[]).map(function(id){
    return stamps().filter(function(s){ return s.id===id; })[0];
  }).filter(function(s){ return s && s.artPath; });

  function step(no,what,sub){
    var s=el("div","step");
    s.appendChild(el("div","no",no));
    var w=el("div","what",what);
    if(sub) w.appendChild(el("small",null,sub));
    s.appendChild(w);
    return s;
  }
  var steps=el("div","steps");
  if(refs.length){
    var s1=step("1","기준 우표 "+refs.length+"장","지피티에 함께 첨부하세요");
    var rr=el("div","refrow");
    refs.forEach(function(r){
      var a=document.createElement("a");
      a.href=DATA.photoUrl(r.artPath); a.download="joahoe-ref.png"; a.target="_blank"; a.rel="noopener";
      var im=document.createElement("img"); im.src=DATA.photoUrl(r.artPath); im.alt="";
      a.appendChild(im); rr.appendChild(a);
    });
    s1.querySelector(".what").appendChild(rr);
    steps.appendChild(s1);
  }else{
    steps.appendChild(step("1","기준 우표가 아직 없어요",
      "첫 우표는 프롬프트만으로 뽑고, 마음에 들면 기준으로 지정하세요"));
  }
  if((st.photoPaths||[]).length){
    var s2=step("2","그날 음식 사진","같이 첨부하면 그 접시가 반영됩니다");
    s2.appendChild(saveLink(st.photoPaths[0],"joahoe-photo.jpg","저장"));
    steps.appendChild(s2);
  }else{
    steps.appendChild(step("2","음식 사진이 없어요","사진 없이 프롬프트만으로도 뽑을 수 있어요"));
  }
  steps.appendChild(step("3","아래 프롬프트","복사해서 붙여넣으세요"));
  f.appendChild(steps);

  var lEn=el("label","fld");
  lEn.appendChild(el("span",null,"음식 영문 설명"));
  var enIn=document.createElement("input");
  enIn.id="artEn"; enIn.value=st.foodEn||"";
  enIn.placeholder="thick-cut aged pork belly over charcoal";
  enIn.disabled=!isAdmin();
  lEn.appendChild(enIn);
  lEn.appendChild(el("div","hint","한글보다 영문 설명이 훨씬 잘 나옵니다."));
  f.appendChild(lEn);

  var lC=el("div","fld");
  lC.appendChild(el("span",null,"색"));
  var chips=el("div","chips");
  var curColor=st.color||"";
  COLORS.forEach(function(c){
    var b=el("button","chip"); b.type="button";
    b.style.background=c.hex; b.title=c.ko+" · "+c.en;
    b.setAttribute("aria-label",c.ko);
    b.setAttribute("aria-pressed",String(curColor===c.key));
    b.disabled=!isAdmin();
    b.onclick=function(){
      curColor=c.key;
      var all=chips.querySelectorAll(".chip");
      for(var i=0;i<all.length;i++) all[i].setAttribute("aria-pressed",String(COLORS[i].key===curColor));
      refresh();
    };
    chips.appendChild(b);
  });
  lC.appendChild(chips);
  var cname=el("div","hint","");
  lC.appendChild(cname);
  f.appendChild(lC);

  var pb=el("div","promptbox");
  var pre=el("pre");
  pb.appendChild(pre);
  f.appendChild(pb);
  var copy=el("button","btn","프롬프트 복사");
  f.appendChild(copy);

  function draft(){ return Object.assign({},st,{foodEn:enIn.value,color:curColor}); }
  function refresh(){
    pre.textContent=buildPrompt(draft());
    var c=colorOf(curColor);
    cname.textContent=c ? (c.ko+" · "+c.en) : "색을 고르면 프롬프트에 들어갑니다.";
  }
  enIn.oninput=refresh;
  refresh();

  copy.onclick=function(){
    var text=pre.textContent;
    var done=function(){
      copy.textContent="복사했어요";
      setTimeout(function(){ copy.textContent="프롬프트 복사"; },1600);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done,fallback);
    }else fallback();
    function fallback(){
      var r=document.createRange();
      r.selectNodeContents(pre);
      var sel=window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      toast("프롬프트를 선택했어요. 길게 눌러 복사하세요.");
    }
    if(isAdmin() && (enIn.value.trim()!==(st.foodEn||"") || curColor!==(st.color||""))){
      guard(function(){ return DATA.updateStamp(st.id,{foodEn:enIn.value.trim(),color:curColor}); });
    }
  };

  if(isAdmin()){
    var up=el("div","fld");
    up.appendChild(el("span",null,"다 뽑았으면"));
    var ub=el("button","btn ghost","그림 올리기");
    var ufi=document.createElement("input");
    ufi.type="file"; ufi.accept="image/*"; ufi.hidden=true; ufi.id="artUp";
    ub.onclick=function(){ ufi.click(); };
    ufi.onchange=function(){
      var file=ufi.files && ufi.files[0];
      if(!file) return;
      ub.textContent="올리는 중…";
      uploadImage(file,"art").then(function(path){
        if(!path){ ub.textContent="그림 올리기"; return; }
        guard(function(){
          return DATA.updateStamp(st.id,{
            artPath:path, foodEn:enIn.value.trim(), color:curColor, promptVer:settings().style||"B"
          }).then(function(){ closeSheet(); toast("정식 우표가 됐어요."); });
        });
      });
    };
    up.appendChild(ub); up.appendChild(ufi);
    f.appendChild(up);
  }else{
    f.appendChild(el("div","hint","그림은 관리자가 올립니다. 뽑은 그림을 단톡방에 보내주세요."));
  }
  body.appendChild(f);
}

function sheetWish(h,body){
  h.textContent="가고 싶은 곳 추가";
  var f=el("div","form");
  var l1=el("label","fld"); l1.appendChild(el("span",null,"가게"));
  var n=document.createElement("input"); n.id="wishName"; n.placeholder="성수 타코집";
  l1.appendChild(n); f.appendChild(l1);

  var l2=el("label","fld"); l2.appendChild(el("span",null,"한 줄 이유 (선택)"));
  var r=document.createElement("input"); r.id="wishWhy"; r.placeholder="사진 보고 뿅 감"; r.maxLength=40;
  l2.appendChild(r); f.appendChild(l2);

  var l3=el("label","fld"); l3.appendChild(el("span",null,"링크 (선택)"));
  var u=document.createElement("input"); u.id="wishUrl"; u.type="url"; u.inputMode="url";
  u.placeholder="카카오맵 · 네이버 · 인스타 주소";
  l3.appendChild(u);
  l3.appendChild(el("div","hint","지도 앱 링크를 넣으면 목록에서 바로 열립니다."));
  f.appendChild(l3);

  var l4=el("label","fld"); l4.appendChild(el("span",null,"동네 (선택)"));
  var ar=document.createElement("input"); ar.id="wishArea"; ar.placeholder="성수"; ar.maxLength=12;
  ar.setAttribute("list","areaListW");
  l4.appendChild(ar); l4.appendChild(areaDatalist("areaListW"));
  l4.appendChild(el("div","hint","지도 탭에서 동네별로 묶입니다."));
  f.appendChild(l4);

  var pick=null;
  var ps=placeSearch(function(p){
    n.value=p.name; u.value=p.url; if(p.area) ar.value=p.area;
    pick=p;
  });
  if(ps) f.insertBefore(ps,l1);

  var b=el("button","btn","추가하기");
  b.onclick=function(){
    var name=n.value.trim();
    if(!name){ toast("가게 이름을 적어주세요."); return; }
    if(shops().some(function(s){ return s.name===name && s.wish; })){ toast("이미 목록에 있어요."); return; }
    var raw=u.value.trim(), safe=safeUrl(raw);
    if(raw && !safe){ toast("링크 주소를 확인해주세요."); return; }
    guard(function(){
      return DATA.addShop({
        name:name, wish:true, proposer:me, reason:r.value.trim(), url:safe, area:ar.value.trim(),
        // 검색으로 고른 가게면 좌표도 같이 담아둔다 (이름을 직접 고쳤으면 버린다)
        lat:(pick && pick.name===name) ? pick.lat : null,
        lng:(pick && pick.name===name) ? pick.lng : null
      }).then(function(id){
        return id ? DATA.setLike(id,me,true) : null;
      }).then(function(){
        tab="wish"; closeSheet();
        toast("추가했어요. 둘이 👍 하면 만장일치예요.");
      });
    });
  };
  f.appendChild(b);
  f.appendChild(el("div","hint","추가하면 내 👍 는 자동으로 들어갑니다. 반대 버튼은 없어요."));
  body.appendChild(f);
}

function areaDatalist(id){
  var seen={}, dl=document.createElement("datalist");
  dl.id=id;
  shops().forEach(function(x){
    var a=(x.area||"").trim();
    if(a && !seen[a]){ seen[a]=1; }
  });
  Object.keys(seen).sort(function(a,b){ return a.localeCompare(b,"ko"); }).forEach(function(a){
    var o=document.createElement("option"); o.value=a; dl.appendChild(o);
  });
  return dl;
}

function sheetShop(h,body){
  var s=shops().filter(function(x){ return x.id===sheet.id; })[0];
  if(!s){ body.appendChild(el("div","empty","찾을 수 없어요.")); return; }
  h.textContent=s.name;
  var f=el("div","form");
  var mine=stamps().filter(function(x){ return x.shopId===s.id; })
    .sort(function(a,b){ return String(b.date||"").localeCompare(String(a.date||"")); });

  f.appendChild(el("div","hint", s.wish
    ? (memberName(s.proposer)||"누군가")+" 추천 · 👍 "+likeScore(s)+"명"
    : "우표 "+mine.length+"장"));
  var ln=linkEl(s.url);
  if(ln){ var w=el("div"); w.appendChild(ln); f.appendChild(w); }

  if(mine.length){
    f.appendChild(el("div","sect","우표"));
    var t=el("div","thumbs");
    mine.forEach(function(st){
      var b=el("button");
      var path=st.artPath || (st.photoPaths && st.photoPaths[0]);
      if(path){
        var im=document.createElement("img");
        im.src=DATA.photoUrl(path); im.alt=st.foodKo||"";
        if(!st.artPath) im.className="t";
        b.appendChild(im);
      }else{
        var sp=el("span",null,fmtMD(st.date));
        sp.style.fontFamily="var(--f-mono)"; sp.style.fontSize="11px"; sp.style.color="var(--ink-soft)";
        b.appendChild(sp);
      }
      b.title=(st.foodKo||"")+" "+fmtMD(st.date);
      b.onclick=function(){ openSheet({k:"detail",id:st.id}); };
      t.appendChild(b);
    });
    f.appendChild(t);
  }

  if(!isAdmin()){
    f.appendChild(el("div","sect","가게 정보"));
    var info=el("div","hint");
    info.textContent=(s.area?("동네 "+s.area):"동네 미지정")+" · 수정은 관리자만 할 수 있어요.";
    f.appendChild(info);
    body.appendChild(f);
    return;
  }

  f.appendChild(el("div","sect","가게 정보"));
  var l1=el("label","fld"); l1.appendChild(el("span",null,"이름"));
  var nIn=document.createElement("input"); nIn.id="shn"; nIn.value=s.name||"";
  l1.appendChild(nIn); f.appendChild(l1);

  var l2=el("label","fld"); l2.appendChild(el("span",null,"링크"));
  var uIn=document.createElement("input"); uIn.id="shu"; uIn.type="url"; uIn.inputMode="url";
  uIn.value=s.url||""; uIn.placeholder="카카오맵 · 네이버 · 인스타 주소";
  l2.appendChild(uIn);
  l2.appendChild(el("div","hint","지도 앱 링크를 넣으면 목록에서 바로 열립니다."));
  f.appendChild(l2);

  var l3=el("label","fld"); l3.appendChild(el("span",null,"동네"));
  var aIn=document.createElement("input"); aIn.id="sha"; aIn.value=s.area||"";
  aIn.placeholder="성수"; aIn.maxLength=12; aIn.setAttribute("list","areaListS");
  l3.appendChild(aIn); l3.appendChild(areaDatalist("areaListS"));
  l3.appendChild(el("div","hint","지도 탭에서 동네별로 묶입니다."));
  f.appendChild(l3);

  var pick=null;
  var ps=placeSearch(function(p){
    nIn.value=p.name; uIn.value=p.url; if(p.area) aIn.value=p.area;
    pick=p;
  });
  if(ps) f.insertBefore(ps,l1);

  var sv=el("button","btn","저장");
  sv.onclick=function(){
    var nm=nIn.value.trim();
    if(!nm){ toast("가게 이름을 적어주세요."); return; }
    var raw=uIn.value.trim(), safe=safeUrl(raw);
    if(raw && !safe){ toast("링크 주소를 확인해주세요."); return; }
    var patch={name:nm,url:safe,area:aIn.value.trim()};
    // 검색으로 고른 가게일 때만 좌표를 건드린다. 손으로 고친 경우 기존 좌표를 지우지 않는다.
    if(pick && pick.name===nm){ patch.lat=pick.lat; patch.lng=pick.lng; }
    guard(function(){
      return DATA.updateShop(s.id,patch).then(function(){
        if(nm===s.name) return null;
        return Promise.all(stamps().filter(function(x){ return x.shopId===s.id; })
          .map(function(st){ return DATA.updateStamp(st.id,{shopName:nm}); }));
      }).then(function(){ toast("저장했어요."); closeSheet(); });
    });
  };
  f.appendChild(sv);

  if(s.wish){
    var fold=el("button","btn ghost", s.folded?"다시 펼치기":"접어두기");
    fold.onclick=function(){
      guard(function(){
        return DATA.updateShop(s.id,{folded:!s.folded}).then(function(){
          closeSheet();
          toast(s.folded?"다시 펼쳤어요.":"접어뒀어요. 언제든 펼칠 수 있어요.");
        });
      });
    };
    f.appendChild(fold);
    var del=el("button","foldlink","이 추천 지우기");
    del.onclick=function(){
      del.textContent="정말 지울까요? 한 번 더 누르면 삭제됩니다";
      del.onclick=function(){
        guard(function(){
          return DATA.deleteShop(s.id).then(function(){ closeSheet(); toast("지웠어요."); });
        });
      };
    };
    f.appendChild(del);
  }
  body.appendChild(f);
}

function sheetVisited(h,body){
  h.textContent="다녀온 곳";
  var f=el("div","form");
  var vs=visitedShops().slice().sort(function(a,b){
    return String(b.visitedAt||"").localeCompare(String(a.visitedAt||""));
  });
  if(!vs.length){
    f.appendChild(el("div","hint","아직 없어요."));
    body.appendChild(f);
    return;
  }
  var g=el("div","mgroup");
  vs.forEach(function(s){ g.appendChild(shopRow(s)); });
  f.appendChild(g);
  f.appendChild(el("div","hint","가게를 누르면 링크와 동네를 볼 수 있어요."));
  body.appendChild(f);
}

function sheetLogin(h,body){
  h.textContent="관리자 로그인";
  var f=el("div","form");
  if(isAdmin()){
    f.appendChild(el("div","hint",DATA.email+" 으로 로그인됨"));
    var out=el("button","btn ghost","로그아웃");
    out.onclick=function(){
      guard(function(){ return DATA.signOut().then(function(){ closeSheet(); toast("로그아웃했어요."); }); });
    };
    f.appendChild(out);
    body.appendChild(f);
    return;
  }
  f.appendChild(el("div","hint","우표 발행과 사진 올리기는 관리자만 할 수 있어요. 이 기기에서 한 번만 로그인하면 계속 유지됩니다."));
  var l1=el("label","fld"); l1.appendChild(el("span",null,"이메일"));
  var em=document.createElement("input"); em.type="email"; em.id="loginEmail"; em.autocomplete="username";
  l1.appendChild(em); f.appendChild(l1);
  var l2=el("label","fld"); l2.appendChild(el("span",null,"비밀번호"));
  var pw=document.createElement("input"); pw.type="password"; pw.id="loginPw"; pw.autocomplete="current-password";
  l2.appendChild(pw); f.appendChild(l2);
  var b=el("button","btn","로그인");
  b.onclick=function(){
    if(!em.value.trim()||!pw.value){ toast("이메일과 비밀번호를 넣어주세요."); return; }
    b.textContent="확인 중…";
    DATA.signIn(em.value.trim(),pw.value).then(function(){
      closeSheet(); toast("로그인했어요.");
    }).catch(function(){
      b.textContent="로그인";
      toast("이메일이나 비밀번호가 맞지 않아요.");
    });
  };
  f.appendChild(b);
  body.appendChild(f);
}

function sheetSettings(h,body){
  h.textContent="설정";
  var f=el("div","form");

  f.appendChild(el("div","sect","나"));
  var who=el("div","pick");
  MEMBERS.forEach(function(m){
    var b=el("button"); b.type="button";
    b.setAttribute("aria-pressed",String(me===m.id));
    var sw=el("span","swatch"); sw.style.background=memberVar(m.id);
    b.appendChild(sw); b.appendChild(el("span",null,memberName(m.id)||m.id));
    b.onclick=function(){ me=m.id; lsSet(LS_ME,m.id); drawSheet(); render(); };
    who.appendChild(b);
  });
  f.appendChild(who);

  f.appendChild(el("div","sect","관리자"));
  if(isAdmin()){
    f.appendChild(el("div","hint",DATA.email+" 으로 로그인됨 · 우표 발행과 사진 올리기 가능"));
    var out=el("button","btn ghost sm","로그아웃");
    out.onclick=function(){
      guard(function(){ return DATA.signOut().then(function(){ drawSheet(); render(); }); });
    };
    f.appendChild(out);
  }else{
    f.appendChild(el("div","hint","지금은 보기 전용입니다. 가고 싶은 곳 추가, 👍, 한 줄은 그대로 됩니다."));
    var lb=el("button","btn ghost sm","관리자 로그인");
    lb.onclick=function(){ openSheet({k:"login"}); };
    f.appendChild(lb);
  }

  if(isAdmin()){
    f.appendChild(el("div","sect","이름"));
    var ins=MEMBERS.map(function(m,i){
      var l=el("label","fld");
      l.appendChild(el("span",null,"멤버 "+(i+1)));
      var inp=document.createElement("input");
      inp.id="setnm_"+m.id; inp.value=memberName(m.id); inp.maxLength=8;
      l.appendChild(inp); f.appendChild(l);
      return inp;
    });
    var sv=el("button","btn ghost","이름 저장");
    sv.onclick=function(){
      guard(function(){
        return DATA.saveSettings({
          members: MEMBERS.map(function(m,i){ return {id:m.id,name:ins[i].value.trim()||memberName(m.id)}; })
        }).then(function(){ toast("저장했어요."); });
      });
    };
    f.appendChild(sv);

    f.appendChild(el("div","sect","우표 스타일"));
    var stp=el("div","pick");
    [["B","플랫 일러스트"],["A","빈티지 우표"]].forEach(function(pair){
      var b=el("button"); b.type="button";
      b.setAttribute("aria-pressed",String((settings().style||"B")===pair[0]));
      b.appendChild(el("span",null,pair[1]));
      b.onclick=function(){
        guard(function(){
          return DATA.saveSettings({style:pair[0]}).then(function(){
            drawSheet(); toast(pair[1]+"로 바꿨어요.");
          });
        });
      };
      stp.appendChild(b);
    });
    f.appendChild(stp);
    f.appendChild(el("div","hint","재시도 없이 한 번에 쓰려면 플랫 일러스트가 안전합니다."));
  }

  var refs=(settings().refStampIds||[]).map(function(id){
    return stamps().filter(function(s){ return s.id===id; })[0];
  }).filter(function(s){ return s && s.artPath; });
  f.appendChild(el("div","sect","기준 우표 "+refs.length+"/3"));
  if(refs.length){
    var rr=el("div","refrow");
    refs.forEach(function(r){
      var a=document.createElement("a");
      a.href=DATA.photoUrl(r.artPath); a.download="joahoe-ref.png"; a.target="_blank"; a.rel="noopener";
      var im=document.createElement("img"); im.src=DATA.photoUrl(r.artPath); im.alt="";
      a.appendChild(im); rr.appendChild(a);
    });
    f.appendChild(rr);
  }else{
    f.appendChild(el("div","hint","마음에 드는 그림 우표를 열어 ‘기준 우표로 지정’ 하세요. 지피티에 함께 첨부하면 스타일이 유지됩니다."));
  }

  f.appendChild(el("div","sect","링크"));
  var share=el("div","hint");
  share.textContent="이 주소를 셋이 공유하세요: "+location.href.split("#")[0];
  f.appendChild(share);
  var cp=el("button","btn ghost sm","링크 복사");
  cp.onclick=function(){
    var url=location.href.split("#")[0];
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ toast("링크를 복사했어요."); },
                                             function(){ toast("주소창의 링크를 복사해주세요."); });
    }else toast("주소창의 링크를 복사해주세요.");
  };
  f.appendChild(cp);
  body.appendChild(f);
}

/* ── 연결 ───────────────────────────────────────────────── */
$("#tabAlbum").onclick=function(){ tab="album"; render(); };
$("#tabWish").onclick=function(){ tab="wish"; render(); };
$("#tabMap").onclick=function(){ tab="map"; render(); };
$("#whoBtn").onclick=function(){ openSheet({k:"settings"}); };
$("#fabBtn").onclick=function(){ openSheet({k:"new"}); };

me=lsGet(LS_ME);
render();
DATA.init(function(){
  if(sheet) drawSheet();
  render();
});
})();
