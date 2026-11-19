const $ = s => document.querySelector(s);
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function enc(s){return encodeURIComponent(s||'');}
// SLPS-00533 / SLPS 00533 / slps00533 → すべて SLPS00533。表示用ではなく照合用の内部正規化。
function codeKey(s){ return (s||'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,''); }

const q=$('#q'), plat=$('#plat'), pub=$('#pub'), year=$('#year'),
      results=$('#results'), count=$('#count'), more=$('#more');
const MAX=20;   // 最初に描く枚数＝Load more で増やす枚数（2026-09-26: 60→20。375px・CPU4倍遅くで1枚目が出るまで final fantasy 約2.3秒→約0.6秒）

/* ============================================================
   マイリスト（保存だけ・2026-08-19）
   カードの「リストに追加」を押すと、その行の**型番フィールド(row[3])を原文のまま**
   localStorage に配列で貯める。一覧画面はまだ無い＝ここは「入れる」だけ。

   ★保存するのは r[3] の原文（'SLPS-00533;SLPS-00534' のように ';' 区切りのまま）。
     表示用の codes.join(' ') ではない ―― 後で一覧画面を作るとき
     DATA.find(r => r[3] === saved) でそのまま行に戻せるのは原文のほうだから。
   ★型番の無い行（noCode）にはボタンを出さない。保存する値が無いので、押せないボタンを
     置くより出さないほうがよい（.btn-clerk の「押せないボタンは壊れて見える」と同じ方針）。
   ★localStorage は必ず try/catch で囲む（locRead/setLoc と同じ理由。プライベート
     ブラウズや一部WebViewでは getItem/setItem そのものが例外を投げる）。
   ★真値は下の listSet。paint() はカードを毎回作り直すので、60枚ぶん
     getItem+JSON.parse を回さずに済むよう起動時に1回だけ読む。
   ★キー名は既存の 'kataban_loc' に合わせて 'kataban_' 接頭辞。
   ★中身の確認: コンソールで myList() を叩く（下で window に出してある）。
   ============================================================ */
const LIST_KEY = 'kataban_mylist';

// 起動時に1回だけ読む。localStorage は人が書き換えられるので、配列でない・文字列でない・
// 空文字は黙って捨てる（locRead が 'jp'/'out' 以外を捨てているのと同じ）。
// 壊れた値をそのまま持つと card() が落ちて検索画面ごと死ぬ。
const listSet = (function(){
  let raw = null;
  try{ raw = localStorage.getItem(LIST_KEY); }catch(e){}
  let arr = [];
  try{ arr = JSON.parse(raw || '[]'); }catch(e){}
  if(!Array.isArray(arr)) arr = [];
  return new Set(arr.filter(v => typeof v === 'string' && v));
})();

// 書き込み。true=localStorage に入った / false=入らなかった。推測しない
// （copyText と同じ方針。「入れたつもりで消えている」が一番困る）。
function listSave(){
  try{ localStorage.setItem(LIST_KEY, JSON.stringify([...listSet])); return true; }
  catch(e){ return false; }
}

// 追加。保存に失敗したら Set からも戻す＝画面の表示と保存先を食い違わせない。
function listAdd(code){
  if(!code || listSet.has(code)) return false;
  listSet.add(code);
  if(!listSave()){ listSet.delete(code); return false; }
  return true;
}

/* アイコンボタン1個の見た目と読み上げを状態に合わせる（2026-08-21）。
   ラベルが文字だった頃は各所で btn.textContent を書いていたが、いまは
   is-on / aria-pressed / aria-label / <use href> の4つを必ず揃えて動かす必要があるので、
   書き換える側（追加ハンドラ・マイリスト画面の削除・clearMyList の3か所）から
   まとめてここを呼ぶ。1か所でも書き忘れると「白いのに追加済み」等の食い違いが出る。
   ★保存の成否は見ない。呼ぶ側が listAdd / listRemove の戻り値を確かめてから呼ぶこと
     （「入れたつもりで入っていない」を作らないため。[data-copy] と同じ考え方）。
   ★<use> が引けなかった場合（描画前など）は href だけ黙って飛ばす。属性が揃っていれば
     読み上げと状態は正しいまま。 */
function listBtnPaint(btn, on){
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Remove from My List' : 'Add to My List');
  const use = btn.querySelector('use');
  if(use) use.setAttribute('href', on ? '#icon-powerup-on' : '#icon-powerup-off');
}

/* コンソール確認用。window に置くのは開発者コンソールから直接叩くため。
   myList()      … いま localStorage に入っている配列を読んで表示し、返す
   clearMyList() … 全消し。1件ずつ外すならカードのアイコン（トグル）か
                   マイリスト画面の Remove で足りるので、これは一括用。 */
window.myList = function(){
  let raw = null;
  try{ raw = localStorage.getItem(LIST_KEY); }
  catch(e){ console.warn('[my-list] localStorage が読めません:', e); return []; }
  let arr = [];
  try{ arr = JSON.parse(raw || '[]'); }catch(e){}
  if(!Array.isArray(arr)) arr = [];
  console.log('[my-list] ' + LIST_KEY + ' … ' + arr.length + '件', arr);
  return arr;
};
window.clearMyList = function(){
  listSet.clear();
  try{ localStorage.removeItem(LIST_KEY); }catch(e){}
  // paint() は呼ばない（検索していない状態だと結果欄を空にしてしまう）。
  // 画面に出ているボタンだけ戻す。
  document.querySelectorAll('.btn-list.is-on').forEach(b=>{ listBtnPaint(b, false); });
  mylistRefresh();                       // 件数バッジ／開いていれば一覧も空にする
  console.log('[my-list] 全消ししました');
};
console.info('[my-list] 保存済み ' + listSet.size + '件。コンソールで myList() / clearMyList() が叩けます。');


// Pre-compute a lowercase search haystack per row ONCE (not per keystroke):
// English title, Japanese name, platform, code(s) and BOTH publisher names (ja + en),
// all lowercased. '\n' separates fields so a query can't match across a boundary.
// Case-insensitive, and including the English publisher lets "Konami" and "コナミ" both hit.
// 検索用の正規化。記号(Unicodeの約物P*・記号S*)をスペースに畳み、連続空白を潰す。
// 「英数字以外」ではない: かな・漢字も英数字ではないので、それで畳むと日本語検索が全滅する。
// 長音符ー(Lm)は記号ではないので残る。中黒・はP*なので、従来どおりスペースになる。
// これで表示は "Resident Evil: Revelations" のまま、"resident evil revelations" でも当たる
// （実測: 英題を持つ5,213行のうち、記号を抜いて打つと当たらない行が 1,561 → 0）。
// 全角ローマ数字(U+2160–217F)を十進化。検索索引のみに効かせる(表示は元字形のまま)。
// run単位で整数解釈: ⅩⅥ→16, Ⅶ→7。減算則あり。Ⅰ&Ⅱ→1&2(&はrun外で残る)。
// @search-formula-begin ★ここから下の @search-formula-end までと、codeKey・strong・PLATFORM_ALIASES は、tools/build_search_index.mjs が
//   そのまま node で動かして検索の索引（catalog/index-*.json）を作る（2026-10-19・data-split）。ここを変えたら索引を作り直す:
//   python3 catalog_io.py --rebuild-index（変えたまま作り直さないと build_feeds.py --check・tools/put_site.sh が止まる。ページは古い索引を使わず自分で作る）。
const RN_VAL = [1,2,3,4,5,6,7,8,9,10,11,12,50,100,500,1000];
const RN_MAP = new Map();
for (let _i=0; _i<16; _i++){ RN_MAP.set(String.fromCharCode(0x2160+_i), RN_VAL[_i]); RN_MAP.set(String.fromCharCode(0x2170+_i), RN_VAL[_i]); }
const romanToArabic = s => (s||'').replace(/[\u2160-\u217f]+/g, run => {
  const v = [...run].map(c => RN_MAP.get(c));
  let t = 0;
  for (let i=0; i<v.length; i++) t += (i+1<v.length && v[i] < v[i+1]) ? -v[i] : v[i];
  return String(t);
});
// アクセント畳み込み。NFD(正準分解)して結合ダイアクリティカルマーク(U+0300-036F)だけ落とす。
// NFKD ではなく NFD なので、仮名の濁点(U+3099/309A)も全角記号も互換分解も一切触らない。
// 掛けるのは r0(英題)の索引とクエリだけ。他列に掛けると濁点が消えて日本語が壊れる
// （実測: r1 に掛けると 22,042 セルが「ゲームス→ケームス」化。r0 は 521 セルが Dōkyūsei→Dokyusei）。
// ★末尾の NFC が必須。NFD のままだと仮名の濁点が U+3099 に分離し、fold(\p{P}\p{S})では消えないため
//   クエリだけ分解形になり、NFC のままの r1/r5/r6/r8 索引と一致しなくなる（「ドラゴン」が0件化）。
const accent = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
/* \u26052026-08-16(\u7d9a\u304d19): eBay \u306e**\u691c\u7d22\u6f14\u7b97\u5b50**\u3092\u984c\u540d\u304b\u3089\u7121\u5bb3\u5316\u3059\u308b\u3002accent() \u306e\u96a3\u306b\u7f6e\u3044\u3066\u3042\u308b\u304c
   **\u7528\u9014\u304c\u9055\u3046** \u2015\u2015 accent \u306f\u7d22\u5f15(HAY)\u306b\u3082\u30af\u30a8\u30ea\u306b\u3082\u639b\u304b\u308b\u304c\u3001\u3053\u308c\u306f **eBay \u306e _nkw \u5c02\u7528**\u3067\u3042\u308b\u3002
   \u2605HAY / fold \u306b\u306f\u7d76\u5bfe\u306b\u639b\u3051\u306a\u3044\u3053\u3068\u3002\u5185\u90e8\u691c\u7d22\u306e\u7d22\u5f15\u304c\u5909\u308f\u308b\u3068\u300c-8\u300d\u304c\u300c8\u300d\u3067\u3057\u304b\u5f15\u3051\u306a\u304f\u306a\u308b\u3002
   \u4f55\u3092\u3059\u308b\u304b\uff082\u3064\u3060\u3051\uff09:
     1. **\u8a9e\u3092\u59cb\u3081\u308b\u30cf\u30a4\u30d5\u30f3**\u3092\u843d\u3068\u3059\u3002`12RIVEN -the \u2026` \u306e `-the` \u3092 eBay \u306f\u300cthe \u3092\u9664\u5916\u300d\u3068\u8aad\u3080\u3002
     2. **straight quote `"`** \u3092\u843d\u3068\u3059\u3002`\u2026 "Kurenai Tokage" \u2026` \u306f\u30d5\u30ec\u30fc\u30ba\u5b8c\u5168\u4e00\u81f4\u3068\u3057\u3066\u98df\u308f\u308c\u308b\u3002
   \u3069\u3061\u3089\u30820\u4ef6\u3067\u6e08\u307e\u305a\u3001**\u90e8\u5206\u4e00\u81f4\u30d5\u30a9\u30fc\u30eb\u30d0\u30c3\u30af\u307e\u3067\u6b62\u307e\u3063\u3066\u753b\u9762\u304c\u5b8c\u5168\u306a\u767d\u7d19\u306b\u306a\u308b**\uff08\u7f60#177\uff09\u3002
   \u2605\u89e6\u3089\u306a\u3044\u3082\u306e\uff08\u3059\u3079\u3066\u5b9f\u6e2c\u3057\u3066\u6c7a\u3081\u305f\u3002\u7d9a\u304d19\u306e6\u7bc0\uff09:
     \u30fb**\u8a9e\u672b\u30cf\u30a4\u30d5\u30f3**(`integral-`) \u2026 19\u884c\u4e2d18\u884c\u3067\u7121\u5f71\u97ff\u3002\u52b9\u3044\u305f1\u884c(`KINGDOM HEARTS -HD 2.5 ReMIX-`
       93\u2192757\u4ef6)\u3082\u4e0a\u4f4d\u30ab\u30fc\u30c9\u306f\u524d\u5f8c\u3068\u3082\u672c\u7269\u3067**\u8cea\u304c\u4e0a\u304c\u3089\u306a\u3044**\u3002\uff1d\u300c\u5909\u308f\u308b\u304c\u826f\u304f\u306a\u3089\u306a\u3044\u300d\u306e\u3067\u89e6\u3089\u306a\u3044\u3002
     \u30fb**\u5b64\u7acb\u30cf\u30a4\u30d5\u30f3**(`Virtua Cop 1 - 2 Pack` \u306e ` - `) \u2026 \u7a7a\u767d\u3067\u631f\u307e\u308c\u305f `-` \u306f\u6f14\u7b97\u5b50\u3067\u306f\u306a\u3044\u3002
       \u2605`(^|\s)-+` \u3068\u66f8\u304f\u3068\u3053\u3053\u3092\u5dfb\u304d\u8fbc\u3093\u3067 **79\u884c\u304c128\u884c\u306b\u5897\u3048\u308b**\uff0849\u884c\u306f\u672a\u5b9f\u6e2c\uff09\u3002`(?=\S)` \u304c\u8981\u308b\u3002
     \u30fb**\u30ab\u30fc\u30ea\u30fc\u5f15\u7528\u7b26 `\u201d`**(U+201D) \u2026 `10101 \uff5e\u201dWILL\u201dThe Starship\uff5e` \u30674\u6761\u4ef6\u304c\u5b8c\u5168\u540c\u4e00\u3002\u98df\u308f\u308c\u3066\u3044\u306a\u3044\u3002
     \u30fb**\u975eASCII\u8a18\u53f7** `\u03a8 \uff06 \u00d7 \u2606 \uff5e \u300e\u300f \u2013`(en dash) \u2026 \u7d9a\u304d17\u306e\u7d50\u8ad6\u306e\u307e\u307e\u3002`\u00d7` \u306f\u7573\u3080\u3068\u60aa\u5316\u3059\u308b\u3002
   \u2605\u7a7a\u767d\u306f\u7573\u307e\u306a\u3044\u3002\u4e8c\u91cd\u7a7a\u767d\u306f eBay \u304c heading \u5074\u3067\u6f70\u3057\u3066\u304a\u308a\u3001\u3053\u3061\u3089\u3067\u7573\u3080\u7406\u7531\u304c\u7121\u3044\u3002
   \u2605accent() \u3068\u53ef\u63db\uff08\u516813,090\u884c\u3067\u78ba\u8a8d\u6e08\u307f\uff09\u3002\u5f71\u97ff\u306f **79\u884c**\uff08\u8a9e\u982d\u30cf\u30a4\u30d5\u30f376\uff0f\u5f15\u7528\u7b263\uff09\u3002
   \u2605\u5b9f\u6e2c: 24\u884c\u3067\u6551\u6e0819\u30fb\u7121\u5f71\u97ff4\u30fb**\u60aa\u53161**\uff08`Cardinal Ark -The Seal of Chaos-` \u306f `Ark`/`Chaos` \u304c
     \u72ec\u7acb\u30c8\u30fc\u30af\u30f3\u306b\u306a\u308a `Ys: The Ark of Napishtim` \u304c\u4e0a\u4f4d\u3092\u5360\u3081\u308b\uff09\u3002\u60aa\u5316\u30bc\u30ed\u3067\u306f\u306a\u3044\u3002\u7d9a\u304d18/19 \u53c2\u7167\u3002 */
const ebayOp = s => s.replace(/(^|\s)-+(?=\S)/g, '$1').replace(/"/g, '');
const fold = s => romanToArabic(s).replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim().toLowerCase();
// 列ごとに畳んでから \n で連結する。連結してから畳むと列の境界が消え、
// 英題の末尾と日本語名の先頭をまたいだ誤ヒットが出る（実測: "revelations biohazard" が 0→1件）。
// ★r0(英題)だけ accent を通してから fold する。Dōkyūsei を dokyusei で引くため。
//   他列は素の fold のまま（r1/r5/r6/r8 に掛けると濁点が落ちて日本語が壊れる）。
const HAY  = [];   // 2026-10-19: 中身は buildSearchIndex() が区切って入れる（式は hayRow）
const hayRow = r => [accent(r[0]),r[1],r[2],r[3],r[5],r[6],r[8]||'',r[9]||''].map(fold).join('\n');
// 第4レーン: fold からさらにスペースを消した索引。狙いは「三國志8remake」「halo5」のように
// スペースを打たずに入力された題を拾うこと。fold/クエリ側は対称なので不一致ではなく、
// String.includes の連続部分一致が「打った側にスペースが無い」だけで落ちるのが真因。
// ★対象は row[0]/row[1] のタイトル2列と row[8]（カナ読み）だけ。全8列に掛けると機種列(row[2])まで同一視され、
//   nintendoswitch が845行・gameboyadvance が888行を巻き込む（機種はプルダウンの仕事）。
// ★row[8] は 2026-09-29 に追加。和題がラテンで読みが「ブルー スティンガー」のように空白入りの行は、
//   カナを詰めて打つと0件だった（自分の行に当たらない 1,282行→26行。記事の /?q= 134通りは件数不変）。
// ★列ごとに squash してから \n で連結。\n は squash で消えないので列境界は HAY と同じく残る。
const squash = s => fold(s).replace(/ /g,'');
const HAY4 = [];   // buildSearchIndex()（式は hay4Row）
const hay4Row = r => [r[0],r[1],r[8]||''].map(squash).join('\n');
// 第2レーン: ローマ字(row[9])だけを対象に、同じ母音の重なりを1つに潰した索引。
// 狙いは ryuu ga gotoku(読みに忠実な表示) を ryu ga gotoku(英語圏の入力)で引くこと（罠30）。
// fold 本体には入れない。全列に掛けると英題を巻き込んで壊れる（実測: Dragoon→Dragon で+148、
// wii→wi で+1716、ローマ数字 II/III/VIII が混ざる）。母音の重なりは英語では意味を持つ。
// だから潰すのは「カナ読み由来で、母音の重なりが長音しか意味しない」row[9] だけに限る。
const collapseV = s => s.replace(/([aeiou])\1+/g,'$1');
const RJ = [];    // buildSearchIndex()（式は rjRow）
const rjRow = r => collapseV(fold(r[9]||''));
// 第5レーン: ローマ字(row[9])だけを対象に、スペースを消してから長音を畳んだ索引（2026-09-25）。
// 狙いは radiasenki（DATA）を Radia Senki（区切って入力）で、akumajoudensetsu を Akumajo Densetsu（長音を省いて入力）で引くこと。
// 畳み方: squash（fold→スペース除去）→ ou を o に → 同母音の重なりを1つに（collapseV）。クエリも同じ関数で畳む。
// ★対象は row[9] だけ。英題(row[0])に掛けると英語の ou（house 等）まで潰れる。第4レーン(HAY4)とは別の配列にする。
// ★床8。5〜7文字では語の境目をまたいで乱射する（実測: radia→うる星やつら「dia」、senki→大決戦「sen ki」、yuusha→緊急車両）。
// ★他の4経路で外れたときだけ試す（足すだけで、既存のヒットは1件も減らない）。
// 試算（scratchpad の kataban_sim.js）: 英題が空で MADB にスペース入りローマ字がある18,775行のうち、
//   その表記で自分の行が出るのが 6,646→10,442行（+3,796）。英語でよく検索される25語・短い語30個の件数は不変。
const romaFold = s => collapseV(squash(s).replace(/ou/g,'o'));
const RJ5 = [];   // buildSearchIndex()（式は rj5Row）
const rj5Row = r => romaFold(r[9]||'');
// 型番を正規化して行ごとに保持（';'区切りは分けて全部）。現物どおり（ハイフン/スペース）打っても照合できるようにする。
const CODEKEYS = [];   // buildSearchIndex()（式は codeKeysRow）
const codeKeysRow = r => r[3].split(';').map(codeKey).filter(Boolean);
// 第6レーン（2026-10-27）: 外来語のローマ字（taigaaheri）を英語の綴り（Tiger Heli）で引く。
// 英題が無い行（全体の57%）は、英語で打つと row[9] のローマ字にしか当たらず、外来語はカナ読みの綴り（taigaa・suupaa）なので外れていた
// （GA4 の書き出しの後の調査: Kyukyoku Tiger Heli が0件）。両方を「子音の骨格」に畳んで照合する:
//   英語側（en）は非 r 音化（tiger→tige）・ph/gh/ck/th/c/x/q の読み替え・母音の y を消す。両側で l→r・v→b・f→h・z→s・j→g・dg→g、
//   母音を消し、同じ字の重なりを1つに。Tiger Heli も taigaaheri も tghr。
// ★クエリが英字だけで骨格が6字以上のときだけ。ほかの5レーンで外れた行にだけ試す（既存のヒットは減らない・並びは段5＝最後）。
// ★照合は行のローマ字の語の始まりからだけ（語の途中から当たると乱射した: Shatterhand が kanshuu the unou に当たっていた）。
// 試算（英題とローマ字の両方がある行から3,000件・英題で引く）: 自分の行が出るのが 788→1,100。新たに当たる語の件数は中央値3・90%で13。
// 誤ヒットの例: Street Fighter→Stellar☆Theater、Guardian Heroes→戦国BASARA 英雄外伝（HEROES）、Blue Stinger→BLASTING AGENT。
const skelWord = (w, en) => {
  if(en){
    w = w.replace(/ph/g,'f').replace(/gh/g,'').replace(/ck/g,'k').replace(/qu/g,'kw').replace(/th/g,'s').replace(/wh/g,'w');
    w = w.replace(/c(?=[eiy])/g,'s').replace(/c/g,'k').replace(/x/g,'ks').replace(/q/g,'k');
    w = w.replace(/(?<=[aeiouy])r(?![aeiou])/g,'');   // 非 r 音化: tiger→tige、fighters→fightes
    w = w.replace(/y(?![aeiou])/g,'');                // 母音の y（story）
  }
  w = w.replace(/l/g,'r').replace(/v/g,'b').replace(/f/g,'h').replace(/z/g,'s').replace(/j/g,'g').replace(/dg/g,'g');
  return w.replace(/[aeiou]/g,'').replace(/(.)\1+/g,'$1');
};
const skel = (s, en) => fold(accent(s)).split(' ').filter(w => /^[a-z0-9]+$/.test(w)).map(w => skelWord(w, en)).join('');
const RJ6 = [];   // buildSearchIndex()（式は rj6Row）。語ごとの骨格を空白で区切った列
const rj6Row = r => fold(r[9]||'').split(' ').filter(w => /^[a-z0-9]+$/.test(w)).map(w => skelWord(w, false)).join(' ');
// @search-formula-end
/* ============================================================
   検索の索引づくり（2026-10-19・data-split）。以前は読み込み時に全行で作っていて、4倍遅い CPU で13〜15秒ページが止まっていた。
   本体が動いたあと（読み取り画面・カードが先に出る）、数百行ずつ区切って作る。作り終わるまで run() は「Preparing search…」を出して待つ。
   ★AMBIG_EN（英題が複数の日本版にまたがる注記）と PLAT_TERMS（④ 機種名を外して探し直す）も同じ行の回しで作る。
   ★作り終わったら: 先に待っていたもの（links.json の別名＝applyBlogAliases）→ 待っていた検索 → 待っていた search の計測 の順に流し、
     <html data-catalog="ready"> にする（道具はこれを待つ）。
   ★式（hayRow 等）は以前の DATA.map(...) の中身と同じ。並び・中身は変えていない。
   ============================================================ */
let SEARCH_READY=false, pendingRunOpts=null, pendingSearchLog=false;
/* ★2026-10-21（main 2b2634d・d0a828e の移植・data-split 版）: /?q= 付きで開いたときの最初の検索は、links.json（別名）を読み終えるまで待つ。
   以前は別名なしで先に件数を出し、あとで出し直していた（/?q=タイガーヘリ が 3件 → 7件）。待つのは索引ができてから最長 LINKS_WAIT_MS。
   型番・バーコードの形（queryKind が code / barcode）は待たない（店頭でいちばん速く出したい語）。待つあいだは件数の代わりに「Searching…」。
   links.json の読み終わり（成功・失敗とも）に <html data-links="ready|none">。data-catalog="ready" は待っていた最初の検索を描いたあとに付ける。 */
const LINKS_WAIT_MS=2000;
let linksState='', firstRunWaiting=null, linksWaitTimer=null, ranSinceReady=false;
function releaseFirstRun(){   // 待っていた最初の検索を1回だけ流す（links.json が届いた／LINKS_WAIT_MS たった）
  if(!firstRunWaiting) return;
  const o=firstRunWaiting; firstRunWaiting=null; clearTimeout(linksWaitTimer); linksWaitTimer=null;
  run(o);
  if(pendingSearchLog){ pendingSearchLog=false; logSearch(); }
  document.documentElement.setAttribute('data-catalog','ready');
}
let indexProbe='';   // 見本の照合の結果（buildSearchIndex の fill()）。'' ＝照合まで行かなかった
const searchReadyQueue=[];
function whenSearchReady(fn){ if(SEARCH_READY) fn(); else searchReadyQueue.push(fn); }
// /?scan=1 で読み取り画面を引き継ぐ途中なら、索引づくりはその後に始める（openScan が scanSettled() を呼ぶ・最長8秒待つ）。
let scanSettle=null;
function scanSettled(){ if(scanSettle){ const f=scanSettle; scanSettle=null; f(); } }
function buildSearchIndex(){
  const E=window.__earlyScan;
  if(E && E.started && !E.closed && !buildSearchIndex.waited){
    buildSearchIndex.waited=true;
    let done=false; const go=()=>{ if(done) return; done=true; scanSettle=null; buildSearchIndex(); };
    scanSettle=go; setTimeout(go, 8000); return;
  }
  // 読み取り画面（/?scan=1）でないときは区切らない（区切ると検索が使えるまでが4倍遅い CPU で十数秒延びた）。
  // /?scan=1 では、iPhone の「Start camera」をまだ押していなくても区切る（一度に作るとタップが十数秒待たされた・2026-10-19）。
  const scanning = !!(E && !E.closed);
  const n=DATA.length, STEP=scanning ? 600 : n; let i=0;
  document.documentElement.setAttribute('data-catalog','indexing');
  // 2026-10-19: ビルドのときに作った索引（catalog/index-*.json・tools/build_search_index.mjs）があれば、それを入れるだけ。
  //   manifest とカタログの md5・行数が合うときだけ使う。無い・合わない・取れないときは下の step() で自分で作る（以前と同じ）。
  const fill=ix=>{
    const m=window.KB_CATALOG||{};
    if(!ix || ix.v!==1 || ix.catalog_md5!==m.md5 || ix.fold_md5!==m.fold_md5 || ix.rows!==n
       || !Array.isArray(ix.hay) || ix.hay.length!==n || !Array.isArray(ix.rj6) || ix.rj6.length!==n || ix.hay4.length!==n || ix.rj.length!==n || ix.rj5.length!==n || ix.ck.length!==n) return Promise.resolve(false);
    // 見本の照合（2026-10-19）: 索引は node の Unicode の表で作ってある。このブラウザ（特に iPhone の Safari）で同じ式を見本の行に掛け、
    //   一字でも違えば索引は使わず自分で作る（検索語はこのブラウザで畳むので、索引も同じブラウザの畳み方でないと当たらない）。
    //   見本 ＝ 等間隔 200 行＋ラテン・かな・漢字以外の字を含む行 200 行（tools/build_search_index.mjs の probe）と PLAT_TERMS の全語。
    const pr=ix.probe;
    if(!pr || !Array.isArray(pr.rows) || pr.rows.length<100 || !Array.isArray(pr.plat_src) || pr.plat_src.length!==ix.plat_terms.length){ indexProbe='no-probe'; return Promise.resolve(false); }
    // 2026-10-29: 照合と写しと第6レーンの表を小分けにして（合間にキー入力・描画を通す）、Promise で真偽を返す（fillChunked）。
    const yn=window.__kbYield || (()=>Promise.resolve());
    let j=0;
    const probe=()=>{ const end=Math.min(pr.rows.length, j+100);
    for(;j<end;j++){
      const k=pr.rows[j], r=DATA[k];
      if(!r || hayRow(r)!==ix.hay[k] || hay4Row(r)!==ix.hay4[k] || rjRow(r)!==ix.rj[k] || rj5Row(r)!==ix.rj5[k]
         || codeKeysRow(r).join('\n')!==ix.ck[k].join('\n') || rj6Row(r)!==ix.rj6[k] || strong(r[0]||'')!==pr.strong[j][0] || strong(r[1]||'')!==pr.strong[j][1]){
        indexProbe='mismatch row '+k; return false;
      }
    }
    return j<pr.rows.length ? yn().then(probe) : true; };
    return Promise.resolve().then(probe).then(ok=>{
      if(!ok) return false;
      for(let j=0;j<ix.plat_terms.length;j++) if(fold(accent(pr.plat_src[j]||''))!==ix.plat_terms[j][0]){ indexProbe='mismatch plat '+j; return false; }
      indexProbe='ok '+pr.rows.length+' rows';
      let k=0;
      const copy=()=>{ const end=Math.min(n, k+10000);
        for(;k<end;k++){ HAY[k]=ix.hay[k]; HAY4[k]=ix.hay4[k]; RJ[k]=ix.rj[k]; RJ5[k]=ix.rj5[k]; RJ6[k]=ix.rj6[k]; CODEKEYS[k]=ix.ck[k]; }
        return k<n ? yn().then(copy) : true; };
      return copy().then(()=>{
        for(const k of ix.ambig) AMBIG_EN.add(k);
        for(const p of ix.plat_terms) PLAT_TERMS.push(p);
        ambigMap.clear(); platTermsMap.clear();
        // 第6レーンの表（rj6J）: 準備完了を遅らせないよう、準備完了の後に裏で小分けに作る（それより先に英字で探したら残りをその場で作る＝以前と同じ）。
        //   ★準備完了の前に作る形も試したが、索引の取り込みが約6秒延び、最初の検索も速くならなかった（10/29・4倍遅い CPU）。
        whenSearchReady(()=>rj6Build(()=>new Promise(r=>setTimeout(r,0))));
        return true;
      });
    });
  };
  const step=()=>{
    const end=Math.min(n,i+STEP);
    for(;i<end;i++){ const r=DATA[i]; HAY[i]=hayRow(r); HAY4[i]=hay4Row(r); RJ[i]=rjRow(r); RJ5[i]=rj5Row(r); RJ6[i]=rj6Row(r); CODEKEYS[i]=codeKeysRow(r); ambigAdd(r); platTermsAdd(r); }
    if(i<n){ setTimeout(step,0); return; }
    ambigFinish(); platTermsFinish();
    finish();
  };
  const finish=()=>{
    SEARCH_READY=true;
    for(const fn of searchReadyQueue.splice(0)){ try{ fn(); }catch(e){ console.warn('searchReady', e); } }
    const o=pendingRunOpts; pendingRunOpts=null;
    const qk = q.value.trim() ? queryKind(q.value) : '';
    // 2026-10-21: 題名の語で links.json がまだなら、別名を待ってから1回で出す（上の LINKS_WAIT_MS・2秒は索引ができた今から数える）
    if(o && qk && !linksState && qk!=='code' && qk!=='barcode'){
      firstRunWaiting=o; if(!results.querySelector('.qa')) count.textContent='Searching…';   // 最初の答えが出ていれば件数の文はそのまま
      linksWaitTimer=setTimeout(releaseFirstRun, LINKS_WAIT_MS);   // 届かなければ別名なしで出す（届いたら links.json の処理で検索し直す）
      return;   // 計測（pendingSearchLog）と data-catalog="ready" は releaseFirstRun で
    }
    // 何か打っていた・絞り込んでいたときだけ検索し直す（空のまま run() すると、読み取りで出したカードを消してしまう）
    if(o && (q.value.trim() || plat.value!=='All' || pub.value!=='All' || year.value!=='All')) run(o);
    else if(current.length) paint();   // 出ているカードを描き直す（AMBIG_EN の注記が入る。札・並びは変えない）
    if(pendingSearchLog){ pendingSearchLog=false; logSearch(); }
    document.documentElement.setAttribute('data-catalog','ready');
  };
  // <html data-index> … prebuilt（索引を使った）／computed（索引が無い・取れない）／computed-probe（見本が合わず自分で作った）。調べる人のための印。
  const root=document.documentElement;
  const self=why=>{ root.setAttribute('data-index', why); if(why==='computed-probe') try{ console.warn('search index: '+indexProbe+' — building in the browser'); }catch(e){} setTimeout(step,0); };
  const ixp = window.__kbCat && window.__kbCat.idx;
  if(ixp) ixp.then(ix=>fill(ix).then(ok=>{ if(ok){ root.setAttribute('data-index','prebuilt'); finish(); } else self(ix && indexProbe!=='' ? 'computed-probe' : 'computed'); }), ()=>self('computed'));
  else self('computed');
}
// Publisher list per row = ENGLISH names (index 6), split & trimmed — used by the filter.
// Filtering by the English name is what merges 任天堂 + Nintendo into one working option
// (keying by the Japanese value would leave them split and miss those rows).
const KB_PRE = window.__kbPre || null;   // 2026-10-29: 起動の前に小分けで作った表（下の「カタログの読み込み」の prep）。無ければここで作る（以前と同じ式）
const PUBS = KB_PRE ? KB_PRE.PUBS : DATA.map(r => r[6].split(';').map(s=>s.trim()).filter(Boolean));

// ============================================================
// 検索結果の並び順（案F・2026-09-26）。当たり外れは run() の5経路のまま変えず、当たった行の順番だけを決める。
// 段（小さいほど上）。見るのは題名の4列＝英題・和題・読み・ローマ字（HAY と同じ畳み方の値を HAY から取り出して使う）と型番:
//   0 完全一致（題名4列のどれか・スペースを消した英題/和題・ローマ字の長音畳み・型番）
//   1 前方一致で語の切れ目で終わる（final fantasy → final fantasy 7）・型番の前方一致
//   2 語として含む（record of radia war の radia）
//   3 前方一致で語の途中で終わる（radia → radiant）
//   4 題名のどこかに含む・揺れを吸う経路（第2・第4・第5レーン）で当たった
//   5 題名以外（機種・発売元）にだけ当たった
// ★段0の中だけ発売年の古い順（同じ題名の原作を先に。悪魔城ドラキュラ→FC、トップハンター→AES）。他の段の中は DATA の順。
// ★日本語の題名（和題・読みのうち、かな・漢字を含む値）は段1と段3を区別しない（前方一致なら段1）。
//   和題はスペースの有無が行ごとにばらばらで、「ファイアーエムブレム 蒼炎の軌跡」のようにスペースがある行だけが上がってしまうため。
//   英題・ローマ字、かな・漢字を含まない和題（Castlevania 等）は区別する。
// ★試算は scratchpad/kataban_rank_sim.js（rank.G）。件数は変わらない（並べ替えるだけ）。
const JP_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rankTier(i, lane, lo, qk, sq, r5, wbRe, wwRe, loT){
  const f = HAY[i].split('\n');
  const T = [f[0], f[1], f[6], f[7]].filter(Boolean);     // 英題・和題・読み・ローマ字（畳み済み）
  const codes = CODEKEYS[i];
  // ★2026-11-17（en-rank）: 先頭の "the " は無くても完全一致（Legend of Zelda → The Legend of Zelda）。loT は rankHits が作る
  if(T.includes(lo) || (loT && T.some(t => t.replace(/^the /, '') === loT)) || (qk.length >= 3 && codes.includes(qk))
     || (sq && HAY4[i].split('\n').includes(sq)) || (r5.length >= 5 && RJ5[i] === r5)) return 0;
  if(T.some(t => wbRe.test(t)) || (qk.length >= 4 && codes.some(c => c.startsWith(qk)))) return 1;
  if([f[1], f[6]].some(t => t && JP_SCRIPT.test(t) && t.startsWith(lo))) return 1;   // 日本語の題名は段1と段3を分けない
  if(T.some(t => wwRe.test(t))) return 2;
  if(T.some(t => t.startsWith(lo))) return 3;
  if(T.some(t => t.includes(lo)) || lane === 2 || lane === 4 || lane === 5) return 4;
  return 5;
}
// ★2026-11-17（na-aliases）: 北米名（links.json の r・blog/_parts/na_titles.json・出典2つ）。検索語が北米名と同じなら、
//   その日本版を段0より上に置く（段「-1」。中は発売年の古い順）。例: Final Fantasy III → SFC FF6 が FC FF3 より上。
//   比べるのは fold と squash の2通り（"Super Mario Bros 2" と "Super Mario Bros. 2"）。先頭の "The " は無くても同じ。
let NA_Q = null;   // fold した北米名 → 「機種\t和題」の集合。links.json が届いたら setNaTitles() が作る
let NA_FIRST = new Set();   // links.json の rf: 同じ北米名の日本版が2つ以上あるとき、発売年に関係なく先に出すキー（2026-11-18: SMB2 → スーパーマリオUSA を夢工場より上）
function setNaTitles(r, rf){
  NA_Q = new Map(); NA_FIRST = new Set(Array.isArray(rf) ? rf : []);
  const add = (s, k) => { if(!s) return; if(!NA_Q.has(s)) NA_Q.set(s, new Set()); NA_Q.get(s).add(k); };
  for(const k in r) for(const n of r[k]){
    for(const v of [n, n.replace(/^the\s+/i, '')]){ add(fold(accent(v)), k); add('\u0000' + squash(accent(v)), k); }
  }
}
function naHit(i, lo, sq){   // 0 = 当たらない・1 = 北米名の日本版・2 = そのうち先に出すもの（rf）
  if(!NA_Q) return 0;
  const k = DATA[i][2] + '\t' + DATA[i][1];
  const a = NA_Q.get(lo), b = sq ? NA_Q.get('\u0000' + sq) : null;
  return ((a && a.has(k)) || (b && b.has(k))) ? (NA_FIRST.has(k) ? 2 : 1) : 0;
}
function rankHits(idx, lanes, lo, qk, sq, r5){
  const wbRe = new RegExp('^' + reEsc(lo) + '(\\s|$)');
  const wwRe = new RegExp('(^|\\s)' + reEsc(lo) + '(\\s|$)');
  const loT = lo.replace(/^the /, '');
  // ★2026-11-17（en-rank）: 鍵は 段 → 配信専用か（row[12]・ソフトを先に）→ 発売年（段0〜2 と北米名だけ・古い順）→ DATA の順。
  //   段1・2 は1つにまとめて古い順にした。完全一致の題名が無い語（Kirby・Mario Kart・Fire Emblem・Pokemon）で元祖を先に出すため。段3〜5 は DATA の順のまま。
  const keyed = idx.map((i, n) => {
    const yr = parseInt(DATA[i][4], 10) || 9999;   // 年が無い行は同じ段の最後
    const dl = DATA[i][12] ? 1 : 0;
    const na = naHit(i, lo, sq);
    if(na) return { n, g: na === 2 ? -2 : -1, dl, y: yr };      // 北米名の日本版（段0より上。rf はさらに上）
    const t = rankTier(i, lanes[n], lo, qk, sq, r5, wbRe, wwRe, loT);
    return { n, g: t === 2 ? 1 : t, dl, y: t <= 2 ? yr : 0 };   // 段1（前方一致）と段2（語として含む）は同じ扱い（Mario Kart → Super Mario Kart が元祖）
  });
  keyed.sort((a, b) => a.g - b.g || a.dl - b.dl || a.y - b.y || a.n - b.n);   // 最後は元の順（DATA の順）
  return keyed.map(x => x.n);
}

// 英題の曖昧さ判定。strong = NFKC → 小文字化 → 空白・中黒・約物(P)・記号(S)を全除去
// （前回の集計と同一の関数）。起動時に一度だけ、strong(row0) が 2種類以上の異なる
// strong(row1) に付いている英題キーの集合を作る。card() はこれを参照して注記を出す。
const strong = s => (s||'').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');
// 2026-10-19（data-split）: 中身は buildSearchIndex() が行ごとに ambigAdd() で数え、作り終わりに ambigFinish() で入れる
// （読み込み時に全行で作ると4倍遅い CPU で約3.6秒止まっていた）。作り終わるまでは空＝注記が出ないだけ。
// 読み取り（JAN と完全一致）のカードはもともと注記を出さない。作り終わったら、出ているカードを描き直す。
const AMBIG_EN = new Set();
const ambigMap = new Map();                              // strong(row0) -> Set(strong(row1))
function ambigAdd(r){
  if(!r[0]) return;                                      // 英題が空の行は数えない
  const k0 = strong(r[0]); if(!k0) return;
  let s = ambigMap.get(k0); if(!s) ambigMap.set(k0, s = new Set());
  s.add(strong(r[1]));
}
function ambigFinish(){ for(const [k, s] of ambigMap){ if(s.size >= 2) AMBIG_EN.add(k); } ambigMap.clear(); }  // 2種類以上の日本語名に付く英題だけ

// Platform dropdown — the value is used as-is (already English from the pipeline).
const PLATFORM_COUNTS = KB_PRE ? KB_PRE.PLATFORM_COUNTS : DATA.reduce((m,r)=>(m[r[2]]=(m[r[2]]||0)+1,m),{});
const PLATFORMS = Object.keys(PLATFORM_COUNTS).filter(Boolean)
  .sort((window.__kbColl ? window.__kbColl.base : new Intl.Collator(undefined, {numeric:true, sensitivity:'base'})).compare);   // 2026-10-29: localeCompare に options を渡すと比べるたびに照合器を作り直す（4倍遅い CPU で約1.8秒）。同じ並び
plat.innerHTML = '<option value="All">All platforms</option>' +
  PLATFORMS.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');

// Publisher dropdown — one entry per unique ENGLISH publisher name (index 6).
// Value AND display are the English name; sorted by English name so prefixed
// relatives sit together (Bandai / Bandai Namco Entertainment / Bandai Namco Games).
// Companies without an English name carry the Japanese name in index 6, so no branch needed.
const PUB_COUNTS = KB_PRE ? KB_PRE.PUB_COUNTS : {};
if(!KB_PRE) for(const list of PUBS) for(const p of list) PUB_COUNTS[p]=(PUB_COUNTS[p]||0)+1;
// プルダウンは名寄せ後(row[6])の件数が 50 本以上の社だけを出す（短く・有名どころに絞る）。
// A→Z は維持。All publishers はしきい値・ソート対象外で先頭固定（下の innerHTML 先頭に連結）。
const PUB_MIN = 50;
const PUBLISHERS = Object.keys(PUB_COUNTS)
  .filter(p => PUB_COUNTS[p] >= PUB_MIN)
  .sort((window.__kbColl ? window.__kbColl.ja : new Intl.Collator('ja')).compare);   // 2026-10-29: localeCompare(b,'ja') と同じ並び（照合器は1つ）
// ---- パブリッシャー手入力（タイプアヘッド）------------------------------------
// #pub は hidden。確定した publisher_en(正規名) を保持し、run() は従来どおり pub.value を読む。
// 可視の #pubInput に打つと候補を出す。照合は大小無視・部分一致 ＋ 下の ALIAS（最小限）。
// 空フォーカスは有名どころ(件数≥50=PUBLISHERS)を A→Z。入力時は全社(しきい値なし)から。
//
// ★ALIAS はここに1行足すだけで拡張できる（部分一致で拾える名前は入れない＝二重管理を避ける）。
const ALIAS = {
  "squaresoft": "Square Enix", "square soft": "Square Enix",
  "tecmo koei": "Koei Tecmo",
  "sce": "Sony Interactive Entertainment", "scei": "Sony Interactive Entertainment",
  "sie": "Sony Interactive Entertainment", "sony": "Sony Interactive Entertainment",
  "psygnosis": "Sony Interactive Entertainment",
};
const PUB_ALL = Object.keys(PUB_COUNTS);              // 全社（しきい値なし。ロングテールは打てば出る）
const pubInput = $('#pubInput'), pubList = $('#pubList');

// 入力 q に対する候補（正規名の配列, 最大8, 完全一致を先頭・以降は件数降順）
function pubCandidates(q){
  q = q.trim().toLowerCase();
  if(!q) return PUBLISHERS.slice();                  // 空: 有名どころ A→Z（PUBLISHERS は既に A→Z）
  const set = new Set();
  for(const name of PUB_ALL){                        // ① 部分一致（大小無視・前方一致に限らない）
    if(name.toLowerCase().includes(q)) set.add(name);
  }
  for(const a in ALIAS){                             // ② エイリアス部分一致 → その正規名を追加
    if(a.includes(q) || q.includes(a)){
      const canon = ALIAS[a];
      if(PUB_COUNTS[canon]) set.add(canon);
    }
  }
  return [...set].sort((x,y)=>{
    const ex = x.toLowerCase()===q, ey = y.toLowerCase()===q;
    if(ex!==ey) return ex ? -1 : 1;                  // 完全一致を最上位
    return PUB_COUNTS[y]-PUB_COUNTS[x];              // 以降は件数降順
  }).slice(0,8);
}

// 候補リストを描画して開く。先頭に All publishers（＝絞り込み解除）。
function pubRender(){
  const cands = pubCandidates(pubInput.value);
  pubList.innerHTML = '<div class="pubopt" data-val="All">All publishers</div>' +
    cands.map(n=>`<div class="pubopt" data-val="${esc(n)}">${esc(n)}<span class="c">${PUB_COUNTS[n]}</span></div>`).join('');
  pubList.hidden = false;
  pubInput.setAttribute('aria-expanded','true');
}
function pubClose(){ pubList.hidden = true; pubInput.setAttribute('aria-expanded','false'); }

// 確定：hidden #pub に正規名を入れて、既存の run() フィルタをそのまま回す。
function pubSelect(val){
  pub.value = val;                                   // ← 既存 run() が読む値（433行の pv）
  pubInput.value = (val==='All') ? '' : val;
  pubClose();
  run();
}
// スキャン/全リセットからのクリア用（run は呼ばない。呼び出し側が描画を持つ）
function pubReset(){ pub.value='All'; pubInput.value=''; pubClose(); }

pubInput.addEventListener('focus', pubRender);
pubInput.addEventListener('input', ()=>{
  if(pubInput.value.trim()===''){ pub.value='All'; run(); }   // 入力を空にしたら All に戻す
  pubRender();
});
// blur より先に確定させる（mousedown で拾う＝モバイルのタップにも効く）
pubList.addEventListener('mousedown', e=>{
  const opt = e.target.closest('.pubopt');
  if(!opt) return;
  e.preventDefault();                                // input の blur を止めて選択を優先
  pubSelect(opt.dataset.val);
});
// 外側クリックで閉じる
document.addEventListener('click', e=>{ if(!e.target.closest('.pubwrap')) pubClose(); });

// Year dropdown — unique release years, descending.
const YEARS = [...(KB_PRE ? KB_PRE.YEARS : new Set(DATA.map(r=>r[4]).filter(Boolean)))].sort((c=>(a,b)=>c(b,a))((window.__kbColl ? window.__kbColl.def : new Intl.Collator()).compare));   // 2026-10-29: b.localeCompare(a) と同じ並び（照合器は1つ）
year.innerHTML = '<option value="All">All years</option>' +
  YEARS.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');

//@@KB-SPLIT@@ ── 2026-10-29（boot-chunks）: 本体はここで区切って別々の <script> として順に動かす（間にキー入力・描画を通す）。区切りの前の文は後ろの関数を起動の時点では呼ばないこと
// ============================================================
// リージョン注記 — 機種 → 英文の対応表。
// 以前は全行に "runs only on a Japanese {機種}" を出していたが、これは機種の3割で嘘だった
// (GB/GBA/DS/PSP/Vita/PS3〜5/Switch/Xbox One はディスク・カートリッジがリージョンフリー)。
// 「日本版だから日本の本体が要る」は、買う前に一番効く情報なので、間違えてはいけない。
//
// 3分類。分からない機種は neutral に落とす = 断定しない(罠#62「断定の形容詞は数字より危険」)。
//   lock : 日本の本体が要る(物理的に挿さらない / リージョンロック)
//   free : どの本体でも動く。中身の言語は日本語のまま
//   (表に無い機種) : neutral = 常に真の文だけ出す
//   mixed : 同じ機種に媒体が2種類混ざる（DATA では見分けられない）。どちらの行に出ても正しい1文を e[2] にそのまま入れる（e[3] は店モードの短い形）。
//           ★e[2] は手書きの HTML 定数（<b> を含む）なので esc() しない。外部の値を入れないこと。
//           PC Engine＝HuCard と CD-ROM²（約 400 行）、Mega Drive＝カートリッジとメガCD（116 行）・32X（17 行）、
//           Famicom＝カートリッジとディスクシステム（198 行）。行数は MADB の mediaFormat で 2026-09-28 に実測。
//           ★つなぎ（2026-09-28）。媒体の列を DATA に足したら（region-media ブランチ）媒体ごとの注記に分ける。
//           出典: PCE CD はリージョンなし（nicole.express・Wikipedia TurboDuo）、メガCD はリージョンあり（SDA KB・ConsoleMods）、
//           ディスクシステムは日本と香港だけ（Wikipedia・FamiWiki）、32X は本体側の判定で作品による（SDA KB〔Unconfirmed〕・AtariAge）。
// ★2026-11-11（region-badge・こはさん決定）: 北米・欧州の札（REGION_TIER）を足した。理由の文はこの表のまま More に入る。
//   adapter : 北米・欧州の本体では変換アダプタ・コンバーターカートリッジが要る（12/5 早見表の Adapter needed）。e[2] が理由
//   var     : タイトルごとに発売元が地域を選ぶ（Xbox・Xbox 360）。e[2] が理由
//   Super Famicom・Nintendo 64・Sega Saturn は lock → adapter（早見表に合わせた）。Xbox は lock → var。
//   Neo Geo(AES)・Neo Geo CD・3DO・Virtual Boy は出典が2つそろったので free で足した（出典は REGION_TIER の上）。
// ★機種を足したら、ここに1行足すか、足さずに neutral のまま出すか。放置しても嘘にはならない。
// ============================================================
const REGION = {
  'Famicom':        ['mixed','','<b>carts need an adapter</b> on an NES; disk games need a Disk System, never sold in the West','Carts need an NES adapter; disk games a Disk System'],
  'Super Famicom':  ['adapter','','two tabs in the North American slot block the cartridge, and a lockout chip blocks it on European consoles; a few games add their own check'],
  'Nintendo 64':    ['adapter','','each region’s cartridges have different notches on the back, the same kind of lock as the Super NES'],
  '64DD':           ['lock','a Japanese Nintendo 64 with a 64DD','the 64DD was never released outside Japan'],
  'GameCube':       ['lock','a Japanese GameCube','GameCube discs are region-locked'],
  'Wii':            ['lock','a Japanese Wii','Wii discs are region-locked'],
  'Wii U':          ['lock','a Japanese Wii U','Wii U discs are region-locked'],
  'Nintendo 3DS':   ['lock','a Japanese 3DS','3DS cartridges are region-locked'],
  'PC Engine':      ['mixed','','<b>HuCards need a converter</b> on a TurboGrafx-16; CDs are region-free (check the System Card)','HuCards need a converter; CDs are region-free'],
  'PC-FX':          ['lock','a Japanese PC-FX','the PC-FX was never released outside Japan'],
  'Mega Drive':     ['mixed','','<b>carts need an adapter</b> on a US Genesis; Mega-CD and some 32X games are region-locked','Carts need a Genesis adapter; Mega-CD is region-locked'],
  'Sega Mark III':  ['lock','a Japanese Mark III','Mark III cartridges do not fit a Master System'],
  'Sega Saturn':    ['adapter','','Saturn discs are region-locked; a converter cartridge gets around it, but the language does not change'],
  'Dreamcast':      ['lock','a Japanese Dreamcast','Dreamcast discs are region-locked'],
  'PlayStation':    ['lock','a Japanese PlayStation','PS1 discs are region-locked'],
  'PlayStation 2':  ['lock','a Japanese PlayStation 2','PS2 discs are region-locked'],
  'Xbox':           ['var','','each publisher chose the regions its original Xbox disc runs in'],
  'Xbox 360':       ['var','','each publisher chose the regions its Xbox 360 disc runs in'],
  'Game Boy':          ['free','Game Boy','Game Boy cartridges are region-free'],
  'Game Boy Advance':  ['free','Game Boy Advance','GBA cartridges are region-free'],
  'Game Gear':         ['free','Game Gear','Game Gear cartridges are region-free'],
  'WonderSwan':        ['free','WonderSwan','the WonderSwan was Japan-only, so every unit plays it'],
  'Neo Geo Pocket':    ['free','Neo Geo Pocket','Neo Geo Pocket cartridges are region-free'],
  'Nintendo DS':       ['free','Nintendo DS','DS cartridges are region-free, except software made only for the DSi'],
  'PSP':               ['free','PSP','UMDs are region-free'],
  'PlayStation Vita':  ['free','PS Vita','Vita cards are region-free'],
  'PlayStation 3':     ['free','PlayStation 3','PS3 discs are region-free'],
  'PlayStation 4':     ['free','PlayStation 4','PS4 discs are region-free'],
  'PlayStation 5':     ['free','PlayStation 5','PS5 discs are region-free'],
  'Nintendo Switch':   ['free','Switch','Switch cartridges are region-free'],
  'Xbox One':          ['free','Xbox One','Xbox One discs are region-free'],
  'Neo Geo':           ['free','Neo Geo (AES)','Neo Geo cartridges are region-free and the same shape everywhere'],
  'Neo Geo CD':        ['free','Neo Geo CD','Neo Geo CD discs are region-free; some games switch language with the console'],
  '3DO':               ['free','3DO','3DO discs are region-free, though a few Japanese games need a kanji font only Japanese consoles have'],
  'Virtual Boy':       ['free','Virtual Boy','Virtual Boy cartridges are region-free; the console was sold only in Japan and North America'],
};
// 北米・欧州の本体で動くかの札（2026-11-11・region-badge・こはさん決定）。値は「北米 欧州」の2文字。
//   o＝そのまま動く／a＝変換アダプタが要る／x＝売っているままでは動かない（改造・起動ディスクが要る）／v＝タイトルによる（グレー）／-＝札を出さない。
//   出典は 12/5 早見表（blog/2026-99-99-japanese-games-region-lock-chart.html・各行2出典・10/30 確認）＋ en Wikipedia「Region lock」revid 1384605268（11/11 確認）。
//   早見表に無い機種の2つ目: Neo Geo CD・Virtual Boy・Xbox One は en の各機種ページ（Regionless 分類と本文）、3DO は en「3DO」、Xbox・Xbox 360 は ja「リージョンコード」（一部作品）。
//   札を出さないもの（文は REGION のまま）: 出典が1つの組み合わせ（ファミコン・PCエンジンの欧州、Mark III）、その地域で本体が売られていない（64DD・PC-FX・ワンダースワン・Virtual Boy の欧州）、
//   DATA で媒体が分からず段階が割れる（ファミコン＝カセット△とディスク不可、PCエンジン＝HuCard△と CD○）。
//   配信版（row[12]）は札を出さない（要るのは日本のストアアカウント）。
const REGION_TIER = {
  'Super Famicom':'aa', 'Nintendo 64':'aa', 'Mega Drive':'aa', 'Sega Saturn':'aa',
  'Nintendo 3DS':'xx', 'GameCube':'xx', 'Wii':'xx', 'Wii U':'xx', 'Dreamcast':'xx', 'PlayStation':'xx', 'PlayStation 2':'xx',
  'Game Boy':'oo', 'Game Boy Advance':'oo', 'Nintendo DS':'oo', 'Nintendo Switch':'oo', 'Game Gear':'oo',
  'Neo Geo':'oo', 'Neo Geo CD':'oo', 'Neo Geo Pocket':'oo', '3DO':'oo', 'Virtual Boy':'o-',
  'PlayStation 3':'oo', 'PlayStation 4':'oo', 'PlayStation 5':'oo', 'PSP':'oo', 'PlayStation Vita':'oo', 'Xbox One':'oo',
  'Xbox':'vv', 'Xbox 360':'vv',
};
// 札の文言（6言語）。o・a は 12/5 早見表の各言語版の段階名と同じ。x・v は新しい語（11/11）。言語は blogLang() と同じ判定（KB_SHOP.lang）。
const REGION_L10N = {
  en:{na:'North America', eu:'Europe', o:'Works as is', a:'Adapter needed', x:'Won\u2019t run as sold', v:'Varies by game'},
  zh:{na:'北美', eu:'歐洲', o:'直接可用', a:'需要轉接器', x:'原廠主機無法執行', v:'依遊戲而異', lang:'zh-Hant'},
  ko:{na:'북미', eu:'유럽', o:'그대로 작동', a:'어댑터 필요', x:'판매 상태로는 작동 안 함', v:'게임마다 다름', lang:'ko'},
  es:{na:'Norteamérica', eu:'Europa', o:'Funciona tal cual', a:'Necesita adaptador', x:'No funciona de serie', v:'Depende del juego', lang:'es'},
  de:{na:'Nordamerika', eu:'Europa', o:'Läuft so', a:'Adapter nötig', x:'Läuft ab Werk nicht', v:'Je nach Spiel', lang:'de'},
  fr:{na:'Amérique du Nord', eu:'Europe', o:'Fonctionne tel quel', a:'Adaptateur nécessaire', x:'Ne fonctionne pas d\u2019origine', v:'Selon le jeu', lang:'fr'},
};
const REGION_SYM = { o:'\u25CB', a:'\u25B3', x:'\u2715', v:'~' };
// 札の列の HTML。札が1枚も無い機種は ''（呼び出し側は今までの1文に戻る）。
function regionChips(pf){
  const tier = Object.hasOwn(REGION_TIER, pf) ? REGION_TIER[pf] : '';
  if(!tier) return '';
  const L = REGION_L10N[KB_SHOP.lang()] || REGION_L10N.en;
  const la = L.lang ? ` lang="${L.lang}"` : '';
  const chip = (k, c) => (c && c !== '-')
    ? `<span class="rchip t-${c}"><span class="rs" aria-hidden="true">${REGION_SYM[c]}</span><span class="rk">${esc(L[k])}</span><span class="rv">${esc(L[c])}</span></span>`
    : '';
  const h = chip('na', tier[0]) + chip('eu', tier[1]);
  return h ? `<div class="rchips"${la}>${h}</div>` : '';
}
// 日本語なしで遊べるか（R17・2026-11-03）。links.json の n にある行は外部の2出典が揃った作品（目安の札なし）。
// ★2026-11-18（lang-barrier）: n に無い行は、ジャンルからの目安（catalog/lb-<md5>.json・tools/genre_tier.json）を「Estimate from genre」付きで出す。
//   n がジャンルより先（ジャンルと実際が違う作品の上書き）。どちらも無い行は何も出さない（地域の1文の「The game's text is Japanese.」のまま）。
// ★2026-11-19（こはさん指示）: 目安の行が出るカード（出典2つ・ジャンルの目安のどちらでも）では、地域の1文から「The game's text is Japanese.」を外す（langNeedShown）。
//   Play freely と並ぶと食い違って見えたため。目安の無いカードは今のまま一文を出す。地域の文は6言語とも英語なので、ここ1か所で全言語に効く。
//   文言は検索画面の zh/ko 表示（UIX・KB_SHOP.u・2026-11-18 tools/i18n_zhko.py でまとめた）。es/de/fr は英語。言語は ?hl → ブログで選んだ言語 → ブラウザ。
const LANG_NEED = { play:'p', menus:'m', text:'t' };
const LB_EN = { p:'Play freely', pd:'little text to read', m:'Some Japanese', md:'menus and options', t:'Text-heavy', td:'the story needs Japanese', Est:'Estimate from genre' };
const lbText = k => KB_SHOP.u('ln'+k, LB_EN[k]);
let LB_GENRE=null;   // DATA の行 → 'p'|'m'|'t'（ジャンルからの目安）。読めなければ null＝出ないだけ
// 北米名の1行（2026-11-17・links.json の x・blog/_parts/na_titles.json・出典2つ）。[文言, 比べる名前] の並び。
//   比べる名前が英題（row[0]）と同じ行では出さない（「English」欄にもう同じ名前が出ている）。「別の作品です」の行は比べる名前が空＝いつも出す。
function naNotes(r, en){
  const x = !r[12] && BLOG_LINKS && BLOG_LINKS.x && BLOG_LINKS.x[r[2]+'\t'+r[1]];
  if(!x) return '';
  const h = x.filter(([t, n]) => !(n && en && strong(n) === strong(en))).map(([t]) => `<div class="na-note">${esc(t)}</div>`).join('');
  return h;
}
function langNeedShown(r){ return !r[12] && !!((BLOG_LINKS && BLOG_LINKS.n && LANG_NEED[BLOG_LINKS.n[r[2]+'\t'+r[1]]]) || (LB_GENRE && LB_GENRE.get(r))); }
function langNeedNote(r){
  if(r[12]) return '';
  const src = BLOG_LINKS && BLOG_LINKS.n && LANG_NEED[BLOG_LINKS.n[r[2]+'\t'+r[1]]];
  const t = src || (LB_GENRE && LB_GENRE.get(r)) || '';
  if(!t) return '';
  const zk = KB_ZK(), la = zk==='zh' ? ' lang="zh-Hant"' : zk==='ko' ? ' lang="ko"' : '';
  return `<div class="lang-need ln-${t}"${la}><span class="ln-k">${esc(lbText(t))}</span> <span class="ln-d">&mdash; ${esc(lbText(t+'d'))}</span>`
    + (src ? '' : `<span class="ln-est">${esc(lbText('Est'))}</span>`) + `</div>`;
}
// ★2026-11-18（fan-tl）: 英語のファン翻訳（パッチ）がある作品の1行。links.json の f（blog/_parts/fan_tl.json・出典2つで全訳が公開済みと確かめた行だけ）。
//   キーは「機種\t和題\t型番（row[3] そのまま）」＝同じ題名の別の版（別の型番・別の機種）には出ない。配信専用（row[12]）には出さない。
//   表示だけ。パッチやゲームのデータへのリンクは置かない。「非公式のパッチで、元のカセット・ディスクのままでは英語にならない」を添える。
let FAN_TL=new Set();
const FT_EN = { D:'an unofficial patch made by fans; the original disc itself stays in Japanese', C:'an unofficial patch made by fans; the original cartridge itself stays in Japanese', G:'an unofficial patch made by fans; the original game itself stays in Japanese' };
const FT_CART = new Set(['Famicom','Super Famicom','Nintendo 64','Game Boy','Game Boy Advance','Nintendo DS','Nintendo 3DS','Virtual Boy','Mega Drive','Game Gear','Sega Mark III','WonderSwan','Neo Geo','Neo Geo Pocket']);
const FT_DISC = new Set(['Sega Saturn','Dreamcast','PlayStation','PlayStation 2','PlayStation 3','PlayStation 4','PlayStation 5','PSP','Mega-CD','3DO','Neo Geo CD','GameCube','Wii','Wii U','Xbox','Xbox 360','PC-FX']);
function fanTlNote(r){
  if(r[12] || !FAN_TL.has(r[2]+'\t'+r[1]+'\t'+r[3])) return '';
  // 媒体: ディスクの機種・カセットの機種・どちらもある機種（PC Engine の HuCARD と CD-ROM² など）は「元のゲーム」
  const md = FT_DISC.has(r[2]) ? 'D' : FT_CART.has(r[2]) ? 'C' : 'G';
  const zk = KB_ZK(), la = zk==='zh' ? ' lang="zh-Hant"' : zk==='ko' ? ' lang="ko"' : '';
  return `<div class="fan-tl"${la}><span class="ft-k">${esc(KB_SHOP.u('ft','English fan translation exists'))}</span> <span class="ft-d">&mdash; ${esc(KB_SHOP.u('ftd'+md, FT_EN[md]))}</span></div>`;
}
// 1行のHTMLを返す。機種が空なら何も出さない(嘘をつくより、無いほうがまし)。
// o.noText: 「日本語なしで遊べるか」の1行が出る行では、本文の言語の一文を出さない（1行のほうが具体的）。
// o.short: 店モード。遊べる本体・必要なものだけを1文で出し、理由は More で開く（2026-11-03）。
// o.bare: short の1文だけ（More を付けない）。スマホのカードの最初の部分で使う（2026-11-06・card-compact）。理由の全文は More details を開くと出る本来の .region。
function regionNote(r, o={}){
  const pf = r[2];
  if(!pf) return '';
  // 配信専用(row[12]) は棚にも本体にも話が及ばない。要るのは日本のストアアカウント。
  if(r[12]) return `<div class="region dl"><span class="tick" aria-hidden="true"></span><span class="t">`
    + `<b>Download-only Japanese release</b> — no disc or cartridge exists. `
    + `You need <b>a Japanese store account</b> (and, on region-locked consoles, Japanese hardware).</span></div>`;
  const e = REGION[pf];
  const lang = o.noText ? '' : ` The game's text is Japanese.`;
  let txt, brief='';
  if(e && e[0]==='mixed'){
    txt = `Japanese release — ${e[2]}.`;
    brief = `<b>${e[3]}</b>.`;
  } else if(e && e[0]==='lock'){
    txt = `Japanese release — needs <b>${esc(e[1])}</b>: ${esc(e[2])}.`;
    brief = `Needs <b>${esc(e[1])}</b>.`;
  } else if(e && e[0]==='free'){
    txt = `Japanese release — plays on <b>any ${esc(e[1])}</b>: ${esc(e[2])}.`;
    brief = `Plays on <b>any ${esc(e[1])}</b>.`;
  } else if(e && e[0]==='adapter'){
    txt = `Japanese release — needs <b>an adapter</b> on a North American or European console: ${esc(e[2])}.`;
    brief = `Needs <b>an adapter</b> outside Japan.`;
  } else if(e && e[0]==='var'){
    txt = `Japanese release — whether it runs outside Japan <b>varies by game</b>: ${esc(e[2])}.`;
    brief = `Region lock <b>varies by game</b>.`;
  } else {
    // 未収載。常に真のことだけ言う。
    return `<div class="region"><span class="tick" aria-hidden="true"></span><span class="t">`
      + `Japanese release —${o.noText?'':` the game's text is Japanese.`} <b>Check region compatibility</b> for your ${esc(pf)} before buying.</span></div>`;
  }
  // 2026-11-11（region-badge・案A）: 札がある機種は、今までの1文を北米・欧州の札に置き換え、理由の文（txt）は More に入れる。
  //   1つの要素に包む（スマホのカードは子要素ごとに order で並べ替えるので、札と More が離れないように）。bare は札だけ。
  const chips = regionChips(pf);
  if(chips){
    if(o.bare) return chips;
    return `<div class="region rg">${chips}<details class="region-more"><summary>More</summary><div class="t">${txt}${lang}</div></details></div>`;
  }
  const line = (o.short ? brief : txt) + lang;
  return `<div class="region"><span class="tick" aria-hidden="true"></span><span class="t">${line}</span></div>`
    + (o.short && !o.bare ? `<details class="region-more"><summary>More</summary><div class="t">${txt}</div></details>` : '');
}

// ============================================================
// 棚の目安 — row[11]（@ja-hrkt/@ja-latn 読みの先頭カナ→清音1字）から出す。
// フィールド調査(3店)の結論: ブックオフ・駿河屋は「行」、スーパーポテトは「一字」。
// **一字で持って、行に丸めた形も併記すれば全店に効く。** だから両方出す。
//
// ★店員画面ではなく結果カードに出す。棚を探すのは店員ではなく**ユーザー本人**で、
//   スマホを店員に渡している間、本人はこの情報を読めないため。
// row[11] が空の行では棚を出さず、代わりに「無い」と正直に書く。
// 配信専用(row[12])は棚に物が無いので、どちらも出さない。
// ============================================================
const GYO = {
  'ア':'あ行','イ':'あ行','ウ':'あ行','エ':'あ行','オ':'あ行',
  'カ':'か行','キ':'か行','ク':'か行','ケ':'か行','コ':'か行',
  'サ':'さ行','シ':'さ行','ス':'さ行','セ':'さ行','ソ':'さ行',
  'タ':'た行','チ':'た行','ツ':'た行','テ':'た行','ト':'た行',
  'ナ':'な行','ニ':'な行','ヌ':'な行','ネ':'な行','ノ':'な行',
  'ハ':'は行','ヒ':'は行','フ':'は行','ヘ':'は行','ホ':'は行',
  'マ':'ま行','ミ':'ま行','ム':'ま行','メ':'ま行','モ':'ま行',
  'ヤ':'や行','ユ':'や行','ヨ':'や行',
  'ラ':'ら行','リ':'ら行','ル':'ら行','レ':'ら行','ロ':'ら行',
  'ワ':'わ行',
};
function shelfNote(r){
  if(r[12]) return '';                       // 配信専用。棚そのものが無い
  const kana = r[11] || '';
  if(!kana) return `<div class="field">
      <span class="micro plain">${KB_SHOP.u('shelf0','On the shelf')}</span>
      <div class="cap">${KB_SHOP.u('shelfNone',"No shelf hint for this title — we don't have a reading for it, and a wrong shelf is worse than none.")}</div>
    </div>`;
  const gyo = GYO[kana] || '';
  const gyoHead = gyo ? gyo.charAt(0) : '';   // 「は行」→「は」。行の頭1字だけを札に出す
  return `<div class="field">
      <span class="micro plain">${KB_SHOP.u('shelf','On the shelf &middot; kana order')}</span>
      <div class="shelf-row">
        <span class="shelf-kana">${esc(kana)}</span>${gyoHead?`
        <span class="shelf-kana shelf-kana-gyo">${esc(gyoHead)}</span>`:''}
        <span class="shelf-txt">${KB_SHOP.u('shelfTxt',`Japanese shops file games by the <i>reading</i> of the title.
          Look under <b class="gyo">${esc(kana)}</b>${gyo?` — or the <b class="gyo">${esc(gyo)}</b> group where shelves are split by row`:''}.`,{k:esc(kana),g:gyo?KB_SHOP.u('shelfGyo','',{g:esc(gyo)}):''})}</span>
      </div>
    </div>`;
}

// ★2026-11-17（shop-kana）: 国内モード（LOC==='jp'）のカードの「棚で探す」欄。閉じたカード（スマホ）でも出す。
//   和題がラテン文字だけの行（CHRONO TRIGGER 等）は、日本語の読み（row[8]・Wikidata の日本語名）を大きく出す。棚の字（row[11]）と行（GYO）を横に。
//   和題にかな・漢字がある行は和題がそのまま見えているので、読みは出さず棚の行だけ。国内モードでは .instore の shelfNote() の代わりになる。
//   海外モードでは出さない（card() が LOC を見る）。
function shopKanaBox(r, jaLatin){
  if(r[12]) return '';
  const kana = r[11] || '';
  const gyo = GYO[kana] || '';
  const read = jaLatin ? ((r[8] && JP_SCRIPT.test(r[8])) ? r[8] : (READ_FILL.get(r) || '')) : '';   // READ_FILL＝表示だけの読み（manifest の rd）
  if(!kana && !read) return `<div class="field shopkana sk-none">
      <span class="micro plain">On the shelf</span>
      <div class="cap sk-cap">No shelf hint for this title — we don't have a reading for it, and a wrong shelf is worse than none.</div>
    </div>`;
  return `<div class="field shopkana">
      <span class="micro plain">${read ? 'Japanese reading &middot; on the shelf' : 'On the shelf &middot; kana order'}</span>
      <div class="sk-row">${read ? `
        <div class="sk-title" lang="ja">${esc(read)}</div>` : ''}${kana ? `
        <div class="sk-shelf" lang="ja"><span class="shelf-kana">${esc(kana)}</span><span class="sk-txt">「${esc(kana)}」の棚${gyo ? ` / ${esc(gyo)}` : ''}</span></div>` : ''}
      </div>
      <div class="cap sk-cap">Japanese shops file games by the <i>reading</i> of the title${kana ? `. Look under <b class="gyo">${esc(kana)}</b>${gyo ? ` — or the <b class="gyo">${esc(gyo)}</b> group where shelves are split by row` : ''}` : ''}.</div>
    </div>`;
}

// 棚の目安の「値」だけ（2026-09-11・印刷シート用）。shelfNote() と同じ入力（row[11] と GYO）から、
// 英文の説明を付けずに { kana, gyo } を返す。出せない行（配信専用・読み無し）は null。
function shelfKana(r){
  if(r[12]) return null;
  const kana = r[11] || '';
  if(!kana) return null;
  return { kana, gyo: GYO[kana] || '' };
}

/* ローマ字読み（row[9]）を出すかどうか。2026-09-11 に card() から切り出した（印刷シートと共用）。
   ★式とコメントは card() にあったものをそのまま移した。全行で card() の出力が変わらないことを実測で確認済み。
   ★en / jp / jpMain は card() と同じ取り方（row[0] / row[1] / 空なら英題）。 */
function romajiFor(r){
  const en = r[0], jp = r[1];
  const jpMain = jp||en;
  // row[1](日本語名)にかな・カタカナ・漢字が1字も無い＝箱の表記自体がラテン文字（card() の jaLatin と同じ式）。
  const jaLatin = !!jp && !/[぀-ヿ㐀-鿿]/.test(jp);
  // ローマ字は「日本語名にかな/漢字があるとき」に加え、ラテン表記の行(jaLatin)でも出す(row[9]があれば)。
  // row[9] が題名(jpMain または row[0])と正規化して同じ行では出さない(同じ語が2度続くのを止める)。
  // 例) 題名 METAL GEAR SOLID INTEGRAL / row[9] 同文字列 → 出さない。metarugia... の読みは出る。
  const romaji = (r[9] && (jaLatin || /[぀-ヿ㐀-鿿]/.test(jpMain))
    && codeKey(r[9]) !== codeKey(jpMain) && codeKey(r[9]) !== codeKey(en)) ? r[9] : '';
  return romaji;
}

/* ローマ字読みの見せ方（2026-10-27 試作・案③）。row[9] は全部小文字の分かち書きなので、
   海外の読み手が「題名」と読めるよう語頭だけ大文字にする。助詞は小文字のまま（Shin Sangoku Musou / Ao no Exorcist 型）。
   ★大文字・記号・数字で始まる語（AO・GAME・DS・2016・×）には触れない。中身の綴り（長音の uu・aa 等）も変えない
     ＝検索（fold で小文字化）にも、駿河屋・Buyee の検索語にも影響しない。 */
const RO_PARTICLES = new Set(['no','to','wa','ga','ni','de','e','o','wo','ya','mo','ka','yo','ne','eno','kara','made']);
function romajiShow(s){
  return s.split(' ').map((w,i)=> (/^[a-z]/.test(w) && (i===0 || !RO_PARTICLES.has(w))) ? w[0].toUpperCase()+w.slice(1) : w).join(' ');
}

/* 位置トグルの状態。'out'=海外在住（初期） / 'jp'=日本の店頭。
   変えるのは表示の並び順と説明文だけ。検索結果(current)は変わらないので
   run() ではなく paint() を呼ぶ。第1段-a の時点では card() が LOC を
   まだ読んでいないため、押しても表示は変わらない（これは想定どおり）。 */
let LOC='out';

/* 状態の保持（第3段・2026-07-25）。優先順は URL > localStorage > 既定(out)。
   ★URL(?loc=jp)  … 共有リンクが状態を運ぶ。「日本にいる人向け」として貼れる。
   ★localStorage … リロードで戻らない。店頭は電波が悪く再読み込みが起きやすいので、
     日本にいる人が知らないうちに海外向け表示へ戻されるのを防ぐ。
   ★どちらも try/catch で囲む。localStorage はプライベートブラウズや一部WebViewで
     アクセス自体が例外を投げる。囲まないと setLoc() が途中で死んで
     トグルが押せなくなる（paint() に到達しない）。
   ★保存値は 'out'/'jp' 以外を捨てる。localStorage は人が書き換えられる。
   ★期限は設けていない。帰国後も 'jp' を覚えたままになるが、日数の根拠が無い。
     トグルは常設なので間違いにすぐ気づいて押し直せる。未解決として記録した。 */
const locRead = KB_SHOP.locRead;

function setLoc(v,skipSave){
  if(v!=='jp'&&v!=='out') return;
  LOC=v;
  document.querySelectorAll('.locbtn').forEach(b=>{
    const on = b.dataset.loc===LOC;
    b.classList.toggle('is-on',on);
    b.setAttribute('aria-pressed',on?'true':'false');
  });
  document.body.classList.toggle('in-jp', LOC==='jp');
  if(!skipSave){
    try{ localStorage.setItem('kataban_loc',LOC); }catch(e){}
    try{
      const url = new URL(location.href);
      url.searchParams.set('loc',LOC);
      history.replaceState(null,'',url);
    }catch(e){}
  }
  paint();
}
/* 購入リンクブロック。card() のテンプレート内では変数を作れないので関数に切り出した。
   位置トグル(LOC)で「3グループの並び順」と「説明文」だけを切り替える。
   ★店URLの変更は駿河屋の af_jump ラップのみ（2026-07-25）。他店のURL・店名は不変。
   ★強調(primary)の付け替えは実施済み（第1段-c / 2026-07-25）。
     割り当ては下の clsBuyee / clsCode / clsTitle を見ること。 */
/* eBay の _nkw に英題へ足す機種名(英語)。キーは DATA の r[2]＝build_master.py の
   KEEP_PLATFORMS 35機種そのまま（1491行）。値は全部小文字（_nkw は大小を区別しない）。
   使うのは card() の kwEn だけ（下の 1778 付近）。

   ★なぜ足すのか（2026-08-14 実測・実 Chrome を CDP で駆動して ebay.com の SRP を目視。
     方法は memory/ebay-srp-needs-real-chrome.md。日本 IP からの計測なので順位が
     海外からの閲覧と同一である保証は無い）:
       英題だけだと対象機種が上位10件に1件も出ないことがある。
         Chrono Trigger  → PS1 が 0件（SNES 2・DS 3・グッズ 4・SFC 1）
         Secret of Mana  → SFC 日本版が 0件（上位10件すべて北米 SNES / PAL）
         Ganbare Goemon  → PS1 が 1件だけ（Switch 2・FC・N64・PS5・書籍・グッズで埋まる）
       機種名を足すと上位10件のハードはほぼ揃う。
         Chrono Trigger ps1        → PS1 10/10
         Secret of Mana super famicom → SFC 系 10/10・NTSC-J 202/321
         Ganbare Goemon ps1        → 10/10 すべて PS1 の日本版・無関係品 0

   ★機種ごとに正解の向きが違う。素直な小文字化が正解とは限らないので、値を推測で変えないこと。
     実測したのは19機種（下の各項。うち PSP / Nintendo DS / Nintendo 3DS / Xbox /
     PlayStation 4 / Sega Saturn / Famicom / Super Famicom / PC Engine / Dreamcast /
     Mega Drive の11機種は「仮値のままで正解」と確認しただけで値は変えていない）。
     残り16機種は下記の方針で置いた未実測値。
       ・据置 PlayStation 3世代（PS2/PS3/PS4）… 実測済み。テーブル冒頭
       ・そのまま小文字化（17機種）
       ・欧米通称グループ（5機種）… 和名側で統一。北米通称（NES/SNES/Genesis/
         TurboGrafx-16/Master System）は採らない＝北米版を引き寄せる方向に効くため。
         実測: `Secret of Mana` 単独は上位10件とも北米 SNES/PAL で日本版0件、
         `super famicom` を足して初めて NTSC-J 202/321 になった。**2026-08-14(7)〜(8) に
         Famicom / PC Engine で `nes` / `turbografx` と直接比較して、この方針が正しいことを
         確認済み**（`Super Mario Bros. 3` の日本版比率が 70%→6% に崩壊し、
         `Bonk's Adventure turbografx` は上位10件すべてが北米版になった）。
         ★ただし **Mega Drive では和名側でも不十分**。「Mega Drive」は**欧州(PAL)版とも
         名前を共有する**ので、日本版を分離できない（下の 'Mega Drive' の項）。
         和名側＝日本版、とは限らないことに注意。
       ・略称グループ（5機種）… 出品タイトルで一般的な略称、という想定で置いた枠。
         ただし実測すると**想定どおりだったのは PSP だけ**で、Nintendo DS は略称かどうかが
         無関係（eBay が同一視）、Nintendo 64 は略称のほうが取りこぼした。枠名で決めないこと。
       ・(a) 短い名前が長い名前に含まれる組（5機種）… 語として上位機種・派生機種を
         巻き込む。**5機種とも実測済み**。うち Xbox だけは素直な小文字化が正解だった。

   ★ハード名では取り除けない誤爆が残る。正体は**同じハードの別作品**で、
     北米版の有無とは無関係（Chrono Cross / Tobal No.1 / Final Fantasy Chronicles /
     聖剣伝説3 / Pokémon Leaf Green）。日本専売の Tobal 2 ですら同シリーズの
     Tobal No.1 が 'ps1' で 4/10 を占めた。ここを詰めるなら別の手（型番・
     リージョン絞り込み等）が要る。日本専売タイトルのリプロカート（Pokémon Green の
     "English Version" 等）も同様に残る。
   ★sgCom（駿河屋.com・下の 1573 行）にこのテーブルを流用しないこと。あちらの
     56.7% の実測は r[2] の生値を繋いだ URL で測っており、語を変えると測定が無効になる。 */
const PLATFORM_EBAY = {
  // ---- 据置 PlayStation 3世代（実測済み。2026-08-14(5)）----
  // ★'playstation N' は2トークン、'psN' は1トークン。**'playstation' は全世代で共有される
  //   トークン**なので、'playstation 2' は他世代の出品も引き寄せる。'psN' は世代固有の
  //   1トークンで、その漏れが小さい。PS2 / PS3 はこれを理由に 'psN' へ変えた。
  //   PS4 だけは2タイトルとも結果が完全に同一だったので変えていない（下記）。
  //   ※PS Vita で 'playstation vita' が勝ったのとは逆向きだが、あちらは「PS Vita と綴った
  //     出品を取りこぼす」という別要因。世代番号を持つこの3機種とは事情が違う。
  //
  // ★'PlayStation 2' → 'ps2' の根拠（'playstation 2' と比較。日本専売2本）。
  //     Kingdom Hearts Final Mix（PS2 の Final Mix は日本のみ。北米版 Kingdom Hearts が
  //                               大量に在るので混入テストになる）
  //       playstation 2 210件 … 上位10の対象 **6**・無関係3（KH2 Final Mix+ 2・キーホルダー1）
  //       ps2           165件 … 上位10の対象 5・無関係4（すべて KH2 Final Mix+）
  //     Sengoku Basara 2（北米は1作目を Devil Kings として出しただけ。2は未ローカライズ）
  //       playstation 2 291件 … 上位10の対象 2・無関係7（BASARA 1 が2・X Cross・攻略本・お椀）
  //       ps2           257件 … 上位10の対象 **4**・無関係4                      ←最良
  //   上位10件は割れたが、**facet の他世代漏れが決め手**:
  //       Kingdom Hearts Final Mix   PS2 / PS1 / PS3 / PSP / PS4
  //         playstation 2            157 /  20 / **14** / **13** / **7**  ＝他世代 34件
  //         ps2                      155 /  20 /  **3** /  **3** / **3**  ＝他世代  9件
  //       Sengoku Basara 2           PS2 / PS3
  //         playstation 2            219 / **14**
  //         ps2                      211 /  **6**
  'PlayStation 2':     'ps2',                // 4797 実測で決定
  //
  // ★'PlayStation 3' → 'ps3' の根拠（'playstation 3' と比較。日本専売2本）。
  //     428: Shibuya Scramble（PS3 版は日本のみ。北米は後年 PS4）
  //       playstation 3 / ps3 … **完全一致7件が完全に同一**（7/7 対象）＝引き分け。
  //                             PS4 版は境界より下のパディングに2件
  //     Ryū ga Gotoku Kenzan!（龍が如く 見参!。日本のみ）
  //       playstation 3  **10件** … 上位10の対象 10/10 だが母集団が薄い / facet PS3 9
  //       ps3            **54件** … 上位10の対象 8/10（残り2はシリーズまとめ売り）/
  //                                 **facet PS3 54/54 ＝ 100%**                  ←最良
  //   【トークン数の問題】Kenzan で 5倍の差が出た理由を切り分けた（同じ題名で4パターン）:
  //       `Ryū ga Gotoku Kenzan! playstation 3` → eBay の heading は
  //          **`ryu ga gotoku kenzan!playstation3`**（小文字化・マクロン除去に加え
  //          **空白が消えて癒着**）… 10件
  //       `Ryu ga Gotoku Kenzan! playstation 3`（ASCII）→ 書き換えなし … 11件
  //       `Ryu ga Gotoku Kenzan playstation 3`（! を外す）→ `ryuga gotoku kenzan ...` … 62件
  //       `Ryu ga Gotoku Kenzan! ps3` → `ryu ga gotoku kenzan! ps3` … 54件
  //     ＝**eBay は不透明なクエリ書き換えパスを通す**（小文字化・ダイアクリティカル除去・
  //       トークンの癒着/分割）。ただし**書き換えは主因ではない**。書き換えが起きなかった
  //       ASCII 版でも 11件しか返らず、効いているのは**トークン数**だった。'playstation 3'
  //       は2トークンで、題名に `!` が付いて要求トークンが増えると2トークン側だけが崩れる
  //       （`!` を外すと 'playstation 3' でも 62件に戻る）。'ps3' は1トークンなので頑健。
  //     DATA で該当する行（描画される英題あり行のうち）: PS2 は `!`/`?` 53行(2.7%)・
  //       非ASCII 96行(4.9%)、PS3 は 5行(0.5%)・14行(1.3%)、PS4 は 5行(0.9%)・27行(4.9%)。
  //       全機種では `!`/`?` 374行・非ASCII 702行。少数だが確実に居る。
  'PlayStation 3':     'ps3',                // 2543 実測で決定
  //
  // ★'PlayStation 4' は実測済み・**差なし・変更不要**（'ps4' と比較。日本専売2本）。
  //     Winning Post 8 2016（コーエーの競馬シム。未ローカライズ）
  //       playstation 4 / ps4 … **11件で完全に同一**（上位10件・facet とも一致）
  //     Nobunaga's Ambition: Souzou（信長の野望・創造。北米は別題 Sphere of Influence）
  //       playstation 4 / ps4 … **完全一致3件で完全に同一**（3/3 対象）
  //   PS2/PS3 で効いた「他世代漏れ」が PS4 では観測されなかった＝変える理由が無い。
  //   ★ただし Winning Post は**シリーズ内の他ハード版混入が深刻**（facet: PS4 6 /
  //     **PS Vita 3** / 未指定1。上位10件にも Vita 2件・PS2表記1件・年度違い3件）。
  //     これは**両クエリで同一**で、原因はハード名ではなく
  //     `Winning Post 8 2016 PC PS4 PS3 PSV ... Guide` のように**1つの出品が複数機種を
  //     題名に列挙している**こと。ハード名では分離できない種類の誤爆。
  'PlayStation 4':     'playstation 4',      // 2572 実測済み・変更不要

  // ---- そのまま小文字化（17機種）----
  // ★'Sega Saturn' は実測済み・変更不要（2026-08-14(7)。'saturn' と比較。日本専売2本）。
  //     Sakura Wars（サターン版は日本のみ。北米版は2020年の PS4 で別物）
  //       sega saturn 450件 … 上位10の対象 **4**・無関係6（サクラ大戦2 が3・コラムス3）
  //       saturn      539件 … 上位10の対象 3・無関係7（別作品4・**フィギュア1・
  //                           Power Memory アクセサリ2**）
  //       ★増えた89件は **Saturn の facet に載っていない**（セガサターン 342→343 と
  //         ほぼ不変で、未指定が増える）＝増分はゲームではなくグッズ／周辺機器。
  //     Dragon Force II（北米未発売。1作目は Working Designs から出ている）
  //       sega saturn 36件 / saturn 35件 … 上位10の対象とも 4/10 で**ほぼ同一**
  //                                         （facet セガサターン 35 vs 34）
  //   2語のままのほうがゲームに寄る。短縮する利得が無いので現状維持。
  'Sega Saturn':       'sega saturn',        // 1239 実測済み・変更不要
  'Game Boy Advance':  'game boy advance',   //  903
  'Nintendo Switch':   'nintendo switch',    //  845
  // ★'Dreamcast' は実測済み・変更不要（2026-08-14(8)。'dc' と比較）。
  //     Segagaga（日本専売）
  //       dreamcast 23件 … 上位10の対象 **9/10**・無関係1（SEGA TETRIS）/ NTSC-J 22
  //       dc        26件 … 対象 6/10・無関係4（**ファミ通DC誌・攻略本・VMU メモリカード**・
  //                        SEGA TETRIS）/ NTSC-J 21
  //     Sonic Adventure（北米版あり）
  //       dreamcast 601件 … 対象(SA1) 6/10（SA2 が4件）/ NTSC-J 176・**PAL 55**
  //       dc        412件 … 対象 **8/10**（SA2 2件）/ NTSC-J 145・PAL **9**
  //   割れたが 'dreamcast' を維持する。**日本専売タイトルで負ける語は採れない**——
  //   'dc' は「DC」が雑誌名・型番の一部として頻出するため非ゲーム（誌・攻略本・
  //   メモリカード）を通し、Segagaga で 9/10→6/10 に落ちた。この道具の目的は
  //   日本版に届くことなので、日本専売側の劣化を許容できない。
  'Dreamcast':         'dreamcast',          //  671 実測済み・変更不要
  'GameCube':          'gamecube',           //  308
  'PlayStation 5':     'playstation 5',      //  258
  'WonderSwan':        'wonderswan',         //  223
  '3DO':               '3do',                //  215
  'Game Gear':         'game gear',          //  195
  'Xbox 360':          'xbox 360',           //  144
  'Neo Geo CD':        'neo geo cd',         //   98
  'Neo Geo Pocket':    'neo geo pocket',     //   95
  'PC-FX':             'pc-fx',              //   44
  'Xbox One':          'xbox one',           //   29
  'Wii U':             'wii u',              //   20
  'Virtual Boy':       'virtual boy',        //   13
  '64DD':              '64dd',               //    6

  // ---- 欧米通称グループ（5機種）----
  // 5機種とも和名側（＝日本版を狙う表記）で統一。理由は上の方針コメント。
  'Super Famicom':     'super famicom',      // 1460  実測済（'sfc' も結果集合はほぼ同一だった）
  //
  // ★'Famicom' は実測済み・**維持確定**（2026-08-14(7)。'nes' と比較）。
  //   **この機種の実測で、(b) グループの方針そのものが正しいと確認できた。**
  //
  //   ① 日本専売タイトルだけ見ると 'nes' が良く見える（＝ここで判断すると誤る）:
  //        Fire Emblem Gaiden famicom  55件 … 対象 7/10・無関係3（セット2・空カート1）
  //        Fire Emblem Gaiden nes      54件 … 対象 7/10・無関係3（英訳リプロ1 ほか）＝互角
  //        Ganbare Goemon 2 famicom   119件 … 対象 **2/10**・**スーパーファミコン版 6件**
  //        Ganbare Goemon 2 nes        98件 … 対象 **7/10**・SFC 1件        ←'nes' の勝ち
  //   ② **北米版が存在するタイトルで測ると 'nes' は崩壊する**（日本専売2本では
  //      引き寄せる北米版が存在せず、この害が見えなかった）:
  //        `_nkw`                                 総件数 / NTSC-J / NTSC-U/C / 上位10件
  //        Super Mario Bros. 3 famicom             362 / **253(70%)** /   39 / 10/10 日本版
  //        Super Mario Bros. 3 nes              3,300+ / **219( 6%)** / 1,465 / 9/10 北米NES
  //                                                     ＋PAL 979
  //        Castlevania III: Dracula's Curse famicom 85 /  21 /  38 / 日本版5・北米NES5
  //        Castlevania III: Dracula's Curse nes    179 / **13( 7%)** / 100 / 10/10 北米NES
  //      日本版比率が **70% → 6%** に落ち、母集団が10倍に膨れて北米版と PAL 版で埋まる。
  //      DATA の Famicom 436行（描画される英題あり行）には北米版を持つ題が多数ある。
  //
  //   ★**未解決の弱点**: 'famicom' は **Super Famicom を巻き込む**。
  //     「Super Famicom」は「famicom」をトークンとして含むので語では排除できない。
  //     Ganbare Goemon 2 では上位10件に SFC 版（奇天烈将軍マッギネス）が6件入り、
  //     facet でも SFC系 54件を含んでいた。これは (a)「短い名前が長い名前に含まれる組」
  //     と同じ構造で、Famicom を (b) に分類したときには見落としていた。
  //     'nes' は解決策にならない（上の②）。**未検証の候補として `family computer`**
  //     （日本の出品者がよく書く表記）が残っている。測るならここから。
  'Famicom':           'famicom',            // 1252  実測済み・維持確定（北米は NES）
  //
  // ★'PC Engine' は実測済み・変更不要（2026-08-14(8)。'turbografx' / 'pce' と比較）。
  //     Snatcher（PCE CD 版は日本のみ。北米版は Sega CD で出た）
  //       pc engine   52件 … 上位10の対象 **10/10**・無関係0 / NTSC-J 29・NTSC-U/C 2
  //       turbografx  56件 … 対象 7/10・無関係3（Devils Crush・Lords of Thunder＝別ゲーム、
  //                          TG16 まとめ売り）/ NTSC-J 28・NTSC-U/C **12**
  //       pce          6件 … 対象 6/6（母集団が薄い）
  //     Bonk's Adventure（北米 TurboGrafx-16 版あり＝Famicom と同じ轍の検証）
  //       pc engine   94件 … 上位10の日本版（PC原人）4・北米2 / NTSC-U/C 36
  //       turbografx  93件 … 日本版 **0**・**上位10件すべて北米 TurboGrafx-16** /
  //                          NTSC-U/C **48**
  //       pce      12〜23件 … 日本版4だが母集団が 1/8 に潰れる
  //   【'turbografx' は 'nes' と同じ轍】北米通称を送ると上位10件が北米版で埋まる。
  //     (b) の方針どおり和名側を採る。
  //   【'pce' を採らない理由】母集団が壊滅的に小さいうえ、facet に **任天堂ゲームボーイ 9件**
  //     が混じった（Bonk の GB 版を拾っている）。2文字トークンの副作用。
  'PC Engine':         'pc engine',          //  687  実測済み・変更不要（北米は TurboGrafx-16）
  //
  // ★'Mega Drive' は実測済み・変更不要（2026-08-14(8)。'md' / 'megadrive' と比較。
  //   日本専売2本＋他リージョン版が競合する2本、計4タイトルを同一バッチで実測）。
  //
  //     タイトル（条件）        クエリ       母集団  上位10の対象/日本版  無関係の中身
  //     Puyo Puyo 2（日本のみ） mega drive     60      8/10             ぷよぷよ1作目2
  //                             md             37      8/10             全く別のゲーム2
  //                             megadrive      72      8/10             攻略本1・1作目1
  //     Gunstar Heroes          mega drive    101      日本版 **1/10**  PAL 4・北米3・復刻2
  //     （北米 Genesis 版あり）  md             52      日本版 **8/10**  北米2
  //                             megadrive     129      日本版 3/10      **PAL 6**・北米1
  //     Langrisser II           mega drive    385      6/10             英訳リプロ3・攻略本1
  //     （日本のみ）             md         **15**      7/10             攻略本2・**PS1版1**
  //                             megadrive     384      6/10             mega drive とほぼ同一
  //     Alien Soldier           mega drive     24      日本版 4/10      欧州2・リプロ2
  //     （日本＋欧州）           md             12      日本版 **7/10**  ケースのみ1
  //                             megadrive      33      日本版 **2/10**  **ブートレグ/リプロ4**
  //
  //   【'megadrive'（1語）は却下】**eBay 内部で 'mega drive' と同一視される。**
  //     facet の数値が一致した（Puyo Puyo 2: NTSC-U/C 1 / NTSC-J 40 / リージョンフリー1 /
  //     未指定19 が完全一致。Gunstar: NTSC-U/C 15 / NTSC-J 30 / PAL 11 / 未指定59 が完全一致。
  //     Langrisser II: NTSC-J 296 vs 295 で ±1）。`gameboy`/`game boy` と同じ現象。
  //     ところが**総件数だけ増える**（60→72・101→129・24→33）＝**増分は facet に載らない
  //     出品**で、実際 Alien Soldier ではブートレグ/クローン/リプロを4件拾い日本版 2/10 と
  //     3クエリ中で最悪になった。＝「'mega drive' に未分類のゴミを足したもの」。
  //
  //   【'md' を採らなかった理由】'md' は他リージョン版が競合するとき圧倒的に強い
  //     （Gunstar 1/10→8/10、Alien Soldier 4/10→7/10）。しかし**日本専売タイトルで
  //     在庫を消す**（Langrisser II が 385→**15件**＝96%消滅）。母集団は4タイトルとも
  //     一貫して縮んだ（-38% / -49% / -96% / -50%）。
  //     **在庫消失は取り返しがつかない**（押しても品が出てこないリンクになる）のに対し、
  //     **リージョン混入は画面に出ているリージョンコードの facet で買い手が気づける**。
  //     この非対称を理由に 'mega drive' を維持する。★これは価値判断であって、罠#27
  //     （別物を最短距離で指す害）を重く見るなら 'md' に倒す筋も依然ある。
  //   ★'md' が拾った無関係品の性質も記録しておく: 別ハードの同名作（Langrisser I & II の
  //     **PS1版** SLPM-86798）・攻略本（題名に "MD" が入る）・全く別のゲーム2件。
  //     型番や雑誌名を誤って拾った例は無かった。
  'Mega Drive':        'mega drive',         //  557  実測済み・変更不要（北米は Genesis）
  'Sega Mark III':     'sega mark iii',      //   27  北米は Master System

  // ---- 略称グループ（5機種）----
  // ★このグループは「略称のほうが出品タイトルで一般的」という想定で置いた枠だが、
  //   2026-08-14(3) に3機種を実測したところ**想定どおりだったのは PSP だけ**だった。
  //   Nintendo DS は略称かどうかが無関係（eBay が同一視）、Nintendo 64 は略称のほうが
  //   取りこぼす（下記）。枠の名前に引きずられて値を決めないこと。
  //
  // ★'PSP' は実測済み・変更不要（2026-08-14(3)。'playstation portable' と比較）。
  //     Sol Trigger（日本専売。完全一致7件しか無い）
  //       psp                 7件 … 対象 **7/7**・無関係 0            ←最良
  //       playstation portable 7件 … 対象 6/7・無関係1（攻略本）
  //       facet は両者完全一致（Sony PSP 15 / NTSC-J 15）
  //     Monster Hunter Portable 3rd（日本専売。北米は Freedom Unite=2nd G まで）
  //       psp                 433件 … 対象 3/10・本体(PSP-3000 MH限定モデル) **6**・セット1
  //       playstation portable 492件 … 対象 4/10・本体2・セット2・グリップ1・まとめ1
  //   割れたが 'psp' を維持する。MHP3 は題名自体に "Portable" を含むので
  //   'playstation portable' はトークン重複になり照合が緩む側に働いた分を差し引く必要があり、
  //   かつ facet では 'playstation portable' のほうが **PS3 を 19→57件** と3倍拾う
  //   （MHP3rd HD 版が PS3 に在るため）。短くて漏れが少ない 'psp' が良い。
  'PSP':               'psp',                // 3646 実測済み・変更不要
  //
  // ★'Nintendo DS' は実測済み・変更不要（2026-08-14(3)。'nds' と比較）。
  //   **eBay は 'nintendo ds' と 'nds' を同一視する。** 総件数だけでなく facet の数値も
  //   1つ残らず一致した:
  //     Jump Ultimate Stars … 両方 60件 / 任天堂DS 51 / NTSC-J 44 / PS4 2 / PS3 3 / 3DS 2
  //     Soma Bringer        … 両方 13件 / 任天堂DS 7 / NTSC-J 7
  //   上位10件も同じ顔ぶれの並べ替え。'gameboy' と 'game boy' と同じ現象で、変えても
  //   何も変わらない＝短くする意味も無いので現状維持。
  'Nintendo DS':       'nintendo ds',        // 2535 実測済み・変更不要
  //
  // ★'PlayStation Vita' → 'playstation vita' の根拠（2026-08-14(3)+(4) 実測。
  //   'ps vita' / 'playstation vita' / 'vita' を比較。日本専売4タイトルで **2勝2分・負けなし**）。
  //   **eBay は 'ps vita' と 'playstation vita' を同一視しない**（Nintendo DS の
  //   'nintendo ds'/'nds' が完全に同一だったのとは挙動が違う。ここが判断の分かれ目）。
  //
  //     タイトル（すべて日本専売）      ps vita              playstation vita        判定
  //     Genkai Tokki: Seven Pirates   完全一致4件・対象4/4  完全一致**5件**・**5/5**  playstation vita
  //     To Heart 2: Dungeon Travelers 4件・対象2/4          4件・対象2/4             引き分け
  //     Ciel Nosurge                  23件・対象**7/10**    26件・対象**8/10**        playstation vita
  //     Love Live! School Idol        14件・Vol.1単品6/10   13件・Vol.1単品6/10       引き分け
  //       Paradise Vol.1 Printemps
  //
  //   【勝因は1つ】'ps vita' が**題名を "PlayStation Vita" と綴った出品を取りこぼす**。
  //     勝った2件はどちらもこれで説明できる:
  //       Seven Pirates … `... Sony PlayStation Vita Japan Import` を 'ps vita' は
  //                       完全一致の境界より下に落としていた
  //       Ciel Nosurge  … `Ciel Nosurge *Playstation Vita* PSV Japan B` を新たに拾い、
  //                       代わりに `Sony PS Vita Games (Loose)` という寄せ集め出品が落ちた
  //     **負けたケースが1つも無い**のが採用の決め手。引き分け2件は上位10件が同一。
  //   【'vita' 単独は却下】Seven Pirates で同シリーズ別作品（Moero Crystal /
  //     Monster Monpiece / Moero Chronicle）を5件拾い、対象が 4/10 に落ちた。
  //   ★To Heart 2 は3クエリとも**完全一致4件のうち2件が `J.League Winning Eleven 5`(PS2)**
  //     という妙な混入がある。3クエリ共通なのでハード名の問題ではない。原因は未特定。
  'PlayStation Vita':  'playstation vita',   // 2407 実測で決定
  //
  // ★'Nintendo 3DS' は実測済み・変更不要（2026-08-14(7)。'3ds' と比較。日本専売2本）。
  //   **eBay は 'nintendo 3ds' と '3ds' を実質同一視する。** facet の数値が
  //   両タイトルとも1つ残らず一致した:
  //     Dragon Quest Monsters: Terry's Wonderland 3D
  //       nintendo 3ds 41件 / 3ds 44件 … どちらも 3DS 28 / NTSC-J 23・上位10の対象 7/10
  //     Inazuma Eleven GO 2: Chrono Stone
  //       nintendo 3ds 94件 / 3ds 95件 … どちらも 3DS 71 / DS 3 / 2DS 2 / NTSC-J 22・
  //                                      上位10の対象 8/10
  //   総件数だけ僅かに違うが上位10件は同じ顔ぶれの並べ替え。DS/2DS の混入も同数。
  //   'nintendo ds' と 'nds' のときと同じ現象で、変えても何も変わらないので現状維持。
  'Nintendo 3DS':      'nintendo 3ds',       // 2302 実測済み・変更不要
  //
  // ★'Nintendo 64' → 'nintendo 64' の根拠（2026-08-14(3) 実測。'n64' と比較）。
  //   北米版が存在しない日本専売2本で比較した（英題は DATA の r[0] 実物）。
  //     Sin and Punishment（罪と罰。N64 版は日本のみ）
  //       n64         28件 … 上位10件 **10/10** 対象・無関係0 / facet N64 26・NTSC-J 26
  //       nintendo 64 38件 … 上位10件 **10/10** 対象・無関係0 / facet N64 **36**・NTSC-J 29
  //     Goemon Mononoke Sugoroku（ゴエモンもののけ双六。日本のみ）
  //       n64         20件 … 対象 9/10・無関係1（攻略本 Perfect Guide）/ facet N64 16
  //       nintendo 64 20件 … 対象 **10/10**・無関係 **0**          / facet N64 **18**
  //   【なぜ長いほうが勝つか】'n64' を書く出品は 'nintendo 64' でも拾えるが、逆は取りこぼす
  //     ＝上位互換の関係。Sin and Punishment では母集団が 28→38件に広がり、増えた分も
  //     facet 上すべて N64 だった（26→36）。Goemon では上位10件から攻略本が落ちた。
  //   ★Game Boy（'gb' が正解＝略称が勝つ）とは逆向きの結果。同じ「略称グループ」でも
  //     機種ごとに向きが違うという例がまた1つ増えた。
  'Nintendo 64':       'nintendo 64',        //  211 実測で決定

  // ---- (a) 短い名前が長い名前に含まれる組（5機種）----
  // 5機種とも実測で決着済み（2026-08-14 に PlayStation / Wii / Game Boy、同日(2) に
  // Neo Geo / Xbox）。Xbox だけは素直な小文字化がそのまま正解だった。
  //
  // ★'PlayStation' → 'ps1' の根拠（2026-08-14 実測）。北米版が存在するタイトル
  //   （Chrono Trigger）と、存在しない日本専売タイトル（Tobal 2 / がんばれゴエモン。
  //   英題は DATA の r[0] 実物）で3クエリを比較した。
  //     ┌─ Tobal 2（総件数 / 上位10のうち Tobal 2 の実物 / 日本版 / 無関係）
  //     │  基準 "Tobal 2"        98件 … 4 / 4 / 6（Tobal No.1×3、テレカ・広告×3）
  //     │  ps1                   50件 … 6 / 6 / 4（全部 Tobal No.1）        ←最良
  //     │  playstation 1         72件 … 4 / 4 / 6（No.1×2、攻略本・広告・キーホルダー×4）
  //     │  psx                   18件 … 1 / 1 / 9（No.1×8、10本まとめ×1）   ←最悪
  //     └─ がんばれゴエモン（同）
  //        基準 "Ganbare Goemon" 1100+件 … 1 / 1 / 9（Switch×2・FC・N64・PS5・書籍・グッズ）
  //        ps1                    75件 … 10 / 10 / 0（上位10件すべて PS1 日本版）←最良
  //        playstation 1          99件 …  6 /  6 / 4（本体セット・寄せ集め出品を拾う）
  //        psx                   397件 …  9 /  9 / 1（ただし9件中8件が同一スペイン出品者の
  //                                     ほぼ同文の重複で、作品を題名から特定できない）
  //     Chrono Trigger ps1 は 190件・PS1 10/10・日本版2・無関係1（Chrono Cross）で、
  //     同日の前回計測と内訳が完全一致＝この測り方は再現する。
  //   【なぜ 'playstation 1' ではないか】「1」が独立トークンとして弱くしか効かず、
  //     非ゲーム（攻略本・雑誌広告・キーホルダー・本体セット・寄せ集め出品）を通す。
  //     2タイトルとも上位10件に4件ずつ混ざった。語の構造の問題なので作品を選ばない。
  //   【なぜ 'psx' ではないか】母集団の増減が極端で、どちらに振れても質が落ちる。
  //     Tobal 2 では 98→18件に潰れたうえ中身が Tobal No.1 に化け、ゴエモンでは
  //     397件に膨らんで同一出品者の重複で埋まった。psx はセラーが検索寄せのために
  //     題名へ詰め込む語で、その出品を優先的に拾っているように見える。
  'PlayStation':       'ps1',                // 4559 実測で決定
  //
  // ★'Wii' → 'wii' の根拠（2026-08-14 実測。'nintendo wii' と比較）。北米版あり＝
  //   Super Mario Galaxy（Wii U にも配信された作品を意図的に選んだ）、日本専売＝
  //   Captain Rainbow / 斬撃のREGINLEIV。
  //     Super Mario Galaxy（総件数 / 上位10の Wii / 日本版 / 無関係 / Wii U 混入）
  //       wii          4,100+件 … 10 / 0 / 2（Galaxy 2・Wii寄せ集め）/ 0
  //       nintendo wii 4,200+件 … 10 / 0 / 2（同上）              / 0
  //       facet も同値（NTSC-U/C 2155 vs 2156・NTSC-J 135 vs 135・PAL 504 vs 504）
  //     Captain Rainbow / 斬撃のREGINLEIV（ともに完全一致7件しか無い）
  //       wii / nintendo wii … 完全一致の7件が1件単位まで同一（順序だけ入れ替わる）。
  //       7件とも Wii の日本版。facet も同値（任天堂Wii 7・NTSC-J 4）
  //   【Wii U は巻き込まない】Wii U が出るのは `一部の語句に一致する検索結果` バナーより
  //     下のパディング領域だけで、完全一致には1件も入らなかった。語を伸ばす利得が無いので
  //     短い 'wii' を採る。※ヒット数が10件未満のクエリはこの境界を越えて数えてしまうので、
  //     測り直すときは heading の件数と突き合わせること。
  'Wii':               'wii',                // 1448 実測で決定（'nintendo wii' と差が無いので短い方）
  //
  // ★'Game Boy' → 'gb' の根拠（2026-08-14 実測。'gameboy' / 'game boy' / 'gb' を比較）。
  //   北米版あり＝Super Mario Land、日本専売＝Pokémon Green（ポケットモンスター 緑）。
  //   【まず 'gameboy' と 'game boy' は eBay 内部で同一視される】facet の数値が一致する。
  //     Pokémon Green: どちらも GB 420 / GBA 573 / GBC 66 / NTSC-J 384、総件数 864 vs 863。
  //     Super Mario Land も同様（GB 2395 vs 2392 / GBA 171 vs 170）。＝選択肢は実質2つ。
  //     Pokémon Green（総件数 / GB / GBA / NTSC-J）
  //       gameboy    864件 … GB 420 / GBA 573 / NTSC-J 384(44%)
  //       game boy   863件 … GB 420 / GBA 573 / NTSC-J 384(44%)
  //       gb         309件 … GB 316 / GBA  63 / NTSC-J 268(87%)   ←最良
  //     上位10件で見ると 'game boy' は Pokémon Leaf Green(GBA) を4件入れた。'gb' は0件。
  //     日本版（正規）は gameboy 2 / game boy 3 / gb 5。
  //     Super Mario Land（上位10。この題では 'gb' がやや不利）
  //       gameboy 2,800+件 … GB 10/10・対象作品 7・シリーズ別作品 3
  //       game boy 2,700+件 … 同じ
  //       gb      1,800+件 … GB 10/10・対象作品 5・シリーズ別作品 5
  //   【なぜ 'gb' が勝つか】GBA/GBC の出品は自分を 'GBA'/'GBC' と書くので 'gb' では
  //     拾われない。一方 'game boy' は "Game Boy Advance" の部分文字列なので必ず巻き込む。
  //     ＝PS1 とは逆で短い略称が正しい。機種ごとに実測が要るというのはこの逆転のこと。
  'Game Boy':          'gb',                 // 1342 実測で決定
  //
  // ★'Neo Geo' → 'neo geo aes' の根拠（2026-08-14(2) 実測。'neo geo' と比較）。
  //   北米 AES 未発売の日本専売2本で比較した（英題は DATA の r[0] 実物）。
  //     Kizuna Encounter: Super Tag Battle（総件数 / 上位10の AES / 無関係）
  //       neo geo     14件 … 7 / 3（MVS=業務用基板2・箱のみ1）
  //       neo geo aes 11件 … 7 / 3（同じ顔ぶれで順序が入れ替わるだけ）      ←引き分け
  //     Samurai Shodown V Special（同）
  //       neo geo     46件 … 4 / 6（**PS4 2・Switch 1**・PC 1・キーホルダー1・別作品1）
  //       neo geo aes 35件 … 5 / 5（PC 2・別作品3。**PS4/Switch は 0件**）  ←最良
  //   【なぜ 'aes' を足すか】'neo geo' は「Neo Geo」を題名に含む**移植版**を拾う。
  //     Limited Run Games の PS4 版が `Neo Geo AES Edition`、Switch 版が
  //     `NeoGeo Collection` と名乗るため。'aes' を足すと上位10件から消える。
  //   ★Neo Geo CD/Pocket の巻き込みは元から軽微だった。Kizuna の facet に CD が1件
  //     居て 'aes' で消えるが、そもそも上位10件には出ていない。Pocket は両方0件。
  //   ★'aes' を足しても **MVS（業務用基板）は落ちない**。出品タイトルに "AES / MVS" と
  //     両方書く売り方が多いため。ここは語では詰められない。
  //   ★残るリスク: "AES" と書かない正規 AES 出品を落とす可能性（Kizuna 14→11件・
  //     SS5SP 46→35件の減少分の中身は未確認）。117行なので実害は小さいと見て採った。
  'Neo Geo':           'neo geo aes',        //  117 実測で決定

  // ★'Xbox' → 'xbox' は実測済み、**変更不要**（2026-08-14(2)。'original xbox' と比較）。
  //     segaGT Online（Xbox 専売。※北米版が在り「日本専売」の条件は満たさないと
  //                    実測後に判明したが、ハードの巻き込み検出には使える）
  //       xbox          48件 … 初代 Xbox 9/10・無関係1（寄せ集め出品）・360/One **0**
  //       original xbox 22件 … 初代 Xbox 8/10・無関係2（雑誌広告・Wall Art）・360/One **0**
  //     DOUBLE-S.T.E.A.L（北米は別題 Wreckless ＝この題名は日本版のみ）
  //       xbox          **完全一致4件** … うち3件が目的の日本版（Japan Import 表記）
  //       original xbox **完全一致0〜1件** … 目的の3件が全部パディング領域に落ちる
  //   【なぜ 'original xbox' ではないか】日本版の出品タイトルに "original" と書く人が
  //     いないため、必須トークンが1つ増えて完全一致を壊す。'playstation 1' の「1」と
  //     同じ構造の問題。DOUBLE-S.T.E.A.L では 4件→0件になった。
  //   【360/One は巻き込まない】どちらのクエリでも上位10件に 360/One は0件。
  //     segaGT の facet も `Microsoft Xbox 17` ＝全部初代。素直な小文字化で正解だった。
  'Xbox':              'xbox',               //   82 実測済み・変更不要
};
/* eBay の SRP をリージョンコード NTSC-J（日本）で絞る aspect パラメータ。
   ★2026-08-15 実測。現時点で適用するのは r[2]==='PlayStation'（PS1）の行だけ。
     使うのは card() の ebayRegion（下の 2290 付近）。

   ★この文字列は eBay の左レール facet「リージョンコード → NTSC-J（日本）」の href を
     **そのまま写したもの**。A-1〜A-3 の3つの SRP で同一だった。
     パラメータ名 'Region%2520Code' は 'Region Code' の**二重エンコード**
     （'Region%20Code' をさらにエンコードした形）で、値 'NTSC%252DJ%2520%2528Japan%2529' も
     'NTSC-J (Japan)' の二重エンコード。
   ★**URLSearchParams / encodeURIComponent に通さないこと。** 再エンコードされて別物になり
     フィルタが効かなくなる。必ず文字列連結で URL に足す。
   ★HTML 側では他のパラメータに揃えて &amp; で書く。属性値としてパースされる時点で
     & に戻るので、飛び先の URL は上の facet href と1文字も違わない。
   ★'_dcat=139973'（ビデオゲームカテゴリ）は facet href に同伴していたので一緒に写した。
     単独では no-op（6クエリ全部で素の状態と件数が完全に一致）だが、実測した URL と
     同じ形を本番に出すために残す。

   ★なぜ PS1 だけなのか（2026-08-14〜15 実測・実 Chrome を CDP で駆動。
     方法は memory/ebay-srp-needs-real-chrome.md。日本 IP からの計測）:
       機種名を足しても**日本名と輸出名が同じ機種ではリージョンを分離できない**。
       PS1 で北米版が同名で出ている3本を測ると、上位10件の日本版は:
         Final Fantasy VII ps1  0/10（Black Label / PSX の北米版9・PAL 1）
         Metal Gear Solid ps1   2/10（北米4・PAL 3・ゲーム本体ですらない保護スリーブ1）
         Silent Hill ps1        0/10（北米7・PAL 3）
       この aspect を足すと3本とも **10/10 が日本版**になり、PAL は完全に0件になる。
   ★日本専売3本（Racing Lagoon / Boku no Natsuyasumi / Moonlight Syndrome）でも
     上位10件は劣化しない（10/10・10/10・8→9 /10）。Moonlight Syndrome は
     10位に居た攻略本が落ちて**むしろ改善**した。
   ★母集団の損失は小さい: 14→13・30→27・30→16。最後の -47% は攻略本など
     非ゲーム商品が落ちた分で、**ゲーム本体の在庫は 17→16 とほぼ無傷**
     （ビデオゲームカテゴリの facet で確認）。
   ★【LH_PrefLoc=6（Asia）を採らなかった理由】同じ NTSC-J 純度（10/10）を出せるが、
     あちらは**セラーの所在地**フィルタなので「日本版を非アジアのセラーが売っている出品」を
     全部落とす。母集団が aspect の 1/2〜1/3 になり（318→123・136→87）、日本専売行の
     損失も大きい（-14%/-30% 対 -7%/-10%）。上位10件に実際に発送元カナダ・英国・
     US Seller の日本版が複数入っており、それを消すのは買い手の選択肢を削るだけ。
     ※LH_PrefLoc の値は 98=Default / 3=US Only / 4=North America / 5=Europe / 6=Asia。
       **2 は Asia ではなく、どの選択肢にも対応しない no-op**（実測で確認）。
   ★残る誤爆はこれでは取れない。Silent Hill は 10/10 が日本版になっても、単品の製品版は
     4件だけで**体験版3・まとめ売り3**が占める（母集団58件と薄いため）。
     ＝テーブル冒頭に書いた「同じハードの別作品・合本」の層は別の手が要る。
   ★他機種へ広げるときは必ず測り直すこと。値は機種ごとに facet の href を見て写す
     （'NTSC-J (Japan)' 以外のリージョン名を使う機種がある可能性を潰していない）。

   ★【PS2 を追加した（2026-08-15・同日の追試）】facet href を PS2 の SRP で採り直し、
     PS1 と**同一の文字列**であることを確認した上で適用対象に足した。値は流用してよい。
       A群（北米で同名発売）… 上位10件の日本版が
         Devil May Cry ps2  0/10 → 10/10   母集団 2,400+ → 194・NTSC-J比率 14.4% → ほぼ全部
         MGS3 Snake Eater   1/10 → 10/10   954 → 113・14.3%
         Silent Hill 2      0/10 →  9/10   773 → 133・30.4%
       B群（日本専売）… 上位10件は劣化せず、在庫損失は PS1 より軽い
         Boku no Natsuyasumi 2  43 → 41（-4.7%）
         Sengoku Basara 2      257 → 205（-20%・落ちたのはリージョンコード未指定の52件）
         Kenka Bancho           45 →  45（**損失ゼロ**）
   ★【PS2 で新たに見つかった穴1: 韓国版】Silent Hill 2 の aspect 適用後の8位に
     `SUPER RARE Korean Silent Hill 2 PS2 Korean Version`（発送元 韓国）が残った。
     出品者が**リージョンコードを NTSC-J とタグ付けしている**ため aspect では落ちない。
     PS1 では出なかった型。**NTSC-J＝日本版とは限らない。**
   ★【PS2 で新たに見つかった穴2: B群でも合本・別作品が出る】PS1 の B群は3本とも 10/10 で
     無傷だったが、PS2 では Sengoku Basara 2 が 4/10・Kenka Bancho が 4/10 に落ちた。
     切り分けると**決定要因は機種でもリージョンでもなく「同じハードに同シリーズの他作品が
     何本あるか」**だった:
       崩れた… DMC(1/2/3/3SE が全部PS2)・Silent Hill(2/3/4)・Basara(1/2/X/英雄外伝)・
               喧嘩番長(1/2)
       無傷… Boku no Natsuyasumi 2 は**1がPS1・3がPS3**で PS2 には2しか無い
             ＝機種名が期せずして作品の同定にも効いた
     **つまり「日本専売なら安全」ではない。**シリーズが1機種に集中している作品は、
     リージョンを解いても上位10件の半分以上が別作品・合本になる。

   ★【GameCube を追加した（2026-08-15）】facet href は PS1/PS2 と同一（毎回自動照合する）。
       A群（北米で同名発売・上位10件の日本版）… 素の状態はほぼ0 → aspect で **3本とも 10/10**
         Pikmin 2                 340 → 133（NTSC-U/C 129・PAL 29 を排除）
         Luigi's Mansion          544 →  77（NTSC-U/C **332**・PAL 47 を排除）
         Mario Kart: Double Dash  850 →  87（NTSC-U/C **461**・PAL 103 を排除）
       B群（日本専売）の損失… Giftpia -12% / Kururin Squash! -25% /
         Nintendo Puzzle Collection -44%（ただし内訳は NTSC-U/C 14・PAL 11 の他リージョン
         タグ付けで、**落として正しいもの**を含む。aspect 後の上位10件は 10/10 が目的の商品）
     ★選定時に外したもの（続き8の基準）: Metroid Prime は接頭辞衝突1、Zelda 系は GC 内に4本で
       Collector's Edition が合本、Resident Evil 4 は GC 内に5本かつ和名が biohazard4。
     ★**GameCube はまとめ売りが機種レベルで多い。**束売り慣習のあるシリーズを避けて選んだのに、
       aspect 後の上位10件で Pikmin 2 は4件・Luigi's Mansion は3件がロット出品だった
       （中古価格が安く、日本のセラーがまとめて出すため）。タイトル選定では避けきれない。
     ★適用の可否は「未指定率」で事前に見当がつく。GameCube の日本専売3本は 11%/12%/22%
       （平均15%）で、適用した PS1/PS2 の 2〜10% に近く、見送った Sega Saturn の 28〜42% から
       離れていた。**実測前のスクリーニングとして機能する**ことがこの機種で確認できた。

   ★このコメントを編集するときの注意: このファイルはアスタリスク強調と「10/10」形の分数を
     多用する。分数の直前で強調を閉じると、閉じ側のアスタリスクと分数のスラッシュが並んで
     ブロックコメントの終端記号になり、**スクリプト全体が構文エラーになる**
     （2026-08-15 に実際に踏んだ。上の「8→9 /10」で 9 を強調していないのはこのため）。
     追記したら必ず構文チェックすること。 */
const EBAY_REGION_NTSCJ = '&amp;Region%2520Code=NTSC%252DJ%2520%2528Japan%2529&amp;_dcat=139973';
// 2026-10-19（data-split）: 駿河屋のアフィリエイトの組み立ては KB_SHOP（<head>）に移した（簡易カードと共用）。ここは同じものを指すだけ。
const SG_AF=KB_SHOP.SG_AF;
const SG_UTM=KB_SHOP.SG_UTM;
const sgAf = KB_SHOP.sgAf;
/* 駿河屋の英語サイト(.com)。2026-08-04 追加。.jp と違って海外発送に対応する＝日本国内の
   住所も代理購入業者も要らない。海外モードでだけ出す(IN JAPAN は .jp のみで変更なし)。
   ★af_jump を通さない。アフィリエイトではない直リンクなので、通すと .jp のアフィリエイト
     経由に見せかけることになる。sgAf と別系統にしてあるのはそのため。
   ★検索語は「英題 + 機種名(英語)」。DATA の r[0] と r[2] をそのまま繋ぐ。
     r[2] は PLATFORM_RENAME 適用後の platform_en(build_master.py 991行)。
   実測(2026-08-04・30件を目視): 1ページ目に対象あり 56.7% / 誤表示 0件。
   4割強は空振りするが、空振りは「検索結果が薄い」だけで別物を掴ませない＝罠#27 の害は出ない。
   その代わり塗り(primary)にはしない。下の gEnTitle のコメントを見ること。 */
const SG_COM=KB_SHOP.SG_COM;   // 2026-10-19: KB_SHOP（<head>）と同じもの
/* ★空白は %20 ではなく + で送る(2026-08-04)。56.7% の測定に使った30本の URL が + 区切りで、
   %20 のままだと「測ったものと違う URL を本番に置く」ことになる。クエリ値としては等価の
   はずだが、等価かどうかは駿河屋側の実装次第で、こちらでは測っていない。
   ★置換するのは %20 だけ。%3A(:) 等の記号エンコードは encodeURIComponent のまま残す
     ＝測定時(Python の quote_plus)と同じ形。差が残るのは ' の1文字だけで、
     quote_plus は %27・こちらは素の ' を送る(該当は英題にアポストロフィを含む行)。 */
const sgCom = KB_SHOP.sgCom;   // 2026-10-19: KB_SHOP（<head>）と同じもの
const buyBlock = k => KB_SHOP.buyBlock(k, LOC==='jp');   // 2026-10-31: 本体は KB_SHOP（<head>）へ移した。仮のカードと同じ形＝本体に替わっても店ボタンがずれない

/* ★2026-09-28 試作: ブログ記事・機種タグへのリンク。
   /blog/links.json（build_feeds.py の生成物・公開済みの記事だけ）を後から読む。
   ★読み込みに失敗しても BLOG_LINKS は null のまま＝リンクが出ないだけで、検索・カードは今までどおり。
   ★キーは DATA の機種(row[2]) + タブ + 和題(row[1])。DATA 自体には何も足さない（DATA 行の md5 は変わらない）。
   ★行き先の言語: ブログで選んだ言語(kataban_blog_lang) → ブラウザの言語 → 英語（kataban.js と同じ判定）。 */
let BLOG_LINKS=null;
/* ★2026-10-27: 英題が無いカードの外来語を、語ごとに英語へ（loanword hints・カードは「great · boxing …」）。
   表は catalog/loan-<md5>.json（catalog_io.py が tools/loan_gloss.py で作る・約70KB）。検索の準備ができてから後で読む（最初の描画を待たせない）。
   形: {"md5":カタログ,"w":[語],"r":"Δ:id.id~;…"}。Δ＝前の行からの行番号の差・id＝w の位置（どちらも36進）・~＝訳せない片仮名語が残る（末尾に …）。
   ★カタログの md5 が manifest と違えば使わない（行番号がずれる）。読めなければ出ないだけ。
   ★題名として見せない（小文字・中黒区切り・「not a title」）。検索の索引にも店の検索語にも使わない。
   ★語の出どころ: 英題がある行の和題と英題の突き合わせ＋JMdict（EDRDG・CC BY-SA 4.0）。出典はフッター。 */
let LOAN_GLOSS=null;   // DATA の行（配列そのもの）→ "great · boxing …"
let EN_KIND=new Map();  // DATA の行 → 'r'（英題の欄の値はローマ字題）／'p'（発売元が後に使った英語名）／'f'（ファンの通称）。
                        // 同じ loan ファイルの k（tools/en_kind.json）。英語版の無い作品の値を「English」と出さないため。読めなければ空＝今まで通り「English」
// ★2026-10-28: k は manifest にも入れた（約1KB）。本体が動く時点で manifest（KB_CATALOG）と DATA は揃っているので、最初のカードから欄名が決まる。
//   manifest に k が無い（古い manifest）ときは loan が届くまで EN_KIND_READY=false＝欄名を「English」と言い切らない中立の表示（card() の enLabel）。
//   loan も読めなければ ready にして今まで通り「English」。
let EN_KIND_READY=false;
function parseEnKind(k){ const km=new Map(); let i=0; for(const e of k.split(';')){ if(!e) continue; const c=e.indexOf(':'); i+=parseInt(e.slice(0,c),36); if(DATA[i]) km.set(DATA[i], e.slice(c+1)); } return km; }
(function(){ const m=window.KB_CATALOG; if(m && typeof m.k==='string'){ EN_KIND=parseEnKind(m.k); EN_KIND_READY=true; } })();
// ★2026-11-17（kana-fill）: 国内モードのカードに出す日本語の読み（manifest の rd・tools/kana_read.json・k と同じ "Δ:値;…" の形）。
//   和題がラテン文字だけで row[8] に日本語が無い行のうち、出典2つで読みが一致した行だけ。画面に出すだけで、店の検索語（r[8] || 和題）と検索の索引には使わない。
let READ_FILL=new Map();
(function(){ const m=window.KB_CATALOG; if(m && typeof m.rd==='string') READ_FILL=parseEnKind(m.rd); })();
function enKindSettle(){ if(!EN_KIND_READY){ EN_KIND_READY=true; if(current.length) paint(); } }   // loan が読めなかった＝今まで通り「English」
whenSearchReady(()=>{
  const C=window.__kbCat; if(!C || !C.manifest){ enKindSettle(); return; }
  C.manifest.then(m=> (m.loan && m.md5) ? fetch('/catalog/'+m.loan).then(r=>r.ok?r.json():null).then(j=>{
    if(!j || j.md5!==m.md5 || typeof j.r!=='string'){ enKindSettle(); return; }
    const map=new Map(); let i=0;
    for(const e of j.r.split(';')){
      const c=e.indexOf(':'); i+=parseInt(e.slice(0,c),36);
      let v=e.slice(c+1); const part=v.endsWith('~'); if(part) v=v.slice(0,-1);
      if(DATA[i]) map.set(DATA[i], v.split('.').map(x=>j.w[parseInt(x,36)]).join(' · ')+(part?' …':''));
    }
    if(!EN_KIND_READY && typeof j.k==='string') EN_KIND=parseEnKind(j.k);
    EN_KIND_READY=true; LOAN_GLOSS=map; if(current.length) paint();
  }) : enKindSettle()).catch(enKindSettle);
});
// ★2026-11-18（lang-barrier）: ジャンルからの目安（manifest の lb）。loan と同じく検索の準備ができてから後で読み、カタログの md5 が違えば使わない。
whenSearchReady(()=>{
  const C=window.__kbCat; if(!C || !C.manifest) return;
  C.manifest.then(m=> (m.lb && m.md5) ? fetch('/catalog/'+m.lb).then(r=>r.ok?r.json():null).then(j=>{
    if(!j || j.md5!==m.md5 || typeof j.g!=='string' || j.g.length!==DATA.length) return;
    const map=new Map(); for(let i=0;i<j.g.length;i++){ const c=j.g[i]; if(c!=='.') map.set(DATA[i], c); }
    LB_GENRE=map; if(current.length) paint();
  }) : null).catch(()=>{});
});
let JAPAN_ONLY=new Set();
let SHARED_CODES={};      // links.json の d（別の作品に同じ型番が付いている「機種\t型番」→ 和題の一覧）。読めなければ空＝注意書きが出ないだけ   // links.json の j（「Japan only」の印を出すキー）。読めなければ空のまま＝印が出ないだけ
const BLOG_LANGS=['en','zh','ko','es','de','fr'];
function blogLang(){ return KB_SHOP.lang(); }
function blogUrl(path){ const l=blogLang(); return '/blog/'+(l==='en'?'':l+'/')+path; }
/* ★別名（links.json の s）: 記事で扱う作品の行に、検索用の別名を足す（DATA は変えない）。
   HAY / HAY4 の末尾に1行として足すので、完全一致の段（HAY を \n で割って比べる）にも効く。 */
function applyBlogAliases(s){
  // ★2026-10-21: 全行の「機種\t和題」を作らない（4倍遅い CPU で十数秒かかり、/?q= の最初の検索がそのぶん待たされた）。
  //   和題が別名の表にある行だけ見る。足す行・足す中身は以前と同じ。
  const titles=new Set(); for(const k in s) titles.add(k.slice(k.indexOf('\t')+1));
  for(let i=0;i<DATA.length;i++){ const r=DATA[i]; if(!titles.has(r[1])) continue;
    const al=s[r[2]+'\t'+r[1]]; if(al) for(const a of al){ HAY[i]+='\n'+fold(accent(a)); HAY4[i]+='\n'+squash(a); } }
  HAYK = HAY4K = null;   // ひらがな・カタカナの索引（予備の検索③）は別名込みで作り直す
}
fetch('/blog/links.json').then(r=>r.ok?r.json():null).then(j=>{
  if(j && j.a && j.p){
    BLOG_LINKS=j;
    if(Array.isArray(j.j)) JAPAN_ONLY=new Set(j.j);
    if(j.d && typeof j.d==='object') SHARED_CODES=j.d;
    if(Array.isArray(j.f)) FAN_TL=new Set(j.f);   // 英語のファン翻訳がある行（2026-11-18・fan-tl）。読めなければ空＝出ないだけ
    if(j.r && typeof j.r==='object') setNaTitles(j.r, j.rf);   // 北米名の並び順（2026-11-17）。検索し直しは下の linksArrived と同じとき
    linksArrived('ready', j.s);
    if(!q.value.trim() && current.length) paint();   // 先に検索していたら、別名込みで検索し直す（deep はそのまま）
  } else linksArrived('none');
}).catch(()=>{ linksArrived('none'); });
// 2026-10-19: 別名は検索の索引（HAY）に足すので、索引ができてから。検索し直しも同じとき。
// 2026-10-21: 最初の検索を待たせていたら、ここで別名込みで1回だけ。もう検索していたら（型番の語・2秒を過ぎた・打った）別名込みで検索し直す。
function linksArrived(state, s){
  if(linksState) return; linksState=state; document.documentElement.setAttribute('data-links', state);
  whenSearchReady(()=>{
    if(s) applyBlogAliases(s);
    if(firstRunWaiting) releaseFirstRun();
    else if(ranSinceReady && q.value.trim()) run({deep: lastDeep});
  });
}

/* ★2026-09-28: 行ごとの eBay 検索語の差し替え（card() の kwEn）。英題＋機種名で実測した純度が低かった行だけ。
   キーは DATA の機種(row[2]) + タブ + 和題(row[1])。値はそのまま _nkw に入れる（ebayOp も機種名も足さない）。
   実測（2026-09-28・実 Chrome＋CDP・日本 IP）と判定は scratchpad の title_fill_proposal.csv。
   ★型番だけの _nkw は eBay では外れやすい（JF-30 は日産の部品等）。型番にしたのは件数1〜2件でも純度100%の2行だけ。
   ★マイナス演算子（-II）は eBay で効く（GG Aleste game gear 5/10 → 9/10）。 */
const EBAY_KW_OVERRIDE = {
 "Famicom\tスーパー魂斗羅": "Super Contra konami famicom",
 "PlayStation 4\tストリートファイター30thアニバーサリーコレクションインターナショナル": "PLJM-80264",
 "Famicom\tファイナルミッション": "Final Mission famicom",
 "PC Engine\tパラソルスター": "Parasol Stars pc engine",
 "Neo Geo\tトップハンター": "Top Hunter neo geo aes japan",
 "Famicom\tマジックジョン": "Magic John famicom",
 "Famicom\t西遊記ワールド": "NMK-KW",
 "Famicom\t西遊記ワールド2  天上界の魔神": "Saiyuki World 2 famicom",
 "Game Boy\tONI2  隠忍伝説": "ONI II gb",
 "Game Boy\tONI3  黒の破壊神": "ONI III gb",
 "Game Boy\tONI4  鬼神の血族": "ONI IV gb",
 "Game Boy\tONI5 隠忍を継ぐ者": "ONI V gb",
 "Game Gear\tロイアル・ストーン 開かれし時の扉": "Royal Stone game gear",
 "Famicom\t仮面の忍者 花丸": "Kamen no Ninja Hanamaru famicom",
 "Game Gear\tGGアレスタ": "GG Aleste game gear -II",
 "Neo Geo CD\tクロススウォード": "Crossed Swords neo geo cd -II -2"
};


// 結果カードの札（2026-10-19）。'' = 検索・'barcode' = 読んだ JAN と完全一致（showByJan）・
// 'guess' = DATA に無い JAN を楽天の商品名から当てた候補（janFallback）。run()（検索）で '' に戻す。
let cardMatch='', cardMatchJan='';
/* 2026-11-06（card-compact）: スマホのカードの「More details」。文言の言語は blogLang()（DUPE_NOTE と同じ）。
   開いた行は WeakSet で覚える（DATA の行の配列そのもの＝検索し直しても同じ行なら開いたまま）。 */
const CM_LABEL = {
  en: ['More details', 'Fewer details'],
  zh: ['更多詳情', '收起詳情'],
  ko: ['자세히 보기', '간단히 보기'],
  es: ['Más detalles', 'Menos detalles'],
  de: ['Mehr Details', 'Weniger Details'],
  fr: ['Plus de détails', 'Moins de détails']
};
// 閉じた形の英題のすぐ下に出す短い1行（2026-11-06）。英題が複数の日本版にまたがる行だけ（AMBIG_EN）。全文の注意書き（.cap）は開くと出る。
const CM_AMBIG = {
  en: 'Shared name — match the Japanese title & code',
  zh: '多個日版同名——請核對日文標題與型號',
  ko: '같은 이름의 일본판이 여럿 — 일본어 제목·품번 확인',
  es: 'Nombre compartido: mira título japonés y código',
  de: 'Name mehrfach vergeben: jap. Titel & Code prüfen',
  fr: 'Nom partagé : vérifiez titre japonais et code'
};
const CM_OPEN = new WeakSet();
// 2026-11-07（案A）: More details と閉じた形の注記は英語に固定（店ボタンと同じ）。
// 2026-11-14: zh/ko だけ訳を使う（検索画面の zh/ko 表示と揃える）。
const KB_ZK = ()=>{ const l=KB_SHOP.lang(); return (l==='zh'||l==='ko')?l:'en'; };
function cmLabel(open){ const t = CM_LABEL[KB_ZK()]; return open ? t[1] : t[0]; }
/* GA4 のイベント（2026-11-06・card-compact）: clerk_open（Show to shop staff）・card_expand（閉じた形で More details を開いた）。
   パラメータは loc（out＝海外 / jp＝国内）と platform（DATA の row[2]＝機種の英語名）。
   gtag は <head> の先頭で定義済み（GA のタグを読む前は dataLayer に積まれ、読んだときに送られる）。無い・失敗しても押した動作は止めない。 */
function cmTrack(name, r){
  try{ if(typeof gtag === 'function') gtag('event', name, { loc: LOC, platform: (r && r[2]) || '' }); }catch(e){}
}
function cmText(k){ return k === 'ambig' ? CM_AMBIG[KB_ZK()] : ''; }
results.addEventListener('click', e=>{
  const b = e.target.closest('.cm-toggle'); if(!b) return;
  const c = b.closest('.card'); const r = current[[...results.querySelectorAll(':scope > article.card')].indexOf(c)];
  const open = !c.classList.contains('cm-open');
  c.classList.toggle('cm-open', open);
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
  b.textContent = cmLabel(open);
  if(r){ if(open) CM_OPEN.add(r); else CM_OPEN.delete(r); }
  if(open) cmTrack('card_expand', r);
  // 閉じたときにカードの頭が上の帯（#locbar）の下か画面の上へ消えていたら、カードの先頭へ戻す（ボタンの位置が大きく上がるため）
  const lb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--locbar-h')) || 0;
  if(!open && c.getBoundingClientRect().top < lb) c.scrollIntoView({block:'start'});
});

function card(r,idx){
  const [en,jp,pf,code,yr,pubja,puben]=r;
  const hasEn=!!en;
  const title = hasEn?en:jp;      // 検索・ローマ字判定に使う見出し（表示の主役は下の jp）
  const jpMain = jp||en;          // 日本語タイトル＝店員が読む主役。空の行だけ英題に落ちる
  const codes = code.split(';').map(s=>s.trim()).filter(Boolean);
  // 発売元は英語(row[6])を優先し、無ければ日本語(row[5])。どちらも空なら出さない。
  const pubs  = (puben||pubja).split(';').map(s=>s.trim()).filter(Boolean);
  // Buy-link keywords: sellers list by TITLE, not by product code.
  const kwName = enc(jp||en);        // Japanese name (fallback English) — no consumer now (passed to buyBlock only)
  /* eBay の検索キー。★2026-08-14: 和名フォールバック(en||jp)をやめ、英題が無い行は '' にする
     ＝ buyBlock 側で eBay リンクごと出さない（物理30,741行のうち17,651行・57.4%が該当）。
     理由(2026-08-14 実測・実ブラウザで ebay.com の SRP を目視):
       ・和名をそのまま _nkw に入れると eBay 側が機械翻訳して別語に化ける。
         「風のクロノア1&2アンコール」→ "style chronos 1 & 2 encore"(風=style)で 2件、
         見えている上位10件のうち8件がランプ・ワッシャー・カウボーイベルト等の完全な無関係品。
       ・化けない場合も完全一致0件になる。「聖剣伝説3トライアルズオブマナ」は 0件で、
         表示されるのは関連品フォールバック(フィギュア・アクリルスタンド・ポストカード)のみ
         ＝ゲームソフトが1件も出ない。和名にスペースが無く1トークン化する行が6,258ある。
     ★ゲートは kwEn 側に置く。buyBlock は k しか受け取らず en を持たないため、フラグを増やさず
       「キーが空ならリンクを出さない」という既存の形(下の sgComUrl)に揃える。
     ★en が空白文字のみの行は0行なので、truthy 判定で取りこぼしは無い(全数確認)。
     ★英題が空 かつ Buyee リンクも作れない行は0行＝.stores が空箱になる行は存在しない(全数確認)。 */
  /* ★2026-08-14(2): 英題に機種名(英語)を足す。PLATFORM_EBAY は r[2] をキーに引く（定義と
     実測の根拠はテーブル側のコメント・1560 付近）。pf は上の分割代入で既に r[2] が入っている。
     ★未知のキー / 'TBD' は「足さない」に倒す＝この行の _nkw は変更前と完全に同じになる。
       undefined や 'TBD' が URL に混ざることは無い（既存の「キーが空ならリンクを出さない」と
       同じ、安全側に倒す形）。r[2] は KEEP_PLATFORMS 通過後の35種でテーブルも同じ35キーなので
       現時点で発火する行は0行＝将来 KEEP_PLATFORMS に機種を足したときの受け皿。
     ★pf.toLowerCase() のような自動フォールバックは入れない。未実測の語を黙って本番に出す
       ことになり、しかも素直な小文字化が誤りである実例が2つある（'playstation' は PS2〜5・
       Vita を巻き込む / 'game boy' は Game Boy Advance を巻き込む）。
     ★hasOwn で引く。r[2] はホワイトリスト由来なので実害は無いが、'constructor' のような
       継承キーで関数が返る余地を残さない。
     ★enc() は連結後の文字列にかける。enc(en) + ' ' + pfTerm だと空白が生のまま URL に入る。
     ★エンコードは encodeURIComponent のまま＝空白は %20。実測に使った URL も
       encodeURIComponent で組んだので、測ったものと同じ URL が本番に出る。sgCom が
       %20 を + に置換しているのは駿河屋側の測定条件に合わせたためで、eBay には持ち込まない。
     ★jp / 海外モードで同じ処理にする。eBay リンクは gWorld の中にあり両モードとも出る
       （order は 1740 付近）。飛び先が同じ eBay の SRP なのでモードで結果が変わる要素が無く、
       罠#27 の理屈（別物を最短距離で指すのは誤った値を出すのと同じ害）は国内の買い手にも
       同じく当たる。前回の eBay 変更（英題が無い行はリンクごと出さない）も両モード適用。
     ★語の重複を除くガードは**意図して入れていない**。英題に既に機種名が入っている行が
       65行あり（buyBlock を吐く13,090行の0.5%。Wii 23・Game Boy 10・Nintendo Switch 9・
       3DS 7・Dreamcast 5・WonderSwan 4 ほか）、"New Super Mario Bros. Wii wii" のように
       語が2回続く。2026-08-14 に3組を実測して**質の劣化なし**を確認した:
         New Super Mario Bros. Wii / + wii     … 3,700件→5,800件と母集団は膨らむが、
           上位10件はどちらも10/10 この作品の Wii 版で中身は同等
         Princess Arthur for Nintendo Switch / + nintendo switch
           … 6件で完全一致6件が**完全に同一**（2語フレーズの重複でも影響ゼロ）
         beat mania GB / + gb                  … 68件 vs 67件。重複ありのほうが10位に
           無関係なポスターではなく BEATMANIA GB が入り**むしろ改善**（差は揺れの範囲）
       ＝測って害が無いと分かったものに未測定の正規表現分岐を足すほうがリスクが高い。
       ガードを入れるなら en に \b<語>\b が在るとき pfTerm を落とす形になるが、不要と判断した。 */
  const pfRaw  = Object.hasOwn(PLATFORM_EBAY, pf) ? PLATFORM_EBAY[pf] : '';
  const pfTerm = (pfRaw && pfRaw !== 'TBD') ? pfRaw : '';
  /* ★2026-08-16: eBay に投げる英題を accent() で畳む（`Dōkyūsei`→`Dokyusei`）。
     ★掛けるのは kwEn だけ。カード見出し・検索索引(HAY)・sgComUrl は en のまま。
       駿河屋.com の英語検索で畳み込みが要るかは**測っていない**ので持ち込まない。
     ★accent() は 1309 行の既存関数をそのまま使う（HAY の r0 に既に掛けているもの）。
       NFD → U+0300-036F 除去 → NFC なので、**結合ダイアクリティカルしか落ちない**。
       波ダッシュ `～` / 全角 `＆` / `☆` / `Ψ` / ローマ数字 `Ⅶ` には触れない
       ＝続き13の6節で「白紙6件」の原因になった記号群は**この変更の対象外**。
     ★影響範囲（2026-08-16・DATA 全 37,850行の全数確認）: eBayリンクが出る 13,090行のうち
       非ASCII英題は 702行。**_nkw が変わるのは 460行**で、残 242行は1文字も変わらない。
       ASCII だけの行で変わったものは **0行**（＝この変更が触れないことの全数確認）。
       畳まれた文字は15種で全部が結合ダイアクリティカル
       （ō 354 / ū 173 / é 70 / Ō 27 / ä 9 / ë 7 / ö 5 ほか）。
       触れなかった 242行 に残るのは ～113 / ☆31 / –30 / 〜30 / ×20 / Ⅱ17 / ＆13 など。
       ★8行は「畳んだうえで記号が残る」（例 `Masō Kishin 3 – Pride of Justice` の en dash、
         `NOëL ～La neige～` の波ダッシュ）。ダイアクリティカルだけ落ちて記号は残る＝意図どおり。
     ★理由(2026-08-16 実測・素のURL・profile7・対照6本通過。accent12.mjs / accent12b.mjs /
       accent12c.mjs、生データ accent12*.json):
       ・**効いているのは「ō→o」ではなく「eBay の書き換えパスを通らせない」こと。**
         マクロンを送ると 12本中10本で eBay がクエリを書き換える（heading が小文字化して返る）。
         書き換えの中身が一貫していない ―― `ō→o` と `ū→uu` が同一クエリ内で混ざり
         (`jikkyo powerful pro yakyuu 11`)、`ō` が片方だけ残り
         (`kurohyō: ryu ga gotoku shinsho`)、最悪は**別語に化ける**
         (`Astronōka`→`astronomy`／`Astronouka`→`astronaut`)。
         ASCII を送ると 12本中11本で書き換えが起きない（例外は `!` を含む Kenzan!）。
       ・12本の合計: facet が出ない行 6→2、リージョンfacet計 292→389、NTSC-J 102→177。
       ・**件数の増減で判断してはいけない。**`Jikkyō…Yakyū 11` は 8件→5件と減るが、
         上位が「メモリーカードのシール」から実物の PS2 ソフトに入れ替わる。
         `Ōkamiden` の 98→78 は facet が完全同一で、消えた20件はリージョン欄の無いグッズ。
     ★`ō→ou` 置換（続き13の7節が推した案）は**採らない**。同じ12本で直接対決させた結果:
         facet計 264 / NTSC-J 171 で accent(389 / 177) に負ける。
         長音の由来を区別できないのが致命的で、`Ōkamiden`(大神=おおかみ)→`Oukamiden` は
         facet 85→**0**。`Butouden` は仮名として正しい綴りなのに facet 80→16 になる
         ―― 西側で同名発売された行が必要としているのは仮名の正しさではなく
         **ASCII 畳み込み形そのもの**（西側の正式題名が `Okamiden` / `Butoden`）。
       row[9](title_romaji) から正しい重ね方を引く案も測った（`Ookamiden` と当てられる）。
       ou よりは良い（facet計 330 / NTSC-J 217）が、**accent には勝てない**
       ―― B群では勝つ(224→299)が A群で大敗する(165→31)ため。
     ★直らないものは直らない。`Cyber Knight II: Chikyū Teikoku no Yabō`（セラーは
       `Chikyuu…Yabou`）と `Jikū Tantei DD: Maboroshi no Rōrerai`（セラーは全員
       **`Lorelei`**）は accent でも0件のまま。後者はマクロンの問題ですらなく
       続き13の「流通名の乖離」クラスで、どの綴り方式でも解けない。
     ★行ごとに accent と row[9] を測り分ければ NTSC-J 231 まで伸びる（12本実測）が、
       それは「測った結果を持たせる場所」が要る＝build_master.py の名指し表の仕事になる。
       ここは**測らずに全行へ一律に掛けられる範囲**だけを入れる。
     ★空判定は `en` のまま（accent(en) ではない）。既存の「キーが空ならリンクを出さない」
       と1文字も変えない ―― 下の ebayRegion もこの kwEn を見ている。
     ★2026-08-16(続き19): さらに ebayOp() を掛ける（語頭ハイフンと straight quote だけ落とす。
       定義と根拠は 1309 付近の関数コメント）。accent の**後**に掛けるが両者は可換で、
       全13,090行で `ebayOp(accent(en)) === accent(ebayOp(en))` を確認してある。
       ★変わるのは 79行（語頭ハイフン76／引用符3）。accent が効く460行のうち重なるのは3行だけで、
         残り457行の kwEn は1文字も変わらない。ASCII だけの行で変わるのは 76行のうちの ASCII 分。
       ★空判定を `en` のままにしているのがここでも効く ―― ebayOp で空白のみになる行は0行だが、
         仮に出ても「リンクを出さない」側に倒れる（ebayRegion も同じ kwEn を見ているので連動する）。 */
  /* ★2026-09-28 試作: 行ごとの eBay 検索語の差し替え（実測で英題＋機種名の純度が低かった行だけ）。
     キーは DATA の機種＋タブ＋和題。値はそのまま _nkw に入れる（ebayOp・機種名は足さない）。 */
  const ebayOv = EBAY_KW_OVERRIDE[pf+'\t'+jp];
  const kwEn   = ebayOv ? enc(ebayOv) : (en ? enc(pfTerm ? ebayOp(accent(en)) + ' ' + pfTerm : ebayOp(accent(en))) : '');  // English title + console (空なら eBay リンクを出さない)
  /* eBay のリージョン絞り込み。★2026-08-15: PS1 / PS2 / GameCube の行を NTSC-J（日本）で絞る。
     根拠と「他機種に広げる前に測り直すこと」はテーブル側のコメント（EBAY_REGION_NTSCJ・1990 付近）。
     ★kwEn が空の行は eBay リンク自体が出ないので、ここも '' に倒して URL 片を作らない。
     ★enc() には通さない。二重エンコードされた生文字列で、再エンコードすると効かなくなる。
     ★pf の直値で判定する。PLATFORM_EBAY のように 35 機種のテーブルにしていないのは、
       実測した機種にしか適用しないため＝未実測の機種に黙って広げない。
       現在の適用対象は3機種（PS1 1,861行・PS2 1,974行・GameCube 225行）。
     ★実測して**見送った**機種: PlayStation 3（リージョンフリー機・下記コメント参照）、
       Sega Saturn（日本専売タイトルの損失が -33〜-39% と大きい）。 */
  const ebayRegion = ((pf === 'PlayStation' || pf === 'PlayStation 2' || pf === 'GameCube') && kwEn)
    ? EBAY_REGION_NTSCJ : '';
  // ★2026-10-23 Buyee メンテのお知らせの「eBay」リンク（buyeeMaintNote）。英題があれば eBay ボタンと同じ検索（kwEn・ebayRegion）、
  //   英題が無い行は和題で同じ作り（accent・ebayOp・機種名・PS1/PS2/GC は NTSC-J）。メンテ明けに BUYEE_MAINT を false にすれば使われない。
  const kwEbayMaint = kwEn || (jp ? enc(pfTerm ? ebayOp(accent(jp)) + ' ' + pfTerm : ebayOp(accent(jp))) : '');
  const ebayRegionMaint = kwEn ? ebayRegion
    : (((pf === 'PlayStation' || pf === 'PlayStation 2' || pf === 'GameCube') && kwEbayMaint) ? EBAY_REGION_NTSCJ : '');
  // 2026-10-19（data-split）: 購入リンクの語（駿河屋の型番・題名、Buyee）は KB_SHOP.keys(r)（<head>）へそのまま移した。
  //   読み取りの簡易カード（本体の準備前に出す）と同じ式を使うため。中身・並び・例外の表は移す前と一字一句同じ。
  const {kwCode, sgComUrl, sgNoCode, kwCodeSg, kwBuyee, kwBuyeeFallback, buyeeWrapped, kwKana, kwKanaBo, kwKanaHard} = KB_SHOP.keys(r);
  const credit = [pubs.join(' \u00b7 '), yr].filter(Boolean).join('  \u00b7  ');
  // row[1](日本語名)にかな・カタカナ・漢字が1字も無い＝箱の表記自体がラテン文字。
  const jaLatin = !!jp && !/[぀-ヿ㐀-鿿]/.test(jp);
  // 英題があるラテン表記の行では「Japanese reading」の見出しを出さない(英題と同じ文字列の重複を止める)。
  // row[0] が空の行では従来どおり出す(見出しが英題側に無いため)。
  // ★ただし row[0] と row[1] が別表記(例 Resident Evil 4 / biohazard4)なら箱の背表紙照合に要るので消さない。
  //   codeKey(NFKC+大文字化+英数字以外除去=全角半角統一・空白/記号除去)で正規化して一致する行だけ消す。
  const hideJa = jaLatin && !!en && codeKey(en) === codeKey(jp);
  // ローマ字読みの判定は romajiFor() に切り出した（2026-09-11・印刷シートと共用）。式は元のまま。
  const romaji = romajiFor(r);
  // 英語版の無い作品の英語名（2026-10-27 試作）: links.json の u（blog/_parts/search_aliases.json の unofficial_en・出典2つ）。
  //   英題（row[0]）が空の行だけ。公式英題の欄には出さず、ローマ字見出しの下に「Unofficial English name」として出す。検索は同じ名前が別名（s）で当たる。
  const unoff = (!en && BLOG_LINKS && BLOG_LINKS.u && BLOG_LINKS.u[pf+'\t'+jp]) || null;
  // スラブ表示。区切りの前後は「折り返せる普通の空白」にする(&nbsp; だと型番の内側でしか折れない)
  // 中黒の前は &nbsp;(前の型番にくっつける)、後ろは普通の空白(ここで折る)。
  // → 折り返しても行頭が「・」で始まらず、型番は必ず1つ丸ごと1行に載る。
  const codeShow = codes.map(esc).join('<span class="sep">&nbsp;&middot;</span> ');
  const codeCopy = esc(codes.join(' '));                              // スラブのコピー値(属性用にエスケープ)
  const pubShow  = pubs.join(' · ');
  const noCode = codes.length === 0 && !r[12];   // 型番の無い物理ソフト。日本語タイトルが唯一の検索キー
  // マイリストのアイコンボタン（2026-08-21。以前は型番ブロック直下の全幅ボタンだった）。
  // ★型番の無い行には出さない ―― 保存する値が無いため（LIST_KEY 付近のコメント参照）。
  // ★置き場所は「そのカードで一番上に出るタイトル」の左。英題がある行は .en-title の左、
  //   無い行は .ja-title の左（下の .identity を参照）。両方消える行は無い:
  //   .ja-title を隠す hideJa は en が真のときしか立たないため、en が偽なら必ず出る。
  // ★状態は3つ同時に持たせる: is-on（見た目）/ aria-pressed（押下状態）/ aria-label（読み上げ）。
  //   label は状態の記述ではなく**押すと起きること**を書く（2026-08-21 のトグル化で
  //   "In My List" から "Remove from My List" へ戻した）。aria-pressed が状態を伝えるので、
  //   label まで状態にすると「押されている / リストにあります」と二重に読まれる。
  //   押した後にこの3つと <use href> を書き換える手順は listBtnPaint() に寄せてある
  //   ＝ここの初期値と listBtnPaint() は必ず同じ文言・同じ href を使うこと。
  const inList = listSet.has(code);
  const listBtn = codes.length ? `<button class="btn-list${inList?' is-on':''}" type="button"
      data-list="${esc(code)}" aria-pressed="${inList?'true':'false'}"
      aria-label="${inList?'Remove from My List':'Add to My List'}"><svg class="pu-icon" aria-hidden="true" focusable="false"><use href="#icon-powerup-${inList?'on':'off'}"></use></svg></button>` : '';
  const blogArts = (BLOG_LINKS && BLOG_LINKS.a[pf+'\t'+jp]) || [];
  const platKey = BLOG_LINKS && BLOG_LINKS.p[pf];
  const jpOnly = !r[12] && JAPAN_ONLY.has(pf+'\t'+jp);
  const enKind = en ? EN_KIND.get(r) : '';   // 英題の欄の値の種類（EN_KIND）。r・p・f のときは欄名を「English」にしない
  // 札: バーコードと完全一致なら「Barcode match」、楽天からの推測なら「Possible match」。
  // 完全一致のときは「英題が複数の日本版にまたがる」の注意を出さない（箱の JAN がこの1本を指している）。
  const byBarcode = cardMatch==='barcode' && !!r[10] && r[10]===cardMatchJan;
  const byGuess = cardMatch==='guess';
  const matchLabel = byBarcode ? 'Barcode match' : byGuess ? 'Possible match' : 'Match';
  // 2026-11-03: 店モードでは「遊べる本体」を相場のすぐ下へ。値札を見ながら、値段と遊べるかを1画面で決められるように。
  const regionUp = (byBarcode||byGuess) && inShopRead()==='yes';
  const buyKeys = {kwBuyee,kwBuyeeFallback,buyeeWrapped,kwEn,ebayRegion,kwEbayMaint,ebayRegionMaint,kwCode,kwCodeSg,kwKana,kwKanaBo,kwName,kwKanaHard,codes,sgNoCode,sgComUrl};
  const rakSlot = /^\d{13}$/.test(r[10]||'') ? `<div class="rak-slot" data-jan="${r[10]}"></div>` : '';
  // 2026-11-06（card-compact）: スマホ（480px 以下）ではカードの最初に要点だけを出し、残りは More details で開く（CSS の「スマホのカードの最初の部分」）。
  //   パソコン幅では .cm-toggle と .cm-rb は出ない＝見た目は前と同じ。開いた状態は行（r）ごとに覚える（Load more の描き直しで閉じない）。
  const cmOpen = CM_OPEN.has(r);
  const cmBtn = `<button class="cm-toggle" type="button" aria-expanded="${cmOpen?'true':'false'}">${cmLabel(cmOpen)}</button>`;
  return `<article class="card cm${cmOpen?' cm-open':''}">

    <div class="status${(byBarcode||byGuess)?' is-scan':''}${byGuess?' is-guess':''}"><span class="dot"></span>${(byBarcode||byGuess)?`<span class="status-txt">${matchLabel} &middot; Japan / NTSC-J</span>`:`${matchLabel} &middot; Japan / NTSC-J`}${jpOnly?`<a class="jp-only" href="${blogUrl('tag/release/japan-only/')}" title="Home version sold only in Japan" aria-label="Japan only: home version sold only in Japan">Japan only</a>`:''}</div>
    ${(byBarcode||byGuess) ? inShopPanel(r) : ''}
    ${regionUp ? `<div class="region-up">${langNeedNote(r)+fanTlNote(r)+regionNote(r,{noText:langNeedShown(r),short:true})}</div>` : ''}

    ${(pf||pubs.length||yr)?`<div class="specs">
      ${pf?`<div class="spec sp-con"><span class="micro">${KB_SHOP.u('console','Console')}</span>${platKey?`<a class="v jp plat-link" href="${blogUrl('tag/platform/'+platKey+'/')}">${esc(pf)}</a>`:`<span class="v jp">${esc(pf)}</span>`}</div>`:''}
      ${pubs.length?`<div class="spec"><span class="micro">${KB_SHOP.u('publisher','Publisher')}</span><span class="v">${esc(pubShow)}</span></div>`:''}
      ${yr?`<div class="spec"><span class="micro">${KB_SHOP.u('released','Released')}</span><span class="v">${esc(yr)}</span></div>`:''}
    </div>`:''}

    <div class="identity">
      ${(!en && romaji)?`<div class="field">
        <span class="micro plain ro-k">Romanized <span class="ro-note">&middot; no official English title</span></span>
        <div class="title-row">${listBtn}<div class="en-title ro-title" lang="ja-Latn">${esc(romajiShow(romaji))}</div></div>
        ${(LOAN_GLOSS && LOAN_GLOSS.get(r))?`<div class="loan-gloss"><span class="lg-k">Loanwords, word by word &middot; not a title</span><span class="lg-v">${esc(LOAN_GLOSS.get(r))}</span></div>`:''}
        ${unoff?`<div class="loan-gloss unoff"><span class="lg-k">Unofficial English name &middot; ${unoff[1]==='publisher_later'?'used later by the publisher; never released in English':'fan name'}</span><span class="lg-v">${esc(unoff[0])}</span></div>`:''}
      </div>`:''}
      ${en?`<div class="field">
        ${enKind==='r'?`<span class="micro plain ro-k">Romanized <span class="ro-note">&middot; no official English title</span></span>`
          :enKind?`<span class="micro plain ro-k">Unofficial English name <span class="ro-note">&middot; ${enKind==='p'?'used later by the publisher; never released in English':'fan name'}</span></span>`
          :EN_KIND_READY?`<span class="micro plain">${KB_SHOP.u('english','English')}</span>`:`<span class="micro plain">${KB_SHOP.u('latinT','Title in Latin letters')}</span>`}
        <div class="title-row">${listBtn}<div class="en-title${enKind==='r'?' ro-title" lang="ja-Latn':''}">${esc(en)}</div></div>
        ${AMBIG_EN.has(strong(en)) && !byBarcode?`<div class="cap">This English name covers more than one Japanese release. Check the Japanese title and the code below.</div><div class="cm-ambig">${esc(cmText('ambig'))}</div>`:''}
      </div>`:''}
      ${naNotes(r, en)}
      <div class="field">
        ${hideJa?'':`<span class="micro plain">${KB_SHOP.u('reading','Japanese reading')}</span>`}
        ${hideJa?'':`<div class="title-row">${(en||romaji)?'':listBtn}<div class="ja-title">${esc(jpMain)}</div></div>`}
        ${(romaji && en && enKind!=='r')?`<div class="romaji" lang="ja-Latn">${esc(romajiShow(romaji))}</div>`:''}
        ${noCode?`<div class="no-code-notice">${KB_SHOP.u('noCode','No product code on record')}</div>`:''}
      </div>
      ${blogArts.length?`<div class="articles">${blogArts.map(([s,dt,ttl])=>`<a class="read-article" href="${blogUrl(s)}" aria-label="Read article: ${esc(ttl)}">${KB_SHOP.u('readArt','Read article')}${blogArts.length>1?` <span class="ra-date">${esc(dt)}</span>`:''}<span aria-hidden="true">&rarr;</span></a>`).join('')}</div>`:''}
    </div>

    ${LOC==='jp' ? shopKanaBox(r, jaLatin) : ''}

    <!-- 店（2026-10-31: 海外モードは和題の直下。楽天の枠は店の下。国内モードと配信専用の行は下の hr の後のまま） -->
    ${(!r[12] && LOC!=='jp') ? buyBlock(buyKeys)+rakSlot : ''}

    <!-- 型番（2026-10-19: 購入ブロックの下から見出しのすぐ下へ移した。「これで合っているか」を箱と見比べる一番の手がかり）。 -->
    ${codes.length?`<div class="field cm-code">
      <span class="micro plain">${KB_SHOP.u('codeExact','Product code &middot; exact match')}</span>
      <div class="jp-copy-row">
        <div class="jp-chip"><span class="code">${codeShow}</span></div>
        <button class="slab-copy" type="button" data-copy="${codeCopy}"><span class="txt">Copy</span></button>
      </div>
      <div class="cap" style="margin-top:7px;">${KB_SHOP.u('codeNote','Latin letters — type it into any store yourself, or copy.')}</div>
    </div>`:''}

    <!-- 配信専用(row[12])ではボタンごと出さない。店に行く行為が無いので見せる相手がいない。
         disabled や淡色にはしない ―― 押せないボタンは「壊れている」と読まれる。
         理由は下の灰色帯(region.dl)と NO DISC バッジが説明している。
         ★これが clerkOpen() への唯一の入口（下方の function clerkOpen(r) を参照）。
           ※このコメントはテンプレートリテラルの中にある。バッククォートを書くと
             文字列がそこで閉じてJSが壊れる（実際に一度壊した）。
           あちらは「配信専用の行は来ない」前提で書いてあり、r[12] を一切見ていない。
           **この条件を外すなら、必ず clerkOpen() 側も直すこと。**
           外したまま渡すと、配信専用の行で「在庫はありますか？」と店員に聞かせることになる。 -->
    ${r[12]?'':`<div class="instore">
      ${LOC==='jp' ? '' : shelfNote(r)}
      <button class="genre-link" type="button">${KB_SHOP.u('genre','Find by genre &amp; condition guide')}</button>
      <a class="cond-link" href="${blogUrl('2026-09-16-glossary-condition-rank.html')}">${KB_SHOP.u('cond','What the condition words on a label mean (ランクB · 美品 · 未開封)')} &rarr;</a>
      <span class="micro plain instore-head">${KB_SHOP.u('help','Need help or paying?')}</span>
      <button class="btn-clerk" type="button" data-clerk="${idx}">${KB_SHOP.u('clerk','Show to shop staff')}</button>${cmBtn}
    </div>`}

    ${regionUp ? '' : langNeedNote(r)+fanTlNote(r)+regionNote(r,{noText:langNeedShown(r)})+`<div class="cm-rb">${regionNote(r,{noText:langNeedShown(r),short:true,bare:true})}</div>`}
    ${r[12] ? cmBtn : ''}

    <hr class="div">

    ${(r[12] || LOC==='jp') ? (r[12]?`<span class="nodisc">No disc &middot; download</span>`:buyBlock(buyKeys))+rakSlot : ''}



    ${noCode?`<div class="cm-slab">
      <div class="slab">
        <span class="reg" aria-hidden="true"></span>
        <div class="slab-main">
          <span class="slab-label">${KB_SHOP.u('searchKey','Japanese title &middot; your search key')}</span>
          <div class="jp-copy-row">
            <div class="jp-chip">${esc(jpMain)}</div>
            <button class="btn-copy" type="button" data-copy="${esc(jpMain)}">Copy</button>
          </div>
        </div>
      </div>
    </div>`:`<div class="field">
      <!-- Copy と注記は配信専用(row[12])でも出す。2026-07-24 に「現物が無い行が店の検索欄に貼れと
           指示していた」として3か所とも消したが、実店舗を指すのは見出しの文言だけなので、
           2026-08-03 に見出しの row[12] 分岐へ置き換えた(配信専用=日本のストアで検索/物理=店に貼る)。
           ★.instore と購入ブロックの r[12] ゲートは別物。ここと一緒に外さないこと。 -->
      <span class="micro plain">${r[12]?KB_SHOP.u('jaCopyStore','Japanese title &middot; copy to search the Japanese store'):KB_SHOP.u('jaCopy','Japanese title &middot; copy to paste into a store')}</span>
      <div class="jp-copy-row">
        <div class="jp-chip">${esc(jpMain)}</div>
        <button class="btn-copy" type="button" data-copy="${esc(jpMain)}">Copy</button>
      </div>
      <div class="cap" style="margin-top:7px;">${jaLatin?KB_SHOP.u('canType','Latin letters — you can type this yourself, or copy.'):KB_SHOP.u('cantType',"You can't type this — copy, then paste into the search box.")}</div>
    </div>`}
  </article>`;
}

// Current result set + how many are rendered. "Load more" grows `shown` by MAX;
// we never build more than `shown` cards, so 2,227-row sets don't render at once.
let current=[], shown=0;

/* ★2026-10-18: 別の作品に同じ型番（links.json の d・blog/_parts/shared_codes.json）。結果にその型番の行が2つ以上出ているときだけ、
   件数の下に注意書きを1つ出す。文言の言語は blogLang()（ブログで選んだ言語→ブラウザ→英語）。「箱に刷られている」とは書かない（未確認）。 */
const DUPE_NOTE = {
  en: ['Heads-up: the code ', ' is listed for two different games (', '). Check the title and the box before you buy.'],
  zh: ['請注意：', ' 這個編號同時對應兩款不同的遊戲（', '）。購買前請確認標題與包裝盒。'],
  ko: ['주의: ', ' 코드는 서로 다른 게임 두 개(', ')에 쓰이고 있습니다. 구매 전에 제목과 상자를 확인하세요.'],
  es: ['Atención: el código ', ' corresponde a dos juegos distintos (', '). Comprueba el título y la caja antes de comprar.'],
  de: ['Hinweis: Der Code ', ' ist für zwei verschiedene Spiele eingetragen (', '). Vor dem Kauf bitte Titel und Verpackung prüfen.'],
  fr: ['Attention : le code ', ' correspond à deux jeux différents (', '). Vérifiez le titre et la boîte avant d’acheter.']
};
function paintDupeNote(){
  const el=document.getElementById('dupeNote'); if(!el) return;
  const seen={};
  for(const r of current){ const k=r[2]+'\t'+r[3]; if(SHARED_CODES[k]) seen[k]=(seen[k]||0)+1; }
  const k=Object.keys(seen).find(x=>seen[x]>=2);
  if(!k){ el.hidden=true; el.innerHTML=''; return; }
  const [a,b,c]=DUPE_NOTE[blogLang()]||DUPE_NOTE.en;
  el.innerHTML=esc(a)+'<b>'+esc(k.split('\t')[1])+'</b>'+esc(b)+'<span lang="ja">'+SHARED_CODES[k].map(esc).join('・')+'</span>'+esc(c);
  el.hidden=false;
}
/* ============================================================
   店頭モード（2026-10-19・data-split・調査 #6）。読み取り（バーコード／推測）の結果の上に「Are you in a shop in Japan?」。
   Yes: ①楽天の中古相場の目安をカードの一番上に大きく ②値札の金額を入れると「相場より安い／ほぼ同じ／高い」
        ③購入欄は日本向けの並び（setLoc('jp')＝駿河屋の型番・題名が上、Buyee・eBay などの海外向けは下の「Ships worldwide」にまとまる）
   No : 今の並びのまま（パネルは出さない）。どちらも localStorage 'kataban_in_shop' に覚える（try/catch・読めなければ毎回たずねる）。
   ★相場は楽天の中古の中央値（カードの「Typical used price (Rakuten)」と同じ値）。目安であって、その店の値付けの良し悪しを保証しない。
   ============================================================ */
const IN_SHOP_KEY='kataban_in_shop';
let inShopMem=null;   // localStorage が使えない（プライベートモード等）ときは、このページの間だけ覚える
function inShopRead(){ if(inShopMem!==null) return inShopMem; try{ const v=localStorage.getItem(IN_SHOP_KEY); return (v==='yes'||v==='no') ? v : ''; }catch(e){ return ''; } }
function inShopSave(v){ inShopMem=v||''; try{ if(v) localStorage.setItem(IN_SHOP_KEY, v); else localStorage.removeItem(IN_SHOP_KEY); }catch(e){} }
function shopPromptHtml(){
  const v=inShopRead();
  if(v==='yes') return `<div class="shopask is-set" role="region" aria-label="Shop mode"><span class="shopask-q">In a shop in Japan &mdash; prices compared on the card</span><button type="button" class="shopask-btn" data-inshop="ask">Change</button></div>`;
  if(v==='no')  return `<div class="shopask is-set" role="region" aria-label="Shop mode"><span class="shopask-q">Shopping online</span><button type="button" class="shopask-btn" data-inshop="ask">I'm in a shop in Japan</button></div>`;
  return `<div class="shopask" role="region" aria-label="Are you in a shop in Japan?">
      <p class="shopask-q"><b>Are you in a shop in Japan?</b> We'll show the typical used price first and let you check the price tag.</p>
      <div class="shopask-row"><button type="button" class="shopask-btn primary" data-inshop="yes">Yes, I'm in a shop</button><button type="button" class="shopask-btn" data-inshop="no">No, online</button></div>
    </div>`;
}
function inShopPanel(r){
  if(inShopRead()!=='yes') return '';
  const jan = /^\d{13}$/.test(r[10]||'') ? r[10] : '';
  // 2026-11-03: 比較の結果と同じ画面で「どのゲームか」が分かるように、題名と機種を欄の先頭に置く。英題が無い行はローマ字、それも無ければ和題。
  const romaji = romajiFor(r), name = r[0] || (romaji ? romajiShow(romaji) : r[1]);
  return `<div class="inshop"${jan?` data-jan="${jan}"`:''}>
      <div class="inshop-name">${esc(name)}${r[2]?`<span>${esc(r[2])}</span>`:''}</div>
      <span class="micro">Typical used price (Rakuten)</span>
      <div class="inshop-yen">${jan?'checking&hellip;':'no price data for this item'}</div>
      ${jan?`<label class="inshop-cmp"><span>Price on the shop's tag (&yen;)</span><input type="text" inputmode="numeric" autocomplete="off" placeholder="e.g. 2,980" aria-label="Price on the shop's tag in yen"></label>
      <div class="inshop-verdict" aria-live="polite"></div>`:''}
    </div>`;
}
// 相場を入れる（rakutenLookup はカードの相場と同じ・キャッシュ付き）
function fillInShop(root){
  root.querySelectorAll('.inshop[data-jan]').forEach(el=>{
    if(typeof rakutenLookup!=='function'){ el.querySelector('.inshop-yen').textContent='no price data right now'; return; }
    fillInShopOne(el,0);
  });
}
// 2026-11-03: 通信の失敗は覚えない（_rakFetch）。店は電波が悪いので、この欄は数秒おきに決まった回数だけ引き直す。描き直されて el が消えたら止まる。
const INSHOP_RETRY_MS=5000, INSHOP_RETRY_MAX=3;
function fillInShopOne(el,tries){
  const jan=el.dataset.jan;
  rakutenLookup(jan).then(hit=>{
    if(!el.isConnected) return;
    const mid = hit && Number(hit.medianPrice);
    const yen = el.querySelector('.inshop-yen');
    if(Number.isFinite(mid) && mid>0){ el.dataset.mid=String(Math.round(mid)); yen.textContent='~\u00a5'+Math.round(mid).toLocaleString('en-US'); inShopCompare(el); return; }
    if(!_rakFailed.has(jan)){ yen.textContent='no used listings found'; return; }
    yen.textContent='no price data right now';
    if(tries<INSHOP_RETRY_MAX) setTimeout(()=>{ if(el.isConnected) fillInShopOne(el,tries+1); },INSHOP_RETRY_MS);
  }).catch(()=>{ if(el.isConnected) el.querySelector('.inshop-yen').textContent='no price data right now'; });
}
function inShopCompare(el){
  const out=el.querySelector('.inshop-verdict'), inp=el.querySelector('input'); if(!out||!inp) return;
  const p=Number(String(inp.value).replace(/[^\d]/g,'')), mid=Number(el.dataset.mid||0);
  out.className='inshop-verdict';
  if(!p){ out.textContent=''; return; }
  if(!mid){ out.textContent='No typical price to compare with.'; return; }
  const d=p-mid, pct=Math.round(Math.abs(d)/mid*100);
  if(p < mid*0.9){ out.classList.add('is-low');  out.textContent=`Cheaper than typical \u2014 about \u00a5${Math.abs(d).toLocaleString('en-US')} (${pct}%) below.`; }
  else if(p > mid*1.1){ out.classList.add('is-high'); out.textContent=`More than typical \u2014 about \u00a5${d.toLocaleString('en-US')} (${pct}%) above.`; }
  else { out.classList.add('is-same'); out.textContent='About the same as typical.'; }
}
results.addEventListener('input', e=>{ const inp=e.target.closest('.inshop input'); if(inp) inShopCompare(inp.closest('.inshop')); });
results.addEventListener('click', e=>{
  const b=e.target.closest('[data-inshop]'); if(!b) return;
  const v=b.dataset.inshop;
  if(v==='ask'){ inShopSave(''); paint(); return; }
  inShopSave(v);
  if(v==='yes' && LOC!=='jp') setLoc('jp');   // 日本向けの並び（setLoc が描き直す）
  else paint();
  if(v==='yes') scrollToResult();
});
// 2026-11-03: 店モードはカードの先頭へ移る＝値札の比較・地域ロックの要点が最初の画面に入る（件数と店モードの札は上へ送る）。
function scrollToResult(){
  const c = inShopRead()==='yes' && results.querySelector('.card .inshop');
  (c ? c.closest('.card') : results).scrollIntoView({behavior:'smooth',block:'start'});
}
function paint(){
  const len=current.length;
  if(!len && !SEARCH_READY && results.querySelector('.qa')) return;   // 2026-10-28: 起動時の描き直し（setLoc 等）で最初の答え（.qa）を消さない
  paintDupeNote();
  const qaStore=results.querySelector('.qa a.store'), qaY=qaStore ? qaStore.getBoundingClientRect().top : null;   // 2026-10-31: 仮のカード→本体で店ボタンの画面上の位置を保つ（本体は発売元・読みの行のぶん高い）
  results.innerHTML = current.slice(0,shown).map(card).join('');
  if(qaY!==null) requestAnimationFrame(()=>{ const a=results.querySelector('.card a.store'); if(a) window.scrollBy(0, a.getBoundingClientRect().top-qaY); });   // 描き終えた後に測る（直後は高さが定まっていない）
  if((cardMatch==='barcode' || cardMatch==='guess') && current.length){ results.insertAdjacentHTML('afterbegin', shopPromptHtml()); fillInShop(results); }
  // 任意層: 楽天画像。card() は文字列を返すので、DOM に入った後にスロットを拾って結線する。
  // この行を消せばレイヤーごと死ぬ(本体は無傷)。
  attachRakutenSlots(results);
  if(shown<len){
    count.textContent = KB_SHOP.u('results',`${len} results · showing ${shown}`,{n:len,s:shown}) + (platFallback ? ` · ${platFallback.label}` : '');
    more.innerHTML = `<button type="button" class="moreBtn">${KB_SHOP.u('more',`Load more · ${len-shown} left`,{n:len-shown})}</button>`;
  } else {
    count.textContent = len ? KB_SHOP.u('result',`${len} result${len>1?'s':''}`,{n:len}) + (platFallback ? ` · ${platFallback.label}` : '') : '';
    more.innerHTML = '';
  }
}

// ============================================================
// 機種名で絞る予備の検索（案B2・2026-10-12）。★今の検索が0件のときだけ働く。
// 「ばくばくアニマル ゲームギア」「Top Hunter Neo Geo」「Castlevania NES」のように、検索語の最初か最後に機種名
// （DATA の英語名 row[2]・日本語名 row[7]・下の略称と海外名）があれば、それを外し、その機種で絞って残りの語だけで探し直す。
// ★1件以上出る検索には一切触れない（記事に貼った /?q= の件数を変えないため。128通りで変化0を確認）。
// ★外したあとの語が空なら働かない（「ゲームギア」だけの検索は今のまま0件）。語の境目は空白だけ（続け書きは対象外）。
// ★長い語から先に見る（Neo Geo CD を Neo Geo より、3DS を DS より先に）。値は DATA の row[2]（機種の英語名）と同じ綴り。
const PLATFORM_ALIASES = {
  // 派生機種（2026-10-12）は DATA でその作品が入っている親の機種へ（MADB に別の機種名が無い）:
  //   ディスクシステム→Famicom・ゲームボーイカラー→Game Boy・メガCD/32X→Mega Drive・ワンダースワンカラー→WonderSwan・CD-ROM²/SUPER CD-ROM²/TurboDuo→PC Engine。
  //   Switch 2 は MADB にも DATA にも作品が無いので入れていない。
  // zh・ko はサイトの zh・ko 記事で実際に使っている表記（2026-10-12 に記事本文で数えた）。
  'Famicom':          ['ファミコン','FC','NES','Nintendo Entertainment System','Family Computer','ファミリーコンピューター',
                       'ディスクシステム','ファミコンディスクシステム','FDS','Famicom Disk System','Disk System',
                       '紅白機','任天堂紅白機','磁碟機','패미컴','패밀리 컴퓨터','디스크 시스템'],
  'Super Famicom':    ['スーファミ','SFC','SNES','Super NES','Super Nintendo','Super Nintendo Entertainment System',
                       '超級任天堂','超任','슈퍼 패미컴','슈퍼패미컴'],
  'Game Boy':         ['GB','Gameboy','ゲームボーイカラー','GBC','Game Boy Color','Gameboy Color','게임보이','게임보이 컬러'],
  'Game Boy Advance': ['GBA','Gameboy Advance','게임보이 어드밴스'],
  'Game Gear':        ['GG','게임기어','게임 기어'],
  'Mega Drive':       ['メガドラ','MD','Genesis','Sega Genesis','Sega Mega Drive',
                       'メガCD','Mega-CD','Sega CD','32X','スーパー32X','Super 32X','Sega 32X','메가 드라이브','메가드라이브'],
  'Sega Saturn':      ['サターン','SS','Saturn','世嘉土星','土星','세가 새턴','세가새턴','새턴'],
  'PC Engine':        ['PCE','TurboGrafx-16','TurboGrafx 16','TurboGrafx','TG16','TG-16','TurboGrafx-CD','PCエンジンCD-ROM2',
                       'CD-ROM2','CD-ROM²','スーパーCD-ROM2','スーパーCD-ROM²','Super CD-ROM2','Super CD-ROM²',
                       'PC Engine CD','PCエンジンCD','Turbo CD','TurboDuo','Turbo Duo','PCエンジンDuo','PC Engine Duo','PC 엔진','PC엔진'],
  'Dreamcast':        ['ドリキャス','DC','Sega Dreamcast','드림캐스트'],
  'PlayStation':      ['プレステ','PS','PS1','PSX','PSone','PS one','플레이스테이션'],
  'PlayStation 2':    ['プレステ2','PS2','플레이스테이션 2'],
  'PlayStation 3':    ['プレステ3','PS3'],
  'PlayStation 4':    ['プレステ4','PS4'],
  'PlayStation 5':    ['プレステ5','PS5'],
  'PSP':              ['PlayStation Portable'],
  'PlayStation Vita': ['Vita','PS Vita','PSV'],
  'Nintendo 64':      ['N64','ニンテンドー64','ロクヨン','任天堂64','닌텐도 64'],
  'Nintendo DS':      ['DS','ニンテンドーDS','任天堂DS','닌텐도 DS'],
  'Nintendo 3DS':     ['3DS','任天堂3DS','닌텐도 3DS'],
  'Nintendo Switch':  ['Switch','スイッチ','ニンテンドースイッチ','닌텐도 스위치','스위치'],
  'GameCube':         ['GC','NGC','Nintendo GameCube','任天堂GameCube','게임큐브'],
  'Wii U':            ['WiiU'],
  'WonderSwan':       ['WS','ワンダースワンカラー','WSC','WonderSwan Color','원더스완'],
  'Neo Geo':          ['NEOGEO','Neo-Geo','AES','Neo Geo AES','NEOGEO AES','네오지오'],
  'Neo Geo CD':       ['NEOGEO CD','Neo-Geo CD','네오지오 CD'],
  'Neo Geo Pocket':   ['NGP','NEOGEO POCKET','ネオジオポケットカラー','네오지오 포켓'],
  'Sega Mark III':    ['マーク3','Mark III','Master System','Sega Master System','SMS','마크 III','마스터 시스템'],
  'Virtual Boy':      ['VB'],
  'Xbox 360':         ['X360'],
};
// 2026-10-19（data-split）: 検索（④ 機種名を外して探し直す）だけが使う。buildSearchIndex() が行ごとに platTermsAdd()、
// 作り終わりに platTermsFinish() で並べる（読み込み時に作ると4倍遅い CPU で約2秒止まっていた）。式と並びは以前と同じ。
const PLAT_TERMS = [];
const platTermsMap = new Map();
const platTermsPut = (s, p) => { const k = fold(accent(s)); if(k && !platTermsMap.has(k)) platTermsMap.set(k, p); };
function platTermsAdd(r){ platTermsPut(r[2], r[2]); if(r[7]) platTermsPut(r[7], r[2]); }
function platTermsFinish(){
  for(const p in PLATFORM_ALIASES) for(const s of PLATFORM_ALIASES[p]) platTermsPut(s, p);
  PLAT_TERMS.push(...[...platTermsMap].sort((a, b) => b[0].length - a[0].length)); platTermsMap.clear();
}
function stripPlatform(s){
  const f = fold(accent(s));
  for(const [k, p] of PLAT_TERMS){
    if(f.length <= k.length + 1) continue;
    if(f.endsWith(' ' + k)) return { title: f.slice(0, -k.length - 1).trim(), plat: p };
    if(f.startsWith(k + ' ')) return { title: f.slice(k.length + 1).trim(), plat: p };
  }
  return null;
}
let platFallback = null;   // 予備の検索で出したときだけ {label}。paint() が件数の後ろに出す（例「Game Gear only」「barcode」）

// ---- 予備の検索の追加（2026-10-12）: バーコード・型番の地域記号と -P-・ひらがな／カタカナ。どれも今の検索が0件のときだけ働く ----
// ① バーコード: 検索欄に数字だけ（8桁・13桁）を打ったとき、DATA の JAN（row[10]）に完全一致する行を出す。
//   ★カメラ読み取り（showByJan）と、JAN が DATA に無いときの楽天の補い（jan-fallback）には触れない。検索欄からは楽天を引かない。
// ② 型番: 末尾の地域記号（-JPN・-USA・-EUR など）と、箱の型番の途中の -P-（RVL-P-RFEJ ↔ ディスクの RVL-RFEJ）を外して照合し直す。
// ②' 型番の O と 0・I と 1（2026-10-14）: ②でも0件のとき、検索語と DATA の型番の両方で O→0・I→1 にそろえて照合し直す（DMG-0NJ → DMG-ONJ、DMG-AO5J → DMG-A05J）。
//   照合は型番の頭から（startsWith）。★DATA の全型番（O・0・I・1 を含む 8,244 種）で、型番を丸ごと打ち間違えたときに別の作品が混ざる組み合わせは0（2026-10-14）。
//   途中で切った打ち間違い（TPO1・SHVC-0 など4〜6字）では、O と 0 だけ違う型番の系統が両方出る（34通り）。0件の代わりなので許す。
// ③ ひらがな・カタカナ: 両方をカタカナにそろえた索引で照合し直す（バクバクアニマル → ばくばくアニマル）。索引は初めて要るときに作る。
// ④ 機種名（案B2）は上の stripPlatform。①〜④の順に試し、最初に1件以上出たものを使う。
const KANA = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
var HAYK = null, HAY4K = null, CODEKEYS_NOP = null, CODEKEYS_OI = null, JANIDX = null;   // applyBlogAliases が HAY を伸ばしたら HAYK・HAY4K は作り直す
const kanaHay  = () => HAYK  || (HAYK  = HAY.map(KANA));
const kanaHay4 = () => HAY4K || (HAY4K = HAY4.map(KANA));
const REGION_SUFFIX = /[-\s](JPN|USA|EUR|NOE|FRA|ESP|ITA|UKV|AUS|KOR|CHN|HKG|ASI|EUU|FAH|SCN)$/i;
const HAS_KANA = /[ぁ-ゖァ-ヶ]/;
const OI = k => k.replace(/O/g, '0').replace(/I/g, '1');   // ②' 型番の O・0 と I・1 をそろえる（codeKey 済みの大文字に掛ける）
function passFilters(i, pf, pv, yv){ const r=DATA[i]; return (pf==='All'||r[2]===pf) && (yv==='All'||r[4]===yv) && (pv==='All'||PUBS[i].includes(pv)); }
function idxResult(idx, s, lane){ return {res: idx.map(i=>DATA[i]), resIdx: idx, resLane: idx.map(()=>lane), lo: fold(accent(s)), qk: codeKey(s.trim()), sq: squash(s), r5: romaFold(s)}; }
function fallbackOne(s, pf, pv, yv, onlyPlat, folded){   // ①〜③（onlyPlat は ④ で機種を外したあとに絞るとき。folded は外したあとの語＝fold 済み）
  const t = s.trim();
  const keep = i => passFilters(i,pf,pv,yv) && (!onlyPlat || DATA[i][2]===onlyPlat);
  const digits = t.replace(/[\s-]/g, '');
  if(/^[\d\s-]+$/.test(t) && /^\d{13}$/.test(digits)){   // DATA に8桁の JAN は0件（2026-10-12）なので13桁だけ   // ① バーコード（空白・ハイフン区切りも可。数字だけの検索はほかの探し直しに回さない）
    if(!JANIDX){ JANIDX = {}; DATA.forEach((r,i)=>{ if(r[10]) (JANIDX[r[10]]||(JANIDX[r[10]]=[])).push(i); }); }
    const idx = (JANIDX[digits]||[]).filter(keep);
    return idx.length ? {m: idxResult(idx, digits, 3), label: 'barcode'} : null;
  }
  const codeLike = /[A-Za-z]/.test(t) && (/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/.test(t) || (/\d/.test(t) && /^[A-Za-z0-9]+(?:\s[A-Za-z0-9]+)+$/.test(t))
                   || (folded && /^[a-z0-9]+(?: [a-z0-9]+)*$/.test(t))   // 機種を外したあとはハイフンが空白になっているので、英数字の並びなら型番として試す
                   || /^(?=.*\d)[A-Za-z0-9]+$/.test(t));   // ハイフンなしの1語（BGO1003）も ②' のために型番として試す（2026-10-14）
  if(codeLike){   // ② 型番
    const base = t.replace(REGION_SUFFIX, ''), key = codeKey(base);
    if(key.length >= 4){
      if(!CODEKEYS_NOP) CODEKEYS_NOP = DATA.map(r => r[3].split(';').map(c => codeKey(c.replace(/-P-/i,'-'))).filter(Boolean));
      const idx = [];
      for(let i=0;i<DATA.length;i++) if(keep(i) && (CODEKEYS[i].some(c=>c.includes(key)) || CODEKEYS_NOP[i].some(c=>c.includes(key)))) idx.push(i);
      if(idx.length) return {m: idxResult(idx, base, 3), label: base!==t ? 'code without region suffix' : 'code without -P-'};
      if(/[0O1I]/.test(key)){   // ②' O と 0・I と 1（どれかの字が入っているときだけ。-P- を外した形も含める）
        const ko = OI(key);
        if(!CODEKEYS_OI) CODEKEYS_OI = CODEKEYS.map((cs, i) => [...new Set([...cs, ...CODEKEYS_NOP[i]].map(OI))]);
        for(let i=0;i<DATA.length;i++) if(keep(i) && CODEKEYS_OI[i].some(c=>c.startsWith(ko))) idx.push(i);   // 頭から（途中に当てると GOI-00 の打ち間違いが BG01003 にも当たる）
        if(idx.length) return {m: idxResult(idx, base, 3), label: 'code with O = 0, I = 1'};
      }
    }
  }
  if(HAS_KANA.test(t)){   // ③ ひらがな・カタカナ
    const m = matchAll(s, pf, pv, yv, onlyPlat, true);
    if(m.res.length) return {m, label: 'hiragana = katakana'};
  }
  return null;
}
function quickBarcode(s, pf, pv, yv){   // 打っている途中でも動かす①（表引きだけ）
  return /^[\d\s-]+$/.test(s.trim()) ? fallbackOne(s, pf, pv, yv, null, false) : null;
}
function fallbackSearch(s, pf, pv, yv){
  const r = fallbackOne(s, pf, pv, yv, null, false);
  if(r) return r;
  const sp = stripPlatform(s);   // ④ 機種名。外したあとも0件なら、①〜③を機種で絞ってもう一度（例: バクバクアニマル ゲームギア・RVL-RFEJ-JPN Wii）
  if(!sp) return null;
  const m = matchAll(sp.title, pf, pv, yv, sp.plat);
  if(m.res.length) return {m, label: sp.plat + ' only'};
  const r2 = fallbackOne(sp.title, pf, pv, yv, sp.plat, true);
  return r2 ? {m: r2.m, label: sp.plat + ' only · ' + r2.label} : null;
}

// ---- 0件のときの案内（2026-10-12・案 A〜D・G）。検索語の種類で文を出し分ける。件数と並び順には触れない ----
// A バーコード（数字だけ・8桁／13桁）… DATA に無い。型番か題名を勧め、押したときだけ楽天で商品名を確かめる（janFallback。自動では引かない）
// B 型番らしい語 … 箱の型番を確かめるか題名で探すよう勧め、駿河屋・Buyee でその語を引くリンク（-JPN・-P- は予備の検索が自動で外している）
// C 英字（英題・ローマ字）・D 日本語 … 語を短くして1件以上出る形をボタンで出す（最大2つ・0件のときだけ数回走査する）
// G 韓国語（と、ブログの言語が中国語のときの漢字だけの語）… 現地語の題名は無いので、日本語か英語で探すよう勧める
function queryKind(s){
  const t = s.trim();
  if(/^[\d\s-]+$/.test(t) && /^\d{13}$/.test(t.replace(/[\s-]/g,''))) return 'barcode';
  if(/[\uac00-\ud7af]/.test(t)) return 'korean';
  if(HAS_KANA.test(t) || /[\u4e00-\u9fff]/.test(t)) return 'japanese';
  if(!/\s/.test(t) && /[A-Za-z]/.test(t) && (/\d/.test(t) || (/-/.test(t) && t===t.toUpperCase()))) return 'code';
  if(/[A-Za-z]/.test(t)) return 'latin';
  return 'other';
}
function shortCands(s, ja){
  const t = s.trim(), out = [];
  const parts = t.split(/[\s\u301c\uff5e~:\uff1a\u30fb\u2013\u2014-]+/).filter(Boolean);   // 空白・〜・～・:・：・・・ダッシュで区切る
  for(let n=parts.length-1; n>=1; n--) out.push(parts.slice(0,n).join(' '));   // 後ろの語から落とす
  for(let n=1; n<parts.length; n++) out.push(parts.slice(n).join(' '));          // 前の語から落とす
  if(ja){ const b = parts[0]||t; for(let L=b.length-1; L>=4; L--) out.push(b.slice(0,L)); }   // 日本語は最初の語を後ろから1字ずつ削る（4字まで）
  return [...new Set(out)].filter(x => ja ? x.length>=2 : x.replace(/\s/g,'').length>=3);
}
const STOPWORDS = new Set(['the','a','an','of','and','in','on','to','no','de','la','le','for','vs','ii','iii']);
function suggestShorter(s, pf, pv, yv, ja){
  // ★出さない候補: 冠詞などだけの語（The・of など）・100件を超える語（絞り込みにならない）・先に出した候補と同じ件数の語（同じ結果）
  const sug = []; let tries = 0;
  for(const c of shortCands(s, ja)){
    if(!ja && c.toLowerCase().split(/\s+/).every(w => STOPWORDS.has(w))) continue;
    if(++tries > 24) break;
    const m = matchAll(c, pf, pv, yv, null);
    if(!m.res.length) continue;
    const n = new Set(m.res.map(r=>JSON.stringify(r.slice(0,13)))).size;
    if(n > 100 || sug.some(([,k]) => k===n)) continue;
    sug.push([c, n]); if(sug.length>=2) break;
  }
  return sug;
}
function zeroHelp(s, pf, pv, yv){
  const t = s.trim(), k = queryKind(t);
  const P = x => '<p>'+x+'</p>';
  const tryBtns = sug => sug.length ? '<div class="zero-acts">'+sug.map(([c,n]) =>
    `<button type="button" class="zero-btn" data-try="${esc(c)}">${KB_SHOP.u('zTry',`Try \u201c${esc(c)}\u201d \u00b7 ${n} result${n>1?'s':''}`,{c:esc(c),n})}</button>`).join('')+'</div>' : '';
  let h;
  if(k==='barcode'){
    const jan = t.replace(/[\s-]/g,'');
    h = P(KB_SHOP.u('zBar1','This barcode is not in our list. We have barcodes for only some games.'))
      + P(KB_SHOP.u('zBar2','Look for the product code on the spine or the back of the box (for example SLPM-86023), or search by the title.'))
      + `<div class="zero-acts"><button type="button" class="zero-btn" data-janfb="${esc(jan)}">${KB_SHOP.u('zBarBtn','Check this barcode on Rakuten')}</button></div>`;
  } else if(k==='code'){
    const w = enc(t);
    h = P(KB_SHOP.u('zCode1','We can\u2019t find this code.'))
      + P(KB_SHOP.u('zCode2','Check the product code on the spine or the back of the box, or search by the title.'))
      + `<div class="zero-acts"><a class="zero-btn" target="_blank" rel="sponsored nofollow noopener" href="${sgAf(w)}">${KB_SHOP.u('zCodeSg','Search Suruga-ya for this code')}</a>`
      + `<a class="zero-btn" target="_blank" rel="sponsored nofollow noopener" href="${KB_SHOP.buyeeLink('https://buyee.jp/item/search/query/'+w+'?lang=en')}">${KB_SHOP.u('zCodeBy','Search Buyee for this code')}</a></div>`
      + KB_SHOP.maintNote(w,'');
  } else if(k==='latin'){
    h = P(KB_SHOP.u('zLat1','We list Japanese titles and official English titles.'))
      + P(KB_SHOP.u('zLat2','Try a shorter part of the name, or the Japanese title.'))
      + tryBtns(suggestShorter(t, pf, pv, yv, false));
  } else if(k==='japanese'){
    h = P(KB_SHOP.u('zJa','Try a shorter part of the title. You can leave out the subtitle.'))
      + (blogLang()==='zh' && !HAS_KANA.test(t) ? '<p lang="zh-Hant">\u6211\u5011\u6c92\u6709\u6536\u9304\u4e2d\u6587\u540d\u7a31\u3002\u8acb\u7528\u65e5\u6587\u6216\u82f1\u6587\u641c\u5c0b\u3002</p>' : '')
      + tryBtns(suggestShorter(t, pf, pv, yv, true));
  } else if(k==='korean'){
    h = P(KB_SHOP.u('zKo','We don\u2019t list Korean or Chinese names. Please search in Japanese or English.'))
      + (KB_ZK()==='ko' ? '' : '<p lang="ko">\ud55c\uad6d\uc5b4 \uc774\ub984\uc740 \ubaa9\ub85d\uc5d0 \uc5c6\uc2b5\ub2c8\ub2e4. \uc77c\ubcf8\uc5b4\ub098 \uc601\uc5b4\ub85c \uac80\uc0c9\ud574 \uc8fc\uc138\uc694.</p>');
  } else {
    h = P(KB_SHOP.u('zElse','Try part of the title, the Japanese name, a cartridge code, or a publisher.'));
  }
  return '<div class="state"><b>'+KB_SHOP.u('noMatch','No match.')+'</b><div class="zero-help">'+h+'</div></div>';
}

//@@KB-SPLIT@@ ── 2026-10-29（boot-chunks）: 本体はここで区切って別々の <script> として順に動かす（間にキー入力・描画を通す）。区切りの前の文は後ろの関数を起動の時点では呼ばないこと
// 第6レーンの照合（語の始まりからだけ）。RJ6 の「語ごとの骨格を空白で区切った列」から、空白を除いた列と語の始まりの位置を初回に作る。
let RJ6J = null;
function rj6JRow(S){ let J = ''; const st = new Set(); for(const w of S.split(' ')){ st.add(J.length); J += w; } return {J, st}; }
// 2026-10-29（boot-chunks）: 小分けに作る途中の表（RJ6J_TMP・次の行 RJ6J_I）。rj6Build が 2,000行ずつ足し、終わったら RJ6J に入れる。
//   作り終わる前に英字で探したら、rj6J() が残りをその場で作る（作る式は同じ）。
let RJ6J_TMP = null, RJ6J_I = 0;
function rj6Build(pause){
  if(RJ6J) return Promise.resolve();
  if(!RJ6J_TMP){ RJ6J_TMP = new Array(RJ6.length); RJ6J_I = 0; }
  const step = () => { if(RJ6J) return; const end = Math.min(RJ6.length, RJ6J_I + 2000); for(; RJ6J_I < end; RJ6J_I++) RJ6J_TMP[RJ6J_I] = rj6JRow(RJ6[RJ6J_I]);
    if(RJ6J_I < RJ6.length) return pause().then(step); RJ6J = RJ6J_TMP; };
  return Promise.resolve().then(step);
}
const rj6J = () => { if(RJ6J) return RJ6J;
  if(RJ6J_TMP){ for(; RJ6J_I < RJ6.length; RJ6J_I++) RJ6J_TMP[RJ6J_I] = rj6JRow(RJ6[RJ6J_I]); RJ6J = RJ6J_TMP; return RJ6J; }
  return (RJ6J = RJ6.map(rj6JRow)); };
const rj6Hit = (e, k) => { for(let p = e.J.indexOf(k); p !== -1; p = e.J.indexOf(k, p + 1)) if(e.st.has(p)) return true; return false; };
// ★2026-10-27: 英題がある行では、語の並びまで合うときだけ当てる（Blue Stinger が BLASTING AGENT〔英題あり・ローマ字 burasutingu〕に当たっていた。
//   骨格はどちらも brstng で、骨格だけでは区別できない）。クエリの語の骨格が、行のローマ字の語の骨格と1語ずつ順に一致すること（最後の語だけ前方一致）。
//   英題が無い行（このレーンの本来の相手）は今までどおり語をまたいで当てる（taigaaheri＝Tiger Heli のように外来語は1語に詰まる）。
//   試算（英題811件＋記事・既知の19件をクエリに）: 英題がある行への第6レーンのヒット40件のうち外れるのは7件で、7件とも別作品
//   （BLASTING AGENT・KILLING ZONE→カーレンジャー/黒ノ十三・Dragon's Earth→パズドラ×2・Battle Fantasy→Battle Fantasia・Taiko Risshiden II→初代 SFC）。
//   Kyukyoku Tiger→MD/SS・RASTAN SAGA 2→Rastan Saga II などは残る。英題が無い行へのヒット195件は変わらない。
const q6Words = s => fold(accent(s)).split(' ').filter(w => /^[a-z0-9]+$/.test(w)).map(w => skelWord(w, true)).filter(Boolean);
const rj6Aligned = (i, qw) => {
  const rw = RJ6[i].split(' ').filter(Boolean);
  for(let a = 0; a + qw.length <= rw.length; a++){
    let ok = true;
    for(let j = 0; j < qw.length; j++){ const last = j === qw.length - 1; if(last ? !rw[a + j].startsWith(qw[j]) : rw[a + j] !== qw[j]){ ok = false; break; } }
    if(ok) return true;
  }
  return false;
};


// 照合の本体（もとの run() の中身をそのまま関数にした。onlyPlat は予備の検索のときだけ機種で絞る）
function matchAll(s, pf, pv, yv, onlyPlat, kana){
  let lo=fold(accent(s));   // HAY と同じ畳み方＋accent。é で打っても e で打っても r0 に当たる
  const qk=codeKey(s.trim());   // 型番照合用（正規化済み）。判定ではなく、下の床つき部分一致に使う。
  const loc=collapseV(lo);            // 第2レーン用のクエリ（同母音を潰した形）
  let sq=squash(s);           // 第4レーン用。lo ではなく q.value から作る（squash 内で fold が走る）
  const r5=romaFold(s);         // 第5レーン用。スペースを消して長音を畳んだ形（ローマ字列 RJ5 と照合）
  // 床8: 短い針を潰すと乱射する（moon→mon 等）。8文字以上＝実質フルタイトル入力のときだけ第2レーンを使う。
  const lane2 = loc.length >= 8;
  const k6 = /^[\x00-\x7f]+$/.test(s.trim()) ? skel(s, true) : '';   // 第6レーン用（英字だけのクエリ・骨格6字以上）
  const R6 = k6.length >= 6 ? rj6J() : null;
  const q6w = R6 ? q6Words(s) : null;
  if(kana){ lo=KANA(lo); sq=KANA(sq); }   // ③ ひらがな・カタカナをそろえるとき（索引も KANA を掛けたものを使う）
  const H = kana ? kanaHay() : HAY, H4 = kana ? kanaHay4() : HAY4;
  const res=[], resIdx=[], resLane=[];
  for(let i=0;i<DATA.length;i++){
    const r=DATA[i];
    if(onlyPlat && r[2]!==onlyPlat) continue;
    if(pf!=='All' && r[2]!==pf) continue;
    if(yv!=='All' && r[4]!==yv) continue;
    if(pv!=='All' && !PUBS[i].includes(pv)) continue;
    let lane = 0;   // 並び順（rankHits）用に、どの経路で当たったかだけ記録する。判定式は変えない
    if(lo){
      let hit = H[i].includes(lo); lane = 1;
      if(!hit && lane2){ hit = RJ[i].includes(loc); lane = 2; }   // 第2レーン: ローマ字だけ長音を潰して照合
      if(!hit && qk.length >= 4){ hit = CODEKEYS[i].some(c => c.includes(qk)); lane = 3; }  // 4文字未満はJPN等が数千件に当たるので床
      if(!hit && sq.length >= 5){ hit = H4[i].includes(sq); lane = 4; }  // 床5: halo5(5)を残す上限と star/gear(4)を弾く下限の唯一解
      if(!hit && r5.length >= 8){ hit = RJ5[i].includes(r5); lane = 5; }   // 第5レーン: 床8（5〜7文字は語の境目をまたいで乱射する）
      if(!hit && R6){ hit = rj6Hit(R6[i], k6) && (!r[0] || rj6Aligned(i, q6w)); lane = 6; }   // 第6レーン: 外来語のローマ字を英語の綴りで（式は skelWord・rj6Row）
      if(!hit) continue;
    }
    res.push(r); resIdx.push(i); resLane.push(lane);
  }
  return {res, resIdx, resLane, lo, qk, sq, r5};
}

// ★打っている途中は重い探し直しと0件の案内を動かさない（2026-10-12・速さの直し）:
//   その場では今の検索と、表引きだけで済むバーコード（13桁）だけ。0件ならまず「No match.」だけ出し、
//   型番・ひらがな／カタカナ・機種名の探し直しと案内・候補は、最後の検索から500ミリ秒後（打ち終わり）に1回だけ動かす。
//   Enter・/?q= 付きの URL で開いたとき・候補ボタンを押したときは待たずに動かす（deep）。途中でまた打ったら取り消す。
let deepTimer = null, lastDeep = false;
function run(opts){
  if(!SEARCH_READY){   // 2026-10-19: 索引を作り終わるまで待つ（作り終わったら buildSearchIndex() が呼び直す）
    pendingRunOpts = opts || {};
    if(fold(accent(q.value)) || plat.value!=='All' || pub.value!=='All' || year.value!=='All'){
      if(!results.querySelector('.qa')){ count.textContent=''; } more.innerHTML='';
      if(!results.querySelector('.qa')) results.innerHTML='<div class="state"><b>Preparing search…</b>The catalog is still loading. Your search will run in a moment.</div>';   // 最初の答え（.qa）は消さない
    }
    return;
  }
  ranSinceReady=true;
  cardMatch=''; cardMatchJan='';   // 検索の結果は「Match」の札（バーコード・推測の札は読み取りのときだけ）
  const deep = !!(opts && opts.deep);
  clearTimeout(deepTimer); deepTimer = null; lastDeep = deep;
  platFallback = null;
  const pf=plat.value, pv=pub.value, yv=year.value;
  if(!fold(accent(q.value)) && pf==='All' && pv==='All' && yv==='All'){
    current=[]; shown=0; more.innerHTML=''; count.textContent=''; paintDupeNote();
    results.innerHTML='';
    return;
  }
  let m = matchAll(q.value, pf, pv, yv, null);
  let pending = false;   // 打ち終わりに探し直しを待っている
  if(m.lo && !m.res.length){   // 予備の検索: 0件のときだけ（① バーコード → ② 型番 → ③ ひらがな・カタカナ → ④ 機種名）
    const fb = deep ? fallbackSearch(q.value, pf, pv, yv) : quickBarcode(q.value, pf, pv, yv);
    if(fb){ m = fb.m; platFallback = {label: fb.label}; }
    else if(!deep){ pending = true; deepTimer = setTimeout(()=>run({deep:true}), 500); }
  }
  const {res, resIdx, resLane, lo, qk, sq, r5} = m;
  // 完全重複（row[0]〜row[12] の13列が「すべて」一致）を描画直前に1枚へ畳む。
  // DATA には触らず、ヒット配列 res だけを縮める。鍵は13列を JSON で連結（列境界を跨いだ偶然一致を防ぐ）。
  // 最初に現れた行を残す＝並び順は不変。1列でも違えば残す＝発売年(row[4])違い・型番(row[3])違いは別レコードのまま。
  const seenKey=new Set(), res2=[], idx2=[], lane2s=[];
  for(let j=0;j<res.length;j++){ const r=res[j]; const k=JSON.stringify(r.slice(0,13)); if(seenKey.has(k)) continue; seenKey.add(k); res2.push(r); idx2.push(resIdx[j]); lane2s.push(resLane[j]); }
  if(!res2.length){
    current=[]; shown=0; more.innerHTML=''; count.textContent=KB_SHOP.u('result','0 results',{n:0}); paintDupeNote();
    results.innerHTML = pending ? '<div class="state"><b>'+KB_SHOP.u('noMatch','No match.')+'</b></div>'   // 打っている途中は見出しだけ（案内は打ち終わりに）
                                : zeroHelp(q.value, pf, pv, yv);                  // 0件の案内（検索語の種類で出し分け）
    return;
  }
  // 並び順（案F）。検索語があるときだけ。機種・年・発売元の絞り込みだけのときは DATA の順のまま。
  // ★current に入れる前に並べる（店員ボタンの data-clerk は current[] の添字なので、入れた後に並べ替えると別の作品を指す）。
  const sorted = lo ? rankHits(idx2, lane2s, lo, qk, sq, r5).map(n => res2[n]) : res2;
  current=sorted; shown=Math.min(MAX,sorted.length);   // a new search always resets to the first page（畳んだ後の件数で数える）
  paint();
}

let lastLoggedQuery = null;
function logSearch(){
  const term = q.value.trim();
  if(!term) return;
  if(!SEARCH_READY || firstRunWaiting){ pendingSearchLog=true; return; }   // 2026-10-21: 別名待ちのあいだも送らない   // 2026-10-19: 読み込み中の 0件を GA4 に送らない（作り終わって検索したあとに送る）
  if(term === lastLoggedQuery) return;
  lastLoggedQuery = term;
  if(typeof gtag === 'function'){
    gtag('event', 'search', { search_term: term, hit_count: current.length,
      query_type: queryKind(term), fallback: platFallback ? platFallback.label : 'none' });   // 案F（2026-10-12）: 種類と使った探し直し
  }
}

// Grow the visible slice in place — appending below keeps the scroll position steady.
more.addEventListener('click',e=>{
  if(e.target.classList.contains('moreBtn')){ shown=Math.min(shown+MAX,current.length); paint(); }
});

// ============================================================
// コピー — 非日本語話者に一番大事な操作。型番・日本語タイトルの両方に付く [data-copy]。
//
// ★旧実装の穴: `try{ navigator.clipboard.writeText(t) }catch{}` は失敗を1つも捕まえない。
//   writeText は Promise を返すので reject は try/catch の外を通る。しかも成否に関係なく
//   「✓」を出していた＝落ちた端末では「コピーしたつもりで、店の検索窓に何も貼れない」。
//   罠#12(例外がデータの不在に化ける)の UI 版。**成否を見てから表示を決める。**
//
// クリップボードが落ちる実際の条件: 非セキュアコンテキスト(http/file)、アプリ内WebView
// (Instagram/X のブラウザ)、権限拒否。どれも棚の前で普通に起きる。
// 落ちたら execCommand を試し、それも駄目なら「長押しで選択」を出す（.code/.jp-chip は
// user-select:all にしてあるので、一度触れば全体が選べる）。
// ============================================================
function legacyCopy(text){
  const ta=document.createElement('textarea');
  ta.value=text;
  ta.setAttribute('readonly','');
  ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0';
  document.body.appendChild(ta);
  const sel=document.getSelection();
  const prev=(sel && sel.rangeCount>0) ? sel.getRangeAt(0) : null;
  let ok=false;
  try{
    if(/ipad|iphone|ipod/i.test(navigator.userAgent)){
      // iOS では textarea.select() が効かない。Range を作って選択する。
      ta.contentEditable='true'; ta.readOnly=false;
      const range=document.createRange();
      range.selectNodeContents(ta);
      sel.removeAllRanges(); sel.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.select();
    }
    ok=document.execCommand('copy');
  }catch(err){ ok=false; }
  document.body.removeChild(ta);
  if(prev && sel){ sel.removeAllRanges(); sel.addRange(prev); }
  return ok;
}

// true=クリップボードに入った / false=入らなかった。推測しない。
// navigator.clipboard が無い経路は await を1つも通らないので、iOS のユーザー操作の
// 文脈を保ったまま legacyCopy に落ちる（await を挟むと iOS で execCommand も死ぬ）。
async function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    try{ await navigator.clipboard.writeText(text); return true; }catch(err){}
  }
  return legacyCopy(text);
}

const copyToast=$('#copyToast');
let toastT=0;
function toast(msg){
  copyToast.textContent=msg;
  copyToast.classList.add('on');
  clearTimeout(toastT);
  toastT=setTimeout(()=>copyToast.classList.remove('on'), 3400);
}

// カードは paint() で作り直されるので個別結線ではなく委任。店員モードの中のボタンも
// 拾えるように #results ではなく document に付ける。
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-copy]');
  if(!btn) return;
  const text = btn.getAttribute('data-copy');
  const label = btn.querySelector('.txt') || btn;
  if(btn._prev === undefined) btn._prev = label.textContent;   // 連打しても元ラベルを失わない
  copyText(text).then(ok=>{
    label.textContent = ok ? '✓' : 'Hold';
    btn.classList.remove('done','fail');
    btn.classList.add(ok ? 'done' : 'fail');
    if(!ok) toast('Couldn’t copy on this device — press and hold the text itself to select it, then copy.');
    clearTimeout(btn._t);
    btn._t = setTimeout(()=>{
      label.textContent = btn._prev; btn.classList.remove('done','fail');
    }, ok ? 1400 : 3400);
  });
});

// ============================================================
// リストの追加／解除 — カードは paint() で作り直されるので個別結線ではなく委任
// （[data-copy] と同じ理由）。付ける先は #results：このボタンはカードの中にしか無く、
// 店員モードや各モーダルには出ない。
// ★2026-08-21 にトグルへ変更。それまでは片道（追加のみ）で、外す導線はマイリスト
//   画面だけだった。押した本人がその場で取り消せないのが不便なため、同じボタンで
//   追加⇔解除の両方を受ける。
// ★分岐は listSet の中身だけで決める（見た目の .is-on ではなく保存側を正とする）。
//   クラスを正にすると、保存に失敗した回の見た目のずれがそのまま次の判定に効いて
//   「白いのに listSet には入っている」行が押しても直らなくなる。
// ★保存に失敗したら見た目を変えない。「入れたつもりで入っていない」も
//   「外したつもりで外れていない」も作らないため（[data-copy] が成否を見てから
//   ✓/Hold を出しているのと同じ）。listAdd / listRemove は失敗時に listSet を
//   自分で巻き戻すので、ここで戻す必要は無い。
// ★listRemove は下のマイリスト画面の節で定義しているが、function 宣言なので
//   巻き上げられてここから呼べる（実行はクリック時＝定義済み）。
// ★mylistRefresh() は件数バッジを直し、マイリスト画面が開いていれば中身も組み直す
//   ＝一覧を開いたまま背後のカードで解除しても、一覧側の行がその場で消える。
// ============================================================
results.addEventListener('click', e=>{
  const btn = e.target.closest('[data-list]');
  if(!btn) return;
  const code = btn.getAttribute('data-list');
  const on = listSet.has(code);          // 押す**前**の状態。押した後は !on になる
  if(on){
    if(!listRemove(code)){
      toast('Couldn\u2019t update your list on this device \u2014 private browsing blocks storage.');
      return;
    }
  }else{
    if(!listAdd(code)){
      toast('Couldn\u2019t save on this device \u2014 private browsing blocks storage.');
      return;
    }
  }
  listBtnPaint(btn, !on);
  mylistRefresh();                       // 入口ボタンの件数バッジを合わせる
  console.log('[my-list] ' + (on?'removed':'added') + ': ' + code + ' \u2192 ' + listSet.size + '件', [...listSet]);
});

/* ============================================================
   マイリスト画面（2026-08-19）
   保存されているのは型番(row[3])だけ。行データは開くたびに DATA から引き直す
   ＝データを二重に持たない（DATA を直せば一覧の表示も直る）。
   ★引き方は DATA.find(r => r[3] === code)。保存した値は card() が data-list に入れた
     r[3] の原文そのものなので、加工せずに等値比較できる。
   ★引けなかった型番も捨てずに出す。DATA から消えた行・手で書き換えられた値でも、
     「Remove」が残っていないとその1件を外す手段が無くなる。
   ★保存の経路は既存のまま。追加は listAdd、削除は下の listRemove で、どちらも
     listSet を触って listSave() を1回呼ぶ形に揃えてある。
   ============================================================ */
const mylistEl = $('#mylist'), mylistBody = $('#mylistBody'),
      mylistCloseBtn = $('#mylistClose'), myListBtn = $('#myListBtn');

// 削除。listSet / listSave をそのまま使う（追加と同じ1本の保存経路）。
// 保存に失敗したら Set を戻す＝画面と保存先を食い違わせない（listAdd と対称）。
function listRemove(code){
  if(!listSet.has(code)) return false;
  listSet.delete(code);
  if(!listSave()){ listSet.add(code); return false; }
  return true;
}

// 件数表示を合わせ、開いていれば中身も組み直す。
// ★要素は毎回 getElementById で引く。clearMyList() から呼ばれる可能性があり、
//   上の const より先に走ると TDZ に落ちるため。
function mylistRefresh(){
  const n = listSet.size;
  const badge = document.getElementById('myListCount');
  if(badge) badge.textContent = '(' + n + ')';
  const head = document.getElementById('mylistCount');
  if(head) head.textContent = (n === 1) ? '1 saved' : n + ' saved';
  // 印刷ボタンは中身があるときだけ（空のシートを刷らせない）。
  const pb = document.getElementById('mylistPrintBtn');
  if(pb) pb.hidden = (n === 0);
  const el = document.getElementById('mylist');
  if(el && el.classList.contains('on')) mylistRender();
}

// 型番1件ぶんのカード。.card を付けるのは色・書体のトークンがそこにしか無いためで、
// shelfNote() が返す .field / .shelf-row もそのまま効く（同じ器の中なので）。
function mylistCard(code){
  const r = DATA.find(row => row[3] === code);
  const codes = code.split(';').map(s=>s.trim()).filter(Boolean);
  // 区切りは card() の codeShow と同じ形（中黒の前は &nbsp; で前の型番にくっつける）。
  const codeShow = codes.map(esc).join('<span class="sep">&nbsp;&middot;</span> ');
  const remove = '<button class="btn-remove" type="button" data-remove="' + esc(code) + '">Remove</button>';
  /* 店頭提示。★配信専用(row[12])の行では出さない ―― 現物が無い行について店員に
     「これはありますか？」と聞かせることになる。clerkOpen() 側の同じゲート
     （card() の .instore ブロック）と揃えてある。
     ★DATA から引けなかった型番(!r)では出す。型番だけでも店の在庫システムには打てる。 */
  const showClerk = (!r || !r[12])
    ? '<button class="btn-clerk-mini" type="button" data-clerkcode="' + esc(code) + '">Show clerk</button>'
    : '';
  const actions = '<div class="my-actions">' + showClerk + remove + '</div>';
  if(!r) return `<article class="card mycard">
      <div class="field">
        <span class="micro plain">Product code</span>
        <div class="my-code">${codeShow}</div>
      </div>
      <div class="my-orphan">This code is no longer in the database. Remove it to clear it from your list.</div>
      ${actions}
    </article>`;
  const jpMain = r[1] || r[0];
  // 英題は日本語タイトルと別物のときだけ出す。row[1] が元々ラテン表記の行では
  // row[0] と同じ文字列になり、同じ語が2行続く（card() の hideJa と同じ狙い）。
  // ★照合は strong()（NFKC→小文字→約物・記号・空白の除去）で、codeKey() ではない。
  //   codeKey は英数字**以外**を全部落とすので、かな漢字の付いた副題ごと消えてしまう
  //   ―― 実測: 「DRAGON QUEST BUILDERS アレフガルドを復活せよ」が英題 "Dragon Quest
  //   Builders" と同一と判定され、別物なのに英題の行が出なくなる。strong は仮名漢字を残す。
  const enSub = (r[0] && strong(r[0]) !== strong(jpMain)) ? r[0] : '';
  const sub = [r[2], r[4]].filter(Boolean).join('  \u00b7  ');   // 機種 · 発売年
  return `<article class="card mycard">
      <div class="field">
        <span class="micro plain">Product code</span>
        <div class="my-code">${codeShow}</div>
      </div>
      <div class="field">
        <span class="micro plain">Japanese title</span>
        <div class="my-title">${esc(jpMain)}</div>
        ${enSub?`<div class="my-sub">${esc(enSub)}</div>`:''}
      </div>
      ${sub?`<div class="my-sub">${esc(sub)}</div>`:''}
      ${shelfNote(r)}
      ${actions}
    </article>`;
}

/* ============================================================
   着地コスト目安 ＋ まとめ買い提案（2026-09-11）
   一覧の末尾に「楽天の中央値を足した商品代金の目安」を1枚置く。
   ★海外モード(LOC==='out')だけ。buyBlock() の buyeeNote と同じ条件 ―― 国内の買い手は
     Buyee を経由しないので、送料・手数料の話は要らない。
   ★足すのは各行の medianPrice（カードの「Used on Rakuten: ~¥」と同じ値）。hit.price は
     使わない: 在庫ありが無いと在庫切れの最安に落ちる（_rakFetch）うえ、あちらは (PR) の
     広告行の数字で、リンクでないこの合計に混ぜると広告と非広告の区別が崩れる。
   ★取得は IntersectionObserver を通さず rakutenLookup() を直に呼ぶ ―― 画面外の行も
     合計に要るため。直列・1.6秒間隔・JAN キャッシュは rakutenLookup 側がそのまま守る。
   ★1件取れるたびに合計を書き直す（全件は待たない）。未取得が残る間は calculating… を出す。
   ★JAN の無い行・DATA から消えた行(!r)・楽天で取れなかった行は合計から外し、件数だけ注記する。
   ★rakutenLookup は楽天レイヤー（このファイルの末尾）にある。レイヤーごと消されても
     落ちないよう typeof で確かめてから使う＝消されたらこの1枚が出なくなるだけ。
   ============================================================ */

// 型番1件の JAN。card() の .rak-slot と同じ条件（13桁の数字だけ）。引けなければ ''。
function mylistJan(code){
  const r = DATA.find(row => row[3] === code);
  return (r && /^\d{13}$/.test(r[10]||'')) ? r[10] : '';
}

// ★2026-11-17（price-fx）: 海外モードの円の横に出すドル・ユーロの目安。レートは公開のときに固定した値（外部 API は呼ばない＝表示を遅くしない）。
//   出典: 欧州中央銀行（ECB）の参照レート（euro foreign exchange reference rates・eurofxref-daily.xml）。1 EUR = usd ドル = jpy 円。円→ドルは jpy/usd の割り算。
//   変えるときは3つの数と date を一緒に直す（カードと My List の「rate as of」に date が出る）。
const FX = { date: '2026-11-16', label: '16 Nov 2026', eurJpy: 175.78, eurUsd: 1.1014 };
function fxApprox(yen){   // '(≈ $64 / €59)'。1未満は '<$1' のように出す
  const n = Number(yen); if(!(Number.isFinite(n) && n > 0)) return '';
  const eur = n / FX.eurJpy, usd = eur * FX.eurUsd;
  const f = (v, c) => v < 1 ? '<' + c + '1' : c + Math.round(v).toLocaleString('en-US');
  return `(\u2248 ${f(usd, '$')} / ${f(eur, '\u20ac')})`;
}

// 器だけ返す。数字は mylistCostFill() が後から書く（楽天は非同期）。
// 外部リンクは広告ではないので sponsored は付けない。
function mylistCostBlock(n){
  return `<section class="card mycost" id="mylistCost" aria-labelledby="mylistCostHead">
      <div class="field">
        <span class="micro plain" id="mylistCostHead">Estimated item total</span>
        <div class="my-cost-sum" data-cost-sum>\u2014</div>
        <div class="my-cost-fx" data-cost-fx></div>
        <div class="my-cost-status" data-cost-status>calculating\u2026</div>
      </div>
      <p class="my-cost-note">Item prices only \u2014 international shipping and Buyee\u2019s fees are not included. <a href="https://bc.help.buyee.jp/en/shipping-fees" target="_blank" rel="noopener">Check Buyee\u2019s shipping fees</a></p>
      <p class="my-cost-note">Prices are Rakuten reference prices (the \u201cTypical used price (Rakuten)\u201d median), a different source from where the store links go \u2014 Buyee mostly searches Yahoo! Auctions, so what you pay will differ. $ and \u20ac are rough conversions at the ECB rate as of ${FX.label}.</p>
      ${n >= 2 ? `<p class="my-cost-note">Buying these together in one shipment can reduce your shipping cost. <a href="https://faq.buyee.jp/article/125?lang=en" target="_blank" rel="noopener">How Buyee combines packages</a></p>` : ''}
    </section>`;
}

// jans は一覧の並びどおり（JAN の無い行は ''）。
function mylistCostFill(jans){
  const box = document.getElementById('mylistCost');
  if(!box) return;
  const sumEl = box.querySelector('[data-cost-sum]'), statusEl = box.querySelector('[data-cost-status]');
  const lookups = jans.filter(Boolean).length;
  const noJan = jans.length - lookups;
  let settled = 0, priced = 0, failed = 0, sum = 0;
  // 金額は「有限かつ正」だけ（attachRakutenImage と同じ判定・同じ書式）。
  const money = v => { const n = Number(v); return (Number.isFinite(n) && n > 0) ? n : null; };
  const yen = n => `¥${Math.round(n).toLocaleString('ja-JP')}`;
  const items = n => n + (n === 1 ? ' item' : ' items');
  const paintCost = () => {
    // 待っている間に mylistRender() で組み直された（削除・閉じて開き直し）なら書かない
    if(!box.isConnected) return;
    const pending = lookups - settled;
    // 全件取れなかった＝足せる数字が1つも無い。楽天レイヤーの方針どおり何も出さない。
    // ★hidden 属性ではなく remove()。.card{display:flex} が UA の [hidden]{display:none} に勝つので隠れない。
    if(!pending && !priced){ box.remove(); return; }
    sumEl.textContent = priced ? '~' + yen(sum) : '\u2014';
    const fxEl = box.querySelector('[data-cost-fx]'); if(fxEl) fxEl.textContent = priced ? fxApprox(sum) : '';   // 2026-11-17: ドル・ユーロの目安（My List は海外モードだけ）
    const unknown = noJan + failed;
    const parts = [];
    if(priced) parts.push('for ' + items(priced));
    if(pending) parts.push('calculating\u2026 ' + settled + ' of ' + lookups + ' checked');
    if(unknown) parts.push(items(unknown) + (unknown === 1 ? ' is' : ' are') + ' not included \u2014 price unknown');
    statusEl.textContent = parts.join(' · ');
  };
  paintCost();
  const asked = new Map();   // 同じ JAN を2度並ばせない（キャッシュは取得が終わるまで効かないため）
  jans.forEach(jan => {
    if(!jan) return;
    if(!asked.has(jan)) asked.set(jan, rakutenLookup(jan));
    const done = hit => {
      const mid = money(hit && hit.medianPrice);
      if(mid){ priced++; sum += mid; } else failed++;
      settled++;
      paintCost();
    };
    asked.get(jan).then(done, () => done(null));
  });
}

function mylistRender(){
  const codes = [...listSet];
  const jans = (codes.length && LOC === 'out') ? codes.map(mylistJan) : [];
  const withCost = jans.some(Boolean) && typeof rakutenLookup === 'function';
  mylistBody.innerHTML = codes.length
    ? codes.map(mylistCard).join('') + (withCost ? mylistCostBlock(codes.length) : '')
    : '<div class="state"><b>Nothing saved yet.</b>Your list is empty \u2014 tap the <svg class="pu-icon" aria-hidden="true" focusable="false"><use href="#icon-powerup-off"></use></svg> beside a title in your search results to keep its product code here.</div>';
  if(withCost) mylistCostFill(jans);
}

function mylistOpen(){
  mylistRender();
  mylistEl.classList.add('on');
  mylistEl.scrollTop = 0;
  myListBtn.setAttribute('aria-expanded','true');
  document.body.style.overflow = 'hidden';   // 背後の結果が動くと戻ったとき迷子になる（#clerk と同じ）
  mylistCloseBtn.focus();
}
function mylistHide(){
  mylistEl.classList.remove('on');
  document.body.classList.remove('printing-mylist');   // afterprint が来ない環境の後始末（印刷の規則はこのクラスでしか効かない）
  myListBtn.setAttribute('aria-expanded','false');
  document.body.style.overflow = '';
  myListBtn.focus();
}
myListBtn.addEventListener('click', mylistOpen);
mylistCloseBtn.addEventListener('click', mylistHide);
// ★店員画面が上に載っているときは何もしない。document 上の keydown は登録順に走るので、
//   ガードが無いと Escape 1回で #clerk と #mylist の両方が閉じる（下の #clerk 側の
//   ハンドラがこの直後に走る）。上の1枚だけを閉じる。
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  if(document.querySelector('#clerk.on')) return;
  if(mylistEl.classList.contains('on')) mylistHide();
});

// 削除。カードは mylistRender() で作り直されるので個別結線ではなく委任
// （[data-copy] / [data-list] と同じ）。
mylistBody.addEventListener('click', e=>{
  const btn = e.target.closest('[data-remove]');
  if(!btn) return;
  const code = btn.getAttribute('data-remove');
  if(!listRemove(code)){
    // 保存できなかった＝消えていない。カードも消さない（「消したつもり」を作らない）。
    toast('Couldn\u2019t update your list on this device \u2014 private browsing blocks storage.');
    return;
  }
  // 背後の検索結果に出ている同じ行のボタンを「未追加」へ戻す。paint() は呼ばない
  // （検索していない状態だと結果欄を空にしてしまう。clearMyList と同じ理由）。
  document.querySelectorAll('#results .btn-list.is-on').forEach(b=>{
    if(b.getAttribute('data-list') !== code) return;
    listBtnPaint(b, false);
  });
  mylistRefresh();
  console.log('[my-list] removed: ' + code + ' \u2192 ' + listSet.size + '件', [...listSet]);
});

mylistRefresh();   // 起動時のバッジ（保存済みの件数を帯に出す）

/* ============================================================
   My List の印刷／PDF 保存（2026-09-11）
   ★刷る直前に #mylistPrint へシートを組み、body に printing-mylist を付けてから window.print()。
     印刷の規則（@media print）はこのクラスのときだけ効き、afterprint で外す。
     Print ボタンを使わず Cmd+P 等で刷ったときも、My List が開いていれば beforeprint で同じシートを組む。
   ★中身は DATA から引き直す（mylistCard() と同じ。データを二重に持たない）。
   ★1品＝左が本人用（題名・読み・型番・機種・棚）、右が店員に見せる枠。
     棚は店員の枠に入れない（2026-08-04 / 08-19 の方針: 棚を探すのは本人。渡した面は本人が読めない）。
   ★店員の枠の文言・見出し・値は店員画面と同じもの（CLERK_ASK_BRIEF / CLERK_LB / clerkFacts）。
   ★配信専用(row[12])の行は棚も店員の枠も出さない（Show clerk と同じゲート）。
   ============================================================ */

// 店の棚が「ジャンル札 → その中で五十音」になりうる機種。品ごとのジャンルは持たない（罠#130）ので、
// これらの機種には「まずジャンル札」の一文を添えて、末尾の付録（GENRE_GUIDE）へ案内する。
// ★列挙はノート 2026-07-31「棚のルール確定（フィールド写真）」のディスク側（DS/3DS は店の扱いがディスク側）。
//   ブックオフのディスク機はジャンル＋読み五十音、駿河屋は全機種五十音（ノートの店別表）なので、
//   文面は「そうする店もある」に留める。未観測の機種（PS5 / Switch / Wii U 等）は足していない（罠#129）。
const GENRE_SHELF_PLATFORMS = new Set(['PlayStation', 'PlayStation 2', 'PlayStation 3', 'PlayStation 4', 'PSP',
  'PlayStation Vita', 'Sega Saturn', 'Dreamcast', 'GameCube', 'Wii', 'Xbox', 'Xbox 360', 'Xbox One',
  'Nintendo DS', 'Nintendo 3DS']);
// その品に「まずジャンル札」の一文を付けるか。付録（ジャンル札の表）を刷るかの判定も同じ関数で見る
// ＝「see the table at the end」と案内したのに付録が無い、というずれを構造的に起こさない。
function mylistGenreShelf(r){ return !!r && !r[12] && GENRE_SHELF_PLATFORMS.has(r[2]); }

// 店員に見せる枠。f は clerkFacts(r)、DATA から引けなかった型番では null（型番と一言だけ出す）。
function mylistPrintStaff(codes, f){
  const rows = [];
  if(codes.length) rows.push([CLERK_LB.code, `<span class="mlp-s-code">${codes.map(esc).join('<br>')}</span>`]);
  if(f){
    rows.push([CLERK_LB.title, esc(f.jpMain)]);
    if(f.platShow) rows.push([CLERK_LB.plat, esc(f.platShow)]);
    if(f.pubShow) rows.push([CLERK_LB.pub, esc(f.pubShow)]);
    if(f.year) rows.push([CLERK_LB.year, esc(f.year)]);
  }
  return `<div class="mlp-staff">
      <p class="mlp-ask">${CLERK_ASK_BRIEF}</p>
      <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    </div>`;
}

function mylistPrintItem(code, i){
  const r = DATA.find(row => row[3] === code);
  const num = `<span class="mlp-num">${i + 1}</span>`;
  if(!r){
    const codes = code.split(';').map(s=>s.trim()).filter(Boolean);
    return `<article class="mlp-item">
      <div class="mlp-you">
        <div class="mlp-code">${num}${codes.map(esc).join(' &middot; ')}</div>
        <div class="mlp-note">This code is no longer in the database.</div>
      </div>
      ${mylistPrintStaff(codes, null)}
    </article>`;
  }
  const f = clerkFacts(r);
  const romaji = romajiFor(r);
  // 英題は日本語タイトルと別物のときだけ（mylistCard() と同じ判定）。
  const enSub = (r[0] && strong(r[0]) !== strong(f.jpMain)) ? r[0] : '';
  const meta = [f.codes.map(esc).join(' &middot; '), esc(r[2] || ''), esc(r[4] || '')].filter(Boolean).join(' &middot; ');
  let shelf = '';
  if(r[12]){
    shelf = `<div class="mlp-note">Download-only &mdash; there is no disc or cartridge to find in a store.</div>`;
  } else {
    const k = shelfKana(r);
    if(k){
      shelf = `<div class="mlp-shelf"><span class="mlp-kana">${esc(k.kana)}</span>${k.gyo ? `<span class="mlp-kana">${esc(k.gyo.charAt(0))}</span>` : ''}
        <span>Kana order: look under <b>${esc(k.kana)}</b>${k.gyo ? ` &mdash; or the <b>${esc(k.gyo)}</b> group` : ''}.</span></div>`;
    } else {
      shelf = `<div class="mlp-note">No shelf hint &mdash; we don't have a reading for this title.</div>`;
    }
    if(mylistGenreShelf(r)){
      shelf += `<div class="mlp-genre">Some stores (Book-Off, for one) shelve ${esc(r[2])} games by genre: find the genre sign first &mdash; see the table at the end${k ? ` &mdash; then look under <b>${esc(k.kana)}</b> inside it` : ''}.</div>`;
    }
  }
  return `<article class="mlp-item">
      <div class="mlp-you">
        <div class="mlp-title">${num}${esc(f.jpMain)}</div>
        ${romaji ? `<div class="mlp-romaji">${esc(romaji)}</div>` : ''}
        ${enSub ? `<div class="mlp-en">${esc(enSub)}</div>` : ''}
        <div class="mlp-meta">${meta}</div>
        ${shelf}
      </div>
      ${r[12] ? '' : mylistPrintStaff(f.codes, f)}
    </article>`;
}

function mylistPrintSheet(){
  const codes = [...listSet];
  const d = new Date(), p2 = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const head = `<header class="mlp-head">
      <h1>My List<span>Kataban &middot; gamekataban.com</span></h1>
      <p>${codes.length} item${codes.length === 1 ? '' : 's'} &middot; printed ${date}. Left: for you (where to look). Right: show the boxed part to the staff.</p>
    </header>`;
  // 付録。文面はジャンル早見表の冒頭の一文と同じ趣旨（棚札を英語から引く）。
  const appendix = `<section class="mlp-appendix">
      <h2>Genre signs<span>ジャンル札</span></h2>
      <p>Find your genre in English, then look for the Japanese shelf sign. Disc-era shelves are usually split by genre, not by kana.</p>
      <table>
        <thead><tr><th>Genre</th><th>Sign</th><th>Also covers</th></tr></thead>
        <tbody>${GENRE_GUIDE.map(g => `<tr><td>${esc(g.en)}</td><td class="mlp-sign">${esc(g.jp)}</td><td>${g.terms.map(esc).join(', ')}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
  // 付録は、ジャンル札の一文が付く品が1件以上あるときだけ（2026-09-11）。カートリッジ機だけのリストでは
  // 付録へ案内する品が無いので省き、ページを減らす（6品で A4 2ページのうち、付録が半分以上を占めていた）。
  const needsGenre = codes.some(c => mylistGenreShelf(DATA.find(row => row[3] === c)));
  return head + codes.map(mylistPrintItem).join('') + (needsGenre ? appendix : '');
}

const mylistPrintEl = $('#mylistPrint'), mylistPrintBtn = $('#mylistPrintBtn');
function mylistPrintPrepare(){
  if(!listSet.size) return false;
  mylistPrintEl.innerHTML = mylistPrintSheet();
  document.body.classList.add('printing-mylist');
  return true;
}
mylistPrintBtn.addEventListener('click', ()=>{ if(mylistPrintPrepare()) window.print(); });
window.addEventListener('beforeprint', ()=>{
  if(document.body.classList.contains('printing-mylist')) return;   // Print ボタンから来た＝組み済み
  if(mylistEl.classList.contains('on')) mylistPrintPrepare();        // Cmd+P 等。My List が開いているときだけ
});
window.addEventListener('afterprint', ()=>{ document.body.classList.remove('printing-mylist'); });



// ============================================================
// 店員モード — 全画面・白・大きい文字。カード1枚に1ボタン。
// 読むのは日本の店員。だから中身は日本語だけにし、英語の説明は1ブロックだけ、
// 挨拶の直下に置く(渡す前に、自分が何を見せるのか読めるように)。
//
// 出すのは 日本語タイトル・型番・機種・発売元・発売年。
// ★棚の目安はここには出さない。棚を探すのは店員ではなくユーザー本人なので、
//   結果カード側(shelfNote)へ移した。渡した後の画面に置いても本人が読めない。
// ★2026-08-23: 機種を日本語(row[13])で出すようにした。以前はここだけ row[2] の英語
//   （Super Famicom 等）が出ていて、「中身は日本語だけ」から外れていた。
//   row[13] が空の11機種は箱自体がラテン表記なので英語のまま出る（下の platShow を見ること）。
//   ※簡易版の clerkOpenBrief() には機種を出していないので、あちらは変えていない。
// ============================================================
const clerkEl=$('#clerk'), clerkBody=$('#clerkBody'), clerkClose=$('#clerkClose');

// 店員に見せる面の固定文言と見出し（2026-09-11 に定数化）。
// clerkOpen() / clerkOpenBrief() / My List の印刷シートで同じものを使う ―― 片方だけ直して食い違うのを防ぐ。
const CLERK_ASK_BRIEF = 'これはありますか？';
const CLERK_LB = { title:'タイトル', code:'型番', plat:'機種', pub:'発売元', year:'発売年' };

// 店員に見せる値。clerkOpen() と印刷シートで共用する（式を2か所に書くと、片方だけ直したときに黙ってずれる）。
// ★中身は clerkOpen() の冒頭にあった式と注意書きをそのまま移したもの。
function clerkFacts(r){
  const jpMain = r[1] || r[0];
  const codes  = (r[3]||'').split(';').map(s=>s.trim()).filter(Boolean);
  // 発売元は日本語(row[5])を優先。読むのは日本の店員なので、card() とは優先順が逆。
  // 空なら英語(row[6])に落ちる。どちらも空なら行を出さない。
  const pubShow = (r[5]||r[6]||'').split(';').map(s=>s.trim()).filter(Boolean).join(' · ');
  // 機種は日本語(row[13])を優先し、空なら英語(row[2])に落ちる。card() とは優先順が逆で、
  // 発売元(pubShow)と同じ考え方 ―― 読むのは日本の店員。
  // ★row[13] が空なのは「変換し忘れ」ではない。国内版パッケージ自体がラテン表記の
  //   11機種（Wii / Wii U / Nintendo Switch / Xbox・360・One / 3DO / PC-FX / 64DD /
  //   Nintendo 64 / PlayStation Vita）で、build_master.py が意図して空にしている。
  //   実測の根拠は build_master.py の PLATFORM_JA / PLATFORM_JA_DROP と
  //   BIN_DIVER_NOTES.md「機種名の日本語化」調査（2026-08-23）。
  //   **和名を足す方向に直さないこと。** `ニンテンドースイッチ` と書くほうが棚の現物から遠のく。
  // ★1つの const にまとめてある。下の「出すかどうかの判定」と「出す値」で別々の式を
  //   書くと、片方だけ直したときに黙ってずれる（空ラベルだけ残る等）。
  const platShow = r[13] || r[2];
  return { jpMain, codes, pubShow, platShow, year: r[4] || '' };
}

// ★前提: この関数には配信専用の行（row[12]）は来ない。
//   唯一の入口である「店員に見せる」ボタンを row[12] の行では出していないため（card() 内）。
//   ボタン側の条件を変えるなら、ここも見直すこと。
//   配信専用の行を渡すと「在庫はありますか？」と店員に聞かせることになる。
/* ============================================================
   店員に見せる定型文カード（2026-09-28・staff-cards）。
   ★質問を1枚ずつ選んで見せ、店員さんが指させる答えを下に並べる。答えを押すと、
     その答えを画面いっぱいに大きく出す（英語も大きく＝持ち主がその場で読める）。
   ★答えはカードごとに選んである（全カード共通にしない）。文言は 2026-09-28 こはさん承認。
   ★免税（tax）は作品と関係ないので題名・型番・機種を出さない（item:false）。
     金額・手数料は書かない ―― 2026-11-01 から国の制度がリファンド方式に変わり、数字が古くなるため。
     「パスポートを見せてください」は新制度でも店頭で旅券を確認する（観光庁「手続の変更点（比較表）」の
     販売時「旅券を確認 変更無」・観光庁「免税購入対象者一覧（リファンド方式）」・BOOKOFF Tax free shop）。
   ★ja は手書きの HTML 定数（<br> を含む）なので esc() しない。外部の値を入れないこと。
   ★全部 index.html の中にある＝sw.js がキャッシュするページ本体に入る＝圏外でも使える。
   ============================================================ */
const STAFF_CARDS = [
  { id:'stock', label:'In stock?', item:true,
    ja:'すみません、このゲームを探しています。<br>在庫はありますか？',
    en:"Excuse me, I'm looking for this game. Do you have it in stock?",
    answers:[['はい、あります','Yes, we have it'],['売り場にご案内します',"I'll show you where it is"],
             ['少々お待ちください（調べます）',"One moment, I'll check"],['在庫はありません','Out of stock']] },
  { id:'case', label:'Glass case', item:true,
    ja:'ショーケースの中のこの商品を<br>見せていただけますか？',
    en:'Could I see this one in the glass case?',
    answers:[['はい、少々お待ちください','Yes, one moment'],['担当の者を呼びます',"I'll get a colleague"],
             ['今はお出しできません','Not possible right now']] },
  { id:'box', label:'Box & manual?', item:true,
    ja:'箱と説明書は付いていますか？',
    en:'Does it come with the box and manual?',
    answers:[['箱・説明書あり','Box and manual included'],['箱のみ（説明書なし）','Box only, no manual'],
             ['説明書のみ（箱なし）','Manual only, no box'],['ソフトのみ','Game only'],['確認します','Let me check']] },
  { id:'test', label:'Test it?', item:true,
    ja:'動作の確認はできますか？',
    en:'Can I check that it works?',
    answers:[['はい、できます','Yes, you can'],['いいえ、できません','No, sorry'],['動作確認済みです','Already tested']] },
  // ★免税は日本時間 2026-11-01 00:00 から国の制度がリファンド方式に変わる（観光庁「2026年11月1日購入分から」・国税庁「令和８年11月１日から実施」）。
  //   それより前は上の文、以後は refund の文を出す（staffCardNow()。開くたび・描くたびに端末の時刻で判定＝11/1 に手作業は要らない）。
  //   文案は 0f23fdd（_experiments/staff-cards/tax-free-refund-draft.json）。答えは必須4つ＋追加案5（空港の税関・手荷物を預ける前）。
  //   追加案6（返金の方法の案内）は「Refund how?」カードと重なるので入れない（2026-10-15 こはさん決定）。
  //   下限 5,000円（税抜）は制度の条件で新制度でも変わらない（比較表「変更無」）ので、新しい答えにだけ書いた。手数料・返金額は書かない。
  { id:'tax', label:'Tax-free?', item:false,
    ja:'免税の手続きはできますか？',
    en:'Can I buy this tax-free?',
    answers:[['はい、できます','Yes'],['パスポートを見せてください','Please show your passport'],
             ['免税の対象金額に達していません','Below the tax-free minimum'],['当店では対応していません','Not available at this store']],
    refund:{ from: Date.UTC(2026,9,31,15),
      ja:'免税で購入できますか？<br>（出国時に消費税の返金を受けたいです）',
      en:"Can I buy this tax-free? (I'd like the tax refunded when I leave Japan.)",
      hint:'Tax-free since 1 November 2026: you pay the tax in the shop, then get it back after a customs check at the airport — before you check in your bags, within 90 days of buying.',
      answers:[['対応しています（お支払いは税込で、出国時に返金されます）','Yes — you pay the tax now and get it back when you leave Japan'],
               ['パスポートを見せてください','Please show your passport'],
               ['免税の対象金額（同じ店で1日に税抜5,000円以上）に達していません','Below the tax-free minimum (¥5,000 before tax, same shop, same day)'],
               ['当店では対応していません','Not available at this store'],
               ['出国時、手荷物を預ける前に空港の税関で確認を受けてください','When you leave, get it checked at airport customs before you check in your bags']] } },
  // ★返金の方法（2026-10-15 追加・こはさん指示）。2026-11-01 購入分からのリファンド方式では、返金は免税店か委託先の
  //   返金事業者が行い、方法は店ごとに違う（観光庁「旅行者向け よくある質問（リファンド方式）」が挙げる例＝銀行振込・
  //   クレジットカード送金・アプリ送金・出国時の空海港での現金）。案内は購入時に店がする＝レジで聞く質問。item:false。
  //   免税ブログ記事（2026-99-99-japan-tax-free-refund-method-guide）の「返金はどの方法で受け取れますか？」と同じ文。
  //   ★タブを出すのは日本時間 2026-11-01 00:00 から（showFrom。免税カードの refund.from と同じ時刻・同じ判定）。それより前は旧制度で、返金の質問は要らない。
  { id:'refund', label:'Refund how?', item:false, showFrom: Date.UTC(2026,9,31,15),
    ja:'返金はどの方法で<br>受け取れますか？',
    en:'How will I receive my refund?',
    answers:[['銀行振込','Bank transfer'],['クレジットカード','Back to your credit card'],['アプリ','Through an app'],
             ['出国時に空港で現金','Cash at the airport when you leave'],['こちらの案内をご覧ください','Please read this guide']] },
  { id:'other', label:'Other stores?', item:true, codeFirst:true,
    ja:'ほかの店舗に在庫はありますか？',
    en:'Is it in stock at another store?',
    answers:[['ほかの店舗にあります','Another store has it'],['どの店舗にもありません','No store has it'],
             ['当店の在庫しかお調べできません','I can only check this store'],['少々お待ちください（調べます）',"One moment, I'll check"]] },
];
let staffRow = null, staffCard = 0;

// 画面を消さない（見せている間に暗くなって消えるのを防ぐ）。使えないブラウザでは何もしない。
// ★例外もエラーも外へ出さない。これが無くてもカードは使える（上乗せ）。
let staffWakeLock = null;
async function staffWake(){
  try{
    if(!('wakeLock' in navigator) || staffWakeLock) return;
    staffWakeLock = await navigator.wakeLock.request('screen');
    staffWakeLock.addEventListener('release', ()=>{ staffWakeLock = null; });
  }catch(e){ staffWakeLock = null; }
}
function staffSleep(){
  try{ if(staffWakeLock) staffWakeLock.release(); }catch(e){}
  staffWakeLock = null;
}
// タブを離れると wake lock は自動で外れる。店員画面を開いたまま戻ってきたら取り直す。
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && clerkEl.classList.contains('on')) staffWake();
});

// 作品の段。質問のすぐ下・答えの上に置く（店員が「どのゲームの話か」を先に読めるように）。
// ★大きさの順はカードで変える（2026-09-28 こはさん決定）。
//   在庫・ショーケース・箱と説明書・動作確認 … 題名がいちばん大きく、型番は2番目（棚や現物と題名で照合する場面）。
//   ほかの店舗（codeFirst）… 型番がいちばん大きく、題名は2番目（店員がシステムで型番を打って調べる場面）。
//   機種は日本語名。発売元・発売年は出さない。免税カードは item:false で段ごと出さない。
function staffItemHtml(r, codeFirst){
  const { jpMain, codes, platShow } = clerkFacts(r);
  const code  = codes.length ? `<div class="clerk-row"><span class="lb">${CLERK_LB.code}</span>
    <div class="clerk-code">${codes.map(esc).join('<br>')}</div></div>` : '';
  const title = `<div class="clerk-row"><span class="lb">${CLERK_LB.title}</span>
    <div class="clerk-title">${esc(jpMain)}</div></div>`;
  const plat  = platShow ? `<div class="clerk-row"><span class="lb">${CLERK_LB.plat}</span>
    <div class="clerk-plat">${esc(platShow)}</div></div>` : '';
  return `<div class="staff-item ${codeFirst?'code-first':'title-first'}">${codeFirst ? code+title : title+code}${plat}</div>`;
}

/* 店員に見せる画面の旅行者側の3行目（2026-10-15・こはさん決定）。サイトの言語（blogLang()）が en 以外なら、英語の下にその言語の訳を足す。
   ★英語は消さない（店員画面の英語は免税記事などの案内と一致させてあるため）。日本語（店員さんが読む側）は変えない。
   ★訳文の正本は _experiments/i18n/staff-cards.json（51か所・id は「カードの id＋.label／.q／.a番号」、免税の 11/1 以後の版は「tax.new.*」）。
   ★11/1 の切り替え（staffCardNow・staffVisible）には手を入れない。どちらの版を描いているかを見て、引く id を変えるだけ。 */
const STAFF_L10N = {"zh":{"ui.hint":"選一個問題，再把畫面給店員看。店員可以點選答案。","ui.again":"再問一次","stock.label":"有庫存嗎？","stock.q":"不好意思，我在找這款遊戲。請問有庫存嗎？","stock.a0":"有的，我們有","stock.a1":"我帶您到賣場","stock.a2":"請稍等，我查一下","stock.a3":"沒有庫存","case.label":"展示櫃","case.q":"可以讓我看看展示櫃裡的這件商品嗎？","case.a0":"好的，請稍等","case.a1":"我去請負責的同事來","case.a2":"現在無法取出","box.label":"盒子說明書？","box.q":"有附盒子和說明書嗎？","box.a0":"附盒子與說明書","box.a1":"只有盒子（無說明書）","box.a2":"只有說明書（無盒子）","box.a3":"只有遊戲本體","box.a4":"我確認一下","test.label":"可試機嗎？","test.q":"可以確認它能不能正常運作嗎？","test.a0":"可以，沒問題","test.a1":"不好意思，沒辦法","test.a2":"已確認可正常運作","tax.label":"可以免稅嗎？","tax.q":"這件商品可以免稅購買嗎？","tax.a0":"可以","tax.a1":"請出示護照","tax.a2":"未達免稅門檻","tax.a3":"本店不提供","tax.new.q":"這件商品可以免稅購買嗎？（我希望在離開日本時退還稅金。）","tax.new.hint":"2026年11月1日起的免稅：在店內先支付稅金，在機場接受海關查核後再退還——須在託運行李之前、購買後90天內辦理。","tax.new.a0":"可以——現在先付稅，離開日本時退還","tax.new.a1":"請出示護照","tax.new.a2":"未達免稅門檻：同一家店、同一天未稅 ¥5,000","tax.new.a3":"本店不提供","tax.new.a4":"出境時，請在託運行李前到機場海關接受查核","refund.label":"怎麼退稅？","refund.q":"我可以透過哪種方式收到退款？","refund.a0":"銀行轉帳","refund.a1":"退回信用卡","refund.a2":"透過 App","refund.a3":"出境時在機場領取現金","refund.a4":"請閱讀這份說明","other.label":"其他分店？","other.q":"其他分店有庫存嗎？","other.a0":"其他分店有","other.a1":"所有分店都沒有","other.a2":"我只能查詢本店的庫存","other.a3":"請稍等，我查一下"},"ko":{"ui.hint":"질문을 고른 뒤 화면을 보여 주세요. 점원이 답을 누를 수 있습니다.","ui.again":"다시 묻기","stock.label":"재고 확인","stock.q":"실례합니다. 이 게임을 찾고 있습니다. 재고가 있나요?","stock.a0":"네, 있습니다","stock.a1":"매장으로 안내해 드리겠습니다","stock.a2":"잠시만 기다려 주세요. 확인해 보겠습니다","stock.a3":"재고가 없습니다","case.label":"진열장","case.q":"진열장 안의 이 상품을 볼 수 있을까요?","case.a0":"네, 잠시만 기다려 주세요","case.a1":"담당자를 부르겠습니다","case.a2":"지금은 꺼내 드릴 수 없습니다","box.label":"상자·설명서","box.q":"상자와 설명서가 포함되어 있나요?","box.a0":"상자·설명서 포함","box.a1":"상자만 있음(설명서 없음)","box.a2":"설명서만 있음(상자 없음)","box.a3":"게임 본체만","box.a4":"확인해 보겠습니다","test.label":"동작 확인","test.q":"작동하는지 확인할 수 있나요?","test.a0":"네, 가능합니다","test.a1":"죄송하지만 할 수 없습니다","test.a2":"동작 확인을 마쳤습니다","tax.label":"면세 되나요?","tax.q":"이 상품을 면세로 살 수 있나요?","tax.a0":"네, 가능합니다","tax.a1":"여권을 보여 주세요","tax.a2":"면세 최소 금액 미만","tax.a3":"이 매장에서는 이용할 수 없습니다","tax.new.q":"이 상품을 면세로 살 수 있나요? (일본을 떠날 때 세금을 환급받고 싶습니다.)","tax.new.hint":"2026년 11월 1일부터의 면세: 상점에서 세금을 내고, 공항에서 세관 확인을 받은 뒤 돌려받습니다. 수하물을 위탁하기 전에, 구매 후 90일 이내에 해야 합니다.","tax.new.a0":"네——지금 세금을 내고 일본을 떠날 때 돌려받습니다","tax.new.a1":"여권을 보여 주세요","tax.new.a2":"면세 최소 금액 미만: 같은 상점, 같은 날, 세금 제외 ¥5,000","tax.new.a3":"이 매장에서는 이용할 수 없습니다","tax.new.a4":"출국할 때 수하물을 위탁하기 전에 공항 세관에서 확인을 받으세요","refund.label":"환급은 어떻게?","refund.q":"환급은 어떤 방법으로 받을 수 있나요?","refund.a0":"은행 송금","refund.a1":"신용카드로 환급","refund.a2":"앱으로","refund.a3":"출국할 때 공항에서 현금으로","refund.a4":"이 안내를 읽어 주세요","other.label":"다른 매장","other.q":"다른 매장에 재고가 있나요?","other.a0":"다른 매장에 있습니다","other.a1":"어느 매장에도 없습니다","other.a2":"이 매장의 재고만 확인할 수 있습니다","other.a3":"잠시만 기다려 주세요. 확인해 보겠습니다"},"es":{"ui.hint":"Elige una pregunta y enseña la pantalla. El personal puede tocar una respuesta.","ui.again":"Volver a preguntar","stock.label":"¿Hay stock?","stock.q":"Perdona, estoy buscando este juego. ¿Lo tienen en stock?","stock.a0":"Sí, lo tenemos","stock.a1":"Te enseño dónde está","stock.a2":"Un momento, lo compruebo","stock.a3":"Agotado","case.label":"Vitrina","case.q":"¿Puedo ver este de la vitrina?","case.a0":"Sí, un momento","case.a1":"Voy a llamar a la persona encargada","case.a2":"Ahora mismo no es posible","box.label":"¿Caja y manual?","box.q":"¿Viene con caja y manual?","box.a0":"Con caja y manual","box.a1":"Solo caja, sin manual","box.a2":"Solo manual, sin caja","box.a3":"Solo el juego","box.a4":"Lo compruebo","test.label":"¿Probarlo?","test.q":"¿Puedo comprobar que funciona?","test.a0":"Sí, puedes","test.a1":"No, lo siento","test.a2":"Ya está probado","tax.label":"¿Libre de impuestos?","tax.q":"¿Puedo comprar esto libre de impuestos?","tax.a0":"Sí","tax.a1":"Enseña tu pasaporte, por favor","tax.a2":"No llega al mínimo libre de impuestos","tax.a3":"No disponible en esta tienda","tax.new.q":"¿Puedo comprar esto libre de impuestos? (Quiero que me devuelvan el impuesto al salir de Japón).","tax.new.hint":"Libre de impuestos desde el 1 de noviembre de 2026: pagas el impuesto en la tienda y lo recuperas tras la comprobación de aduanas en el aeropuerto, antes de facturar el equipaje y en un plazo de 90 días desde la compra.","tax.new.a0":"Sí: pagas el impuesto ahora y lo recuperas al salir de Japón","tax.new.a1":"Enseña tu pasaporte, por favor","tax.new.a2":"No llega al mínimo libre de impuestos: ¥5,000 sin impuestos, misma tienda, mismo día","tax.new.a3":"No disponible en esta tienda","tax.new.a4":"Al salir, pásalo por la aduana del aeropuerto antes de facturar el equipaje","refund.label":"¿Cómo es la devolución?","refund.q":"¿De qué forma puedo recibir la devolución?","refund.a0":"Transferencia bancaria","refund.a1":"Devolución a tu tarjeta de crédito","refund.a2":"A través de una aplicación","refund.a3":"En efectivo en el aeropuerto al salir","refund.a4":"Lee esta guía, por favor","other.label":"¿Otra tienda?","other.q":"¿Lo tienen en otra tienda?","other.a0":"Lo tiene otra tienda","other.a1":"No lo tiene ninguna tienda","other.a2":"Solo puedo consultar esta tienda","other.a3":"Un momento, lo compruebo"},"de":{"ui.hint":"Wähl eine Frage und zeig den Bildschirm. Das Personal kann eine Antwort antippen.","ui.again":"Erneut fragen","stock.label":"Vorrätig?","stock.q":"Entschuldigung, ich suche dieses Spiel. Habt ihr es vorrätig?","stock.a0":"Ja, haben wir","stock.a1":"Ich zeige dir, wo es steht","stock.a2":"Einen Moment, ich schaue nach","stock.a3":"Nicht vorrätig","case.label":"Vitrine","case.q":"Kann ich mir das hier aus der Vitrine ansehen?","case.a0":"Ja, einen Moment","case.a1":"Ich hole jemanden, der zuständig ist","case.a2":"Gerade nicht möglich","box.label":"OVP & Anleitung?","box.q":"Sind OVP und Anleitung dabei?","box.a0":"Mit OVP und Anleitung","box.a1":"Nur OVP, ohne Anleitung","box.a2":"Nur Anleitung, ohne OVP","box.a3":"Nur das Spiel","box.a4":"Ich schaue nach","test.label":"Testen?","test.q":"Kann ich testen, ob es funktioniert?","test.a0":"Ja, kannst du","test.a1":"Nein, leider nicht","test.a2":"Bereits getestet","tax.label":"Steuerfrei?","tax.q":"Kann ich das steuerfrei kaufen?","tax.a0":"Ja","tax.a1":"Bitte zeig deinen Reisepass","tax.a2":"Unter dem Mindestbetrag für den steuerfreien Einkauf","tax.a3":"In diesem Geschäft nicht möglich","tax.new.q":"Kann ich das steuerfrei kaufen? (Ich möchte mir die Steuer bei der Ausreise aus Japan erstatten lassen.)","tax.new.hint":"Steuerfrei seit dem 1. November 2026: Du zahlst die Steuer im Geschäft und bekommst sie nach der Zollprüfung am Flughafen zurück – bevor du dein Gepäck aufgibst, innerhalb von 90 Tagen nach dem Kauf.","tax.new.a0":"Ja: Du zahlst die Steuer jetzt und bekommst sie bei der Ausreise aus Japan zurück","tax.new.a1":"Bitte zeig deinen Reisepass","tax.new.a2":"Unter dem Mindestbetrag für den steuerfreien Einkauf: ¥5,000 ohne Steuer, dasselbe Geschäft, derselbe Tag","tax.new.a3":"In diesem Geschäft nicht möglich","tax.new.a4":"Lass es bei der Ausreise vom Zoll am Flughafen prüfen, bevor du dein Gepäck aufgibst","refund.label":"Wie wird erstattet?","refund.q":"Auf welchem Weg erhalte ich meine Erstattung?","refund.a0":"Banküberweisung","refund.a1":"Zurück auf deine Kreditkarte","refund.a2":"Über eine App","refund.a3":"Bar am Flughafen bei der Ausreise","refund.a4":"Bitte lies diese Anleitung","other.label":"Andere Filiale?","other.q":"Ist es in einer anderen Filiale vorrätig?","other.a0":"Eine andere Filiale hat es","other.a1":"Keine Filiale hat es","other.a2":"Ich kann nur diese Filiale prüfen","other.a3":"Einen Moment, ich schaue nach"},"fr":{"ui.hint":"Choisissez une question, puis montrez l'écran. Le personnel peut toucher une réponse.","ui.again":"Redemander","stock.label":"En stock ?","stock.q":"Excusez-moi, je cherche ce jeu. Vous l'avez en stock ?","stock.a0":"Oui, nous l'avons","stock.a1":"Je vais vous montrer où il se trouve","stock.a2":"Un instant, je vérifie","stock.a3":"En rupture de stock","case.label":"Vitrine","case.q":"Pourrais-je voir celui-ci dans la vitrine ?","case.a0":"Oui, un instant","case.a1":"Je vais chercher la personne responsable","case.a2":"Pas possible pour le moment","box.label":"Boîte, notice ?","box.q":"Est-ce qu'il y a la boîte et la notice ?","box.a0":"Boîte et notice incluses","box.a1":"Boîte seule, sans notice","box.a2":"Notice seule, sans boîte","box.a3":"Jeu seul","box.a4":"Je vérifie","test.label":"Le tester ?","test.q":"Puis-je vérifier qu'il fonctionne ?","test.a0":"Oui, vous pouvez","test.a1":"Non, malheureusement","test.a2":"Déjà testé","tax.label":"Détaxe ?","tax.q":"Puis-je acheter cet article en détaxe ?","tax.a0":"Oui","tax.a1":"Veuillez présenter votre passeport","tax.a2":"En dessous du minimum pour la détaxe","tax.a3":"Non disponible dans ce magasin","tax.new.q":"Puis-je acheter cet article en détaxe ? (Je souhaite me faire rembourser la taxe en quittant le Japon.)","tax.new.hint":"Détaxe depuis le 1er novembre 2026 : vous payez la taxe en magasin, puis la récupérez après le contrôle douanier à l'aéroport, avant d'enregistrer vos bagages, dans les 90 jours suivant l'achat.","tax.new.a0":"Oui : vous payez la taxe maintenant et la récupérez en quittant le Japon","tax.new.a1":"Veuillez présenter votre passeport","tax.new.a2":"En dessous du minimum pour la détaxe : ¥5,000 hors taxes, même magasin, même jour","tax.new.a3":"Non disponible dans ce magasin","tax.new.a4":"À votre départ, faites-le contrôler par la douane de l'aéroport avant d'enregistrer vos bagages","refund.label":"Remboursement comment ?","refund.q":"Par quel moyen vais-je recevoir mon remboursement ?","refund.a0":"Virement bancaire","refund.a1":"Sur votre carte de crédit","refund.a2":"Via une application","refund.a3":"En espèces à l'aéroport à votre départ","refund.a4":"Veuillez lire ce guide","other.label":"Autre magasin ?","other.q":"Est-il en stock dans un autre magasin ?","other.a0":"Un autre magasin l'a","other.a1":"Aucun magasin ne l'a","other.a2":"Je ne peux vérifier que ce magasin","other.a3":"Un instant, je vérifie"}};
const STAFF_LANG_ATTR = { zh:'zh-Hant', ko:'ko', es:'es', de:'de', fr:'fr' };
function staffL(id){ const l = blogLang(); return (l !== 'en' && STAFF_L10N[l] && STAFF_L10N[l][id]) || ''; }
function staffLine(tag, cls, id){ const t = staffL(id); return t ? `<${tag} class="${cls}" lang="${STAFF_LANG_ATTR[blogLang()]}">${esc(t)}</${tag}>` : ''; }
// 描いている版の id の頭（免税で 11/1 以後の文を出しているときは「tax.new」）
function staffKey(i, c){ return STAFF_CARDS[i].id + (STAFF_CARDS[i].refund && !c.refund ? '.new' : ''); }

// その時点で出すカード。refund を持つカード（免税）は、端末の時刻が refund.from 以後なら新しい文に差し替える。
// ★毎回 Date.now() を見る（sw.js がページをキャッシュしていても、11/1 を過ぎた端末では開き直すだけで新しい文になる）。
function staffCardNow(i){
  const c = STAFF_CARDS[i];
  return (c.refund && Date.now() >= c.refund.from) ? { ...c, ...c.refund, refund: undefined } : c;
}

// その時点でタブを出すか。showFrom を持つカード（返金）は、端末の時刻が showFrom 以後のときだけ出す（staffCardNow と同じく毎回 Date.now() を見る）。
function staffVisible(i){
  const c = STAFF_CARDS[i];
  return !c.showFrom || Date.now() >= c.showFrom;
}

function staffRender(){
  if(!staffVisible(staffCard)) staffCard = 0;   // 出していないカードを選んだままにしない
  const c = staffCardNow(staffCard);
  const k = staffKey(staffCard, c);
  const tabs = STAFF_CARDS.map((x,i)=>staffVisible(i) ? `<button type="button" class="staff-tab" data-scard="${i}" aria-pressed="${i===staffCard?'true':'false'}">${esc(x.label)}${staffLine('span','staff-tab-l',x.id+'.label')}</button>` : '').join('');
  const answers = c.answers.map(([ja,en],i)=>`<button type="button" class="staff-ans" data-sans="${i}">
      <span class="staff-ans-ja" lang="ja">${esc(ja)}</span><span class="staff-ans-en">${esc(en)}</span>${staffLine('span','staff-ans-l',k+'.a'+i)}</button>`).join('');
  clerkBody.innerHTML = `
    <p class="staff-hint">Pick a question, then show the screen. The staff can tap an answer.${staffLine('span','staff-l',  'ui.hint')}</p>
    <div class="staff-tabs" role="group" aria-label="Questions">${tabs}</div>
    ${c.hint ? `<p class="staff-hint">${esc(c.hint)}${staffLine('span','staff-l',k+'.hint')}</p>` : ''}
    <div class="staff-q">
      <p class="clerk-ask staff-q-ja" lang="ja">${c.ja}</p>
      <p class="staff-q-en">${esc(c.en)}</p>${staffLine('p','staff-q-l',k+'.q')}
    </div>
    ${c.item && staffRow ? staffItemHtml(staffRow, !!c.codeFirst) : ''}
    <div class="staff-answers" role="group" aria-label="Answers for the staff" lang="ja">${answers}</div>`;
  clerkEl.classList.remove('staff-answered');
  clerkEl.scrollTop = 0;
}

// 答えを大きく出す。持ち主が読む英語も大きくする。
function staffAnswer(i){
  const c = staffCardNow(staffCard), k = staffKey(staffCard, c);
  const [ja,en] = c.answers[i];
  clerkBody.innerHTML = `
    <div class="staff-big" role="status">
      <p class="staff-big-ja" lang="ja">${esc(ja)}</p>
      <p class="staff-big-en">${esc(en)}</p>${staffLine('p','staff-big-l',k+'.a'+i)}
    </div>
    <button type="button" class="staff-back" data-sback="1">Ask again${staffLine('span','staff-back-l','ui.again')}<span lang="ja">もう一度</span></button>`;
  clerkEl.classList.add('staff-answered');
  clerkEl.scrollTop = 0;
  const back = clerkBody.querySelector('.staff-back'); if(back) back.focus();
}

clerkBody.addEventListener('click', e=>{
  const t = e.target.closest('[data-scard],[data-sans],[data-sback]');
  if(!t) return;
  if(t.hasAttribute('data-scard')){ staffCard = +t.dataset.scard; staffRender(); const b=clerkBody.querySelector(`[data-scard="${staffCard}"]`); if(b) b.focus(); }
  else if(t.hasAttribute('data-sans')){ staffAnswer(+t.dataset.sans); }
  else { staffRender(); const b=clerkBody.querySelector(`[data-scard="${staffCard}"]`); if(b) b.focus(); }
});

function clerkOpen(r){
  // 最初は在庫のカード（今までの店員画面と同じ一言）から開く。
  staffRow = r; staffCard = 0;
  staffRender();
  clerkEl.classList.add('on');
  document.body.style.overflow = 'hidden';   // 背後のページが動くと、見せている間に迷子になる
  clerkClose.focus();
  staffWake();
}
function clerkHide(){
  staffSleep();
  // 答えを大きく出した状態の修飾も外す（次に開いたときに持ち越さない）。
  clerkEl.classList.remove('staff-answered');
  // .brief / .over-mylist はマイリストから開いたときだけ付く修飾。閉じるときに必ず外す
  // ―― 残すと次に検索結果から開いた店員画面が簡易表示の字組みのまま出る。
  clerkEl.classList.remove('on','brief','over-mylist');
  const ml = document.getElementById('mylist');
  if(ml && ml.classList.contains('on')){
    // マイリストがまだ開いている＝背後スクロールの固定は解かない（解くと裏のページが動く）。
    document.body.style.overflow = 'hidden';
    // 開いた本人（Show clerk ボタン）へ戻す。カードが作り直されていたら閉じるボタンへ。
    if(clerkOpener && document.contains(clerkOpener)) clerkOpener.focus();
    else { const c = document.getElementById('mylistClose'); if(c) c.focus(); }
  } else {
    document.body.style.overflow = '';
  }
  clerkOpener = null;
}
/* ============================================================
   マイリストからの店頭提示（簡易版）。器は #clerk をそのまま使い、中身だけ差し替える。
   出すのは3つだけ ―― 型番（この画面で一番大きい）・日本語タイトル・
   「これはありますか？」。閉じる以外の操作は置かない。
   ★機種／発売元／発売年と英語の説明は出さない。マイリストは「もう決めた1本」を出す
     画面なので、どれを買うか選ぶための材料はここには要らない（それは検索結果側の
     clerkOpen() の仕事で、あちらは変えていない）。
   ★棚の目安は出さない（2026-08-19 に一度入れて同日外した）。clerkOpen() 側が
     2026-08-04 に「棚を探すのは店員ではなく本人だから、渡した後の画面に置いても
     本人が読めない」として結果カード(shelfNote)へ移したのと同じ理由で、こちらも
     店員に見せる面には置かない。棚は結果カードとマイリストのカードに出ている。
   ★引数は型番。マイリストが持っているのは型番だけなので、行は DATA から引き直す
     （mylistCard() と同じ引き方＝データを二重に持たない）。
   ★配信専用(row[12])の行はここへ来ない。入口の Show clerk ボタンを出していない
     （mylistCard() 内）。ゲートを外すならこの関数の文面も見直すこと。
   ============================================================ */
let clerkOpener = null;   // 戻り先。閉じたときにフォーカスを返す

function clerkOpenBrief(code, opener){
  const r = DATA.find(row => row[3] === code) || null;
  const codes = (code||'').split(';').map(s=>s.trim()).filter(Boolean);
  const parts = [];

  // 1. 型番 = この画面の主役。店員が在庫システムに打つ値。
  parts.push(`<div class="clerk-row clerk-brief-first"><span class="lb">${CLERK_LB.code}</span>
    <div class="clerk-code">${codes.map(esc).join('<br>')}</div></div>`);

  if(r){
    // 2. 日本語タイトル
    parts.push(`<div class="clerk-row"><span class="lb">${CLERK_LB.title}</span>
      <div class="clerk-title">${esc(r[1] || r[0])}</div></div>`);
  }

  // 3. 店員に見せる1行。
  parts.push(`<p class="clerk-ask clerk-brief-ask">${CLERK_ASK_BRIEF}</p>`);

  clerkBody.innerHTML = parts.join('');
  clerkOpener = opener || null;
  clerkEl.classList.add('on','brief','over-mylist');
  staffWake();
  clerkEl.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  clerkClose.focus();
}

// マイリストのカード上のボタン。カードは mylistRender() で作り直されるので委任
// （[data-remove] と同じ。あちらのハンドラとは独立で、互いに邪魔しない）。
mylistBody.addEventListener('click', e=>{
  const btn = e.target.closest('[data-clerkcode]');
  if(!btn) return;
  clerkOpenBrief(btn.getAttribute('data-clerkcode'), btn);
});

clerkClose.addEventListener('click', clerkHide);
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && clerkEl.classList.contains('on')) clerkHide(); });
// カード上のボタン。data-clerk は current[] の添字（card() は paint() から
// current.slice(0,shown).map(card) で呼ばれるので、第2引数がそのまま添字になる）。
results.addEventListener('click', e=>{
  const btn = e.target.closest('[data-clerk]');
  if(!btn) return;
  const row = current[+btn.dataset.clerk];
  if(row){ cmTrack('clerk_open', row); clerkOpen(row); }
});

/* ジャンル早見表。
   ★リンクはカードごとに描かれるが、開く器は #genre-modal ひとつ。将来ディスク機から
     開けるようにするときも、足すのはリンクだけでよい。
   ★ブラウザストレージは使わない。状態は .on の有無だけ。

   GENRE_GUIDE は静的な用語集。DATA とは無関係で、行ごとに中身が変わることはない
   （個々のタイトルのジャンルではなく「棚の仕切り札の読み方」を出す表）。
   だから開くたびに組み直さず、読み込み時に1回だけ描く。
   ★外部ファイルは読まない（1ファイル完結を保つ）。並び順は渡された順のまま。 */
const GENRE_GUIDE = [
  { en:"Role-Playing (RPG)", terms:["RPG","JRPG","action RPG","tactical / strategy RPG","roguelike","dungeon crawler","soulslike","MMORPG"], jp:"ロールプレイング" },
  { en:"Action", terms:["action","platformer","action-adventure","hack & slash","beat 'em up","Metroidvania","stealth","vehicular combat"], jp:"アクション" },
  { en:"Shooter", terms:["shoot 'em up (shmup)","FPS","TPS","bullet hell","run & gun","rail shooter","light-gun","tactical shooter","looter shooter"], jp:"シューティング" },
  { en:"Adventure", terms:["adventure","visual novel","point-and-click","mystery / detective","sound novel","walking sim","escape room"], jp:"アドベンチャー" },
  { en:"Fighting", terms:["fighting","2D fighter","3D fighter","arena fighter","platform fighter"], jp:"対戦格闘" },
  { en:"Dating / Romance", terms:["dating sim","otome","romance","visual novel (romance)","Yuri","BL (Boys' Love)"], jp:"恋愛" },
  { en:"Simulation / Strategy", terms:["simulation","life sim","management / business sim","city-building","god game","strategy","RTS","turn-based strategy","tower defense","wargame","4X","flight / train / vehicle sim","virtual pet"], jp:"シミュレーション" },
  { en:"Sports", terms:["sports","soccer / football","baseball","basketball","tennis","golf","wrestling","boxing","hockey","fishing"], jp:"スポーツ" },
  { en:"Racing", terms:["racing","kart racer","sim racing","arcade racer","off-road","driving"], jp:"レース" },
  { en:"Puzzle", terms:["puzzle","falling-block","match-3","maze","nonogram / picross","pinball","block breaker"], jp:"パズル" },
  { en:"Music / Rhythm", terms:["rhythm","music","dance","karaoke"], jp:"音楽" },
  { en:"Table / Board", terms:["mahjong","shogi","go","chess","card game","casino / gambling","quiz","board game","pachinko"], jp:"テーブル" },
  { en:"Horror", terms:["horror","survival horror","psychological horror"], jp:"ホラー" },
  { en:"Adult (18+)", terms:["eroge","hentai","ecchi"], jp:"アダルト" },
  { en:"Other", terms:["sci-fi","fantasy","party","arcade","educational","and anything not listed above"], jp:"その他" },
];

/* 状態表記。GENRE_GUIDE と同じ形（en / terms / jp）で持つ ―― 描画側を1本の
   テンプレートで共用するため。こちらも DATA とは無関係の静的な用語集。
   ★棚札ではなく「値札・商品説明に出る語」。札として白く浮かせる見え方は共通でよい
     （店頭で現物と照合する語という点は同じ）ため .genre-jp をそのまま使う。 */
const CONDITION_GUIDE = [
  {en:'Rank B — visible wear', terms:['case or manual damage','plays fine, nothing missing'], jp:'ランクB'},
  {en:'Junk — as-is', terms:['no returns','not guaranteed to work'], jp:'ジャンク'},
  {en:'Unopened', terms:['sealed','shrink wrap intact'], jp:'未開封品'},
  {en:'Near-mint (used)', terms:['opened but like new','little to no wear'], jp:'美品'},
  {en:'With obi strip', terms:['original obi band included'], jp:'帯付き'}
];

const genreEl=$('#genre-modal'), genreClose=$('#genre-close');

/* 読み込み時に1回だけ組む。esc() を通すのは、この表がいずれ手で編集されるため
   （& や ' を含む語が既にある。生で入れると次に足した語で壊れる）。 */
// 行の組み方は2つの表で同一。片方だけ直して食い違うのを防ぐため、テンプレートは1本にする。
const guideRow = g=>`<div class="genre-row">
    <div class="genre-main">
      <h3 class="genre-en">${esc(g.en)}</h3>
      <div class="genre-tag-h"><span class="genre-jp-h">${esc(g.jp)}</span></div>
      <div class="genre-terms">${g.terms.map(t=>`<span>${esc(t)}</span>`).join('')}</div>
    </div>
    <div class="genre-tags">
      <div class="genre-tag"><span class="genre-jp">${esc(g.jp)}</span></div>
    </div>
  </div>`;

// 2026-10-29（boot-chunks）: 本体の起動で作らず、開いたとき（か、起動の後の空き時間）に作る。中身は同じ。
let genreBuilt=false;
function genreBuild(){ if(genreBuilt) return; genreBuilt=true;
$('#genre-modal-body').innerHTML =
  `<p class="genre-intro">Find your genre in English, then look for the Japanese shelf tag <b>&rarr;</b>.
   Disc-era shelves are usually split by genre, not by kana.</p>` +
  GENRE_GUIDE.map(guideRow).join('') +
  `<h3 class="genre-section-h">Condition terms<span class="jp">状態表記</span></h3>` +
  // 5項目を「ゲームの5段階評価」と読ませないための一文（2026-09-11・ノート 2026-08-03 続き6 の未解決#2）。
  // ★出典 suruga-ya.jp/man/customer_guide/used_item_policy.html を 2026-09-11 に取り直して節の帰属を再確認した:
  //   未開封品・帯付き・美品＝冒頭「コンディション表記について」、ジャンク＝冒頭の共通記述。
  //   ランクＢは冒頭に「ランクB（状態難あり）」として出て、書籍・CD/DVD・ゲームソフト・フィギュア等の各節に個別の定義がある
  //   ＝ゲームソフト専用のラベルではない。ゲームソフト節が定める表記が5項目のうちランクＢだけ、というのが正確。
  `<p class="genre-intro">These are Suruga-ya listing labels used across all item types, not a grading scale for games&nbsp;&mdash; of the five, only <b>Rank B</b> has a game-specific definition (worn, but complete and plays fine).</p>` +
  CONDITION_GUIDE.map(guideRow).join('');
}
(window.requestIdleCallback || (f=>setTimeout(f, 3000)))(genreBuild);
function genreShow(){
  genreBuild();
  genreEl.classList.add('on');
  document.body.style.overflow='hidden';   // 背後が動くと、閉じた後どこにいたか分からなくなる
  genreClose.focus();
}
function genreHide(){
  genreEl.classList.remove('on');
  document.body.style.overflow='';
}
genreClose.addEventListener('click', genreHide);
// 背景（オーバーレイ）のクリックで閉じる。中身(.genre-in)の上のクリックは拾わない。
genreEl.addEventListener('click', e=>{ if(e.target===genreEl) genreHide(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && genreEl.classList.contains('on')) genreHide(); });
// カード上のリンク。行は見ていない（今は器を開くだけで、行ごとの中身が無いため）。
results.addEventListener('click', e=>{
  if(e.target.closest('.genre-link')) genreShow();
});

// URLクエリ ?q= から検索語を復元する。X等の外部SNSからの共有リンクで
// 型番やタイトルを渡す用途（例: gamekataban.com/?q=SLPS-02040）。
try{
  const urlQ = new URLSearchParams(location.search).get('q');
  if(urlQ){ q.value = urlQ; }
}catch(e){}

let t; q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(run,90);});
q.addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.isComposing){ clearTimeout(t); run({deep:true}); } });   // Enter は待たずに探し直しと案内まで
// 0件の案内のボタン（2026-10-12）: 短くした語で検索し直す／押したときだけ楽天でバーコードを確かめる
results.addEventListener('click', e=>{
  const b = e.target.closest('[data-try],[data-janfb]'); if(!b) return;
  if(b.dataset.try){ q.value = b.dataset.try; run({deep:true}); logSearch(); q.focus(); }
  else { b.disabled = true; janFallback(b.dataset.janfb); }
});
let tLog; q.addEventListener('input',()=>{clearTimeout(tLog);tLog=setTimeout(logSearch,1200);});
plat.addEventListener('change',run);
year.addEventListener('change',run);
// pub は hidden input（タイプアヘッドが pubSelect→run() を直接呼ぶ）ので change 監視は不要。
setLoc(locRead(), true);   // 起動時の状態復元（URL>localStorage>out）。skipSave=保存を書き戻さない
run({deep: !!q.value.trim()});   // /?q= 付きで開いたときは待たずに探し直しと案内まで

// ============================================================
// Barcode scanner (camera). JAN(バーコード) -> showByJan.
// 棚で「抜いた1本を確定 -> 価格へ」。データ側は row[10]=JAN(13桁, 実測でレトロ機ほぼ100%)。
// ヒット行は既存の card() でそのまま描画する(新しい詳細画面は作らない)。
//
// Android/Chrome : ネイティブ BarcodeDetector(速い、外部読み込みなし = 1ファイル完結を保つ)。
// iOS/Safari     : BarcodeDetector 非対応(WebKit未実装, 2026時点)。ZXing-js を動的に読み込む。
//                  ここで「1ファイル完結」は崩れる。崩す価値がある(バーコードは実際に読める)。
//                  ★2026-09-28: jsDelivr から直接ではなく、同じサイトの /vendor/zxing/ から読む
//                    （sw.js が事前キャッシュする＝圏外の店内でも読める）。版と出典は vendor/zxing/README.txt。
//                  ※このフォールバック経路は実機(iPhone)での検証がまだ。要・通しテスト。
// どちらの経路も最後は onDetected(text) に集約。手入力欄も同じ入口に落ちる(PC/検証用)。
// ============================================================
const JANMAP = KB_PRE ? KB_PRE.JANMAP : {};
if(!KB_PRE) for(const r of DATA){ const j=r[10]; if(j){ (JANMAP[j]||(JANMAP[j]=[])).push(r); } }

// JANでヒット行を引いて既存の描画に流す。見つからなければ正直に「無い」と出す(嘘の行に飛ばさない)。
function showByJan(raw){
  const jan=(raw||'').replace(/\D/g,'');   // 数字以外を落とす(スキャナ/入力の余計な文字対策)
  const rows=JANMAP[jan];
  if(rows && rows.length){
    q.value=''; plat.value='All'; pubReset(); year.value='All';
    cardMatch='barcode'; cardMatchJan=jan;   // 札「Barcode match」・複数版の注意は外す（card()）
    current=rows; shown=Math.min(MAX,rows.length); paint();
    scrollToResult();
    lastScanHit=true;
    return true;
  }
  current=[]; shown=0; more.innerHTML=''; count.textContent=''; paintDupeNote();
  lastScanHit=false;
  // 2026-10-19: 商品の JAN ではない番号（チェックディジットが合わない・20〜29 で始まる店内コード・数字以外が混ざる）は
  // 店の値札のバーコードとみなし、楽天には送らない（送ると無関係の商品名から別のゲームを当ててしまう＝実測で手帳→Golf）。
  if(!isProductJan(raw)){
    // 手入力（scanManual）で合わないときは打ち間違いの方が多いので、値札とは言わない。
    results.innerHTML = scanMethod==='manual'
      ? '<div class="state"><b>'+esc(String(raw||'').trim())+'</b>'
        +'That isn\'t a valid product barcode number. Check the 13 digits under the barcode on the back of the box '
        +'— or type the product code printed on the box or cartridge.</div>'
      : '<div class="state"><b>Scanned '+esc(String(raw||'').trim())+'</b>'
        +'This is the shop\'s own price-tag barcode, not the game\'s. '
        +'<b>Scan the barcode on the back of the box</b> — or type the product code printed on the box or cartridge.</div>';
    return false;
  }
  results.innerHTML='<div class="state"><b>Scanned '+esc(jan)+'</b>'
    +'This barcode isn\'t in our catalog — many games we list have no barcode on record. '
    +'<b>Search by the product code</b> printed on the box, cartridge or disc '
    +'(e.g. <span style="font-family:monospace">SLPS-</span>, '
    +'<span style="font-family:monospace">SHVC-</span>, '
    +'<span style="font-family:monospace">HAC-</span>) — type it in the scanner, or in the search box above.</div>';
  janFallback(jan);   // 2026-09-28: 楽天の商品名から作品を当てる（当たらなくても上の案内はそのまま残る）
  return false;
}

// 商品の JAN／UPC として正しい番号か（2026-10-19）。8・12・13桁でチェックディジットが合い、20〜29 で始まる店内コード（13桁）でないこと。
// 数字以外（空白・ハイフン以外）が混ざる読み取り（Code128 の値札など）は商品の番号ではない。
function isProductJan(raw){
  const s=String(raw||'').trim();
  if(/[^0-9\s-]/.test(s)) return false;
  const d=s.replace(/\D/g,'');
  if(!(d.length===8 || d.length===12 || d.length===13)) return false;
  if(d.length===13 && /^2/.test(d)) return false;
  let sum=0;
  for(let i=d.length-2, w=3; i>=0; i--, w=4-w) sum+=Number(d[i])*w;
  return (10-sum%10)%10===Number(d[d.length-1]);
}

// ============================================================
// JAN が DATA に無いときの補い（2026-09-28・jan-fallback）
// ★DATA の JAN 列は物理版の 38% しか埋まっていない（2026-09-28 実測）。外れた JAN で楽天を引き、
//   返ってきた商品名（最大10件）の中に DATA の題名がそのまま含まれているかを探して、作品を当てる。
// ★見せ方は3段階。誤った作品を「これです」と言わない:
//   確定（sure）… 2件以上の商品名が同じ作品を指し、かつ半分以上 →「Probably this game — check the box」
//   候補（maybe）… それ未満 →「Possible matches」最大3作品
//   見つからない（none）… 今までの案内だけ（機種の手がかりがある商品名なら、その名前も添える）
// ★実測（2026-09-28・本番のページの中で36件・15機種）: 確定 23件のうち別の作品は 0件（21件が正しい作品、2件が同じ作品の別の版）。
//   候補 12件（10件は1位が正しい作品、1件は3候補の中に正しい作品、1件は別の作品）、見つからない 1件。
// ★純粋な関数は JANFB_BEGIN〜JANFB_END の間だけに置く。本番のページで測るときにこの範囲を切り出して eval する。
// ============================================================
/* JANFB_BEGIN */
const JANFB_NOISE = /中古|新品|未開封|送料無料|箱説明書なし|表紙説明書なし|箱説なし|説明書なし|箱なし|ソフトのみ|ソフト単品|単品|video game|宅配便出荷|メール便OK|メール便|お取寄せ品|お取り寄せ|ネコポス|ゆうパケット|初回限定版|限定版|PlayStation the Best|the Best|ROMカートリッジ|ロムカセット|カートリッジ|ゲームソフト|ソフト|動作確認済み?|即納|あす楽/gi;
// 商品名から機種を推定する。順番が大事（PS2 を PS より先、GBA を GB より先）。値は DATA の row[2]。
const JANFB_PLAT = [
  ['Famicom', /\[FC\]|ファミコン|ファミリーコンピュータ|\bFC\b/],
  ['Super Famicom', /\[SFC\]|スーパーファミコン|\bSFC\b|スーファミ/],
  ['Game Boy Advance', /\[GBA\]|ゲームボーイアドバンス|\bGBA\b/],
  ['Game Boy', /\[GB\]|\bGBC?\b|ゲームボーイ(?!アドバンス)/],
  ['Mega Drive', /\[MD\]|メガドライブ|\bMD\b/],
  ['PC Engine', /\[PCE\]|PCエンジン|\bPCE\b|\bPCD\b|CDロムロム/],
  ['PlayStation 2', /\[PS2\]|\bPS2\b|プレイステーション2|PlayStation 2/],
  ['PSP', /\[PSP\]|\bPSP\b/],
  ['PlayStation', /\[PS\]|\bPS\b|プレイステーション(?!2)|PlayStation(?! ?[2-5])/],
  ['Sega Saturn', /\[SS\]|セガサターン|\bSS\b/],
  ['Nintendo 64', /\bN64\b|NINTENDO ?64|任天堂64|ニンテンドー64/i],
  ['Nintendo DS', /\[NDS\]|\[DS\]|【DS】|\bNDS\b|ニンテンドーDS/],
  ['Dreamcast', /\[DC\]|ドリームキャスト|\bDC\b/],
  ['GameCube', /\[GC\]|ゲームキューブ|\bGC\b/],
  ['Wii', /\[Wii\]|\bWii\b(?! ?U)/],
];
function janfbNorm(s){
  return String(s||'').normalize('NFKC').toLowerCase()
    .replace(/[\s・\-‐―ー〜～~:：!！?？,，.。/／&＆'’"“”()（）\[\]【】「」『』+＝=]/g,'');
}
function janfbClean(name){
  return String(name||'').normalize('NFKC').replace(/\(\d{8}\)/g,'').replace(JANFB_NOISE,' ')
    .replace(/【[^】]*】|\[[^\]]*\]/g,'');
}
function janfbPlatHint(name){
  const n=String(name||'').normalize('NFKC');
  for(const [p,rx] of JANFB_PLAT) if(rx.test(n)) return p;
  return null;
}
let _janfbIdx=null, _janfbIdxSrc=null;
function janfbIndex(rows){
  if(_janfbIdxSrc===rows && _janfbIdx) return _janfbIdx;
  _janfbIdx = rows.filter(r=>!r[12]).map(r=>({ tj:janfbNorm(r[1]), te:janfbNorm(r[0]), pf:r[2], key:r[2]+'\t'+r[1] }));
  _janfbIdxSrc = rows;
  return _janfbIdx;
}
const janfbBigram = s=>{ const b=new Set(); for(let i=0;i<s.length-1;i++) b.add(s.slice(i,i+2)); return b; };
// names: 楽天の商品名（最大10件）。rows: DATA。戻り値 {verdict:'sure'|'maybe'|'none', keys:[…], hint, votes, n}
function janfbMatch(names, rows){
  const idx=janfbIndex(rows), list=(names||[]).slice(0,10), votes=new Map(), hints=new Map();
  for(const nm of list){
    const hint=janfbPlatHint(nm), c=janfbNorm(janfbClean(nm));
    if(hint) hints.set(hint,(hints.get(hint)||0)+1);
    let best=0, keys=new Set();
    for(const t of idx){
      if(hint && t.pf!==hint) continue;
      let L=0;
      if(t.tj.length>=3 && c.includes(t.tj)) L=t.tj.length;
      if(t.te.length>=5 && c.includes(t.te)) L=Math.max(L,t.te.length);
      if(!L) continue;
      if(L>best){ best=L; keys=new Set([t.key]); } else if(L===best) keys.add(t.key);
    }
    if(keys.size===1){ const k=[...keys][0]; votes.set(k,(votes.get(k)||0)+1); }   // 同じ長さで2作品が並ぶ＝あいまい＝票にしない
  }
  const n=list.length, ranked=[...votes.entries()].sort((a,b)=>b[1]-a[1]);
  const hint=[...hints.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  if(ranked.length){
    const [k,v]=ranked[0];
    if(v>=2 && v/n>=0.5) return { verdict:'sure', keys:[k], hint, votes:v, n };
    return { verdict:'maybe', keys:ranked.slice(0,3).map(x=>x[0]), hint, votes:v, n };
  }
  // 題名がそのまま含まれない（表記ゆれ）。機種の手がかりがあるときだけ、似ている度合いで候補を出す。
  if(hint && list.length){
    const cb=janfbBigram(janfbNorm(janfbClean(list[0]))), sc=[];
    for(const t of idx){
      if(t.pf!==hint || t.tj.length<3) continue;
      const b=janfbBigram(t.tj); let hit=0; for(const x of b) if(cb.has(x)) hit++;
      const r=hit/b.size; if(r>=0.6) sc.push([r,t.key]);
    }
    sc.sort((a,b)=>b[0]-a[0]);
    const keys=[...new Set(sc.map(x=>x[1]))].slice(0,3);
    if(keys.length) return { verdict:'maybe', keys, hint, votes:0, n };
  }
  return { verdict:'none', keys:[], hint, votes:0, n };
}
/* JANFB_END */

// 当てた作品の行。確定のときは、同じ機種で英題が同じ行（廉価版・再販など別の版）も一緒に出す。
function janfbRows(m){
  const out=[], seen=new Set();
  const add=r=>{ if(!seen.has(r)){ seen.add(r); out.push(r); } };
  for(const k of m.keys) for(const r of DATA) if(!r[12] && r[2]+'\t'+r[1]===k) add(r);
  if(m.verdict==='sure'){
    const base=out.slice();
    for(const b of base) if(b[0]) for(const r of DATA) if(!r[12] && r[2]===b[2] && r[0]===b[0]) add(r);
  }
  return out.slice(0,6);
}
// GA4 に「DATA に無い JAN」を記録する（2026-09-28）。あとで DATA の JAN を補う候補にする（自動では補わない）。
// ★送るのは JAN（商品の番号）・楽天で見つかったか・判定・当てた行の型番だけ。個人に関するものは送らない。
// ★DATA に有る JAN（当たり）は送らない。privacy.html の Analytics の節と揃えること。
function janfbLog(jan, result, names, m){
  try{
    if(typeof gtag !== 'function') return;
    // 当てた作品は機種・和題・型番で残す（型番の無い作品もあるため、行を特定できるように3つとも）。
    let code='', title='', platform='';
    if(m && m.keys && m.keys[0]){
      const r=DATA.find(x=>!x[12] && x[2]+'\t'+x[1]===m.keys[0]);
      if(r){ code=(r[3]||'').split(';')[0].trim(); title=r[1]||''; platform=r[2]||''; }
    }
    gtag('event', 'jan_miss', { jan: String(jan), method: scanMethod, rakuten_hit: (names && names.length) ? 'yes' : 'no', result: result,
      matched_platform: platform, matched_title: title, matched_code: code });
  }catch(e){}
}
let janfbToken=0;
async function janFallback(jan){
  const tok=++janfbToken;
  if(!/^\d{8,13}$/.test(jan)) return 'invalid';
  if(typeof rakutenLookup!=='function' || navigator.onLine===false){ janfbLog(jan,'offline',[],null); return 'offline'; }
  const st=results.querySelector('.state');
  if(st) st.insertAdjacentHTML('beforeend','<p class="janfb-wait">Checking this barcode on Rakuten…</p>');
  try{ await rakutenLookup(jan); }catch(e){}
  if(tok!==janfbToken) return 'stale';                 // 待っている間に別の JAN を読んだ
  const names=(typeof _rakNames!=='undefined' && _rakNames.get(jan)) || [];
  const m=janfbMatch(names, DATA);
  janfbLog(jan, m.verdict, names, m);
  const wait=results.querySelector('.janfb-wait');
  if(m.verdict==='none'){
    // 機種の手がかりがある商品名だけ見せる（ゲーム以外の商品＝例: ビデオ は出さない）。
    if(wait) wait.outerHTML = (names.length && m.hint)
      ? `<p class="janfb-name">Rakuten lists this barcode as “${esc(names[0])}”, but we couldn't match it to a game in our catalog.</p>` : '';
    if(overlay.classList.contains('on')) scanMsg.textContent='Scanned '+jan+' — not in catalog. Type the product code from the box below.';
    return 'none';
  }
  const rows=janfbRows(m);
  if(!rows.length){ if(wait) wait.remove(); return 'none'; }
  cardMatch='guess'; cardMatchJan='';        // 札「Possible match」（card()）
  current=rows; shown=rows.length; paint();
  const head = m.verdict==='sure'
    ? `<b>Probably this game</b> — check the title and code on the box before you buy.`
    : `<b>Possible matches</b> — we're not sure. Compare the title with the box.`;
  results.insertAdjacentHTML('afterbegin', `<div class="janfb janfb-${m.verdict}" role="status">
      <p class="janfb-scan">Scanned <span class="janfb-jan">${esc(jan)}</span> — this barcode isn't in our catalog.</p>
      <p class="janfb-name">Rakuten lists it as “${esc(names[0]||'')}”.</p>
      <p class="janfb-head">${head}</p>
    </div>`);
  lastScanHit=true;                                    // 閉じたときに検索欄へフォーカスを移さない
  if(overlay.classList.contains('on')) closeScan();
  scrollToResult();
  return m.verdict;
}

const scanBtn=$('#scanBtn'), scanStart=$('#scanStart'), overlay=$('#scanOverlay'), video=$('#scanVideo'),
      scanMsg=$('#scanMsg'), scanClose=$('#scanClose'), scanJan=$('#scanJan'), scanGo=$('#scanGo'),
      scanCode=$('#scanCode'), scanCodeGo=$('#scanCodeGo');
let stream=null, detector=null, zxingReader=null, zxingFormats=null, rafId=0, closing=false;
// 直近のスキャン結果。null=まだ読んでいない / true=カタログに有り / false=無し。
// closeScan で false のときだけ検索欄にフォーカスを移す(外れた直後は型番手入力に進むため)。
let lastScanHit=null;
// GA4 の scan イベント（2026-10-13）。step＝open・camera_ok・camera_fail・decoder_fail・read。
// source＝button（検索ページのボタン）・url（/?scan=1 を直接）・article（/?scan=1 に /blog/ の記事から来た）。
// ★バーコードそのものは送らない（DATA に無いときだけ jan_miss が送る）。privacy.html の Analytics の節と揃えること。
let scanSource='button', scanMethod='camera';
function scanLog(step, extra){
  try{ if(typeof gtag==='function') gtag('event','scan',Object.assign({step:step, source:scanSource}, extra||{})); }catch(e){}
}

async function getDecoder(){
  if('BarcodeDetector' in window){
    if(!detector){
      let f=['ean_13','ean_8','upc_a','upc_e'];
      try{ const s=await BarcodeDetector.getSupportedFormats(); f=f.filter(x=>s.includes(x)); }catch(e){}
      detector=new BarcodeDetector({formats:f.length?f:['ean_13']});
    }
    return 'native';
  }
  if(!zxingReader){                        // iOS/Safari フォールバック(要・実機検証)
    scanMsg.textContent='Loading scanner…';
    // 2026-10-19: EAN/UPC だけを読む（店の値札の Code128 などを読まない）。DecodeHintType は zxing-browser が import している
    // 同じ zxing-library のファイルから取る（同じ URL＝同じモジュール。sw.js の PRECACHE_OPTIONAL にも入っている）。
    const [zx, zl]=await Promise.all([import('/vendor/zxing/zxing-browser-0.1.5.min.js'), import('/vendor/zxing/zxing-library-0.21.0.min.js')]);
    const F=zx.BarcodeFormat;
    zxingFormats=[F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E];
    zxingReader=new zx.BrowserMultiFormatReader(new Map([[zl.DecodeHintType.POSSIBLE_FORMATS, zxingFormats]]));
  }
  return 'zxing';
}

// 見つかれば true(呼び出し側がループを止める/閉じる)。見つからなければ false(スキャン継続)。
let lastMissJan='';   // 直前に外れた JAN。同じ値が毎フレーム来ても描き直さない（補いの表示が消えるため）
function onDetected(text){
  const j=String(text).replace(/\D/g,'');
  if(j && j===lastMissJan) return false;
  scanMethod='camera';
  const found=showByJan(text);
  scanLog('read',{method:'camera', hit_count: found ? current.length : 0});
  if(!found) lastMissJan=j;
  if(found){ closeScan(); }
  else if(!isProductJan(text)){ scanMsg.textContent='That\'s the shop\'s price-tag barcode — scan the barcode on the back of the box.'; }
  else { scanMsg.textContent='Scanned '+j+' — not in catalog. Type the product code from the box below.'; }
  return found;
}

// opts.defer: 画面だけ開いてカメラはまだ起動しない（/?scan=1 で開いた iPhone 用。タップで起動＝ユーザー操作の中で getUserMedia を呼ぶ）。
// クリックから呼ばれたときは opts がイベントになるが、defer を持たないので従来どおり即起動。
async function openScan(opts){
  overlay.classList.add('on'); scanMsg.textContent=''; closing=false; lastScanHit=null; lastMissJan='';
  scanStart.hidden=true;
  if(!(opts && opts.restart)){   // 「Start camera」から起動し直すときは open を数え直さない（source もそのまま）
    scanSource = (opts && opts.source) || 'button';
    scanLog('open');
  }
  if(opts && opts.defer===true){ scanStart.hidden=false; scanMsg.textContent='Tap “Start camera” to scan.'; return; }
  // 先行起動（DATA より前のスクリプト・window.__earlyScan）が開いたカメラを使う（2026-10-19）。二重に getUserMedia しない。
  const early = opts && opts.early;
  if(early){ early.adopted=true; early.stopped=true; if(early.detector && !detector) detector=early.detector; }
  try{
    if(early){
      stream = early.stream || await early.ready;
      if(!stream) throw (early.error || new Error('NotAllowedError'));
      if(video.srcObject!==stream) video.srcObject=stream;
      // もう映っていれば play() を待たない（4倍遅い CPU で約5秒、読み込み後の処理の後ろに並ばされていた・2026-10-19）
      if(video.paused) await video.play().catch(()=>{});
    } else {
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject=stream; await video.play();
    }
  }catch(e){ scanLog('camera_fail',{error:String((e&&e.name)||'unknown').slice(0,40)}); scanMsg.textContent='Camera unavailable — type the JAN below instead.'; if(opts && opts.fromUrl) scanStart.hidden=false; return; }
  let mode;
  try{ mode=await getDecoder(); }
  catch(e){ scanLog('decoder_fail',{error:String((e&&e.name)||'unknown').slice(0,40)}); scanMsg.textContent='Scanner failed to load — type the JAN below.'; return; }
  scanLog('camera_ok',{mode: mode==='native' ? 'native' : 'zxing'});
  scanMsg.textContent='Point at the barcode…';
  scanSettled();   // 2026-10-19（data-split）: 検索の索引づくりを始めてよい（カメラの引き継ぎが索引の区切りに割り込まれて遅れないように）
  // 先行起動のあいだに読めていた番号は、ここで照合する（当たればカードを出して閉じる）。
  if(early && early.code){ if(onDetected(early.code)) return; }
  if(mode==='native'){
    const tick=async()=>{
      if(closing) return;
      try{
        const codes=await detector.detect(video);
        if(codes && codes.length && onDetected(codes[0].rawValue)) return;  // 見つかったら停止
      }catch(e){}
      rafId=requestAnimationFrame(tick);
    };
    rafId=requestAnimationFrame(tick);
  } else {
    zxingReader.decodeFromVideoElement(video,(result)=>{
      if(closing) return;
      if(result && (!zxingFormats || zxingFormats.includes(result.getBarcodeFormat()))) onDetected(result.getText());
    }).catch(()=>{ scanMsg.textContent='Scan error — type the JAN below.'; });
  }
}

function closeScan(){
  closing=true;
  if(rafId){ cancelAnimationFrame(rafId); rafId=0; }
  try{ zxingReader && zxingReader.reset && zxingReader.reset(); }catch(e){}
  if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
  video.srcObject=null;
  overlay.classList.remove('on','miss');
  // 後回しにしていた検索ページを出す（/?scan=1）。結果を出して閉じたときは、隠れている間に効かなかった結果への移動をここでやり直す。
  const wasScanFirst = document.documentElement.classList.contains('scan-first');
  document.documentElement.classList.remove('scan-first');
  if(wasScanFirst){
    // 隠れていた間に測った帯（#locbar）の高さは 0。測り直させてから（resize で measureLocbar が走る）結果へ移る。
    try{ window.dispatchEvent(new Event('resize')); }catch(e){}
    // 隠れていた検索ページの高さが決まるのを待つ（2026-11-03: 測り直しの前に送ると 75px 手前で止まった）
    if(lastScanHit === true) requestAnimationFrame(()=>requestAnimationFrame(scrollToResult));
  }
  if(lastScanHit === false){ q.focus(); }   // 外れたときだけ。当たり(true)/未スキャン(null)は何もしない
}

scanBtn.addEventListener('click',openScan);
scanStart.addEventListener('click',()=>openScan({restart:true}));
// /?scan=1 で開いたらスキャナー画面を開く（記事の案内から来た人向け・2026-10-13）。iPhone/iPad はタップでカメラ起動、それ以外は即起動（失敗したら「Start camera」を出す）。
try{
  if(new URLSearchParams(location.search).get('scan')==='1'){
    const iOS=/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
    let src='url';
    try{ const r=new URL(document.referrer); if(r.origin===location.origin && r.pathname.startsWith('/blog/')) src='article'; }catch(e){}
    const E=window.__earlyScan;
    if(E && E.closed){ /* 準備中に閉じられた */ }
    else if(E && E.quick){   // 2026-10-19: 簡易カードが出ている（読み取り画面は閉じた）。同じ場所にふつうのカードを描く
      E.adopted=true; scanSource=src; scanLog('open'); scanMethod='camera';
      const found=showByJan(E.code);
      scanLog('read',{method:'camera', hit_count: found ? current.length : 0});
      lastScanHit = found;
      const qz=document.getElementById('scanQuick'); if(qz) qz.innerHTML='';
      overlay.classList.remove('quick');
      if(overlay.classList.contains('on')) closeScan();   // 読み取り画面を閉じてページを出す（結果へ移る）
    }
    else if(E && E.started){ openScan({early:E, fromUrl:true, source:src}); }   // 先行起動のカメラを引き継ぐ
    else { if(E) E.adopted=true; openScan(iOS ? {defer:true, source:src} : {fromUrl:true, source:src}); }
    // 本体の準備前に押された「Look up」「Search」を流す（2026-10-19）
    if(E && E.pendingCode){ scanCode.value=E.pendingCode; E.pendingCode=''; setTimeout(scanCodeSearch, 0); }
    else if(E && E.pendingJan){ scanJan.value=E.pendingJan; E.pendingJan=''; setTimeout(scanManual, 0); }
  }
}catch(e){}
scanClose.addEventListener('click',closeScan);
overlay.addEventListener('click',e=>{ if(e.target===overlay) closeScan(); });
function scanManual(){
  scanMethod='manual';
  const found=showByJan(scanJan.value);
  scanLog('read',{method:'manual', hit_count: found ? current.length : 0});
  if(found) closeScan();
  // 2026-10-19: 外れたときの案内を読み取り画面にも出す（結果の欄は画面の後ろに隠れている）。文言は onDetected と同じ。
  else if(!isProductJan(scanJan.value)) scanMsg.textContent='That isn\'t a valid product barcode number — check the 13 digits under the barcode on the back of the box.';
  else scanMsg.textContent='Scanned '+scanJan.value.replace(/\D/g,'')+' — not in catalog. Type the product code from the box below.';
}
scanGo.addEventListener('click',scanManual);
scanJan.addEventListener('keydown',e=>{ if(e.key==='Enter') scanManual(); });
// 型番で探す（2026-10-19）: 読み取り画面を閉じて、上の検索欄に入れて通常の検索を走らせる（型番の照合は検索と同じ）。
function scanCodeSearch(){
  const v=scanCode.value.trim();
  if(!v){ scanCode.focus(); return; }
  q.value=v; plat.value='All'; pubReset(); year.value='All';
  scanLog('read',{method:'code'});
  lastScanHit=true;            // 閉じたときに検索欄へフォーカスを移さない（キーボードを出さない）
  closeScan(); scanCode.value='';
  run();
  results.scrollIntoView({behavior:'smooth',block:'start'});
}
scanCodeGo.addEventListener('click',scanCodeSearch);
scanCode.addEventListener('keydown',e=>{ if(e.key==='Enter') scanCodeSearch(); });

// ============================================================
// 楽天 商品画像レイヤー(任意層:失敗しても本体は無傷)
// 見えたカードだけを、直列 1.6 秒間隔 + JAN キャッシュで叩く。
// 出品が無い / API が落ちている / 鍵が空 -> 何も出さない(エラーも出さない)。
// このブロックと paint() 内の attachRakutenSlots(results) と .rak-* の CSS、
// 計3か所を消せばレイヤーごと消える。
// ★2026-09-11: マイリストの着地コスト目安（mylistCostFill）も rakutenLookup() を直に呼ぶ＝4か所目。
//   あちらは typeof rakutenLookup で存在を確かめてから使うので、このブロックだけ消しても
//   マイリストは落ちない（合計の1枚が出なくなるだけ）。レイヤーを丸ごと外すなら
//   mylistJan / mylistCostBlock / mylistCostFill と mylistRender() 内の呼び出し、.mycost の CSS も併せて外すこと。
// ============================================================
const RAKUTEN = {
  appId:       '5b26b9e3-07e5-4cc0-9175-d7c4e2afab03',
  accessKey:   'pk_TAF4QdbMhi156br8XpNVH9nayFzeXN28CYsR4aimeWx',
  affiliateId: '55f1e07e.c5731293.55f1e07f.25bfdaee',
  endpoint: 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401',
};
const _rakCache = new Map();            // jan -> {img,url,name,price} | null(出品なしの null も覚える=再取得しない。通信の失敗は覚えない)
const _rakNames = new Map();            // jan -> 商品名の配列（最大10件）。JAN の補い（janFallback）が使う。取れなければ入れない
const _rakFailed = new Set();           // 通信や API の失敗で引けなかった jan。「出品なし」と書き分ける（店は電波が悪い）。成功すれば外す
const _rakInflight = new Map();         // jan -> 並んでいる・問い合わせ中の Promise。結果が出たら外す
let   _rakChain = Promise.resolve();    // 直列化 = レート制限(約1.6秒/回)を守る

// 中央値: 数値を昇順に並べ、奇数件なら真ん中の1つ、偶数件なら中央2つの平均。
// 空配列(0件・非200)は null = 中央値なし。楽天の返り順は当てにせず数値として並べ直す。
function _rakMedian(nums) {
  const s = nums.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function _rakFetch(jan) {
  const p = new URLSearchParams({
    applicationId: RAKUTEN.appId, accessKey: RAKUTEN.accessKey, affiliateId: RAKUTEN.affiliateId,
    keyword: jan, availability: '0', imageFlag: '1', hits: '30', sort: '+itemPrice', format: 'json',
  });
  let result = null, failed = false;
  try {
    const res = await fetch(`${RAKUTEN.endpoint}?${p}`);
    if (!res.ok) failed = true;
    if (res.ok) {
      const items = (await res.json())?.Items ?? [];
      _rakNames.set(jan, items.slice(0, 10).map(x => x?.Item?.itemName).filter(Boolean));
      // 画像・URL・価格に使う1件は「在庫あり(availability=1)の中の最安」。
      // availability:'0' で在庫切れ込みで取っているので、ここで在庫ありだけを選び直す。
      // sort:'+itemPrice' で安い順に並んでいる = 最初に見つかった在庫あり品が最安。
      // 在庫ありが1件も無ければ従来どおり全体の先頭(最安)にフォールバック。
      const item = (items.find(x => Number(x?.Item?.availability) === 1) ?? items[0])?.Item;
      // 返ってきた全件の itemPrice を数値化。空文字や欠損で NaN になったものは捨てる。
      const prices = items.map(x => Number(x?.Item?.itemPrice)).filter(Number.isFinite);
      // 中央値は返ってきた全件の itemPrice から(母集団は在庫切れ込み)。0件なら _rakMedian が null。
      const medianPrice = _rakMedian(prices);
      // 最安は全件の最小値。sort:'+itemPrice' で先頭が最安のはずだが数値として取り直す。0件なら null。
      const minPrice = prices.length ? Math.min(...prices) : null;
      // 楽天がホストする画像を URL で表示するだけ(複製・改変ではない)。実サイズだけ上げる。
      // _ex が無い URL が来ても replace は何もしない = そのまま通る(壊れない)。
      const raw = item?.mediumImageUrls?.[0]?.imageUrl;
      const img = raw ? raw.replace(/_ex=\d+x\d+/, '_ex=300x300') : null;
      if (item && img && item.affiliateUrl)
        result = { img, url: item.affiliateUrl, name: item.itemName, price: item.itemPrice, medianPrice, minPrice };
    }
  } catch (e) { failed = true; console.warn('rakuten', jan, e); }   // 失敗は握らず記録(罠#47)
  if (failed) { _rakFailed.add(jan); return null; }    // 覚えない = 次に開いたとき引き直す
  _rakFailed.delete(jan);
  _rakCache.set(jan, result);
  return result;
}

function rakutenLookup(jan) {                 // 直列 + 間隔をあけて叩く
  // キャッシュ済みは列に並ばせない。paint() は Load more のたびに全カードを作り直すので、
  // ここで短絡しないと既読の JAN が毎回 1.6 秒ずつ列を伸ばす。
  if (_rakCache.has(jan)) return Promise.resolve(_rakCache.get(jan));
  // 2026-11-03: 問い合わせの途中で paint() が描き直すと（索引の完成など）同じ JAN がもう1回並んでいた。途中のものに相乗りする。
  if (_rakInflight.has(jan)) return _rakInflight.get(jan);
  const task = _rakChain.then(() => _rakFetch(jan));
  const spacer = () => new Promise(r => setTimeout(r, 1600));
  _rakChain = task.then(spacer, spacer);      // 次の呼び出しは1.6秒後(この呼び出しは待たせない)
  const shared = task.finally(() => _rakInflight.delete(jan));   // 失敗でも外す = 再試行できる
  _rakInflight.set(jan, shared);
  return shared;
}

function attachRakutenImage(slotEl, jan) {
  if (!jan || !/^\d{13}$/.test(jan)) return;  // JAN 無し = 何も出さない(罠#27)
  const io = new IntersectionObserver((ents, obs) => {
    ents.forEach(async e => {
      if (!e.isIntersecting) return;
      obs.disconnect();                        // 1カード1回だけ = 見えたカードしか叩かない
      const hit = await rakutenLookup(jan);
      slotEl.classList.add('rak-done');        // 取っていた高さを返す
      if (!hit) return;                        // 生きた出品が無ければ何も出さない
      if (!slotEl.isConnected) return;         // 待っている間に paint() で捨てられたカードには書かない
      // API 由来の文字列は innerHTML に流さない(URL 内の引用符で属性を割られる)。DOM で組む。
      const a = document.createElement('a');
      a.href = hit.url; a.target = '_blank'; a.rel = 'sponsored nofollow noopener';
      a.className = 'rak-img';
      const img = document.createElement('img');
      img.src = hit.img; img.alt = ''; img.loading = 'lazy';
      const cap = document.createElement('span');
      cap.className = 'rak-cap';
      // 金額は「有限かつ正」だけを出す(0・負・NaN・null は出さない = 嘘の価格は出さない)。
      const money = v => { const n = Number(v); return (Number.isFinite(n) && n > 0) ? n : null; };
      const yen = n => `¥${Math.round(n).toLocaleString('ja-JP')}`;   // 小数は四捨五入
      // 行1(リンク内): いま買える1件の値段。リンク先が楽天だと文言で明示(規約側の要求)。
      // (PR) はこの行だけ = 広告リンクなのはこの行だけ(ステマ規制)。
      const now = money(hit.price);            // 在庫あり最安 = 画像に選んだ現物
      cap.textContent = now
        ? `Buy this one on Rakuten: ${yen(now)} (PR)`
        : 'See this listing on Rakuten (PR)';
      a.append(img, cap);                      // 画像は必ず affiliateUrl のリンクで包む
      // 行2(リンク外): 相場。広告ではないのでリンクも (PR) も付けない。
      // 中央値が取れない時は span 自体を作らない = 空の「Used on Rakuten:」を出さない。
      // minPrice は行2では使わない: 在庫切れ込みの最安は買えない値段で、
      // 行1(在庫あり最安)より安く並んで誤読を招くため(2026-07-31)。
      const mid = money(hit.medianPrice);      // 全件の中央値
      // ★2026-11-17（price-fx）: 海外モードは相場（中央値）だけを「目安」として出す。楽天の画像・「Buy this one on Rakuten」・「Ships within Japan only」は出さない
      //   （楽天は日本国内にしか送らず、海外の人には行き止まり。並んだ2つの値段のどちらを信じるか迷わせていた）。円の横にドル・ユーロの目安と、短い説明。
      //   国内モード（店モード）は下の今までどおり。
      if (LOC !== 'jp') {
        if (!mid) return;
        const mk = document.createElement('div');
        mk.className = 'rak-market rak-market-out';
        const line = document.createElement('span');
        line.className = 'rm-line';
        line.textContent = `Typical used price (Rakuten): ~${yen(mid)} ${fxApprox(mid)}`;
        const note = document.createElement('span');
        note.className = 'rm-note';
        note.textContent = `Median of used listings on Rakuten Japan \u2014 a guide for buying through Buyee. Shipping and fees are extra. $ / \u20ac at the ECB rate as of ${FX.label}.`;
        mk.append(line, note);
        slotEl.appendChild(mk);
        return;
      }
      // 2026-10-19: 「Typical used price (Rakuten)」と書き、広告（画像＋Buy this one）より先に出して別物に見せる。
      const market = mid ? `Typical used price (Rakuten): ~${yen(mid)}` : null;
      if (market) {
        const mk = document.createElement('span');
        mk.className = 'rak-market';
        mk.textContent = market;
        slotEl.appendChild(mk);                // <a> の外 = .rak-slot 直下
      }
      slotEl.appendChild(a);
      // 2026-11-17: 海外モードの「Ships within Japan only」（rak-ship）は、上で海外モードの楽天リンクごと出さなくなったので外した。
    });
  }, { rootMargin: '200px' });
  io.observe(slotEl);
}

// paint() から呼ばれる。まだ結線していないスロットだけ拾う。
function attachRakutenSlots(root) {
  root.querySelectorAll('.rak-slot[data-jan]:not([data-rak])').forEach(slot => {
    slot.setAttribute('data-rak', '1');
    attachRakutenImage(slot, slot.dataset.jan);
  });
}
// 2026-10-19（data-split）: 検索の索引は本体が動き終わってから区切って作る（読み取り画面・カードを先に出す）
buildSearchIndex();
