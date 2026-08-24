/* ============================================================
   kataban.js — /blog/ と /404.html が共有するロゴ描画
   作成: 2026-08-08（ブログセクション雛形）

   index.html 末尾の "Logo paint" と**同じビットマップ**。本体側はインラインの
   IIFE で持っているので、ここは写しになる。字形（FONT）を変えるときは両方直す。
   ★写しを1つに減らそうとして index.html からこのファイルを読ませない。
     本体は 8MB 単一ファイルで、外部依存を足すと「本体だけ差し替えれば直る」
     という今の運用（＝contents API で index.html を1本 PUT する）が崩れる。

   記事を増やすときにロゴのコードを記事ごとに写さなくて済むように外に出してある。
   ============================================================ */
(function () {
  var FONT = {
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    N: ["10001", "11001", "10101", "10101", "10011", "10001", "10001"]
  };
  function paint(el, cls) {
    if (!el) return;
    var rows = [];
    // 5列の字を "0"（＝1列の隙間）で連結する。7文字 × 5 + 隙間 6 = 41列。
    // kataban.css の grid-template-columns:repeat(41,…) と対で効く。
    for (var r = 0; r < 7; r++) {
      rows.push("KATABAN".split("").map(function (ch) { return FONT[ch][r]; }).join("0"));
    }
    el.innerHTML = rows.map(function (row) {
      return row.split("").map(function (b) {
        return '<i class="' + (b === "1" ? cls : "") + '"></i>';
      }).join("");
    }).join("");
  }
  paint(document.getElementById("kbGridPink"), "kb-on-pink");
  paint(document.getElementById("kbGridCyan"), "kb-on-cyan");
  /* ヘッダー以外のロゴ（フッターの署名など）は data-kb 属性で拾う。
     ID は1ページに1つしか置けないので、2つ目からはこちら。
     ヘッダー側を ID のまま残してあるのは、既存の全ページの markup を
     触らずに済ませるため（移行漏れのページでロゴが無言で消えるのを避ける）。
     ★index.html 末尾の同名 IIFE にも同じ4行がある。片方だけ直さない。 */
  var kbMore = document.querySelectorAll(".kb-grid[data-kb]");
  for (var kbI = 0; kbI < kbMore.length; kbI++) {
    paint(kbMore[kbI], kbMore[kbI].getAttribute("data-kb"));
  }
})();

/* ============================================================
   言語切替ドロップダウン（2026-08-24 追加 / 同日 記事ページへも展開）
   .langswitch が無いページ（404など）では何もしない。
   ★開閉ロジックは一覧ページ4本と記事ページ28本の**両方**で動く。
     「一覧ページだけの機能」は自動リダイレクトだけで、そちらは
     .langswitch の**有無**ではなく data-autoredirect 属性で判定する
     （下の該当箇所の注記を読むこと）。
   ============================================================ */
(function () {
  var root = document.querySelector(".langswitch");
  if (!root) return;

  var STORAGE_KEY = "kataban_blog_lang";
  var SUPPORTED = ["en", "zh", "ko", "es"];
  var PATHS = { en: "/blog/", zh: "/blog/zh/", ko: "/blog/ko/", es: "/blog/es/" };

  // --- ドロップダウンの開閉 ---------------------------------
  var toggle = root.querySelector(".langswitch-toggle");
  var menu = root.querySelector(".langswitch-menu");

  function closeMenu() {
    root.setAttribute("data-open", "false");
    toggle.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  }
  function openMenu() {
    root.setAttribute("data-open", "true");
    toggle.setAttribute("aria-expanded", "true");
    menu.hidden = false;
  }
  if (toggle && menu) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (menu.hidden) { openMenu(); } else { closeMenu(); }
    });
    document.addEventListener("click", function (e) {
      if (!root.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeMenu(); toggle.focus(); }
    });
    // 手動で言語を選んだら、その選択を覚える（次回訪問時に自動リダイレクトしない）。
    var links = menu.querySelectorAll("a[data-lang]");
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener("click", function (e) {
        try { localStorage.setItem(STORAGE_KEY, e.currentTarget.getAttribute("data-lang")); }
        catch (err) { /* localStorage が無くても下の referrer 判定が効くので、ここは無視してよい */ }
        // ★閉じてから遷移する。閉じずに出ると、bfcache（戻る）で戻ってきたときに
        //   開いたままの DOM が復元され、次の1クリックが「開く」ではなく「閉じる」に
        //   なる ―― 使う側には「ボタンが効かない」ように見える。
        closeMenu();
      });
    }
    // bfcache から戻るとスクリプトは再実行されない（DOM は離脱時のまま返ってくる）。
    window.addEventListener("pageshow", function (e) { if (e.persisted) closeMenu(); });
  }

  // --- 初回訪問時の自動リダイレクト ---------------------------
  // ★一覧ページだけの機能。.langswitch に data-autoredirect="true" が付いている
  //   ときだけ動く。記事ページにも同じ見た目のドロップダウン（開閉ロジックは
  //   上と共通）を 2026-08-24 に出したが、記事ページでブラウザ言語だけを見て
  //   自動遷移すると、今読んでいる記事から離れて（対応する翻訳記事ではなく）
  //   別言語の一覧ページへ飛ばしてしまう。記事ページの data-blog-lang 属性は
  //   常に未設定（currentLang が "en" 扱いになる）ため、この判定が無いと
  //   中国語ブラウザで英語記事を開いただけで /blog/zh/ に飛ばされる事故になる。
  if (root.getAttribute("data-autoredirect") !== "true") return;

  // クローラーには介入しない（hreflangで多言語構成を伝える方針と衝突させないため）。
  var ua = navigator.userAgent || "";
  var isBot = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless/i.test(ua);
  if (isBot) return;

  var currentLang = document.documentElement.getAttribute("data-blog-lang") || "en";

  // ★一覧ページから来た＝直前に自分で言語を選んでいる。ここで自動リダイレクトを
  //   かけると、その選択をその場で打ち消してしまう。
  //   localStorage が使える環境では下の stored 判定が止めていたが、
  //   **localStorage が使えない環境（プライバシー設定・ストレージ遮断）では
  //   何度選んでも元の言語へ引き戻され、言語を変えられない**という事故になっていた。
  //   保存に頼らず「どこから来たか」で判定するので、ストレージの可否に左右されない。
  var LISTING_RE = /^\/blog\/(?:zh\/|ko\/|es\/)?$/;
  var ref = document.referrer || "";
  if (ref.indexOf(location.origin + "/blog/") === 0) {
    var refPath = ref.slice(location.origin.length).split("?")[0].split("#")[0];
    if (LISTING_RE.test(refPath)) return;
  }

  var stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (err) { /* 無視 */ }
  if (stored && SUPPORTED.indexOf(stored) !== -1) return; // 既に選択済み＝二度と自動で動かさない

  var browserLangs = navigator.languages || [navigator.language || "en"];
  var detected = "en";
  for (var j = 0; j < browserLangs.length; j++) {
    var code = (browserLangs[j] || "").toLowerCase();
    if (code.indexOf("zh") === 0) { detected = "zh"; break; }
    if (code.indexOf("ko") === 0) { detected = "ko"; break; }
    if (code.indexOf("es") === 0) { detected = "es"; break; }
    if (code.indexOf("en") === 0) { detected = "en"; break; }
  }

  if (detected !== currentLang) {
    try { localStorage.setItem(STORAGE_KEY, detected); } catch (err) { /* 無視 */ }
    location.replace(PATHS[detected]);
  }
})();
