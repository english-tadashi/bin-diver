/* ============================================================
   Kataban — Service Worker（2026-08-19）
   目的は1つだけ: 一度開いたあとは電波が無くてもページが開くこと。
   店頭（Book-Off の地下・ハードオフの奥）は実際に圏外になる場所で、
   そこで開けないなら型番を持ち歩けない ―― それがこのファイルの理由。

   ★スコープ。register() は index.html 側で相対パス './sw.js' で呼んでいる。
     ・独自ドメイン運用（現行 https://gamekataban.com/）… SW は /sw.js、スコープは /
     ・GitHub Pages のプロジェクトページ（https://<user>.github.io/<repo>/）に置いた場合
       … SW は /<repo>/sw.js、スコープは /<repo>/
     どちらでも「index.html と同じ階層以下」が丸ごとスコープに入る。だから
     **このファイルの中の同一オリジンURLはすべて相対で書く**こと。先頭に '/' を付けると
     プロジェクトページで origin の直下を指してスコープの外に出る（＝404 になり、
     install の addAll ごと失敗して SW が一度も有効にならない）。
     ★Service-Worker-Allowed ヘッダは使わない。GitHub Pages は任意ヘッダを付けられないので、
       スコープを sw.js の置き場所より上へ広げる手段が無い。上げる必要も無い（sw.js は
       index.html と同じ階層に置く）。
   ★HTTPS 必須。GitHub Pages は https を張れるので前提を満たす。
     http:// の生 IP や file:// では registration 自体が拒否される（登録側でガードしてある）。

   ★キャッシュの版。**リリースのたびにここを上げる**のが破棄の手順。
     activate で 'kataban-' で始まる別の版をすべて消すので、上げれば古い版は丸ごと消える。
     ★とはいえ「上げ忘れても index.html は腐らない」ようにしてある ―― ページ本体
       (navigate) だけは network-first で、オンラインなら常に最新を取りに行き、
       取れたらキャッシュも上書きする。オフラインのときだけ前回の中身に落ちる。
       版の定数は「SW 自身の作りを変えたときに全部を捨てる」ためのレバーとして残す。
   ============================================================ */
const VERSION = 'v4';  /* v3→v4 (2026-08-22) ★★★を白・16pxに変更（kataban.css のみの差分）。
                          kataban.css / kataban.js は cache-first（再検証なし）なので、
                          上げないと再訪者に「新しいHTML＋古いCSS/JS」が組み合わさり、
                          フッターのロゴが描かれず無スタイルのタグラインだけが出る。 */
const CACHE   = 'kataban-' + VERSION;

/* ページ本体。ナビゲーションはすべてこの1件に落とす。
   '/' で開かれても '/index.html' で開かれても中身は同じなので、8MB を2件持たない。
   ★相対パス。SW の中の相対URLは sw.js の場所を基準に解決されるので、
     独自ドメインなら /index.html、プロジェクトページなら /<repo>/index.html になる。 */
const SHELL = './index.html';

/* install で必ず入れておくもの。ここが1件でも 404 だと addAll ごと reject して
   SW が有効にならないので、**落ちて困るものだけ**を入れる。 */
const PRECACHE_CRITICAL = [SHELL];

/* あると嬉しいが、無くてもページは出るもの（アイコン類）。
   ★individually に put して個別に catch する。addAll に混ぜると、1つ消えただけで
     オフライン対応そのものが死ぬ ―― favicon のためにページを失うのは割に合わない。
   ★index.html 側の <link> は '/favicon.ico' と絶対で書かれている。独自ドメイン運用では
     ここの './favicon.ico' と同じURLに解決されるので一致する。プロジェクトページに
     置くなら index.html 側の絶対パスを先に直すこと（SW の問題ではなく、その場合は
     オフライン以前に通常表示でも 404 になる）。 */
const PRECACHE_OPTIONAL = ['./favicon.ico', './favicon.svg', './apple-touch-icon.png'];

/* ランタイムでキャッシュする外部ホスト。**この2つだけ**。
   ・fonts.googleapis.com … 書体の CSS（index.html が読む唯一の外部 CSS）
   ・fonts.gstatic.com    … 実体の woff2
   どちらも CORS 付きで返るので不透明レスポンスにならず、中身を検査して保存できる。
   ★install では取りに行かない。オフラインや遮断環境で install が失敗すると、
     ページ本体のキャッシュごと作られなくなる。1回目に成功したときだけ拾う。
   ★無くてもページは読める。書体スタックは全部フォールバック付き（Space Grotesk →
     -apple-system/Helvetica/Arial、IBM Plex Sans JP → Hiragino Sans/Noto Sans JP など）
     なので、取れなければ端末の既定書体で出るだけ。
   ★ここに載せていない外部は**一切触らない**（素通し）:
     ・googletagmanager（計測）… 通信の有無を書き換えると計測値が実態とずれる
     ・cdn.jsdelivr.net（@zxing／バーコード）… 遅延 import で、失敗はスキャナ側で扱う
     ・楽天API … 在庫と価格の生データ。古い値をオフラインで出すのは「無い」より悪い */
const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

// ---- install: ページ本体を入れる -------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE_CRITICAL);                       // ここは落ちたら install ごと失敗させる
    await Promise.all(PRECACHE_OPTIONAL.map(u =>                 // ここは1件ずつ・失敗は握りつぶす
      cache.add(u).catch(() => {})
    ));
    // 待機せず次の版へ入れ替える。資産が index.html 1枚に閉じているので、
    // 「古いページが新しい部品を読む」という取り合わせが起こりえない。
    await self.skipWaiting();
  })());
});

// ---- activate: 古い版を捨てる ----------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      // 'kataban-' で始まる自分の版だけを対象にする。同じオリジンに別のものが
      // キャッシュを持っていても巻き添えにしない。
      if (k.startsWith('kataban-') && k !== CACHE) return caches.delete(k);
      return Promise.resolve(false);
    }));
    await self.clients.claim();   // 初回訪問のタブもこの版の管理下に入れる
  })());
});

// ---- fetch -----------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;              // GET 以外は素通し（キャッシュの対象外）

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // (1) ページ本体 = network-first。オンラインなら常に最新、駄目なら前回の中身。
  //     ★これがあるので VERSION を上げ忘れても index.html は古いままにならない。
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then(c => c.put(SHELL, copy)));
        }
        return res;
      } catch (e) {
        const hit = await caches.match(SHELL);
        if (hit) return hit;
        throw e;                                  // 一度も開いたことが無い＝出せるものが無い
      }
    })());
    return;
  }

  // (2) 同一オリジンのその他 = cache-first。アイコンなど、変わらないものだけが来る。
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
      }
      return res;
    })());
    return;
  }

  // (3) Google Fonts だけ cache-first で拾う。取れなければそのまま失敗させる
  //     ＝ページ側のフォールバック書体に落ちる（それで読める作りにしてある）。
  if (FONT_ORIGINS.indexOf(url.origin) !== -1) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(c => c.put(req, copy)));
      }
      return res;
    })());
    return;
  }

  // (4) それ以外（計測・CDN・楽天API）は respondWith を呼ばない＝ブラウザ既定のまま。
});
