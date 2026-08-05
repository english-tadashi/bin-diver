#!/usr/bin/env python3
"""
MADB metadata301.ttl (+ Wikidataの英題) -> master.csv

型番(schema:productID)を持つゲームパッケージを抽出し、
発売元・機種・発売年・日本語名・英題とともにCSVへ出力する。

使い方:
    python3 build_master.py data/metadata301.ttl master.csv [英題.json] [発売元.json] [日本語タイトル.json]

第5引数の 日本語タイトル.json は {madb_id: カタカナ正規タイトル} のフラットなdict。
query.wikidata.org で P7886 の日本語ラベルを引いて作る（wikidata_ja.json）。
カタログ店（ブックオフ等）は箱の印字ではなくこの正規形で棚を持つため、
ラテンロゴのタイトルの検索が噛み合う。空の行は UI が title_ja に戻すだけ。

master.csv と同じ場所に data_line.js も出力する。
data_line.js は index.html の const DATA 行に貼り込むためのもの。
外部ファイルとして読み込ませてはいけない（file:// で CORS に阻まれ、
ダブルクリックで開けなくなる。リクエストも2回になる）。

第3引数のJSONは query.wikidata.org で以下を実行して落としたもの:

    SELECT DISTINCT ?madb ?enTitle
    WHERE {
      ?item wdt:P7886 ?madb .
      ?item rdfs:label ?enTitle .
      FILTER(LANG(?enTitle) = "en")
    }

注意: 同じM番号に複数の英題がぶら下がる場合がある（Wikidata側の重複）。
その行は英題を空欄にする。誤った英題を貼るより、無いほうがましである。
また、Wikidata の P7886 には誤りが混ざる（例: Shining Wisdom の項目に
シーバス・フィッシングのMADB IDが貼られている）。自動検出は不可能なので、
英題は「参考値」として扱うこと。日本語名・型番・発売元はMADB由来で信頼できる。
"""
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

# ---------------------------------------------------------------
# 「title_ja がラテン文字だけか」の判定（束1の転記に使う唯一の定義）
#
# ★この定義は _experiments/survey_missing_title_en_20260805.py（2026-08-05 の調査で
#   「束1＝2,676行」を出した実測）と**同じ1つの関数**である。あちらがこちらを import する。
#   逆向き（build がこちらから import）にしなかったのは、_experiments/ が .gitignore で
#   丸ごと除外されているため。使い捨ての実験フォルダに本番ビルドをぶら下げると、
#   フォルダを消した瞬間にビルドが動かなくなる。定義は追跡されている側に置く。
#   ―― 2つ書いて「同じはず」と信じる形にはしない（罠#141 と同じ理由。目視で揃えた
#   コピーは必ずズレる）。件数が動いたら、それは調査とビルドが別物になった合図。
#
# 判定は「日本語の文字が1つも無い」。ひらがな・カタカナ・漢字・半角カナ・全角空白の
# いずれも含まない行だけが真になる。ローマ数字（Ⅱ）や ×、ö のような非ASCIIは
# 日本語ではないので通る ―― 原文にそう書いてあるものを、そのまま複製するだけ。
#
# ★ main() 内の _script() とは別物。あちらは title_ja の**先頭1文字**だけを見て
#   字種の内訳を印字する統計用で、判定の粒度が違う。混ぜないこと。
# ---------------------------------------------------------------
_RE_ANY_JA = re.compile(r"[぀-ヿ一-鿿㐀-䶿ｦ-ﾟ　]")


def is_latin_only(title):
    """title_ja に日本語の文字が1つも無い＝すでにラテン文字だけで書かれている。"""
    return not _RE_ANY_JA.search(title)


# ---------------------------------------------------------------
# ローマ字変換（決定的・ヘボン式簡易）
# 入力は schema:name の @ja-hrkt 読み（カナ）。漢字タイトルの読みもカナで入っている。
# 読みはカナなのでローマ字は一意に決まる。漢字から読みを推測することは「しない」
# （誤読を生むより、読みが無い行はローマ字を空にする）。
# ---------------------------------------------------------------
_YOON = {
 'キャ':'kya','キュ':'kyu','キョ':'kyo','シャ':'sha','シュ':'shu','ショ':'sho','シェ':'she',
 'チャ':'cha','チュ':'chu','チョ':'cho','チェ':'che','ニャ':'nya','ニュ':'nyu','ニョ':'nyo',
 'ヒャ':'hya','ヒュ':'hyu','ヒョ':'hyo','ミャ':'mya','ミュ':'myu','ミョ':'myo',
 'リャ':'rya','リュ':'ryu','リョ':'ryo','ギャ':'gya','ギュ':'gyu','ギョ':'gyo',
 'ジャ':'ja','ジュ':'ju','ジョ':'jo','ジェ':'je','ビャ':'bya','ビュ':'byu','ビョ':'byo',
 'ピャ':'pya','ピュ':'pyu','ピョ':'pyo',
 'ティ':'ti','ディ':'di','トゥ':'tu','ドゥ':'du','テュ':'tyu','デュ':'dyu',
 'ファ':'fa','フィ':'fi','フェ':'fe','フォ':'fo','フュ':'fyu',
 'ウィ':'wi','ウェ':'we','ウォ':'wo','イェ':'ye',
 'ヴァ':'va','ヴィ':'vi','ヴェ':'ve','ヴォ':'vo','ヴュ':'vyu',
 'ツァ':'tsa','ツィ':'tsi','ツェ':'tse','ツォ':'tso','クァ':'kwa','グァ':'gwa',
}
_BASE = {
 'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o','カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
 'サ':'sa','シ':'shi','ス':'su','セ':'se','ソ':'so','タ':'ta','チ':'chi','ツ':'tsu','テ':'te','ト':'to',
 'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no','ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
 'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo','ヤ':'ya','ユ':'yu','ヨ':'yo',
 'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro','ワ':'wa','ヲ':'o','ン':'n',
 'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go','ザ':'za','ジ':'ji','ズ':'zu','ゼ':'ze','ゾ':'zo',
 'ダ':'da','ヂ':'ji','ヅ':'zu','デ':'de','ド':'do','バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
 'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po','ヴ':'vu','ヷ':'va',
}
_PUNC = {'、':',', '。':'.', '，':',', '．':'.', '・':' ', '　':' ',
         '「':'', '」':'', '『':'', '』':'', '〜':'-', '～':'-'}


def romaji(s):
    """カナ主体の読み文字列をローマ字へ。カナ以外（ラテン・数字）は素通り。"""
    s = ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in s)  # ひらがな→カタカナ
    out = []
    i = 0
    while i < len(s):
        two = s[i:i+2]
        c = s[i]
        if two in _YOON:
            out.append(_YOON[two]); i += 2; continue
        if c == 'ッ':                        # 促音: 次の子音を重ねる
            nr = _YOON.get(s[i+1:i+3]) or _BASE.get(s[i+1:i+2], '')
            if nr:
                out.append(nr[0])
            i += 1; continue
        if c == 'ー':                        # 長音: 直前の母音を伸ばす
            if out and out[-1] and out[-1][-1] in 'aiueo':
                out[-1] += out[-1][-1]
            i += 1; continue
        if c in _PUNC:
            out.append(_PUNC[c]); i += 1; continue
        out.append(_BASE.get(c, c)); i += 1  # 表に無い文字は素通り
    r = ''.join(out)
    r = re.sub(r'\s+([,.])', r'\1', r)        # " ," -> ","
    r = re.sub(r'\s+', ' ', r).strip()
    return r


# ---------------------------------------------------------------
# 五十音の初字（棚案内用）— @ja-hrkt 読みの先頭カナ → 清音カナ1文字
#
# 店（ブックオフ・駿河屋・スーパーポテト、実測 2026-07-19）は、読みの先頭文字で棚を分ける。
#   スーパーポテト = 一字（あ/い/う/え/お…）→ この清音カナをそのまま使う
#   ブックオフ・駿河屋 = 行（あ行・か行…）→ UIがこの一字を行に丸める（あ→あ行）
# だから「一字」で持つ。行しか持たないと一字の店に粗すぎる。
#
# 濁音・半濁音は清音に戻す（店の板は清音のみ: ガ→カ, パ→ハ, ジ→シ, ド→ト）。
# 小書きは大書きに（ァ→ア, ッ→ツ）。長音符・記号・空白が先頭なら剥がして次を見る。
# 先頭がカナでない/読みが無い行は空を返す（罠8: 推測を混ぜない。UIは行を出さない）。
# ラテン始まりも @ja-hrkt にカナ読みが入っていれば拾える（例: ATLAS→アトラス→ア）。
# 読みが無い/ラテンのまま等で拾えない行は空。誤った行に飛ばすより、無いほうがまし。
# ヴ は ウ に寄せる（vu≈う。低頻度。実際の分布はビルドのログで確認する — 罠30の思想）。
# ---------------------------------------------------------------
_SMALL_TO_LARGE = {
    'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ', 'ッ': 'ツ',
    'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ヮ': 'ワ', 'ヵ': 'カ', 'ヶ': 'ケ',
}
_DAKU_TO_SEION = {
    'ガ': 'カ', 'ギ': 'キ', 'グ': 'ク', 'ゲ': 'ケ', 'ゴ': 'コ',
    'ザ': 'サ', 'ジ': 'シ', 'ズ': 'ス', 'ゼ': 'セ', 'ゾ': 'ソ',
    'ダ': 'タ', 'ヂ': 'チ', 'ヅ': 'ツ', 'デ': 'テ', 'ド': 'ト',
    'バ': 'ハ', 'ビ': 'ヒ', 'ブ': 'フ', 'ベ': 'ヘ', 'ボ': 'ホ',
    'パ': 'ハ', 'ピ': 'ヒ', 'プ': 'フ', 'ペ': 'ヘ', 'ポ': 'ホ',
    'ヴ': 'ウ', 'ヷ': 'ワ', 'ヸ': 'イ', 'ヹ': 'エ', 'ヺ': 'ヲ',
}
_SEION = set('アイウエオカキクケコサシスセソタチツテトナニヌネノ'
             'ハヒフヘホマミムメモヤユヨラリルレロワヲン')
# 先頭に来たら剥がす: 空白・全角空白・中黒・各種括弧/引用符・長音符・ダッシュ・約物
_LEAD_STRIP = (' \u3000・「」『』【】〈〉《》()（）[]｢｣'
               '"\u201d\u201c\'`~〜～ー-—…!！?？.。,、:：;；')


def gojuon_initial(reading):
    """@ja-hrkt 読みの先頭カナ → 清音カナ1文字（棚案内の五十音・一字）。
    先頭がカナでない/読みが無い行は空（罠8: 推測を混ぜない）。"""
    s = ''.join(chr(ord(c) + 0x60) if 'ぁ' <= c <= 'ゖ' else c for c in reading)  # ひらがな→カタカナ
    s = s.lstrip(_LEAD_STRIP)
    if not s:
        return ""
    c = s[0]
    c = _SMALL_TO_LARGE.get(c, c)
    c = _DAKU_TO_SEION.get(c, c)
    return c if c in _SEION else ""


