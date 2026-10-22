/* 좋아회 — 화면
 * 데이터는 DATA(data.js)만 통해서 읽고 쓴다.
 * 관리자(로그인)만 우표를 발행하고 사진·그림을 올린다.
 * 가고 싶은 곳 추가, 👍, 한 줄은 누구나.
 */
(function(){
"use strict";

/* 멤버는 모임마다 다르고 수도 달라진다. settings.members 가 유일한 출처.
   [{id,name,c}] — c 는 색 팔레트(--mc0..--mc7) 번호. */
var MC = 8;
function members(){
  // 색(c)이 없던 옛 데이터는 순서대로 칠한다 — 예전 m1·m2·m3 색과 같아진다.
  return (settings().members||[])
    .filter(function(m){ return m && m.id; })
    .map(function(m,i){
      return {id:m.id, name:m.name||"", c:(typeof m.c==="number"?m.c:i)%MC};
    });
}
function memberIds(){ return members().map(function(m){ return m.id; }); }
function memberCount(){ return members().length; }
function nextMemberId(){
  var used={}; members().forEach(function(m){ used[m.id]=1; });
  for(var i=1;i<200;i++){ if(!used["m"+i]) return "m"+i; }
  return "m"+Date.now();
}
function freeColor(){
  var used={}; members().forEach(function(m){ used[(m.c|0)%MC]=1; });
  for(var i=0;i<MC;i++){ if(!used[i]) return i; }
  return members().length%MC;
}
var COLORS = [
  {key:"brick",   ko:"벽돌색",     en:"brick red",     hex:"#B6422F"},
  {key:"mustard", ko:"머스터드",   en:"mustard yellow",hex:"#C99A2E"},
  {key:"olive",   ko:"올리브",     en:"olive green",   hex:"#6E7F3A"},
  {key:"teal",    ko:"딥틸",       en:"deep teal",     hex:"#2A6B70"},
  {key:"orange",  ko:"번트오렌지", en:"burnt orange",  hex:"#C4652A"},
  {key:"plum",    ko:"플럼",       en:"plum purple",   hex:"#7A4A74"}
];
var LS_ME = "joahoe.me";
var LS_GID = "joahoe.gid";

/* 모임은 주소에 담긴다 — .../joahoe/#g=<모임키>
 * 받은 사람은 자기 모임만 본다. 모임 전환기는 관리자에게만 보인다.
 * 가리는 게 아니라 안 보여주는 것이다. 기술적으로 막으려면 모임마다
 * Supabase 프로젝트를 나눠야 한다 (기획서 §1 참고). */
function hashGid(){
  var m=String(location.hash||"").match(/[#&]g=([A-Za-z0-9_-]+)/);
  return m ? m[1] : "";
}
function groupLink(){
  return location.href.split("#")[0] + "#g=" + DATA.gid;
}
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
function settings(){ return DATA.settings || {id:"app",name:"좋아회",style:"B",members:[],refStampIds:[],areaPos:{}}; }
function memberName(id){
  var m=(settings().members||[]).filter(function(x){ return x.id===id; })[0];
  return (m && m.name) || "";
}
function memberVar(id){
  var m=members().filter(function(x){ return x.id===id; })[0];
  return m ? "var(--mc"+((m.c|0)%MC)+")" : "var(--ink-soft)";
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

/* ── 메뉴 추천 — "뭐 먹지"에서 멈춘 걸 풀어준다 ───────────
 * 가게를 골라주지 않는다. 가게는 메뉴를 정한 다음 사람이 고른다.
 * 그래서 바깥 API를 쓰지 않는다 — 목록은 아래에 그냥 적혀 있고,
 * 우표에 적은 음식 이름과 맞춰 "언제 먹었는지"만 붙인다.
 * 한 글자 이름은 엉뚱한 데 걸리니(회 → 회덮밥) 목록에 두지 않는다.
 */
var MENUS=[
  {ko:"아무거나", items:null},
  {ko:"고기", items:["삼겹살","목살","돼지갈비","갈매기살","항정살","소갈비","등심구이","차돌박이",
                     "양꼬치","닭갈비","찜닭","닭볶음탕","닭한마리","치킨","닭강정","족발","보쌈",
                     "수육","곱창","막창","오리고기","제육볶음","불고기","닭발"]},
  {ko:"국물", items:["김치찌개","된장찌개","부대찌개","순두부","감자탕","갈비탕","설렁탕","삼계탕",
                     "육개장","해장국","순댓국","콩나물국밥","추어탕","매운탕","알탕","동태탕",
                     "곰탕","미역국","김치찜","어묵탕","떡국","수제비","만둣국"]},
  {ko:"면",   items:["칼국수","막국수","물냉면","비빔냉면","밀면","잔치국수","비빔국수","콩국수",
                     "쫄면","짜장면","간짜장","짬뽕","라멘","우동","소바","파스타","쌀국수","마라탕"]},
  {ko:"밥",   items:["비빔밥","돌솥비빔밥","백반","한정식","국밥","볶음밥","오므라이스","김밥",
                     "초밥","회덮밥","연어덮밥","제육덮밥","오징어덮밥","낙지덮밥","알밥",
                     "카레라이스","리조또","쌈밥","곤드레밥","전복죽"]},
  {ko:"해산물", items:["모둠회","물회","산낙지","조개구이","대게","꽃게찜","간장게장","장어구이",
                       "아귀찜","해물찜","전복요리","굴요리","낙지볶음","쭈꾸미볶음","오징어볶음",
                       "골뱅이무침","생선구이","갈치조림","새우구이","해물탕"]},
  {ko:"분식·전", items:["떡볶이","라볶이","순대","모둠튀김","어묵","떡꼬치","라면","만두","호떡",
                        "핫도그","토스트","파전","김치전","감자전","녹두전","모둠전","부추전"]},
  // 야식은 새 음식이라기보다 "늦은 밤에 시키는 것들"이다 — 다른 계열과 일부러 겹친다
  {ko:"야식", items:["치킨","닭강정","닭발","닭똥집","닭꼬치","족발","보쌈","곱창","막창","양꼬치",
                     "떡볶이","라볶이","라면","순대","모둠튀김","감자튀김","두부김치","계란말이",
                     "만두","피자","마라탕","어묵탕","골뱅이무침"]},
  {ko:"중식", items:["탕수육","크림새우","깐풍기","유린기","라조기","팔보채","유산슬","동파육",
                     "양장피","멘보샤","꿔바로우","고추잡채","마파두부","딤섬","마라샹궈","훠궈"]},
  {ko:"일식", items:["초밥","오마카세","사시미","돈카츠","규카츠","가츠동","규동","텐동",
                     "장어덮밥","오코노미야키","야키소바","타코야키","야키토리","스키야키","샤브샤브"]},
  {ko:"양식", items:["피자","스테이크","폭립","수제버거","브런치","샐러드","샌드위치","감바스",
                     "라자냐","파에야","그라탕","피시앤칩스","나초","타코","부리토","스튜"]},
  {ko:"아시아", items:["팟타이","푸팟퐁커리","분짜","짜조","반쎄오","똠얌꿍","반미","나시고렝",
                       "사테","커리","탄두리치킨","케밥","양고기구이","월남쌈"]},
  {ko:"디저트", items:["빙수","케이크","티라미수","와플","크레페","크로플","도넛","아이스크림",
                       "붕어빵","탕후루","타르트","에그타르트","마카롱","쿠키","스콘","슈크림",
                       "찹쌀떡","약과","푸딩","밀크티"]}
];
/* 계열 하나, 또는 전부를 한 벌로 (같은 이름은 한 번만) */
function menuPool(i){
  var c=MENUS[i]||MENUS[0];
  if(c.items) return c.items.slice();
  var out=[], seen={};
  MENUS.forEach(function(x){
    (x.items||[]).forEach(function(n){ if(!seen[n]){ seen[n]=1; out.push(n); } });
  });
  return out;
}
/* 목록 안에서 나를 품는 더 긴 이름들 — 탕수육⊃수육, 에그타르트⊃타르트 같은 짝.
   한 번만 만들어 둔다 (MENUS 는 바뀌지 않는다). */
var MENU_LONGER=null;
function longerNames(name){
  if(!MENU_LONGER){
    MENU_LONGER={};
    var all=menuPool(0);
    all.forEach(function(a){
      MENU_LONGER[a]=all.filter(function(b){ return b!==a && b.indexOf(a)>=0; });
    });
  }
  return MENU_LONGER[name]||[];
}
/* 우표에 적은 음식 이름과 맞춰 본다 — "숙성 삼겹살" 은 삼겹살로 친다.
   탕수육을 먹은 걸 수육으로 치면 안 되니, 더 긴 이름은 먼저 지우고 찾는다. */
function menuAte(name){
  var longer=longerNames(name);
  var hit=stamps().filter(function(s){
    var t=String(s.foodKo||"");
    longer.forEach(function(b){ t=t.split(b).join(" "); });
    return t.indexOf(name)>=0;
  });
  if(!hit.length) return null;
  var last=hit.map(function(s){ return String(s.date||""); }).sort().pop();
  return {n:hit.length, date:last};
}
function agoLabel(iso){
  var d=daysSince(iso);
  if(d<=0) return "오늘";
  if(d<14) return d+"일 전";
  if(d<60) return Math.round(d/7)+"주 전";
  return Math.floor(d/30)+"개월 전";
}
/* 이미 위시에 있는 이름은 다시 권하지 않는다 (접어둔 것도 포함 — 겹쳐 담기지 않게) */
function menuWished(name){
  var s=String(name||"").trim();
  return shops().some(function(x){ return x.wish && String(x.name).trim()===s; });
}
function menuAdd(name){
  return DATA.addShop({ name:name, kind:"menu", wish:true, proposer:me, reason:"" })
    .then(function(id){ return id ? DATA.setLike(id,me,true) : null; });
}

/* ── 데이터 뷰 ──────────────────────────────────────────── */
/* 지금 보고 있는 모임 것만 본다 */
function stamps(){ return DATA.stamps.filter(function(x){ return (x.gid||"app")===DATA.gid; }); }
function shops(){ return DATA.shops.filter(function(x){ return (x.gid||"app")===DATA.gid; }); }
function likeScore(s){ return DATA.likesOf(s.id).filter(function(m){ return memberIds().indexOf(m)>=0; }).length; }
/* 만장일치 = 그 모임 멤버 전원. 멤버가 없으면 만장일치도 없다. */
function allLiked(s){ var n=memberCount(); return n>0 && likeScore(s)>=n; }
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
/* 메뉴 줄 — 가게가 아니다. 이름만 있고 링크·동네·좌표가 없어서 지도에 찍지 않는다. */
function isMenu(s){ return s.kind==="menu"; }
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
  var usable=named && me && members().some(function(m){ return m.id===me; });
  $("#hdr").hidden=!usable;
  $("#fab").hidden=!usable || tab!=="album" || !isAdmin();
  var t=$(".brand h1"); if(t) t.textContent=settings().name||"좋아회";

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
    d.appendChild(el("p",null,"관리자가 멤버 이름을 넣으면 우표첩이 열립니다."));
    var lb=el("button","btn ghost","관리자 로그인");
    lb.onclick=function(){ openSheet({k:"login"}); };
    d.appendChild(lb);
    return d;
  }
  d.appendChild(el("h2",null,settings().name+" — 멤버를 적어주세요"));
  d.appendChild(el("p",null,"우표에 참석 표시로 들어갑니다. 나중에 더하거나 바꿀 수 있어요."));
  var f=el("div","form");
  var draft=members().slice();
  while(draft.length<3) draft.push({id:nextMemberId(),name:"",c:(draft.length)%MC});
  var ins=draft.map(function(m,i){
    var l=el("label","fld");
    l.appendChild(el("span",null,"멤버 "+(i+1)));
    var inp=document.createElement("input");
    inp.id="su_"+m.id; inp.maxLength=8; inp.value=m.name||"";
    inp.placeholder=["나","민","수"][i]||("멤버 "+(i+1));
    l.appendChild(inp); f.appendChild(l);
    return inp;
  });
  var b=el("button","btn","시작하기");
  b.onclick=function(){
    var out=[];
    draft.forEach(function(m,i){
      var nm=ins[i].value.trim();
      if(nm) out.push({id:m.id,name:nm,c:(m.c|0)%MC});
    });
    if(out.length<2){ toast("적어도 두 명은 적어주세요."); return; }
    guard(function(){ return DATA.saveSettings({members:out}); });
  };
  f.appendChild(b);
  f.appendChild(el("div","hint","빈 칸은 건너뜁니다. 멤버는 설정에서 더 넣을 수 있어요."));
  d.appendChild(f);
  return d;
}

function viewWho(){
  var d=el("div","center");
  d.appendChild(el("h2",null,"누구세요?"));
  d.appendChild(el("p",null,"이 기기에만 저장돼요."));
  var w=el("div","who3");
  members().forEach(function(m){
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
  members().forEach(function(m){
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
  var hit=all.filter(allLiked);
  var rest=all.filter(function(s){ return !allLiked(s); });

  if(!all.length){
    var e=el("div","empty");
    e.appendChild(el("div","t","가고 싶은 곳이 없어요"));
    e.appendChild(el("div","s","모두 👍 하면 맨 위에서 반짝입니다. 그게 다음 약속이 돼요."));
    var ab=el("button","btn sm","＋ 추가");
    ab.onclick=function(){ openSheet({k:"wish"}); };
    e.appendChild(ab);
    frag.appendChild(e);
  }else{
    if(hit.length){
      frag.appendChild(el("div","sect","★ 모두 가고 싶은 곳"));
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
  var rb=el("button","btn ghost","🎲 뭐 먹지");
  rb.onclick=function(){ openSheet({k:"menu"}); };
  add.appendChild(rb);
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
  if(isMenu(s)) mr.appendChild(el("span","area","메뉴"));
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
      if(on && memberCount()>1 && cur.length===memberCount()-1){
        toast("모두 가고 싶은 집이 생겼어요. 단톡방에 알리세요!");
      }
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
    if(wish && allLiked(s)){
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
    bits.push("가고 싶은 곳 · 👍 "+likeScore(s)+"/"+memberCount());
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
  row.appendChild(el("span","st",s.wish?("★ "+likeScore(s)+"/"+memberCount()):("우표 "+cnt)));
  return row;
}

function viewMap(){
  var frag=document.createDocumentFragment();
  // 메뉴 줄은 가게가 아니라서 지도에 올리지 않는다
  var list=shops().filter(function(s){ return !isMenu(s) && !(s.wish && s.folded); });
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
        : "가고 싶은 곳은 눌러서 동네를 적을 수 있어요 · 다녀온 가게는 관리자가 적습니다"));
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
/* 시트 안에서 글자를 치고 있는 중인가.
   한 줄 메모는 입력이 멎으면 저장되고, 저장되면 데이터가 새로 와서 화면을 다시 그린다.
   그때 입력칸이 통째로 새로 만들어지면 모바일에서 키보드가 내려가 버린다. */
function typingInSheet(){
  var ae=document.activeElement, host=$("#sheets");
  return !!(ae && host && host.contains(ae) &&
            (ae.tagName==="INPUT" || ae.tagName==="TEXTAREA"));
}
function drawSheet(){
  var host=$("#sheets");
  // 다시 그려야만 할 때를 대비한 안전망 — 포커스와 커서 자리를 되돌려 놓는다.
  var ae=document.activeElement, keep=null;
  if(ae && host.contains(ae) && (ae.tagName==="INPUT"||ae.tagName==="TEXTAREA") && ae.id){
    keep={id:ae.id, v:ae.value, s:ae.selectionStart, e:ae.selectionEnd};
  }
  host.innerHTML="";
  if(!sheet) return;
  drawSheetBody(host);
  if(keep){
    var n=document.getElementById(keep.id);
    if(n){
      if(n.value!==keep.v) n.value=keep.v;
      try{ n.focus({preventScroll:true}); n.setSelectionRange(keep.s,keep.e); }catch(e){}
    }
  }
}
function drawSheetBody(host){
  var w=el("div","sheet"), inn=el("div","in");
  w.appendChild(inn); host.appendChild(w);
  var bar=el("div","bar");
  var h=el("h2",null,"");
  var x=el("button",null,"닫기"); x.onclick=closeSheet;
  bar.appendChild(h); bar.appendChild(x); inn.appendChild(bar);
  var body=el("div"); inn.appendChild(body);
  var map={"new":sheetNew,"detail":sheetDetail,"art":sheetArt,"wish":sheetWish,"shop":sheetShop,
           "visited":sheetVisited,"settings":sheetSettings,"login":sheetLogin,"menu":sheetMenu};
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
  // 메뉴 줄은 가게 이름이 아니다 — 자동완성에서 뺀다
  var wishShops=wishList().filter(function(s){ return !isMenu(s); });
  wishShops.concat(visitedShops()).forEach(function(s){
    var o=document.createElement("option"); o.value=s.name; dl.appendChild(o);
  });
  lShop.appendChild(shopIn); lShop.appendChild(dl);
  if(wishShops.length){
    lShop.appendChild(el("div","hint","★ 가고 싶은 곳: "+
      wishShops.slice(0,3).map(function(s){ return s.name; }).join(" · ")));
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
  var att=memberIds();
  members().forEach(function(m){
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
  members().forEach(function(m){
    var it=el("div","lineitem");
    var who=el("div","who",memberName(m.id)||m.id);
    who.style.color=memberVar(m.id);
    it.appendChild(who);
    var txt=DATA.noteOf(st.id,m.id);
    if(m.id===me){
      var inp=document.createElement("input");
      inp.value=txt; inp.placeholder="한 줄 쓰기"; inp.maxLength=60; inp.id="line_"+st.id;
      var timer=null, saved=txt;
      function save(){
        clearTimeout(timer);
        var v=inp.value.trim();
        if(v===saved) return;
        saved=v;
        guard(function(){ return DATA.setNote(st.id,m.id,v); });
      }
      // 치는 동안에는 미루고, 칸을 떠날 때는 확실히 저장한다.
      inp.oninput=function(){ clearTimeout(timer); timer=setTimeout(save,1200); };
      inp.onblur=save;
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

  /* 가고 싶은 곳은 셋 다 고치고 지울 수 있다 (RLS 도 wish = true 인 줄만 열어둔다).
     다녀온 가게는 우표가 걸려 있어서 관리자만 손댄다. */
  var canEdit = isAdmin() || s.wish;
  var reasonIn = null;

  /* 메뉴 줄은 가게가 아니다 — 고칠 게 이름뿐이고, 링크·동네 칸은 보여주지 않는다. */
  if(isMenu(s)){
    if(!canEdit){
      f.appendChild(el("div","hint","메뉴예요. 👍 는 목록에서 누르면 돼요."));
      body.appendChild(f);
      return;
    }
    f.appendChild(el("div","sect","메뉴"));
    var ml=el("label","fld"); ml.appendChild(el("span",null,"이름"));
    var mIn=document.createElement("input"); mIn.id="mnn"; mIn.value=s.name||"";
    ml.appendChild(mIn); f.appendChild(ml);
    f.appendChild(reasonField());
    var msv=el("button","btn","저장");
    msv.onclick=function(){
      var nm=mIn.value.trim();
      if(!nm){ toast("메뉴 이름을 적어주세요."); return; }
      guard(function(){
        return DATA.updateShop(s.id,{name:nm, reason:reasonIn.value.trim()})
          .then(function(){ toast("저장했어요."); closeSheet(); });
      });
    };
    f.appendChild(msv);
    f.appendChild(foldBtn()); f.appendChild(delBtn());
    body.appendChild(f);
    return;
  }

  if(!canEdit){
    f.appendChild(el("div","sect","가게 정보"));
    var info=el("div","hint");
    info.textContent=(s.area?("동네 "+s.area):"동네 미지정")+
      " · 다녀온 가게라 수정은 관리자만 할 수 있어요.";
    f.appendChild(info);
    body.appendChild(f);
    return;
  }

  f.appendChild(el("div","sect","가게 정보"));
  var l1=el("label","fld"); l1.appendChild(el("span",null,"이름"));
  var nIn=document.createElement("input"); nIn.id="shn"; nIn.value=s.name||"";
  l1.appendChild(nIn); f.appendChild(l1);

  if(s.wish) f.appendChild(reasonField());

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
    if(s.wish) patch.reason=reasonIn.value.trim();
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

  if(s.wish){ f.appendChild(foldBtn()); f.appendChild(delBtn()); }
  body.appendChild(f);

  /* 한 줄 이유 — 가고 싶은 곳 카드에 「누구: 이유」로 뜨는 그 줄.
     쓴 사람이 아니어도 고칠 수 있다. 셋이 같이 쓰는 목록이라 그렇다. */
  function reasonField(){
    var l=el("label","fld"); l.appendChild(el("span",null,"한 줄 이유 (선택)"));
    reasonIn=document.createElement("input");
    reasonIn.id="shr"; reasonIn.value=s.reason||"";
    reasonIn.placeholder="사진 보고 뿅 감"; reasonIn.maxLength=40;
    l.appendChild(reasonIn);
    l.appendChild(el("div","hint","비워두면 「"+(memberName(s.proposer)||"누군가")+" 추천」 으로만 보입니다."));
    return l;
  }
  function foldBtn(){
    var fold=el("button","btn ghost", s.folded?"다시 펼치기":"접어두기");
    fold.onclick=function(){
      guard(function(){
        return DATA.updateShop(s.id,{folded:!s.folded}).then(function(){
          closeSheet();
          toast(s.folded?"다시 펼쳤어요.":"접어뒀어요. 언제든 펼칠 수 있어요.");
        });
      });
    };
    return fold;
  }
  function delBtn(){
    var del=el("button","foldlink","이 추천 지우기");
    del.onclick=function(){
      del.textContent="정말 지울까요? 한 번 더 누르면 삭제됩니다";
      del.onclick=function(){
        guard(function(){
          return DATA.deleteShop(s.id).then(function(){ closeSheet(); toast("지웠어요."); });
        });
      };
    };
    return del;
  }
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

function sheetMenu(h,body){
  h.textContent="뭐 먹지";
  var f=el("div","form");
  var catIdx=0, hideAte=true, one=null, lastOne="";

  f.appendChild(el("div","hint",
    "가게가 아니라 메뉴를 고릅니다. 담으면 가고 싶은 곳에 메뉴로 들어가고, "+
    "셋 다 👍 하면 그게 다음 약속 메뉴예요. 가게는 그다음에 고르면 됩니다."));

  /* 계열 칩 */
  var chips=el("div","pick");
  MENUS.forEach(function(c,i){
    var b=el("button",null,c.ko); b.type="button";
    b.onclick=function(){ catIdx=i; one=null; draw(); };
    chips.appendChild(b);
  });
  f.appendChild(el("div","sect","어떤 계열"));
  f.appendChild(chips);

  var tg=el("button","foldlink"); tg.type="button";
  tg.onclick=function(){ hideAte=!hideAte; one=null; draw(); };
  f.appendChild(tg);

  var dice=el("button","btn","🎲 하나만 뽑기"); dice.type="button";
  dice.onclick=function(){
    var pool=visible();
    if(!pool.length) return;
    // 방금 뽑은 건 빼고 — 같은 게 두 번 나오면 뽑은 것 같지 않다
    var p2=pool.filter(function(n){ return n!==lastOne; });
    if(p2.length) pool=p2;
    one=pool[Math.floor(Math.random()*pool.length)];
    lastOne=one;
    draw();
  };
  f.appendChild(dice);

  /* 목록에 없는 것 직접 담기 */
  var fr=el("div","row2");
  var free=document.createElement("input");
  free.type="search"; free.id="menukw"; free.placeholder="목록에 없는 메뉴 — 예: 평양냉면";
  var fb=el("button","btn ghost sm","담기"); fb.type="button"; fb.style.flex="0 0 74px";
  function addFree(){
    var v=free.value.trim();
    if(!v) return;
    if(menuWished(v)){ toast("이미 담겨 있어요."); return; }
    guard(function(){
      return menuAdd(v).then(function(){
        free.value=""; toast("가고 싶은 곳에 담았어요."); draw(); render();
      });
    });
  }
  fb.onclick=addFree;
  free.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); addFree(); } };
  fr.appendChild(free); fr.appendChild(fb);
  f.appendChild(fr);

  var out=el("div"); f.appendChild(out);
  body.appendChild(f);

  /* 지금 권할 수 있는 것 — 이미 담은 건 빼고, 기본은 안 먹어본 것만 */
  function visible(){
    return menuPool(catIdx).filter(function(n){
      if(menuWished(n)) return false;
      return !(hideAte && menuAte(n));
    });
  }
  /* 안 먹어본 것 먼저, 그다음 오래 안 먹은 순 */
  function byFresh(a,b){
    var x=menuAte(a), y=menuAte(b);
    if(!x && !y) return 0;          // 적어둔 순서를 지킨다
    if(!x) return -1;
    if(!y) return 1;
    return String(x.date).localeCompare(String(y.date));
  }
  function ateLabel(n){
    var a=menuAte(n);
    if(!a) return "아직 안 먹어봤어요";
    return agoLabel(a.date)+" 먹음"+(a.n>1 ? (" · "+a.n+"번") : "");
  }

  function draw(){
    Array.prototype.forEach.call(chips.children,function(b,i){
      b.setAttribute("aria-pressed",String(i===catIdx));
    });
    tg.textContent = hideAte ? "먹어본 메뉴도 보기" : "먹어본 메뉴 빼기";
    var list=visible().sort(byFresh);
    dice.hidden=!list.length;
    out.innerHTML="";
    if(one) out.appendChild(menuCard(one));
    if(!list.length){
      out.appendChild(el("div","hint", hideAte
        ? "이 계열은 다 먹어봤거나 이미 담겨 있어요. 「먹어본 메뉴도 보기」를 눌러보세요."
        : "이 계열은 다 담겨 있어요. 다른 계열을 골라보세요."));
      return;
    }
    out.appendChild(el("div","sect",MENUS[catIdx].ko+" "+list.length+"가지"));
    var box=el("div","psr");
    list.forEach(function(n){ box.appendChild(menuRow(n)); });
    out.appendChild(box);
    out.appendChild(el("div","hint",
      "이미 담은 메뉴는 빼고 보여줍니다. 「언제 먹었는지」는 우표에 적은 음식 이름으로 맞춘 거라 "+
      "가끔 틀립니다. 맛 순위는 아닙니다."));
  }

  function menuRow(n){
    var row=el("div","psrow recorow");
    var L=el("div","l");
    L.appendChild(el("span","nm",n));
    L.appendChild(el("span","ad",ateLabel(n)));
    row.appendChild(L);
    row.appendChild(addBtn(n));
    return row;
  }
  function menuCard(n){
    var c=el("div","pincard wish");
    c.appendChild(el("div","nm","오늘은 "+n+" 어때요"));
    c.appendChild(el("div","st",ateLabel(n)));
    var act=el("div","act");
    var again=el("button","btn ghost sm","다시 뽑기"); again.type="button";
    again.onclick=dice.onclick;
    act.appendChild(again);
    act.appendChild(addBtn(n));
    c.appendChild(act);
    return c;
  }
  function addBtn(n){
    var b=el("button","btn ghost sm","＋ 담기"); b.type="button";
    b.onclick=function(ev){
      ev.stopPropagation();
      b.disabled=true; b.textContent="담는 중…";
      guard(function(){
        return menuAdd(n).then(function(){
          toast("가고 싶은 곳에 담았어요.");
          if(one===n) one=null;
          draw(); render();
        });
      });
    };
    return b;
  }

  draw();
}

function sheetSettings(h,body){
  h.textContent="설정";
  var f=el("div","form");

  /* 모임 — 관리자에게만 보인다.
     친구들은 자기 모임 링크(#g=…)로 들어오고, 다른 모임이 있는 줄도 모른다.
     주소를 뜯어보면 볼 수는 있다 — 가리는 게 아니라 안 보여주는 것이다.
     기술적으로도 막으려면 모임마다 Supabase 프로젝트를 나눠야 한다. */
  if(isAdmin()){
  f.appendChild(el("div","sect","모임"));
  var gs=el("div","pick");
  (DATA.groups||[]).forEach(function(g){
    var b=el("button"); b.type="button";
    b.setAttribute("aria-pressed",String(DATA.gid===g.id));
    b.appendChild(el("span",null,g.name));
    b.onclick=function(){
      if(DATA.gid===g.id) return;
      DATA.setGid(g.id); lsSet(LS_GID,g.id);
      try{ location.hash="g="+g.id; }catch(e){}   // 주소도 따라가야 링크 복사가 맞는다
      // 모임마다 멤버가 다르다 — 지금 고른 "나" 가 새 모임에 없으면 다시 고르게 한다
      if(!members().some(function(m){ return m.id===me; })){ me=null; lsSet(LS_ME,""); }
      selPin=null; tab="album"; mapWhole=false; kmapSig="";
      drawSheet(); render();
    };
    gs.appendChild(b);
  });
  f.appendChild(gs);

    var gr=el("div","row2");
    var gname=document.createElement("input");
    gname.placeholder="새 모임 이름"; gname.maxLength=16;
    var gadd=el("button","btn ghost","＋ 모임"); gadd.type="button";
    gadd.onclick=function(){
      var nm=gname.value.trim();
      if(!nm){ toast("모임 이름을 적어주세요."); return; }
      guard(function(){
        return DATA.addGroup(nm).then(function(id){
          DATA.setGid(id); lsSet(LS_GID,id);
          try{ location.hash="g="+id; }catch(e){}
          me=null; lsSet(LS_ME,""); tab="album";
          drawSheet(); render(); toast("모임을 만들었어요. 멤버부터 넣어주세요.");
        });
      });
    };
    gr.appendChild(gname); gr.appendChild(gadd);
    f.appendChild(gr);
    var ren=el("button","btn ghost sm","이 모임 이름 바꾸기"); ren.type="button";
    ren.onclick=function(){
      var nm=(window.prompt("모임 이름", settings().name)||"").trim();
      if(!nm) return;
      guard(function(){ return DATA.renameGroup(DATA.gid,nm).then(function(){ drawSheet(); render(); }); });
    };
    f.appendChild(ren);
    f.appendChild(el("div","hint","모임마다 주소가 다릅니다. 받은 사람은 자기 모임만 봅니다 — 다만 주소를 뜯어볼 줄 아는 사람이면 볼 수 있으니, 완전히 막아야 할 내용은 두지 마세요."));
  }

  f.appendChild(el("div","sect","나"));
  var who=el("div","pick");
  members().forEach(function(m){
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
    /* 멤버 — 더하고 지우고 이름 고치기. 관리자만. */
    f.appendChild(el("div","sect","멤버 "+memberCount()+"명"));
    var draft=members().map(function(m){ return {id:m.id,name:m.name||"",c:(m.c|0)%MC}; });
    var ins=[];
    draft.forEach(function(m,i){
      var l=el("label","fld");
      var head=el("div","mhead");
      var sw=el("span","swatch"); sw.style.background="var(--mc"+m.c+")";
      head.appendChild(sw);
      head.appendChild(el("span",null,"멤버 "+(i+1)));
      var del=el("button",null,"빼기"); del.type="button"; del.className="xbtn";
      del.onclick=function(){
        if(draft.length<=1){ toast("최소 한 명은 있어야 해요."); return; }
        var left=draft.filter(function(x){ return x.id!==m.id; })
                      .map(function(x,j){ return {id:x.id,name:ins[draft.indexOf(x)].value.trim()||x.name,c:x.c}; });
        guard(function(){
          return DATA.saveSettings({members:left}).then(function(){
            if(me===m.id){ me=null; lsSet(LS_ME,""); }
            drawSheet(); render(); toast("뺐어요. 남긴 기록은 그대로입니다.");
          });
        });
      };
      head.appendChild(del);
      l.appendChild(head);
      var inp=document.createElement("input");
      inp.id="setnm_"+m.id; inp.value=m.name; inp.maxLength=8;
      l.appendChild(inp); f.appendChild(l);
      ins.push(inp);
    });

    var r2=el("div","row2");
    var sv=el("button","btn ghost","이름 저장"); sv.type="button";
    sv.onclick=function(){
      guard(function(){
        return DATA.saveSettings({
          members: draft.map(function(m,i){ return {id:m.id,name:ins[i].value.trim()||m.name||m.id,c:m.c}; })
        }).then(function(){ drawSheet(); render(); toast("저장했어요."); });
      });
    };
    var add=el("button","btn ghost","＋ 멤버"); add.type="button";
    add.onclick=function(){
      var next=draft.map(function(m,i){ return {id:m.id,name:ins[i].value.trim()||m.name||m.id,c:m.c}; });
      next.push({id:nextMemberId(), name:"새 멤버", c:freeColor()});
      guard(function(){
        return DATA.saveSettings({members:next}).then(function(){ drawSheet(); render(); });
      });
    };
    r2.appendChild(sv); r2.appendChild(add);
    f.appendChild(r2);
    f.appendChild(el("div","hint","멤버를 빼도 그 사람이 남긴 👍·한 줄·참석 기록은 지워지지 않습니다. 목록에서만 빠집니다."));

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
  share.textContent="「"+settings().name+"」 멤버에게 이 주소를 주세요: "+groupLink();
  f.appendChild(share);
  var cp=el("button","btn ghost sm","링크 복사");
  cp.onclick=function(){
    var url=groupLink();
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ toast("링크를 복사했어요."); },
                                             function(){ toast("주소창의 링크를 복사해주세요."); });
    }else toast("주소창의 링크를 복사해주세요.");
  };
  f.appendChild(cp);
  if(isAdmin() && (DATA.groups||[]).length>1){
    f.appendChild(el("div","hint","모임마다 주소가 다릅니다. 위에서 모임을 고른 뒤 그 모임 사람들에게 이 링크를 주세요."));
  }
  body.appendChild(f);
}

/* ── 연결 ───────────────────────────────────────────────── */
$("#tabAlbum").onclick=function(){ tab="album"; render(); };
$("#tabWish").onclick=function(){ tab="wish"; render(); };
$("#tabMap").onclick=function(){ tab="map"; render(); };
$("#whoBtn").onclick=function(){ openSheet({k:"settings"}); };
$("#fabBtn").onclick=function(){ openSheet({k:"new"}); };

me=lsGet(LS_ME);
// 주소에 모임이 담겨 있으면 그게 이긴다. 없으면 지난번에 보던 모임.
DATA.gid=hashGid()||lsGet(LS_GID)||"app";
if(hashGid()) lsSet(LS_GID,DATA.gid);
window.addEventListener("hashchange",function(){
  var g=hashGid();
  if(!g || g===DATA.gid) return;
  DATA.setGid(g); lsSet(LS_GID,g);
  if(!members().some(function(m){ return m.id===me; })){ me=null; lsSet(LS_ME,""); }
  selPin=null; tab="album"; mapWhole=false; kmapSig="";
  drawSheet(); render();
});
render();
DATA.init(function(){
  // 글자를 치는 중이면 시트를 건드리지 않는다. 다음 상호작용 때 다시 그려진다.
  if(sheet && !typingInSheet()) drawSheet();
  render();
});
})();
