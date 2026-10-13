/**
 * 大なわ 八の字とびの しくみ ─ ウェブアプリ
 *
 *  （URL）            … 児童画面。先生が「児童に 出す」に した 変数だけ 出る
 *  （URL）?p=sensei   … 先生画面。全部の 変数と「児童に 出す／出さない」の きりかえ
 *  （URL）?p=monitor  … モニター用。図と 回数だけ。先生画面の 操作に 約1秒で ついてくる
 *
 * 先生かどうかは 2つの どちらかで きめる（isTeacher_）。
 *   1. アカウントの アドレスが @edu.nishi.or.jp（@ の 右を 完全一致。児童の @kyoiku.edu.nishi.or.jp は 通らない）
 *   2. URL の 合言葉 k が スクリプト プロパティ「teacherKey」と 一致
 * 公開範囲を「全員」「Googleアカウントを持つ全員」に すると、getActiveUser() は 空に なる
 * （児童が 別テナントの とき こう する ことが 多い）。その ときは 2 で 入る。
 * 合言葉つきの URL は、エディタで 関数「teacherUrl」を 実行すると ログに 出る。
 * 出す 変数の リストは スクリプト プロパティ「shown」に 保存する。
 */

var TITLE = '八の字とびの しくみ';
var BUILD = '2026-10-13e';   // shikumi.html の PAGE_BUILD と そろえる。ちがえば 画面に 警告が 出る
var STAFF_DOMAIN = 'edu.nishi.or.jp';
var STUDENT_LOCAL = /^[0-9]{8}$/;
var DEFAULT_SHOWN = ['bpm'];                // はじめに 児童に 出す 変数
var ALL_IDS = ['bpm','nstop','nwait','wrot','ssec','rsec',
  'radius','height','kankyu','cut','stance','help',
  'jump','foot','pos','dist','angle',
  'gap','order','cue','after',
  'vfreq','vkind','cheer','restart'];