# ---------------------------------------------------------------
# @ja-latn（読みのラテン転写）→ 五十音初字  ★2026-07-24 追加
#
# schema:name は3値を持つ: 漢字/原題 ・ "…"@ja-hrkt ・ "…"@ja-latn。
# ラテン原題の行では @ja-hrkt もラテンのまま素通しになるので初字が取れない
# （row[11] が空の 7,243行がこれ）。だが @ja-latn は**そういう行でも読みを転写している**:
#     METAL GEAR SOLID 3 SNAKE EATER → 'Metaru gia soriddo 3 sneku ita'
#     AUBIRDFORCE                    → 'Obado fosu'
# ここから先頭1音を戻して初字にする。実測は _experiments/measure_jalatn_initial.txt。
#
# 逆引き表は**手書きしない**。上の _YOON / _BASE をそのまま反転して作る
# （手書きすると往路と復路が別の表になり、ずれても気づけない。罠#13）。
# 先に定義された綴りを採る＝ _YOON → _BASE の順（ja→ジャ, ji→ジ, zu→ズ, o→オ）。
#
# ★素通しガード（測定B）: @ja-latn の先頭トークンが schema:name の中に
#   トークンとして大小無視で現れる行は、**先頭が転写されず原語のまま残っている**。
#     'HD rimasuta okami zekei ban'（HDリマスター 大神 絶景版）の 'HD'
#     'FIRE EMBLEM fukasetsugetsu …' の 'FIRE'
#   この行は初字を入れない（空のまま）。誤った棚に案内するより、無いほうがまし（罠#27）。
#   ※このガードは正しい転写も巻き込む（Sega→セ, Kanon→カ は本当は正しい）。
#     巻き込みを承知で切る側に倒している＝棚案内で誤るコストのほうが高いため。
# ---------------------------------------------------------------
_ROMAJI_TO_KANA = {}
for _tbl in (_YOON, _BASE):
    for _kana, _rom in _tbl.items():
        _ROMAJI_TO_KANA.setdefault(_rom, _kana)
_ROMAJI_MAXLEN = max(len(_r) for _r in _ROMAJI_TO_KANA)
# 先頭から剥がす記号。romaji() と違い @ja-latn は外部の値なので、素直に前を掃除する。
_LATN_LEAD = " \t　.,-–—~〜…'\"`()[]{}!?:;/\\*&+#@"


def _kana_head_from_latn(latn):
    """ラテン転写の先頭 → カナ1字（濁音は残したまま）。導けなければ ""。"""
    s = (latn or "").lower().lstrip(_LATN_LEAD)
    for n in range(_ROMAJI_MAXLEN, 0, -1):
        head = s[:n]
        if head in _ROMAJI_TO_KANA:
            # 拗音は2文字（'fi'→'フィ'）。初字は必ず1字なので先頭だけ採る。
            c = _ROMAJI_TO_KANA[head][0]
            return _SMALL_TO_LARGE.get(c, c)
    return ""


def gojuon_initial_from_latn(latn, name):
    """@ja-latn と schema:name から五十音初字（清音カナ1字）。
    素通しの行・導けない行は "" を返す。清音への寄せは gojuon_initial() に任せる。"""
    s = (latn or "").lstrip(_LATN_LEAD)
    m = re.match(r"[^\s]+", s)
    if not m:
        return ""
    core = re.sub(r"[^A-Za-z0-9]", "", m.group(0))
    if not core:
        return ""
    # 素通しガード: 先頭トークンが原題にそのまま在るなら、転写されていない
    if core.lower() in {t.lower() for t in re.findall(r"[A-Za-z0-9]+", name or "")}:
        return ""
    kana = _kana_head_from_latn(latn)
    return gojuon_initial(kana) if kana else ""


def normalize_jan(gtins):
    """schema:gtin の値リスト → 13桁JAN（1つ）。カメラ（バーコード）の照合用。
    T始まりのTを落とし（例: T4959067977403）、13桁の数字だけ採用する。
    合致が無ければ空（GTIN-8 や 14桁GTIN-14 は照合に使わない）。表示は不問。"""
    for g in gtins:
        g2 = g[1:] if g[:1] == "T" else g
        if re.fullmatch(r"\d{13}", g2):
            return g2
    return ""


# ---------------------------------------------------------------
# 機種名テーブル: MADBの生値 -> 英語表示名
# 生値はCSVに残す。英語名は「表示用の別列」として持つ。
# 前回のパイプラインは生値を英語で上書きしてしまい、変換漏れが
# そのままUIに出た（ネオジオCD 問題）。今回は両方を持つ。
# ---------------------------------------------------------------
PLATFORM_EN = {
    "プレイステーション": "PlayStation",
    "プレイステーション2": "PlayStation 2",
    "プレイステーション3": "PlayStation 3",
    "プレイステーション4": "PlayStation 4",
    "プレイステーション5": "PlayStation 5",
    "プレイステーション・ポータブル": "PSP",
    "プレイステーションVita": "PlayStation Vita",
    "プレイステーション Vita": "PlayStation Vita",
    "スーパーファミコン": "Super Famicom",
    "ファミリーコンピュータ": "Famicom",
    "PCエンジン": "PC Engine",
    "ニンテンドーDS": "Nintendo DS",
    "ニンテンドー3DS": "Nintendo 3DS",
    "ニンテンドーゲームキューブ": "GameCube",
    "ドリームキャスト": "Dreamcast",
    "セガサターン": "Sega Saturn",
    "ゲームボーイ": "Game Boy",
    "ゲームボーイアドバンス": "Game Boy Advance",
    "メガドライブ": "Mega Drive",
    "ワンダースワン": "WonderSwan",
    "ゲームギア": "Game Gear",
    "ネオジオCD": "Neo Geo CD",
    "ネオジオ": "Neo Geo",
    "ネオジオポケット": "Neo Geo Pocket",
    "バーチャルボーイ": "Virtual Boy",
    "SEGAマーク3": "Sega Mark III",
    "TVボーイ": "TV Boy",
    "Apple (deprecated)": "Apple",
    "Atari PC (deprecated)": "Atari PC",
}

# ---------------------------------------------------------------
# Buyee の検索キーワード（実測 2026-07-18）
#
# 25機種を「有名タイトル + 機種名」2本ずつで実測した。0件だったのは
# ニンテンドーゲームキューブ だけ。落ちるのは「正式名称が通称より長い」
# 機種であり、他の24機種は正式名称がそのまま通称だった。
#
#   バイオハザード4 ニンテンドーゲームキューブ ->  0
#   バイオハザード4 ゲームキューブ             -> 22
#
# ★2026-07-26 訂正: 「同義語を解決しない」は言い過ぎだった。
# キーワード単体の件数を測ると プレイステーション3=38,725 / PS3=38,727 で
# 差が2件しかない（ヤフオク側で同義語展開が働いている）。
# ただし万能ではない:
#   ニンテンドーゲームキューブ 1,402 vs ゲームキューブ 7,578（0.19倍）
#   ニンテンドー3DS 35,485 vs 3DS 39,555（0.90倍）
# → 正しくは「一部の標準的な略称対にだけ働く。機種ごとに測る以外に知る方法がない」。
# なお 7/18 の「バイオハザード4 ニンテンドーゲームキューブ = 0件」は
# キーワードが死んでいたのではなく、1,402件の中にその題が無かっただけ。
# AND検索として一貫している。置換の判断は正しかったが、根拠の説明が違っていた。
# ---------------------------------------------------------------
BUYEE_KEYWORD = {
    "ニンテンドーゲームキューブ": "ゲームキューブ",
    # ★2026-07-26 追加。正式名 601件 / PSVita 23,226件（38倍）＝GameCube と同じ形。
    # ★MADB の生値は2表記ある（スペース有 2,353行 / 無 54行）。両方を書かないと
    #   片方が空のまま静かに残る。片方だけ書かないこと。
    "プレイステーション Vita": "PSVita",
    "プレイステーションVita": "PSVita",
    # ★2026-08-03 追加。MADB の生値は "Xbox 360"（スペース有）。
    # 実測はスペース無しの Xbox360 で行い、下記の件数はすべてその形での結果。
    # スペース有りの形は測っていないので、測った形をそのまま置く。
    "Xbox 360": "Xbox360",
}

