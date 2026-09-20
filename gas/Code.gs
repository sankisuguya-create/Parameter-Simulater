/** ケイドロ・パラメータ実験室をWebアプリとして配信します。 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ケイドロ・パラメータ実験室')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
