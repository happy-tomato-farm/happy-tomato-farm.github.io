/* =====================================================================
   シフトきぼう － ホーム画面・オフライン用の仕組み（service worker）

   役割はひとつだけ。「画面そのもの（HTML・アイコン）を端末に保存しておき、
   電波が弱くてもすぐ開けるようにする」こと。
   希望のデータには一切触らない。データは今までどおり
   Apps Script（保存係）とのあいだでやりとりされる。

   ★ kibou.html を直したら、必ず下の VER を上げること。
     上げ忘れると、端末に残った古い画面がしばらく出つづける。
     収量記録アプリと同じ約束にしてある。
   ===================================================================== */

var VER = "kibou-1.1";

/* 最初に保存しておくもの */
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(VER).then(function(c){
      /* 1つでも取れないと全部失敗する addAll は使わず、個別に入れる。
         アイコンが欠けただけでオフライン対応が丸ごと無効になるのを防ぐ */
      return Promise.all(SHELL.map(function(u){
        return fetch(u, {cache:"no-cache"})
          .then(function(r){ if(r.ok) return c.put(u, r); })
          .catch(function(){});
      }));
    })
  );
  /* ここでは skipWaiting しない。
     入力中に画面が入れ替わると危ないので、切り替えは次に開いたときにする */
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.map(function(n){
        if(n !== VER) return caches.delete(n);     /* 古い版の保存分を片づける */
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

/* 画面側から「新しい版に切り替えてよい」と言われたときだけ入れ替わる */
self.addEventListener("message", function(e){
  if(e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function(e){
  var req = e.request;

  /* 保存係（Apps Script）との通信には一切手を出さない。
     別ドメインだし、POST もあるし、中身は常に新しいものが要るため */
  if(req.method !== "GET") return;
  var url;
  try{ url = new URL(req.url); }catch(err){ return; }
  if(url.origin !== self.location.origin) return;
  if(url.pathname.indexOf(new URL("./", self.location).pathname) !== 0) return;

  /* まず保存してあるものを返し（＝すぐ開く）、
     裏でネットから取り直して次回に備える */
  e.respondWith(
    caches.open(VER).then(function(c){
      return c.match(req, {ignoreSearch:true}).then(function(hit){
        var net = fetch(req).then(function(r){
          if(r && r.ok) c.put(req, r.clone());
          return r;
        }).catch(function(){
          return hit || Response.error();
        });
        return hit || net;
      });
    })
  );
});