# 実測して0件でないことを確認した機種だけ。未実測の機種にはリンクを出さない。
# 0件のリンクは、リンクが無いことより悪い（「探したが無かった」と嘘をつく）。
#
# ★2026-07-26: PS3 / PS Vita / 3DS を追加（計 7,252行・うち物理 3,710行）。
# 7/18の除外理由「現行機で、英語圏の収集家がこの道具を必要としない」は
# PS5 / Switch / Xbox One の3機種にしか当たっていなかった。
# PS3(2006) / Vita / 3DS / Xbox 360 / Xbox / Wii U / 64DD は生産終了機で、
# 除外を1つの束にしたときに、理由の届かないものが混ざっていた。
#
# 測定（キーワード単体・Buyee・2026-07-26）:
#   プレイステーション3 38,725 / PS3 38,727      → 正式名で通る。置換不要
#   ニンテンドー3DS 35,485 / 3DS 39,555          → 正式名で通る。置換不要
#   プレイステーションVita 601 / PSVita 23,226   → ★置換が必要
# タイトル試験（生URL）:
#   あなたの四騎姫教導譚      +正式名 0 / +PSVita 10
#   超次元アクション ネプテューヌU  +正式名 0 / +PSVita 26
#   METAL GEAR SOLID 4 …     +正式名 92 / +PS3 92
#   大戦略大東亜興亡史DX…     +正式名 21 / +3DS 24
# ★PS3 と 3DS のタイトル試験は n=1（他2本は行の側が使えなかった。
#   北米版混入 BLUS30264 と、タイトル単体で0件の amiiboセット）。
#   採用の根拠はキーワード単体の件数のほうであって、n=1のタイトル試験ではない。
#
# 未実測のまま残す＝リンクを出さない:
#   ★2026-08-03: 残っていた Xbox 360 144 / Xbox 82 / Wii U 20 / 64DD 6 を実測して
#     ここから外した（測定は下の BUYEE_OK 内コメント）。未実測は下の3機種だけになった。
#   ★2026-08-04: その Nintendo Switch 845 / PlayStation 5 258 / Xbox One 29（計1,132行）も
#     実測して外した（測定は下の BUYEE_OK 内コメント）。**未実測の機種はこれで0になった。**
#   Famicom の残り5行は -USA 型番の北米版混入（罠#16）で、row[7] とは別問題。
#   ここは触っていない ―― 機種の実測とは別の話なので、まとめて直さないこと。
# 機種として持たない: PC-8801 / Microsoft Windows。
#
# ---------------------------------------------------------------
# ★2026-08-03 測定（Xbox 360 / Xbox / Wii U / 64DD）
#
# 測り方: 実ブラウザのシークレットウィンドウで生URLを目視。
# curl / WebFetch / ヘッドレスChrome は AWS WAF に遮断されて測定できない
# （x-amzn-waf-action: challenge が返る）。ここを機械で測ろうとしないこと。
# なお通常ウィンドウでは、こちらが付けていない未知のクエリパラメータが
# 自動で付加され、検索キーワードが欠落する現象を観測した
# （原因未特定・シークレットウィンドウでは再現せず。付加される具体的な
#  パラメータ名は実測時のURLを見ること ―― ここには残さない）。
# 「0件だった」の前に、まずURLにキーワードが残っているかを見ること。
#
#   Xbox 360 (144行) → Xbox360 : BIOHAZARD 5 65件（1件目が目的物）/ GEARS OF WAR 3 36件
#   Xbox     ( 82行) → Xbox    : DOA3 95件 / Panzer Dragoon Orta 7件
#   Wii U    ( 20行) → Wii U   : マリオカート8 287件 / ベヨネッタ2 21件
#   64DD     (  6行) → 64DD    : 6行中4行が非0件
#
# ★Xbox と Wii U は他機種版の混入がある（Xbox に Xbox360/One 版、
#   Wii U にSwitch版）。それでも目的物は1ページ目に出るので合格とした。
#   マイナス検索での絞り込みは効かない ―― `-360 -One` を足しても 95→74件にしか
#   ならず、Buyee側が除外演算子を解釈していないと判る。ネオジオ（罠#87）と同型。
# ★64DD の残り2行（MARIO ARTIST ペイントスタジオ / ポリゴンスタジオ）は
#   キーワード付きでもタイトル単体でも0件。キーワードが悪いのではなく出品が
#   実在しない（罠#27）。機種としては通っているので 64DD は入れる。
#
# ---------------------------------------------------------------
# ★2026-08-04 測定（Nintendo Switch / PlayStation 5 / Xbox One）
#
# 測り方は上の 2026-08-03 と同じ（実ブラウザのシークレットウィンドウで生URLを目視）。
# チェックシートは `_experiments/buyee_switch_ps5_xboxone_check.md`、
# 実際に叩いたURLは `_experiments/buyee_switch_ps5_xboxone_urls_plain.txt`
# （どちらも _experiments/ なので履歴には残らない。数字だけここに残す）。
#
# 抽出: Switch 845行→30件 / PS5 258行→30件（どちらも seed=42）/ Xbox One 29行→全件。
# 検索キーは「platform_ja の生値 + タイトル」＝下の BUYEE_KEYWORD に置換を足さない形。
#   Nintendo Switch (845行) → Nintendo Switch : 30件を目視
#   プレイステーション5 (258行) → プレイステーション5 : 30件を目視
#   Xbox One ( 29行) → Xbox One : 29件（全件）を目視
#
# ★この3機種は buyee_kw（row[7]）が母数**全件で空**だったので、本番では全行が
#   index.html:1693 の kwBuyeeFallback（和名だけ）経路に入っていた。
#   今回入れるのは、そこへ機種名が前置されるようにする変更である。
# ★URLをブラウザで叩くときは、markdown プレビュー経由も**ターミナルの Cmd+クリックも**
#   使わないこと（罠#146・罠#147）。.txt から選択コピーしてアドレスバーに直接貼る。
#   `King's bounty Ⅱ` のようにタイトルに `'` を含む行は、ターミナル経由だと
#   シェルがそこでコマンドを切り、途中までのURLしか開かれない。
# ---------------------------------------------------------------
BUYEE_OK = {
    "プレイステーション", "プレイステーション2", "プレイステーション4",
    "プレイステーション・ポータブル", "スーパーファミコン", "ファミリーコンピュータ",
    "ニンテンドーゲームキューブ", "PCエンジン", "ニンテンドーDS", "ドリームキャスト",
    "セガサターン", "ゲームボーイアドバンス", "メガドライブ", "ゲームボーイ",
    "ワンダースワン", "NINTENDO 64", "3DO", "Wii", "ゲームギア", "ネオジオCD",
    "SEGAマーク3", "ネオジオ", "バーチャルボーイ", "ネオジオポケット", "PC-FX",
    # ★2026-07-26 追加（上のコメントの測定に基づく）。
    "プレイステーション3", "ニンテンドー3DS",
    "プレイステーション Vita", "プレイステーションVita",
    # ★2026-08-03 追加（同上）。この4つは BUYEE_LINK_ONLY にも入っている。
    "Xbox 360", "Xbox", "Wii U", "64DD",
    # ★2026-08-04 追加（同上）。row[7] を埋めるにはここに入れる必要がある
    # ―― buyee_keyword() が見ているのは BUYEE_OK であって BUYEE_LINK_ONLY ではない。
    # 収録範囲を広げないための細工は BUYEE_LINK_ONLY 側で行う（下の定義を見ること）。
    "Nintendo Switch", "プレイステーション5", "Xbox One",
}

# BUYEE_OK に入れたが、取り込み対象の機種としては足さないもの。
#
# KNOWN_PLATFORMS（取り込み対象）は PLATFORM_EN と BUYEE_OK の和で作っている。
# この4機種は PLATFORM_EN に無いので、BUYEE_OK に足すだけで
# 「型番の無い行」まで新たに取り込まれてしまう ―― 実測で 2,344行
# （Xbox 360 1,316 / Wii U 840 / Xbox 188 / 64DD 0。うち配信 1,096）。
# 今回測ったのは「キーワードが Buyee に通るか」だけであって、
# 収録範囲を広げるかどうかは別の判断。測っていない判断を、
# 測った判断の副作用として混ぜないために、ここで切り離す。
#
# ＝この4機種は「既に出ている 252行（型番あり）にリンクが付く」だけ。
# 収録範囲を広げると決めたときに、この集合から消せばそうなる。
#
# ★2026-08-04: Nintendo Switch と Xbox One を同じ理由で追加した。
# 実測で 1,001行（Switch 318 / Xbox One 683。うち配信を含む）が新規流入するところだった。
# ＝この2機種も「既に出ている 874行（Switch 845 + Xbox One 29）にリンクが付く」だけ。
#
# ★プレイステーション5 は**ここに入れない**。PLATFORM_EN に「プレイステーション5」が
# 既に在り、KNOWN_PLATFORMS は PLATFORM_EN との和で作るので、ここに足しても
# 引かれない＝新規流入は元から 0行。入れると「収録範囲から外す」という
# 効きもしない意図を書くことになり、次に読む人を誤らせる（上の「引くのは
# BUYEE_OK の側だけ」がまさにそれを言っている）。
# 3機種を1つの束として扱わないこと ―― 罠#99 の裏返しで、今度は**追加**の側で
# 束にすると、副作用の有無が違うものが混ざる。
BUYEE_LINK_ONLY = {"Xbox 360", "Xbox", "Wii U", "64DD", "Nintendo Switch", "Xbox One"}


def buyee_keyword(platform_ja):
    """Buyee の検索キーワード。未実測の機種と、機種が空の184行は空文字を返す。
    UI は「空ならリンクを出さない」だけを見ればよい（変換テーブルをUIに置かない）。"""
    if platform_ja not in BUYEE_OK:
        return ""
    return BUYEE_KEYWORD.get(platform_ja, platform_ja)


