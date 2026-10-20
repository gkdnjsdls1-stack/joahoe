/* 좋아회 — 데이터 계층 (Supabase)
 *
 * 화면 코드(app.js)는 이 파일의 DATA 하나만 본다.
 * 권한: 읽기는 모두 / 우표·사진·가게정보는 관리자(로그인)만 /
 *       가고 싶은 곳 추가·👍·한 줄은 모두.
 * 실제 차단은 Supabase RLS가 한다 (supabase/schema.sql). 여기 분기는 화면용.
 */
(function(){
"use strict";

var cfg = window.JOAHOE_CONFIG || {};
var sb = null, notify = null, bumpTimer = null;

var DATA = window.DATA = {
  state: "boot",   // boot | noconfig | nolib | error | ok
  error: "",
  isAdmin: false,
  email: "",
  settings: null,
  shops: [],
  stamps: [],
  notes: [],
  likes: []
};

DATA.configured = function(){
  return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
};

/* ── 정규화 ─────────────────────────────────────────────── */
function normSettings(r){
  r = r || {};
  return {
    style: r.style || "B",
    members: r.members || [{id:"m1",name:""},{id:"m2",name:""},{id:"m3",name:""}],
    refStampIds: r.ref_stamp_ids || [],
    areaPos: r.area_pos || {}
  };
}
function normShop(r){
  return {
    id: r.id, name: r.name || "", wish: !!r.wish, proposer: r.proposer || "",
    folded: !!r.folded, reason: r.reason || "", url: r.url || "", area: r.area || "",
    createdAt: r.created_at, visitedAt: r.visited_at
  };
}
function normStamp(r){
  return {
    id: r.id, shopId: r.shop_id, shopName: r.shop_name || "", date: r.date || "",
    attendees: r.attendees || [], foodKo: r.food_ko || "", foodEn: r.food_en || "",
    color: r.color || "", photoPaths: r.photo_paths || [], artPath: r.art_path || null,
    promptVer: r.prompt_ver || "", by: r.by_member || "", createdAt: r.created_at
  };
}

/* ── 시작 ───────────────────────────────────────────────── */
DATA.init = function(onChange){
  notify = onChange;
  if(!DATA.configured()){ DATA.state = "noconfig"; notify(); return Promise.resolve(); }
  if(!window.supabase || !window.supabase.createClient){ DATA.state = "nolib"; notify(); return Promise.resolve(); }

  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  return sb.auth.getSession().then(function(res){
    setAuth(res && res.data && res.data.session);
    sb.auth.onAuthStateChange(function(_e, s){ setAuth(s); refreshAll().then(fire); });
    return refreshAll();
  }).then(function(){
    DATA.state = "ok";
    subscribe();
    fire();
  }).catch(function(e){
    DATA.state = "error";
    DATA.error = (e && e.message) || String(e);
    fire();
  });
};

function setAuth(s){
  DATA.isAdmin = !!(s && s.user);
  DATA.email = (s && s.user && s.user.email) || "";
}
function fire(){ if(notify) notify(); }

function refreshAll(){
  return Promise.all([
    sb.from("settings").select("*").eq("id","app").maybeSingle(),
    sb.from("shops").select("*"),
    sb.from("stamps").select("*"),
    sb.from("notes").select("*"),
    sb.from("likes").select("*")
  ]).then(function(r){
    var bad = r.find(function(x){ return x.error; });
    if(bad) throw bad.error;
    DATA.settings = normSettings(r[0].data);
    DATA.shops  = (r[1].data || []).map(normShop);
    DATA.stamps = (r[2].data || []).map(normStamp);
    DATA.notes  = r[3].data || [];
    DATA.likes  = r[4].data || [];
  });
}

function subscribe(){
  sb.channel("joahoe")
    .on("postgres_changes", { event: "*", schema: "public" }, bump)
    .subscribe();
}
function bump(){
  clearTimeout(bumpTimer);
  bumpTimer = setTimeout(function(){ refreshAll().then(fire).catch(function(){}); }, 250);
}
function reload(){ return refreshAll().then(fire); }

/* ── 로그인 ─────────────────────────────────────────────── */
DATA.signIn = function(email, password){
  return sb.auth.signInWithPassword({ email: email, password: password }).then(function(r){
    if(r.error) throw r.error;
  });
};
DATA.signOut = function(){ return sb.auth.signOut(); };

/* ── 사진 ───────────────────────────────────────────────── */
DATA.photoUrl = function(path){
  if(!path) return "";
  return cfg.SUPABASE_URL + "/storage/v1/object/public/photos/" + path;
};
DATA.upload = function(blob, kind){
  var ext = (blob.type === "image/png") ? "png" : "jpg";
  var path = (kind || "img") + "/" + Date.now() + "-" +
             Math.random().toString(36).slice(2, 8) + "." + ext;
  return sb.storage.from("photos").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "31536000"
  }).then(function(r){
    if(r.error) throw r.error;
    return path;
  });
};

