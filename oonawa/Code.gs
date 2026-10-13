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
  var wantSensei = prm.p === 'sensei';
  var key = String(prm.k || '');
  var isT = isTeacher_(key);
  var wantMon = !!(e && e.parameter && e.parameter.p === 'monitor');
  var boot = { mode: wantMon ? 'monitor' : ((wantSensei && isT) ? 'sensei' : 'kodomo'), shown: getShown_(),
               denied: wantSensei && !isT, emailOk: !!email, teacher: isT, key: (isT && keyOk_(key)) ? key : '', url: ScriptApp.getService().getUrl() || '' };
  var html = HtmlService.createHtmlOutputFromFile('shikumi').getContent();
  var json = JSON.stringify(boot).replace(/</g, '\\u003c');
  html = html.replace('/*BOOT*/null/*BOOT*/', json);
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

/* ===== 先生の 判定 ===== */
function isTeacher_(key) { return isStaffEmail_(currentEmail_()) || keyOk_(key); }
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