# 型番の誤記だけを直す。ここは MADB の生値をそのまま出すのが原則で、
# 「見て確かめた1件」だけを名指しで置く。パターン置換（`--` を `-` に畳む等）はしない
# ―― 二重ハイフンが正しい型番が将来出てきたときに、静かに壊すため。
#
# AGB--P-B9AJ は 2026-08-02 に index.html 側を手で直した（コミット d662ee0）。
# しかし build_master.py には入れていなかったので、再生成すれば元に戻る状態だった。
# 手で直したものは、必ずここにも書くこと。書かないと次の再生成で消える。
#
# DL--DOL-GMSJ-JPN（スーパーマリオサンシャイン / GameCube）は 2026-08-03 に追加した。
# MADB の metadata301.ttl の原文が既に `--`（1件のみ。同 TTL 内の `DL-DOL-` は 84件）。
# 配信版の接頭辞ではない ―― `DL-` は 90要素すべてで必ず `DOL-` を伴い単独使用は0、
# 当該行の online フラグは空、配信行(7,109件)は全行 product_code が空。単なる誤記である。
#
# 駿河屋の到達性はこの修正では変わらない。index.html の族検出は FAM_RE = /DL-+DOL-/ で
# ハイフン1本でも2本でも拾うため、修正前も修正後も同じ sgFam（JAN 4902370506068）に落ちる。
# 直るのは画面に出る型番の表記だけ。
#
# SHVC-ACMJ-JPN（機動武闘伝Gガンダム / スーパーファミコン・M726043）は 2026-08-04 に追加した。
# 上2件と違い、これは「ハイフンが1本多い」型ではなく **英字1文字の誤記**（3文字目 C/G）。
# MADB の同一レコードが productID を2つ持ち、その中で食い違っている:
#     "SHVC-ACMJ-JPN" と "SHVC-P-AGMJ（JPN)"   ← 4文字コードが ACMJ / AGMJ で不一致
# 任天堂の SFC 型番は `SHVC-P-XXXJ` と `SHVC-XXXJ-JPN` が同じ4文字を共有するので、
# 片方が誤記である。どちらが誤記かは机上では決まらないので、駿河屋で実測して決めた。
#
# 実測（2026-08-04・af_jump/UTM 無しの生URL・自己クリック回避）:
#     SHVC-ACMJ → 404 / 0件（HTML中に「ガンダム」の語が1度も出ない）
#     SHVC-AGMJ → 200 / 2件・2件とも「機動武闘伝Gガンダム スーパーファミコンソフト
#                 [発売日:1994/12/27][バンダイ]」（商品ID 167000882 / 167900502）
# ＝ AGMJ が実在の型番で、codes[0] の ACMJ が誤記。
#
# ★「壊れ方が同型でも直し方は同じとは限らない」（5606行の教訓）を踏まえ、直す前に
#   **直した先の形が実際に当たること**を先に測ってある。DL-DOL-GMSJ のように
#   「机上では正しいが 0件」になる形には直していない。
# ★値は外部からの推測ではない。MADB が同じレコード内に持っているもう一方の productID を
#   正規形（`-P-` 落とし・全角括弧の `（JPN)` を `-JPN` に）に揃えただけ（罠#141 に抵触しない）。
# ★codes[1] の "SHVC-P-AGMJ（JPN)" は触らない。開き括弧が全角だが codeKey は NFKC で吸収し、
#   駿河屋リンクは codes[0] しか見ないため無影響（2026-07-27 の全角括弧2件の調査どおり）。
#
# AHVC- / SHCV-（スーパーファミコン・7件）は 2026-08-04 に追加した。
# SFC の規格品番の接頭辞は SHVC で、この7件はその **並べ替え(SHCV) と1文字違い(AHVC)**。
#
# ★上の SHVC-ACMJ とは根拠の種類が違う。ACMJ は「同一レコードのもう一方の productID」から
#   取れた（レコード内で自己完結）。今回の7件は **どのレコードも productID を1つしか持たない**ので、
#   同じ手は使えない。代わりに以下を根拠にした。いずれも MADB の原文の中で完結しており、
#   外部サイトから値を持ってきてはいない（罠#141）。
#
#   (1) 同一 TTL の接頭辞分布（platform にスーパーファミコンを含むレコードの productID・計655件）:
#         SHVC 615 / DMG 16 / SVHC 6 / SHCV 5 / SFT 2 / AHVC 2 / DMJ 2 / CLV 1
#       AHVC- と SHCV- は **この7件で全部**（TTL 全体でも AHVC 2件 / SHCV 5件のみ）。
#   (2) 直した先の**書式**はすべて同 TTL に実在する:
#         SHVC-####-JPN 142件 / SHVC-P-#### 49件 / SHVC-P-####(JPN) 18件 /
#         SHVC-2文字（SHVC-T8, SHVC-TD, SHVC-TE, SHVC-TF, SHVC-TI, SHVC-TK, SHVC-TM,
#         SHVC-TQ, SHVC-TY …）多数。SHVC-T2 / SHVC-TO はこの T系列の欠番に収まる。
#   (3) **4文字（2文字）部分は一切触っていない。** 動かしたのは接頭辞だけで、
#       新しい文字を外から入れていない＝原文の正規形化に留まる。
#   (4) 直した先が実際に当たることを先に測ってある（下記）。
#
# ★念のため: 修正後の値（SHVC-ALIJ 等）は TTL のどこにも存在しない。つまり (1)〜(3) は
#   「同じ綴りが他所にある」という直接証拠ではなく、**接頭辞の分布と書式の一致**による正規形化。
#   だから (4) の実測を必須にしている。測らずに直すことはしない。
#
# 実測（2026-08-04・af_jump/UTM 無しの生URL・自己クリック回避）。左が当時の実送信値:
#     AHVC-ALIJ → 404/0件  |  SHVC-ALIJ → 200/1件「シムシティJr」[1996/07/25][イマジニア] 167001351
#     AHVC-AN5J → 404/0件  |  SHVC-AN5J → 200/1件「西陣パチンコ物語2」[1996/06/28][KSS]
#     SHCV-AYQJ → 404/0件  |  SHVC-AYQJ → 200/1件「商人よ、大志を抱け!!(ETC)」[1995/12/15][バンダイ] 167001219
#     SHCV-AEFJ → 404/0件  |  SHVC-AEFJ → 200/1件「エルファリア2」[1995/06/09][ハドソン] 167001032
#     SHCV-AKBJ → 404/0件  |  SHVC-AKBJ → 200/1件「スーパー競馬 2」[1995/05/19][アイマックス]
#     SHCV-T2   → 404/0件  |  SHVC-T2   → 200/3件（うち2件が目的の「スーパーテトリス2+BOMBLISS」
#                                        [1992/12/18][BPS] 167000215 と ランクB 版）
#     SHCV-TO   → 404/0件  |  SHVC-TO   → 200/9件（6番目に「オセロワールド」
#                                        [1992/04/05][ツクダオリジナル] 167000080）
# 発売日・発売元はいずれも DATA 側の値と一致する＝正しい商品に着地している。
#
# ★T2 / TO の2件はノイズ混じり（`TO` が "THE WAY TO WORLD YOUTH" 等の英字タイトルに
#   部分一致する）。それでも直す ―― 直す前は 404/0件で**到達手段が無い**のに対し、
#   直した後は件数内に必ず目的の商品が居る。「誤った値より無いほうがまし」（罠#27）は
#   0件と誤着地の比較であって、ここは 0件 と ノイズ混じりだが当たる の比較。後者が上。
#
# ★7件を1つずつ名指しで置く。`SHCV` → `SHVC` のパターン置換にはしない ―― 将来 SHCV が
#   正しい何かの接頭辞として現れたときに静かに壊すため（このブロック冒頭の原則どおり）。
#
# ★同じ TTL に `SVHC-` が6件ある（これも SHVC の並べ替えに見える）。**今回は触らない。**
#   未測定だからで、他意はない。測ってから足すこと。
#     → 2026-08-04 に測った。下の SVHC- 6件がそれ。上のこの一文は残す（測ってから足した記録）。
#
# SVHC-（スーパーファミコン・6件）は 2026-08-04 に追加した。SHVC の V と H の並べ替え。
# 根拠の作り方は上の AHVC-/SHCV- 7件と同一で、外部サイトから値は持ってきていない（罠#141）。
#
#   (1) 同一 TTL の接頭辞分布（platform にスーパーファミコンを含むレコードの productID・計655件）:
#         SHVC 615 / DMG 16 / SVHC 6 / SHCV 5 / SFT 2 / AHVC 2 / DMJ 2 / CLV 1
#       `SVHC-` は TTL 全体でもこの6件で全部。
#   (2) 直した先の**書式**はすべて同 TTL に実在する:
#         SHVC-####-JPN 145件（→ AONJ / AKMJ の2件がこの形）/
#         SHVC-2文字 約350件（SHVC-G3, SHVC-G8, SHVC-I2, SHVC-I7, SHVC-IA, SHVC-NA, SHVC-NJ,
#         SHVC-Z2, SHVC-ZE …）。IV / Z7 / G7 / NO はいずれもこの2文字系列の**欠番**に収まる。
#   (3) **4文字（2文字）部分は一切触っていない。** 動かしたのは接頭辞だけ。
#   (4) 直した先の6件は TTL のどこにも存在しない＝既存レコードとの衝突は無い。
#   (5) 直した先が実際に当たることを先に測ってある（下記）。
#
# 実測（2026-08-04・af_jump/UTM 無しの生URL・自己クリック回避）。左が当時の実送信値:
#     SVHC-AONJ → 404/0件  |  SHVC-AONJ → 200/3件（全件「ペブルビーチの波濤 new トーナメント
#                                        エディション」の状態違い）
#     SVHC-AKMJ → 404/0件  |  SHVC-AKMJ → 200/2件（「旧約・女神転生」と その箱説なし版）
#     SVHC-Z7   → 404/0件  |  SHVC-Z7   → 200/3件（全件「ドラッキーのAりーぐさっかー」の状態違い）
#     SVHC-NO   → 404/0件  |  SHVC-NO   → 200/4件（うち2件が「ナムコットオープン」。
#                                        残り2件は「糸井重里 バス釣りNo1」＝`No1` への部分一致ノイズ）
#     SVHC-IV   → 404/0件  |  SHVC-IV   → 200/59件（目的の「サンサーラナーガ2」は 49位・52位・59位）
#     SVHC-G7   → 404/0件  |  SHVC-G7   → 200/200件（目的の「GP-1」は 146位・165位）
#
# ★IV / G7 の2件は**到達はするが検索順位の下位に埋没する**。`IV` はローマ数字の4として
#   ファイナルファンタジー IV・イースIV・キャプテン翼IV 等に、`G7` は駿河屋側で広いトークンとして
#   拾われ、それぞれ 59件・200件に膨張する。1ページ24件なので IV は3ページ目・G7 は7ページ目で、
#   実用上は「リンクを踏んでもすぐには見つからない」。
#   ★それでも直す。直す前は 404/0件で**到達手段が無い**のに対し、直した後は件数内に必ず
#     目的の商品が居る（全ページを走査して順位まで確定させてある）。「誤った値より無いほうがまし」
#     （罠#27）は 0件と誤着地の比較であって、ここは 0件 と 埋没するが当たる の比較。後者が上。
#     上の SHCV-T2 / SHCV-TO で同じ判断をしており、そこと矛盾させない。
#   ★埋没の度合いは T2/TO（3件・9件）より一段悪い。将来 JAN 逃がし（index.html の SG_JAN）や
#     別の絞り込みで改善する余地はあるが、それは別件。ここでは接頭辞の誤記だけを直す。
# ★残り4件（AONJ / AKMJ / Z7 / NO）は上位が全部目的の商品で、素直に当たる。
#
# ★6件を1つずつ名指しで置く。`SVHC` → `SHVC` のパターン置換にはしない（このブロック冒頭の原則どおり）。
PRODUCT_CODE_TYPO = {
    "AGB--P-B9AJ": "AGB-P-B9AJ",
    "DL--DOL-GMSJ-JPN": "DL-DOL-GMSJ-JPN",
    "SHVC-ACMJ-JPN": "SHVC-AGMJ-JPN",
    "AHVC-ALIJ-JPN": "SHVC-ALIJ-JPN",        # シムシティジュニア
    "AHVC-P-AN5J": "SHVC-P-AN5J",            # 西陣パチンコ物語 2
    "SHCV-P-AYQJ(JPN)": "SHVC-P-AYQJ(JPN)",  # 商人よ、大志を抱け!!
    "SHCV-P-AEFJ(JPN)": "SHVC-P-AEFJ(JPN)",  # エルファリア2
    "SHCV-P-AKBJ(JPN)": "SHVC-P-AKBJ(JPN)",  # スーパー競馬 2
    "SHCV-T2": "SHVC-T2",                    # スーパーテトリス 2 +ボンブリス
    "SHCV-TO": "SHVC-TO",                    # オセロワールド
    "SVHC-AONJ-JPN": "SHVC-AONJ-JPN",        # ペブルビーチの波濤 NEW トーナメント・エディション
    "SVHC-AKMJ-JPN": "SHVC-AKMJ-JPN",        # 旧約・女神転生
    "SVHC-IV": "SHVC-IV",                    # サンサーラ・ナーガ 2（当たるが 49位・下位に埋没）
    "SVHC-Z7": "SHVC-Z7",                    # ドラッキーのAりーぐさっかー
    "SVHC-G7": "SHVC-G7",                    # GP-1（当たるが 146位・下位に埋没）
    "SVHC-NO": "SHVC-NO",                    # ナムコットオープン
}

