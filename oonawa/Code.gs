/**
 * 大なわ 八の字とびの しくみ ─ ウェブアプリ
 *
 *  （URL）            … 児童画面。先生が「児童に 出す」に した 変数だけ 出る
 *  （URL）?p=sensei   … 先生画面。全部の 変数と「児童に 出す／出さない」の きりかえ
 *  （URL）?p=monitor  … モニター用。図と 回数だけ。先生画面の 操作に 約1秒で ついてくる
 *
 * 先生かどうかは アカウントの アドレスで きめる（@edu.nishi.or.jp）。
 * 児童（@kyoiku.edu.nishi.or.jp）が ?p=sensei を 開いても 児童画面に なる。
 * 出す 変数の リストは スクリプト プロパティ「shown」に 保存する。
 */

var TITLE = '八の字とびの しくみ';
var TEACHER_RE = /@edu\.nishi\.or\.jp$/i;   // 児童の @kyoiku.edu.nishi.or.jp には 当たらない
var DEFAULT_SHOWN = ['bpm'];                // はじめに 児童に 出す 変数
var ALL_IDS = ['bpm','nstop','nwait','wrot','ssec','rsec',
  'radius','height','kankyu','cut','stance','help',
  'jump','foot','pos','dist','angle',
  'gap','order','cue','after',
  'vfreq','vkind','cheer','restart'];

function doGet(e) {
  var email = currentEmail_();
  var wantSensei = !!(e && e.parameter && e.parameter.p === 'sensei');
  var isT = TEACHER_RE.test(email);
  var wantMon = !!(e && e.parameter && e.parameter.p === 'monitor');
  var boot = { mode: wantMon ? 'monitor' : ((wantSensei && isT) ? 'sensei' : 'kodomo'), shown: getShown_(),
               denied: wantSensei && !isT, teacher: isT, url: ScriptApp.getService().getUrl() || '' };
  var html = HtmlService.createHtmlOutputFromFile('shikumi').getContent();
  var json = JSON.stringify(boot).replace(/</g, '\\u003c');
  html = html.replace('/*BOOT*/null/*BOOT*/', json);
  return HtmlService.createHtmlOutput(html)
    .setTitle(boot.mode === 'sensei' ? TITLE + '（先生）' : boot.mode === 'monitor' ? TITLE + '（モニター）' : TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* 先生画面から よばれる。先生でなければ ことわる */
function saveShown(list) {
  if (!TEACHER_RE.test(currentEmail_())) throw new Error('先生の アカウントだけが 変えられます');
  var clean = (list || []).filter(function (id) { return ALL_IDS.indexOf(String(id)) >= 0; });
  PropertiesService.getScriptProperties().setProperty('shown', JSON.stringify(clean));
  return clean;
}

/* モニター同期：先生画面が 今の せっていと 再生位置を おく。モニターが 1秒ごとに 読む */
function saveLive(json) {
  if (!TEACHER_RE.test(currentEmail_())) throw new Error('先生の アカウントだけが 送れます');
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

function currentEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; } catch (err) { return ''; }
}