/* ── 쓰기 ───────────────────────────────────────────────── */
function snakeSettings(p){
  var o = {};
  if("style" in p) o.style = p.style;
  if("members" in p) o.members = p.members;
  if("refStampIds" in p) o.ref_stamp_ids = p.refStampIds;
  if("areaPos" in p) o.area_pos = p.areaPos;
  o.updated_at = new Date().toISOString();
  return o;
}
DATA.saveSettings = function(patch){
  // upsert — settings 행이 없어도 스스로 만든다 (스키마를 늦게 돌린 경우 대비)
  var row = snakeSettings(patch);
  row.id = "app";
  return sb.from("settings").upsert(row, { onConflict: "id" }).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};

DATA.addShop = function(s){
  return sb.from("shops").insert({
    name: s.name, wish: s.wish !== false, proposer: s.proposer || "",
    folded: false, reason: s.reason || "", url: s.url || "", area: s.area || "",
    visited_at: s.wish === false ? new Date().toISOString() : null
  }).select().then(function(r){
    if(r.error) throw r.error;
    return reload().then(function(){ return (r.data && r.data[0]) ? r.data[0].id : null; });
  });
};
DATA.updateShop = function(id, patch){
  var o = {};
  if("name" in patch) o.name = patch.name;
  if("url" in patch) o.url = patch.url;
  if("area" in patch) o.area = patch.area;
  if("folded" in patch) o.folded = patch.folded;
  if("wish" in patch){ o.wish = patch.wish; if(patch.wish === false) o.visited_at = new Date().toISOString(); }
  return sb.from("shops").update(o).eq("id", id).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};
DATA.deleteShop = function(id){
  return sb.from("shops").delete().eq("id", id).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};

DATA.addStamp = function(s){
  return sb.from("stamps").insert({
    shop_id: s.shopId, shop_name: s.shopName, date: s.date,
    attendees: s.attendees || [], food_ko: s.foodKo || "", food_en: s.foodEn || "",
    color: s.color || "", photo_paths: s.photoPaths || [], art_path: s.artPath || null,
    prompt_ver: s.promptVer || "", by_member: s.by || ""
  }).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};
DATA.updateStamp = function(id, patch){
  var o = {};
  if("shopName" in patch) o.shop_name = patch.shopName;
  if("foodEn" in patch) o.food_en = patch.foodEn;
  if("foodKo" in patch) o.food_ko = patch.foodKo;
  if("color" in patch) o.color = patch.color;
  if("artPath" in patch) o.art_path = patch.artPath;
  if("photoPaths" in patch) o.photo_paths = patch.photoPaths;
  if("promptVer" in patch) o.prompt_ver = patch.promptVer;
  return sb.from("stamps").update(o).eq("id", id).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};
DATA.deleteStamp = function(id){
  return sb.from("stamps").delete().eq("id", id).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};

/* 👍 — 누구나 */
DATA.likesOf = function(shopId){
  return DATA.likes.filter(function(l){ return l.shop_id === shopId; })
                   .map(function(l){ return l.member; });
};
DATA.setLike = function(shopId, member, on){
  var q = on
    ? sb.from("likes").insert({ shop_id: shopId, member: member })
    : sb.from("likes").delete().eq("shop_id", shopId).eq("member", member);
  return q.then(function(r){
    if(r.error && !(on && r.error.code === "23505")) throw r.error;   // 이미 눌렀으면 무시
    return reload();
  });
};

/* 한 줄 — 누구나 */
DATA.noteOf = function(stampId, member){
  var n = DATA.notes.find(function(x){ return x.stamp_id === stampId && x.member === member; });
  return (n && n.text) || "";
};
DATA.setNote = function(stampId, member, text){
  return sb.from("notes").upsert(
    { stamp_id: stampId, member: member, text: text, updated_at: new Date().toISOString() },
    { onConflict: "stamp_id,member" }
  ).then(function(r){
    if(r.error) throw r.error;
    return reload();
  });
};
})();