# ---- title_ja_kana の誤連結を名指しで直す（2026-08-05・罠#114 の系統） ----
# `data/wikidata_ja.json` には、同じ madb_id に複数の日本語ラベルがぶら下がったとき、
# それを捨てずに `#` で連結した値が混ざっている（4通り・17行）。
# 例: 'ウイニングポスト2#Winning Post for ゲームボーイアドバンス'
#
# load_english_titles() は「1つに定まらないものは捨てる」を実装しているが、ja 側は
# その処理を生成スクリプト側でやる前提で素通しになっており、その生成スクリプトは repo に無い
# （BIN_DIVER_NOTES.md 4623行・罠#114）。つまり衝突除去がどこでも行われていない。
#
# ★捨てるのではなく**片側を採る**。捨てると title_ja_kana が空になり、検索語が title_ja に
#   落ちる。17行のうち7行は title_ja がラテン表記（'MONSTER HUNTER PORTABLE 2nd G' 等）で、
#   カタログ店はカナで棚を持つため、そこでカナを失うと噛み合わなくなる。
# ★採る値は**元の JSON に在った2つの文字列の一方**であって、外から持ってきた値ではない。
#   よって罠#141（外部からの推測値を DATA に書かない）には抵触しない。表記も一切いじらない。
#
# ★★ 採る側は値ごとに違う（前2つ・後2つ）。一律の規則で直そうとすると必ず壊れる。
#
# 判定根拠（全17行の1行ずつの照合は _experiments/kana_split_verification.txt）:
#   規則A（尾）  片側がもう片側の先頭に含まれるとき、はみ出した尾が行の題に在るか。
#   規則B（機種）側が機種名を名乗るなら、行の機種と一致していなければその側を落とす。
#   規則C（番号）側に在る作品番号が行の題に在るか。
#
# ★語の単純な突き合わせでは判定できない。片側がカナ・片側がラテンの組み合わせがあり
#   （'ウイニングポスト2' と 'Winning Post for …'）、語で比べると同じ語が字種違いのせいで
#   「片側にしかない語」に見える。実際それで Winning Post の5行を一度逆に判定した。
KANA_SPLIT_FIX = {
    # (1) 'ウイニングポスト2#Winning Post for ゲームボーイアドバンス' → 前を採る
    #     規則B: 後は「ゲームボーイアドバンス」を名乗るが、5行は PS1×4 / Saturn×1 → 後を落とす。
    #     規則C: 前だけが持つ「2」が5行すべての題に在る（title_en は5行とも 'Winning Post 2'）。
    #     ★後の実体は master に別行として在る（M745646 / GBA / 'ウイニングポスト for
    #       ゲームボーイアドバンス'）。その行の title_ja_kana は空＝本来そちらに付くべき値。
    "M719447": "ウイニングポスト2",   # Sega Saturn  T-7647G     Winning Post 2 ファイナル'97
    "M724794": "ウイニングポスト2",   # PlayStation  SLPS91082   Winning Post 2 プログラム'96
    "M725121": "ウイニングポスト2",   # PlayStation  SLPS 01020  Winning Post 2 ファイナル'97
    "M725539": "ウイニングポスト2",   # PlayStation  SLPS 00509  Winning Post 2 プログラム'96
    "M725709": "ウイニングポスト2",   # PlayStation  SLPS 00293  Winning Post2

    # (2) 'モンスターハンター ポータブル#モンスターハンター ポータブル 2nd G' → 後を採る
    #     規則A: 尾「2nd G」が9行すべての title_ja に在る。前は無印＝別の作品。
    #     規則C: 後だけが持つ「2」が9行すべての題に在る。title_en は9行とも
    #            'Monster Hunter Freedom Unite'（＝2nd G の海外版名）。
    #     ★9行とも元の値が同一（表記揺れは無い）ので、採る値も9行とも同じ1つ。
    #       箱の題は「ハンターポータブル」と詰まる行もあるが、title_ja_kana は箱の印字ではなく
    #       カタログ店の正規形なので、元の JSON の後側をそのまま採る（表記を寄せない）。
    "M720718": "モンスターハンター ポータブル 2nd G",  # PSP  08025      MONSTER HUNTER PORTABLE 2nd G
    "M720745": "モンスターハンター ポータブル 2nd G",  # PSP  ULJM08019  MONSTER HUNTER PORTABLE 2nd G
    "M720752": "モンスターハンター ポータブル 2nd G",  # PSP  ULJM05500  MONSTER HUNTER PORTABLE 2nd G
    "M757985": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンター ポータブル 2nd G
    "M758010": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンターポータブル 2nd G
    "M758011": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンターポータブル 2nd G
    "M758012": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンターポータブル 2nd G
    "M758019": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンターポータブル2ndG
    "M758020": "モンスターハンター ポータブル 2nd G",  # PSP  (型番なし)  モンスターハンターポータブル2ndG

    # (3) 'クイズ殿様の野望#クイズ殿様の野望（第1作）' → 前を採る
    #     ★この1件だけ性質が違う。前後は**同じ作品**で、違いは Wikidata の曖昧さ回避注記
    #       「（第1作）」だけ＝2作品の衝突ではなく同一作品の重複。
    #     規則A: 尾「（第1作）」は2行のどちらの題にも無い → 前。
    #     ★後を採っても index.html の dropCatalogParen が「（第1作）」を落とす（CAT_PAREN_OK に
    #       「第1作」が入っている）ので店に飛ぶ語は同じだが、後段の処理に依存しない前を持つ。
    #     ★M746728 の箱の題は「カプコンのクイズ殿様の野望」で、採る値は頭が落ちた短い形になる。
    "M746728": "クイズ殿様の野望",   # Mega Drive  (型番なし)  カプコンのクイズ殿様の野望
    "M747385": "クイズ殿様の野望",   # PC Engine   (型番なし)  クイズ 殿様の野望

    # (4) 'なつきクライシス#なつきクライシスバトル' → 後を採る
    #     規則A: 尾「バトル」が題に在る。後は title_ja と完全一致。
    #            前「なつきクライシス」は原作漫画の題＝別の作品（title_en の Battle にも対応しない）。
    "M752847": "なつきクライシスバトル",  # Super Famicom  (型番なし)  なつきクライシスバトル
}

# 発売元の誤字だけを直す。社名の歴史的変遷は「直さない」。
# スクウェア と スクウェア・エニックス は別会社であり、
# セガ・エンタープライゼス と セガ も別（2000年の商号変更）。
# 完集家にとってこの区別は情報であってノイズではない。
PUBLISHER_TYPO = {
    "エレクトロニクス・アーツ・スクウェア": "エレクトロニック・アーツ・スクウェア",
    "エレクトロニックアーツ・スクウェア": "エレクトロニック・アーツ・スクウェア",
    "エレクトロニック・アーツスクウェア": "エレクトロニック・アーツ・スクウェア",
}

# MADBの「発売当時の社名」→ 英語表記。
# Wikidataは現在の社名しか持たないため、歴史的な社名はここで補う。
# 一対一を厳守すること。複数の日本語名を同じ英語名に潰すと、
# セガ・エンタープライゼス(1995) と セガ(2001) の区別が消える。
PUBLISHER_EN = {
    "コナミ": "Konami",
    "セガ・エンタープライゼス": "Sega Enterprises",
    "ソニー・コンピュータエンタテインメント": "Sony Computer Entertainment",
    "バンダイナムコゲームス": "Bandai Namco Games",
    "光栄": "Koei",                      # コーエーの旧漢字社名
    "セガゲームス": "Sega Games",
    "アトラス": "Atlus",
    "エレクトロニック・アーツ・スクウェア": "Electronic Arts Square",
    "ビクター音楽産業": "Victor Musical Industries",
    "エス・エヌ・ケイ": "SNK",
    "NECインターチャネル": "NEC Interchannel",
    "NECアベニュー": "NEC Avenue",
    "ナグザット": "Naxat Soft",
    "ソード電算機システム": "Sord",
    "ポニー": "Pony",
    "ユービーアイソフト": "Ubisoft",
    "[ユービーアイソフト]": "Ubisoft",
    "大創産業": "Daiso Industries",       # 100円ショップのダイソー
    "ティーアンドイーソフト": "T&E Soft",
    "電波新聞社": "Dempa Shimbunsha",
    "トミー": "Tomy",
    "タカラトミー": "Takara Tomy",   # 2006年のタカラ+トミー合併。トミーとは別法人。
                                     # Wikidataは "Tomy" を返すが、それに従うと
                                     # トミー(1970-2006) と潰れる。上書きする。
    "アスミック": "Asmik",
    "マーベラスエンターテイメント": "Marvelous Entertainment",
    "マーベラスインタラクティブ": "Marvelous Interactive",
    "アクレイムジャパン": "Acclaim Japan",
    "コトブキシステム": "Kotobuki System",
    "キャリーラボ": "Carry Lab",
    "アクティブゲーミングメディア": "Active Gaming Media",
    "オーイズミ・アミュージオ": "Oizumi Amuzio",
    "メディアカイト": "Media Kite",
    "キッド": "KID",
}


# 英題の手書き補完。PUBLISHER_EN の英題版で、優先順位も同じ（手書き→Wikidata→空）。
#
# キーは **M番号**。PUBLISHER_EN は日本語社名がキーだが、英題はM番号でしか一意に指せない
# （同じ英題が複数作品にあり得るし、日本語タイトルは表記ゆれがある）。
#
# ここに入れてよいのは「1件ずつ目視で確かめた行」だけ。思いつきで足さない（罠#19:
# 測っていないものを事実として書かない）。
#
# 下の6件は 2026-07-20 の測定で全数が確定したもの ―― MADB の schema:description に
# 英語表記が書かれていたファミコン6行。description の一括取り込みは却下した
# （13行のために英題欄を自由記述で汚す経路を作らない）。人が見た分だけ手で入れる。
#
# 箱の印字の癖は、英語圏が自然に打つ・読む形へ直してある:
#   全部大文字 → Title Case（既存英題の98%がTitle Case。THE GAME OF LIFE. → The Game of Life）
#   末尾ピリオド → 落とす（箱の印字の癖であって英題の一部ではない）
#   全角ローマ数字 Ⅲ → 半角 III（既存の主流）
#   分かち書き CHAMPION SHIP → Championship
# 表示の一貫性のための正規化であり、検索の当たり方には影響しない（fold() が小文字化する）。
TITLE_EN = {
    "M877878": "The Game of Life",                    # RPG人生ゲーム
    "M878000": "Aces Iron Eagle III",                  # エイセス・アイアンイーグル3
    "M878005": "World Rally Championship",             # エキサイティングラリー
    "M878034": "A Week of Garfield",                   # ガーフィールドの一週間
    "M878152": "Star Wars: The Empire Strikes Back",   # スター・ウォーズ 帝国の逆襲
    "M878549": "The New Type",                         # 新人類
}


# 日本語の法人格
COMPANY_SUFFIX_JA = re.compile(r"^(株式会社|有限会社)\s*|\s*(株式会社|有限会社)$")

# 英語の法人格。"Ubisoft, Inc." のカンマは会社の区切りではなく法人格を繋ぐもの。
# これをカンマで割ると "Inc." という存在しない会社が生まれる（実際に生んだ）。
SUFFIX_ONLY = re.compile(r"^(inc|ltd|llc|corp|corporation|co|kk|k\.k)\.?$", re.I)
COMPANY_SUFFIX_EN = re.compile(
    r"[,\s]*\b(incorporated|corporation|inc|ltd|llc|corp|co)\.?\s*$", re.I
)


def strip_suffixes(name):
    name = COMPANY_SUFFIX_JA.sub("", name).strip()
    prev = None
    while prev != name:                    # "SQUARE CO., LTD." は2回剥がす必要がある
        prev = name
        name = COMPANY_SUFFIX_EN.sub("", name).strip()
    return re.sub(r"\s+", " ", name).strip(" ,、")


def clean_publisher(raw):
    """1つの発売元文字列を正規化して、社名のリストで返す。"""
    parts = re.split(r"[,、/／;；]", raw)

    # 法人格だけの断片は、直前の社名に戻す。
    # "Ubisoft" + "Inc." -> "Ubisoft, Inc." に復元してから剥がす。
    merged = []
    for p in parts:
        if p.strip() and SUFFIX_ONLY.match(p.strip()) and merged:
            merged[-1] = merged[-1] + ", " + p.strip()
        else:
            merged.append(p)

    out = []
    for part in merged:
        name = strip_suffixes(part.strip())
        name = PUBLISHER_TYPO.get(name, name)
        if name and not SUFFIX_ONLY.match(name):
            out.append(name)
    return out


