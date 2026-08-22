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
