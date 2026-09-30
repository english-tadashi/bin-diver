iPhone（Safari）など、BarcodeDetector の無いブラウザ用のバーコード読み取りライブラリ（2026-09-28 追加）。
以前は index.html から cdn.jsdelivr.net を直接 import していた。圏外の店内でも読めるように、同じサイトに置いて
sw.js の PRECACHE_OPTIONAL で事前キャッシュする。

ファイル（jsDelivr の +esm 配信物をそのまま保存。import の参照先だけ同じフォルダに書き換えた）
  zxing-browser-0.1.5.min.js    https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm      MIT         LICENSE-zxing-browser.txt
  zxing-library-0.21.0.min.js   https://cdn.jsdelivr.net/npm/@zxing/library@0.21.0/+esm     Apache-2.0  LICENSE-zxing-library.txt
                                （package.json の license 欄は MIT だが、同梱の LICENSE は Apache-2.0。厳しい方で扱う）
  ts-custom-error-3.3.1.min.js  https://cdn.jsdelivr.net/npm/ts-custom-error@3.3.1/+esm     MIT         LICENSE-ts-custom-error.txt
                                （zxing-library が import している）

★版を上げるときは、ファイル名の版番号も変える（sw.js は同じサイトのファイルを cache-first で持つので、
  同じ名前のまま中身を替えると古い版が残る）。index.html の import と sw.js の PRECACHE_OPTIONAL も直す。