def values(block, pred):
    """述語の値を取り出す。行頭のインデントでアンカーするのが必須。
    アンカーしないと 'ma:publisher' が 'schema:publisher' に部分一致する。"""
    m = re.search(
        r"\n\s+" + re.escape(pred) + r"\s+((?:\"[^\"]*\"(?:@[\w-]+)?[,;\s]*)+)", block
    )
    if not m:
        return []
    return re.findall(r'"([^"]+)"', m.group(1))


def first(block, pred):
    v = values(block, pred)
    return v[0] if v else ""


def load_publisher_en(path):
    """Wikidataの 日本語社名->英語社名。手書きテーブルが常に優先される。
    Wikidataは「現在の社名」しか持たないため、発売当時の社名は手書きで補う。"""
    wd = {}
    if path:
        for r in json.load(open(path, encoding="utf-8")):
            wd.setdefault(r["jaLabel"], r["enLabel"])
    return wd


def english_publisher(name, wd):
    if name in PUBLISHER_EN:      # 手書きが最優先
        return PUBLISHER_EN[name]
    if name in wd:
        return wd[name]
    if not re.search(r"[ぁ-んァ-ヶ一-龠]", name):  # 既にラテン文字なら素通り
        return name
    return ""                      # 訳が無いなら空。嘘の社名は書かない。


def load_english_titles(path):
    """M番号 -> 英題。1つに定まらないものは捨てる。"""
    raw = defaultdict(set)
    for r in json.load(open(path, encoding="utf-8")):
        raw[r["madb"]].add(r["enTitle"])
    clean = {k: next(iter(v)) for k, v in raw.items() if len(v) == 1}
    dropped = len(raw) - len(clean)
    print(f"英題テーブル         : {len(clean):,} 件（衝突により除外 {dropped:,} 件）")
    return clean


def load_ja_titles(path):
    """madb_id -> カタカナ正規タイトル（Wikidataの日本語ラベル）。
    英題(load_english_titles)と同じくM番号の直引き。
    カタログ店（ブックオフ等）は箱の印字ではなくこの正規形で棚を持つため、
    ラテンロゴのタイトル（例: METAL GEAR SOLID 3 SNAKE EATER）でも検索が噛み合う。
    形式は {madb_id: ja} のフラットなdict。同一madbidに複数の異なるjaが
    ぶら下がる行は生成時に除外済み（誤った値より、無いほうがまし）。"""
    if not path:
        return {}
    d = json.load(open(path, encoding="utf-8"))
    print(f"日本語タイトル表     : {len(d):,} 件")

    # ---- 誤連結（`A#B`）の名指し修正。上の KANA_SPLIT_FIX を見ること ----
    # ★条件付きで当てる。当てるのは「今まさに `#` で連結されている値」だけ。
    #   JSON を作り直して衝突除去が入れば、その時点でこの表は自動的に効かなくなる
    #   （＝直った値を古い判断で上書きし続けない）。名指しの表を置きっぱなしにするときの
    #   いちばんの危険は「上流が直ったあとも古い値を焼き付ける」ことなので、そこを塞ぐ。
    applied, skipped, missing = 0, [], []
    for mid, correct in KANA_SPLIT_FIX.items():
        cur = d.get(mid)
        if cur is None:
            missing.append(mid)                       # 再取得で消えた/M番号が変わった
        elif "#" not in cur:
            skipped.append((mid, cur))                # 上流が直った or 別の値になった
        else:
            d[mid] = correct
            applied += 1
    print(f"カナ連結の名指し修正   : {applied}/{len(KANA_SPLIT_FIX)} 件")
    # 「入れたつもりで効いていない」を黙らせない（罠#16 の名指し除外と同じ思想）。
    for mid in missing:
        print(f"  ★ KANA_SPLIT_FIX: {mid} が wikidata_ja.json に無い（再取得で消えた?）")
    for mid, cur in skipped:
        print(f"  ★ KANA_SPLIT_FIX: {mid} は連結値でない（{cur!r}）。上書きしていない")
    return d


def canonical_case(names):
    """大文字小文字だけが違う綴りを、多数派に寄せる。
    HUDSON SOFT(48) は Hudson Soft(229) と同じ会社であり、
    別項目にすると完集家が48本を取りこぼす。"""
    tally = Counter(names)
    # 出現数が多い綴りを優先。同数なら全部大文字でないほうを選ぶ
    # （SIERRA ON-LINE と Sierra On-Line が1件ずつのとき、後者を残す）。
    order = sorted(tally.items(), key=lambda kv: (-kv[1], kv[0].isupper(), kv[0]))
    best = {}
    for name, _ in order:
        best.setdefault(name.lower(), name)
    return {n: best[n.lower()] for n in tally}