function doGet(e) {
  var email = currentEmail_();
  var prm = (e && e.parameter) || {};
  if (prm.p === 'diag') return diag_(email, String(prm.k || ''));
  var wantSensei = prm.p === 'sensei';
  var key = String(prm.k || '');
  var isT = isTeacher_(key);
  var wantMon = !!(e && e.parameter && e.parameter.p === 'monitor');
  var boot = { mode: wantMon ? 'monitor' : ((wantSensei && isT) ? 'sensei' : 'kodomo'), shown: getShown_(), build: BUILD,
               denied: wantSensei && !isT, emailOk: !!email, teacher: isT, key: (isT && keyOk_(key)) ? key : '', url: ScriptApp.getService().getUrl() || '' };
  var html = HtmlService.createHtmlOutputFromFile('shikumi').getContent();
  var json = JSON.stringify(boot).replace(/</g, '\\u003c');
  // コメントの 印は getContent() で 消えるので、先頭に script を 足して わたす
  html = '<script>window.OONAWA_BOOT=' + json + ';</script>' + html;
  return HtmlService.createHtmlOutput(html)
    .setTitle(boot.mode === 'sensei' ? TITLE + '（先生）' : boot.mode === 'monitor' ? TITLE + '（モニター）' : TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* 先生画面から よばれる。先生でなければ ことわる */
function saveShown(list, key) {
  if (!isTeacher_(key)) throw new Error('先生だけが 変えられます');
  // "bpm"（変数ごと）か "angle:60"（選択肢ごと）
  var clean = (list || []).map(String).filter(function (id) {
    var m = id.match(/^([a-z]+)(?::([0-9a-z.]+))?$/);
    return !!m && ALL_IDS.indexOf(m[1]) >= 0;
  });
  PropertiesService.getScriptProperties().setProperty('shown', JSON.stringify(clean));
  return clean;
}

/* モニター同期：先生画面が 今の せっていと 再生位置を おく。モニターが 1秒ごとに 読む */
function saveLive(json, key) {
  if (!isTeacher_(key)) throw new Error('先生だけが 送れます');
  CacheService.getScriptCache().put('live', JSON.stringify({ m: String(json), at: Date.now() }), 21600);
  return true;
}
function getLive() {
  var v = CacheService.getScriptCache().get('live');
  var o = v ? JSON.parse(v) : { m: null, at: 0 };
  o.now = Date.now();
  return o;
}

function getShown_() {
  var v = PropertiesService.getScriptProperties().getProperty('shown');
  if (!v) return DEFAULT_SHOWN.slice();
  try { return JSON.parse(v); } catch (err) { return DEFAULT_SHOWN.slice(); }
}

/* ===== 診断：（URL）?p=diag  …  うまく 動かない ときに 開く。児童に 見られても こまらない 中身だけ ===== */
function diag_(email, key) {
  var html = '', err = '';
  try { html = HtmlService.createHtmlOutputFromFile('shikumi').getContent(); } catch (x) { err = String(x); }
  var mark = function (s) { return html.indexOf(s) >= 0 ? 'ある' : '★ない'; };
  var m = html.match(/PAGE_BUILD\s*=\s*"([^"]*)"/);
  var rows = [
    ['Code.gs の 版', BUILD],
    ['shikumi.html の 版', m ? m[1] : '★見つからない（古いか、貼り付けが 欠けている）'],
    ['HTMLファイル「shikumi」', err ? '★読めない：' + err : '読めた（' + html.length + ' 文字）'],
    ['HTMLの 最後まで ある', /<\/script>\s*$/.test(html) ? 'ある' : '★ない（貼り付けが 途中で 切れている）'],
    ['BOOT の 受け口', mark('window.OONAWA_BOOT')],
    ['選択肢ごとの スイッチ', mark('data-pubopt')],
    ['先生用の画面へ リンク', mark('id="toSensei"')],
    ['開いた人の アドレス', email ? '取れた（' + (isStaffEmail_(email) ? '学校の 先生' : isDeployer_(email) ? 'この GAS を 置いた 本人＝先生' : '先生ではない') + '）' : '★取れない（公開範囲が「全員」など。合言葉つき URL を 使う）'],
    ['合言葉', PropertiesService.getScriptProperties().getProperty('teacherKey') ? '設定ずみ' + (key ? (keyOk_(key) ? '（この URL の 合言葉は 正しい）' : '（この URL の 合言葉は ちがう）') : '') : '★まだ（エディタで teacherUrl を 実行）'],
    ['児童に 出している もの', getShown_().join(', ') || '（なし）'],
    ['この デプロイの URL', ScriptApp.getService().getUrl() || '★取れない']
  ];
  var t = '<meta charset="utf-8"><style>body{font:16px/1.6 sans-serif;padding:16px}td{border-bottom:1px solid #ddd;padding:6px 10px}td:first-child{color:#555}</style>' +
    '<h1 style="font-size:20px">診断</h1><table>' + rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + String(r[1]).replace(/</g, '&lt;') + '</td></tr>'; }).join('') + '</table>' +
    '<p>★の 行が 原因です。</p>';
  return HtmlService.createHtmlOutput(t).setTitle('診断').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ===== 先生の 判定 ===== */
/* 先生＝ 1. 学校の 先生の アドレス／2. 合言葉／3. この GAS を 置いた 本人（school-timetable の Gate と 同じ。
   置いた 人は エディタで 何でも 直せるので、ここで 閉め出す 意味が ない。個人の gmail で 置いた ときも 入れる） */
function isTeacher_(key) { var e = currentEmail_(); return isStaffEmail_(e) || keyOk_(key) || isDeployer_(e); }
function isDeployer_(email) {
  var me = String(email || '').trim().toLowerCase(), dep = '';
  try { dep = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase(); } catch (x) {}
  return !!me && me === dep;
}
function isStaffEmail_(raw) {
  var e = String(raw || '').trim().toLowerCase();
  var at = e.lastIndexOf('@');
  if (at <= 0) return false;
  return e.slice(at + 1) === STAFF_DOMAIN && !STUDENT_LOCAL.test(e.slice(0, at));
}
function keyOk_(key) {
  var k = PropertiesService.getScriptProperties().getProperty('teacherKey');
  return !!k && !!key && String(key) === k;
}
function teacherKey_() {
  var p = PropertiesService.getScriptProperties(), k = p.getProperty('teacherKey');
  if (!k) { k = Utilities.getUuid().replace(/-/g, '').slice(0, 12); p.setProperty('teacherKey', k); }
  return k;
}
/* エディタで 実行する：先生用の URL（合言葉つき）を ログに 出す。児童には 配らない */
function teacherUrl() {
  var u = (ScriptApp.getService().getUrl() || '（デプロイ後の /exec の URL）') + '?p=sensei&k=' + teacherKey_();
  Logger.log(u);
  return u;
}

function currentEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (err) { return ''; }
}