def main(ttl_path, out_path, wd_path=None, pub_path=None, ja_path=None):
    en_titles = load_english_titles(wd_path) if wd_path else {}
    ja_titles = load_ja_titles(ja_path)
    pub_wd = load_publisher_en(pub_path)

    with open(ttl_path, encoding="utf-8") as f:
        text = f.read()

    blocks = re.split(r"\n(?=<https://mediaarts-db)", text)
    packages = [b for b in blocks if "a class:GamePackage" in b]
    print(f"ゲームパッケージ総数 : {len(packages):,}")

    rows = []
    stats = Counter()
    unknown_platforms = Counter()

    # 取り込み対象の機種。新しい判断を足さない ―― 既にこのファイルが持っている
    # 集合を組み合わせるだけ。だから配信サービス(ゲームアーカイブス・PS Now)・
    # Switch・機種が空の行は、何も書かなくても自動的に外れる。
    # ★2026-08-03: BUYEE_LINK_ONLY を引くようになった。Xbox系・Wii U・64DD は
    # 「Buyeeリンクは出すが、収録範囲は広げない」機種で、以前と同じく
    # 型番のある行だけが残る（理由は BUYEE_LINK_ONLY の定義を見ること）。
    # 引くのは BUYEE_OK の側だけ。PLATFORM_EN に和名が入った機種は、
    # そのとき収録対象になったという意味なので、ここで消さない。
    KNOWN_PLATFORMS = set(PLATFORM_EN) | (set(BUYEE_OK) - BUYEE_LINK_ONLY)

    for b in packages:
        codes = values(b, "schema:productID")
        platform_ja = first(b, "schema:gamePlatform")
        # 残す条件: 型番がある、または 機種が対象集合に入る。
        # 以前は「型番が無ければ捨てる」だった。そのせいで MADB に実在するのに
        # 型番の無いゲーム(ポケモンダッシュ・リベレーションズの3DS版など)が
        # 丸ごと落ちていた ―― データが無いのではなく、持っていて捨てていた。
        # 型番はあるが機種が空の184行は「型番がある」ので残る(非対称は意図どおり。
        # 切っているのは機種の有無ではなく、ユーザーに返せる手がかりの有無)。
        if not codes and platform_ja not in KNOWN_PLATFORMS:
            continue
        stats["型番あり" if codes else "型番なし・対象機種"] += 1

        # 発売元: ma:publisher -> schema:publisher -> copyrightHolder の順に探す
        pubs = values(b, "ma:publisher")
        source = "ma:publisher"
        if not pubs:
            pubs = values(b, "schema:publisher")
            source = "schema:publisher"
        if not pubs:
            pubs = values(b, "schema:copyrightHolder")
            source = "copyrightHolder"
        if pubs:
            stats[f"発売元<-{source}"] += 1
        else:
            stats["発売元なし"] += 1

        names = []
        for p in pubs:
            names.extend(clean_publisher(p))
        # 重複を消しつつ順序を保つ
        names = list(dict.fromkeys(names))
        publisher = ";".join(names)
        # 英語名。訳が無い社は日本語のまま出す（空欄にすると行ごと消えてしまう）
        publisher_en = ";".join(english_publisher(n, pub_wd) or n for n in names)

        platform_en = PLATFORM_EN.get(platform_ja, platform_ja)
        if platform_ja and platform_ja not in PLATFORM_EN:
            unknown_platforms[platform_ja] += 1

        year = first(b, "schema:datePublished") or first(b, "ma:datePublished")
        year = (re.search(r"\d{4}", year).group(0)) if re.search(r"\d{4}", year) else ""

        madb_id = first(b, "schema:identifier")
        # ローマ字: schema:name の @ja-hrkt 読み(カナ)から決定的に生成。
        # 読みが無い行(全体の約3%)は空。漢字から読みを推測しない(誤読を避ける)。
        ym = re.search(r'"([^"]*)"@ja-hrkt', b)
        title_romaji = romaji(ym.group(1)) if ym else ""
        # 五十音初字: 同じ @ja-hrkt 生カナの先頭1文字から。棚案内(五十音)用。空の行もある。
        # 五十音初字: まず @ja-hrkt 読み(97%、決定的)。空なら Wikidataカタカナ題(41%)で補う。
        # ラテンタイトルは @ja-hrkt もラテンのまま=初字が取れないため、ここで CHRONO CROSS→ク 等を救う。
        # どちらも無ければ空(罠8: 憶測変換はしない。ラテンのまま置く方が、誤った行より良い)。
        # ★上書きしない。空のときだけ次の源に降りる（順序＝確からしい順）。
        kana_row = gojuon_initial(ym.group(1)) if ym else ""
        if not kana_row:
            kana_row = gojuon_initial(ja_titles.get(madb_id, ""))
        if not kana_row:
            # 第3の源: @ja-latn（読みのラテン転写）。素通しの行は空のまま返る。★2026-07-24
            yl = re.search(r'"([^"]*)"@ja-latn', b)
            if yl:
                kana_row = gojuon_initial_from_latn(yl.group(1), first(b, "schema:name"))
                if kana_row:
                    stats["五十音初字<-@ja-latn"] += 1
        # JAN: schema:gtin を13桁に正規化。カメラ(バーコード)の照合用。空の行もある。
        jan = normalize_jan(values(b, "schema:gtin"))
        # 配信版フラグ: ma:carrierType が「オンライン資料」なら1（バーチャルコンソール等）。
        # 棚に物が無いので、棚案内も店リンクも空振りする。行は消さない（検索の網羅を保つ）。
        # UI はこのフラグで DOWNLOAD バッジを出すだけ。
        #
        # 判定は carrierType 一本。mediaFormat("ダウンロードコンテンツ") や
        # additionalGenre("オンラインパッケージ") では 174件を取りこぼす（実測 2026-07-21:
        # A∪B∪C = |B| = 10,118、A∖B = C∖B = 0、B∖A = 171、B∖C = 3。carrierType が上位集合）。
        online = "1" if "オンライン資料" in values(b, "ma:carrierType") else ""
        rows.append(
            {
                "madb_id": madb_id,
                # 手書きが最優先。english_publisher() と同じ「手書き→Wikidata→空」の順序。
                "title_en": TITLE_EN.get(madb_id) or en_titles.get(madb_id, ""),
                "title_ja": first(b, "schema:name"),
                "platform_ja": platform_ja,
                "platform_en": platform_en,
                "product_code": ";".join(PRODUCT_CODE_TYPO.get(c, c) for c in codes),
                "year": year,
                "publisher": publisher,
                "publisher_en": publisher_en,
                "buyee_kw": buyee_keyword(platform_ja),
                # カタログ店用の日本語正規タイトル。空なら UI は title_ja に戻る。
                "title_ja_kana": ja_titles.get(madb_id, ""),
                # 読み(@ja-hrkt)由来のローマ字。主に検索用(HAY)。空の行もある。
                "title_romaji": title_romaji,
                # JAN(13桁, gtin由来)。カメラ用。row[10]。
                "jan": jan,
                # 五十音初字(清音カナ1字, 読み由来)。棚案内用。row[11]。
                "kana_row": kana_row,
                # 配信版フラグ(1/空)。UIのDOWNLOADバッジ用。row[12]。
                "online": online,
            }
        )

    # 英語名の綴りを多数派に統一してから書き出す
    case_map = canonical_case([p for r in rows for p in r["publisher_en"].split(";") if p])
    for r in rows:
        r["publisher_en"] = ";".join(
            case_map.get(p, p) for p in r["publisher_en"].split(";") if p
        )

    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    # index.html へ貼り込む DATA 行も同時に出力する。
    # これを別工程にすると、CSVだけ更新してJSが古いまま、という事故が起きる。
    # 8番目は「Buyee の検索キーワード」であって、機種名ではない。
    # 実測していない機種と、MADBに機種が無い184行は空文字。UIは空ならリンクを出さない。
    #
    # 旧コメントは「Buyee は同義語を解決するため変換してはいけない」と書いていた。
    # ファミコンとPSPの2件から一般化した誤りである。ニンテンドーゲームキューブは0件を返す。
    # 9番目(index 8)は「日本語正規タイトル」、10番目(index 9)は「ローマ字(読み由来)」。
    # 11番目(index 10)は「JAN(13桁)=カメラ用」、12番目(index 11)は「五十音初字=棚案内用」。
    # 既存の 0〜9 には触れないよう末尾に足す。card() は先頭7個しか分割代入しない。
    # swap_data.py の差分ガードは [0]〜[6] なので、末尾追加はそのまま通る。
    # 13番目(index 12)は「配信版フラグ」＝棚に物が無い行。UIのDOWNLOADバッジ用。
    # 既存の 0〜11 には触れないよう末尾に足す。
    #
    # ---- アプリ用の機種フィルタ（data_line.js だけに効かせる。master_final.csv=rows は素通し）----
    # 家庭用ゲーム機の35機種だけをアプリに出す。PC/DOS/Mac/クローン機/機種名なしは落とす。
    # master_final.csv は完全な記録として全機種を残す（check_disc.py / check_ps1.py がそれを使う）。
    # ホワイトリスト方式：MADB 更新で新PC機種が増えても、KEEP に足さない限り勝手に混ざらない。
    # 2026年版などに更新するときは、一度 master の機種一覧を件数付きで出し、KEEP を見直すこと。
    PLATFORM_RENAME = {
        "NINTENDO 64": "Nintendo 64",                     # 大文字表記を統一
        "Nintendo Entertainment System": "Famicom",       # 同一機なので寄せる
    }
    KEEP_PLATFORMS = {
        # Sony
        "PlayStation", "PlayStation 2", "PlayStation 3", "PlayStation 4", "PlayStation 5",
        "PSP", "PlayStation Vita",
        # Nintendo
        "Famicom", "Super Famicom", "Nintendo 64", "GameCube", "Wii", "Wii U",
        "Nintendo Switch", "Game Boy", "Game Boy Advance", "Nintendo DS", "Nintendo 3DS",
        "Virtual Boy", "64DD",
        # Sega
        "Mega Drive", "Sega Saturn", "Dreamcast", "Game Gear", "Sega Mark III",
        # NEC
        "PC Engine", "PC-FX",
        # SNK
        "Neo Geo", "Neo Geo CD", "Neo Geo Pocket",
        # その他
        "WonderSwan", "3DO",
        # Microsoft
        "Xbox", "Xbox 360", "Xbox One",
    }
    # ---- 罠#16 の名指し除外（data_line.js だけに効かせる。master_final.csv=rows は素通し）----
    # 上の KEEP_PLATFORMS は機種単位の一律フィルタで、ここは**行単位の名指し**。
    # 別の道具として分けてある ―― 機種や platform_ja で一律に落とすと、
    # 「Nintendo Entertainment System を丸ごと切る」＝将来 MADB が日本版を
    # この生値で登録したときに巻き込む。切るべきは機種ではなく、この5行だけ。
    #
    # 【この5行が何か】MADB が**北米版**の資料として登録している行。
    #   原典（data/metadata301.ttl）で5行すべてが
    #     ma:mediaFormat "Game Pak (Nintendo Entertainment System)"
    #     ma:seriesName  "Nintendo Entertainment System"
    #   を持ち、M727104 / M727504 は ma:locationPublished が "Redmond, WA"
    #   （＝任天堂 of America の所在地）。型番も全て `-USA` 接尾辞。
    #
    # 【なぜ日本版の棚に出てしまうか】schema:gamePlatform の生値が
    #   "Nintendo Entertainment System" で、上の PLATFORM_RENAME が
    #   「同一機なので寄せる」として Famicom に寄せるため。名寄せ自体は正しいが、
    #   北米版の行まで一緒に日本版の棚へ運んでしまう（罠#16）。
    #
    # 【なぜ型番を直すのではなく落とすのか】対応する**日本版の行は別途 master に在り、
    #   既に正しく出ている**。だから落としても日本のソフトが1本も減らない。
    #     M727104 SNS-F4-USA  … `SNS-` は北米SNESの接頭辞＝機種違いも重なる二重の誤り。
    #                            日本版は M726991 / Super Famicom / SHVC-F4（FINAL FANTASY 4）。
    #                            ゲームIDの `F4` が一致する同一ソフトの日米版。
    #     M727504 NES-MH-USA  … 本体同梱の2in1。日本未発売で、日本は2本別売り＝
    #                            M727790 HVC-SM（スーパーマリオブラザーズ）と
    #                            M727853 HVC-DH（ダックハント）が既に在る。
    #     M728043 NES-XV-USA  … 北米はバンダイ発売。日本版はナムコの
    #                            M727847 NXV-4900（XEVIOUS）が既に在る。
    #     M728046 NES-WH-USA  … 本体同梱の3in1。日本未発売＝対応する日本版が存在しない。
    #     M728047 NES-BS -USA … 北米版（原典の copyrightHolder は "©1987 LJN Toys, LTD."）。
    #                            型番文字列に空白が混入してもいる。日本未発売。
    #                            ★同名の M878432「メジャーリーグ」はアイレムの**別ゲーム**。
    #                              対応する日本版ではないので、突き合わせないこと。
    #
    # 【落とさないと何が起きるか】実測（_experiments/famicom_5rows_collision_check.txt）:
    #   カードは全行共通の固定文字列 `Match · Japan / NTSC-J` を出し、さらに
    #   `needs a Japanese Famicom: the 60-pin cartridge does not fit an NES.
    #    The game's text is Japanese.` と、この5行では**主張が丸ごと逆**の1文を出す
    #   （実物は NES の72ピンで日本のファミコンに挿さらず、中身は英語）。
    #   画面上に北米版だと読み取れる要素は無い。また "duck hunt" で検索すると
    #   結果2件が両方この北米版で、本物の日本版（HVC-DH）は英題を持たないため出ない。
    #
    # ★増やすときは1行ずつ、原典を見て理由を書くこと。パターン（`-USA` を含む等）で
    #   括らない ―― master 全体を走査すると `-USA` は他に M1104128（Game Boy /
    #   DMG-TR-USA / TETRIS）も持っており、そちらは platform_ja が「ゲームボーイ」で
    #   性質が違う（今回は対象外＝未判断のまま残す）。パターンで書くと、
    #   測っていない行まで一緒に消える。
    EXCLUDE_MADB_ID = {
        "M727104": "SNS-F4-USA  FINAL FANTASY 2 (北米SNES版。日本版=M726991 SHVC-F4)",
        "M727504": "NES-MH-USA  SUPER MARIO BROS. / DUCK HUNT (北米2in1。日本未発売)",
        "M728043": "NES-XV-USA  XEVIOUS (北米バンダイ版。日本版=M727847 NXV-4900)",
        "M728046": "NES-WH-USA  SUPER MARIO BROS / DUCK HUNT / WORLD CLASS TRACK MEET (北米3in1。日本未発売)",
        "M728047": "NES-BS -USA MAJOR LEAGUE BASEBALL (北米版。日本未発売)",
    }
    # 名指しの ID が master に無くなったら黙って0行除外になる。それを見えるようにする。
    _missing_exclude = sorted(set(EXCLUDE_MADB_ID) - {r["madb_id"] for r in rows})
    if _missing_exclude:
        print(f"★ EXCLUDE_MADB_ID に master へ現れない ID がある（MADB更新で消えた?）: {_missing_exclude}")

    # ---- アプリ用パブリッシャー名寄せ v2（data_line.js の row[6] だけ。rows=master は素通し）----
    # プルダウン/手入力を「短く・読める・絞れる」に。row[5](日本語)と master は一切触らない。
    # 処理順: ①掃除(全社) → ③名指し置換(casefold照合) → ②casefold自動集約(多数派表記, UPPER_FIX)。
    #   ③を②より先にやると、③の正規名(Title Case)が②の多数派判定に乗って安定する。
    # casefold 集約は「掃除後の綴りが完全一致」だけを束ねる＝同綴り＝同一社なので別会社は衝突しない。
    # 次回 MADB 更新: 新しい別ブランド/綴り違いは PUBLISHER_CANON に、全大文字残りは UPPER_FIX に追記。
    def _clean_pub(s):
        name = s.split(";")[0]                              # ; 連結は先頭社のみ
        name = re.sub(r"^©\s*(\d{4}\s*)?", "", name)        # ① 先頭の © を年のあるなし問わず除去
        name = name.replace("[", "").replace("]", "")       # ① 角括弧を外して中身にする
        return name.strip()

    # ③ casefold でも寄らない「別ブランド/綴り違い/語順」。旧v1の別綴り統合もここに含む。casefoldで照合。
    PUBLISHER_CANON = {
        # v1: 別綴り統合（casefold では寄らない）
        "Bandai Namco Games": "Bandai Namco", "Bandai Namco Entertainment": "Bandai Namco",
        "Namco": "Bandai Namco", "Bandai": "Bandai Namco", "Banpresto": "Bandai Namco",
        "Konami Digital Entertainment": "Konami",
        "Sega Enterprises": "Sega", "Sega Games": "Sega",
        "Koei": "Koei Tecmo", "Tecmo": "Koei Tecmo", "Koei Tecmo Games": "Koei Tecmo",
        "Sony Computer Entertainment": "Sony Interactive Entertainment",
        "Sony Computer Entertainment Japan": "Sony Interactive Entertainment",
        "Square": "Square Enix", "Enix": "Square Enix",
        "SNKプレイモア": "SNK", "プレイモア": "SNK", "Playmore": "SNK",
        "Spike": "Spike Chunsoft", "Chunsoft": "Spike Chunsoft",
        "Takara": "Takara Tomy", "Tomy": "Takara Tomy",
        "Marvelous Entertainment": "Marvelous", "Marvelous Interactive": "Marvelous",
        "マーベラスAQL": "Marvelous", "Marvelous AQL": "Marvelous",
        "Electronic Arts Square": "Electronic Arts", "Electronic Arts Victor": "Electronic Arts",
        # ③ v2 追加（シミュレーションで実在確認済みの綴り違い/別ブランド）
        "SQUARESOFT": "Square Enix", "SQUARE SOFT": "Square Enix", "Squaresoft": "Square Enix",
        "Square Electronic Arts L.L.C.": "Square Enix",
        "FROM SOFTWARE": "FromSoftware",       # 海外通用表記=1語
        "HUDSON": "Hudson Soft",               # 断片語
        "HOT・B": "Hot B",                      # 中黒→空白
        "WOLF TEAM": "Wolf Team", "WOLFTEAM": "Wolf Team",  # 海外通用表記=2語
        "SUNSOFT": "Sunsoft",
        "KANEKO": "Kaneko",
        # 例外: Idea Factory / Compile Heart は親子だが両方有名なので寄せない。
    }
    _CANON_CF = {k.casefold(): v for k, v in PUBLISHER_CANON.items()}

    # ② 自動集約で正規名が「全大文字」になる組だけ Title Case を明示（SNK/KID等の正しい全大文字は入れない）。
    UPPER_FIX = {
        "MILESTONE": "Milestone", "SAURUS": "Saurus", "KANEKO": "Kaneko",
    }

    # ①→③ を適用（②の集約前の名前を返す）
    def _step13(pub_en):
        n = _clean_pub(pub_en)
        return _CANON_CF.get(n.casefold(), n)               # ③/旧テーブル（casefold 照合）

    # パス1: KEEP機種の行だけを対象に、①③後の綴りを casefold グループで集計（多数派を決めるため）
    # ★除外行（罠#16）はここでも数えない。data_line.js に出ない行が綴りの多数決に
    #   票を入れているのは、見えないところで結果を動かす形になる。下の出力ループと
    #   同じ集合を見せて、母集団を1つに保つ。
    #   （実測: 除外の有無で他 37,850 行の [0]〜[12] は完全一致＝この5票は多数派を動かさない）
    _cf_counts = defaultdict(Counter)
    for r in rows:
        if r["madb_id"] in EXCLUDE_MADB_ID:
            continue
        plat = PLATFORM_RENAME.get(r["platform_en"], r["platform_en"])
        if plat not in KEEP_PLATFORMS:
            continue
        pe = r["publisher_en"]
        if not pe:
            continue
        nm = _step13(pe)
        if nm:
            _cf_counts[nm.casefold()][nm] += 1

    # casefold -> 正規名（件数最多の表記。全大文字は UPPER_FIX で Title Case、無ければ据え置き）
    _cf_canon = {}
    _upper_left = []
    for cf, spell in _cf_counts.items():
        canon = spell.most_common(1)[0][0]
        if canon == canon.upper() and canon != canon.lower():   # 英字を含む全大文字
            if canon in UPPER_FIX:
                canon = UPPER_FIX[canon]
            else:
                _upper_left.append((canon, sum(spell.values())))  # 洗い出し用（SNK等の正当な全大文字含む）
        _cf_canon[cf] = canon

    def _canon_pub_final(pub_en):
        if not pub_en:
            return pub_en
        nm = _step13(pub_en)
        return _cf_canon.get(nm.casefold(), nm)

    if _upper_left:
        print("パブリッシャー正規名(全大文字・UPPER_FIX外, 要確認): "
              + ", ".join(f"{n}×{c}" for n, c in sorted(_upper_left, key=lambda x: -x[1])[:20]))

    # ---- 束1: ラテン文字だけの title_ja を title_en へ転記（data_line.js だけ。rows=master は素通し）----
    # ★根拠: title_ja が既にラテン文字のみのため、title_en への転記は**外部からの推測値ではなく
    #   原文の複製**である（罠#141 に抵触しない）。MADB が持っている文字列を、同じレコードの
    #   別の列へ1文字も変えずに写しているだけで、外から値を持ってきていない。
    #   だから翻訳も整形もしない ―― 大文字小文字の直し、記号の正規化、綴りの統一、どれもやらない。
    #   『Final fantasy Ⅶ remake』は『Final fantasy Ⅶ remake』のまま入る。見栄えを整えた瞬間に
    #   「原文の複製」ではなくなり、罠#141 の側へ落ちる。整えたくなったら別の工程として立てること。
    #
    # 上書きはしない。title_en が既に入っている行（Wikidata 由来 / TITLE_EN の手書き）は素通し。
    # 転記が効くのは「空 かつ ラテンのみ」の行だけ＝英題が増える方向にしか動かない。
    #
    # master_final.csv を触らないのは、罠#16 の名指し除外・パブリッシャー名寄せ v2 と同じ理由。
    # master は MADB の完全な記録として保つ。アプリ向けの加工は data_line.js 側だけに効かせる。
    _latin_copied = 0
    data = []
    _excluded = []
    for r in rows:                                         # rows(=master) は変更しない。読むだけ。
        if r["madb_id"] in EXCLUDE_MADB_ID:                # 罠#16: 行単位の名指し除外（上の定義を見ること）
            _excluded.append(r["madb_id"])                 # 機種フィルタより先に見る＝理由を1つに保つ
            continue
        plat = PLATFORM_RENAME.get(r["platform_en"], r["platform_en"])   # 先に機種名寄せ
        if plat not in KEEP_PLATFORMS:                     # 名寄せ後の名前で判定。空欄もここで落ちる。
            continue
        title_en = r["title_en"]
        if not title_en and is_latin_only(r["title_ja"]):  # 束1。空のときだけ、原文をそのまま写す
            title_en = r["title_ja"]
            _latin_copied += 1
        data.append([title_en, r["title_ja"], plat, r["product_code"],
                     r["year"], r["publisher"], _canon_pub_final(r["publisher_en"]), r["buyee_kw"],
                     r["title_ja_kana"], r["title_romaji"], r["jan"], r["kana_row"],
                     r["online"]])
    js_path = os.path.join(os.path.dirname(out_path) or ".", "data_line.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("const DATA = " + json.dumps(data, ensure_ascii=False,
                                             separators=(",", ":")) + ";")
    size = os.path.getsize(js_path)

    print(f"出力行数             : {len(rows):,}  -> {out_path}")
    print(f"                       {len(data):,} 件 x {len(data[0])} フィールド -> {js_path}  ({size/1024/1024:.2f} MB)")
    # 名指し除外（罠#16）の実効を毎回出す。「入れたつもりで効いていない」を黙らせない。
    print(f"名指し除外(罠#16)      : {len(_excluded)}/{len(EXCLUDE_MADB_ID)} 行")
    for mid in _excluded:
        print(f"  - {mid}  {EXCLUDE_MADB_ID[mid]}")
    # 束1の転記も毎回実数を出す。2026-08-05 の調査は 2,676 行。ここがズレたら、
    # MADB 側でタイトルか英題が動いたということ ―― 黙って通さない。
    print(f"英題を原文複製(束1)    : {_latin_copied:,} 行  "
          f"(title_en が空 かつ title_ja がラテン文字のみ。調査時 2,676 行)")
    print()
    for k, v in stats.most_common():
        print(f"  {k:22} {v:6,}")
    print()
    have = sum(1 for r in rows if r["publisher"])
    print(f"発売元が入った行       : {have:,}/{len(rows):,}  ({have/len(rows)*100:.2f}%)")
    pubset = {p for r in rows for p in r["publisher"].split(";") if p}
    print(f"ユニークな発売元       : {len(pubset):,}")
    if en_titles:
        e = sum(1 for r in rows if r["title_en"])
        latin = sum(1 for r in rows if r["title_en"] or re.search(r"[A-Za-z]{3,}", r["title_ja"]))
        print(f"英題が付いた行         : {e:,}/{len(rows):,}  ({e/len(rows)*100:.1f}%)")
        print(f"英語で到達可能な行     : {latin:,}/{len(rows):,}  ({latin/len(rows)*100:.1f}%)")
    if ja_titles:
        jk = sum(1 for r in rows if r["title_ja_kana"])
        # 実際に検索が変わる行（title_ja と異なるカタカナ形が入った行）だけを数える
        chg = sum(1 for r in rows if r["title_ja_kana"] and r["title_ja_kana"] != r["title_ja"])
        print(f"日本語正規タイトルが付いた行: {jk:,}/{len(rows):,}  ({jk/len(rows)*100:.1f}%)  うち検索が変わる {chg:,}")
    rj = sum(1 for r in rows if r["title_romaji"])
    print(f"ローマ字(読み由来)が付いた行: {rj:,}/{len(rows):,}  ({rj/len(rows)*100:.1f}%)")
    jn = sum(1 for r in rows if r["jan"])
    print(f"JAN(gtin)が付いた行     : {jn:,}/{len(rows):,}  ({jn/len(rows)*100:.1f}%)  # カメラ用")
    kr = sum(1 for r in rows if r["kana_row"])
    print(f"五十音初字が付いた行     : {kr:,}/{len(rows):,}  ({kr/len(rows)*100:.1f}%)  # 棚案内用")
    # 五十音初字の分布。端に何が出るか(ヴ・記号始まり等)を憶測でなく実測で確認する(罠30)。
    dist = Counter(r["kana_row"] for r in rows if r["kana_row"])
    print("  五十音初字の分布:", " ".join(f"{k}:{v}" for k, v in sorted(dist.items())))
    # 字種別の充足(棚案内が字種でどれだけ成立するか)。表示タイトルの先頭字で割る。
    def _script(t):
        if not t:
            return "(空)"
        o = ord(t[0])
        if 0x30A0 <= o <= 0x30FF or 0x3040 <= o <= 0x309F:
            return "カナ"
        if 0x4E00 <= o <= 0x9FFF:
            return "漢字"
        if t[0].isascii() and t[0].isalpha():
            return "ラテン"
        return "他"
    by_script = defaultdict(lambda: [0, 0])
    for r in rows:
        s = _script(r["title_ja"])
        by_script[s][0] += 1
        if r["kana_row"]:
            by_script[s][1] += 1
    print("  五十音初字の充足(表示タイトルの字種別):")
    for s, (a, b2) in sorted(by_script.items(), key=lambda x: -x[1][0]):
        print(f"    {s:5} {b2:5}/{a:5}  ({b2*100//a if a else 0}%)")
    print()
    kw = sum(1 for r in rows if r["buyee_kw"])
    print(f"Buyeeリンクを出す行    : {kw:,}/{len(rows):,}  ({kw/len(rows)*100:.1f}%)")
    no_kw = Counter(r["platform_ja"] or "(機種が空)" for r in rows if not r["buyee_kw"])
    print("Buyeeリンクを出さない機種（上位10）:")
    for k, v in no_kw.most_common(10):
        print(f"  {v:5}  {k}")
    if unknown_platforms:
        print()
        print("英語名テーブルに無い機種（生値のまま出力される）:")
        for k, v in unknown_platforms.most_common():
            print(f"  {v:5}  {k}")


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4, 5, 6):
        print(__doc__)
        sys.exit(1)
    main(*sys.argv[1:6])
