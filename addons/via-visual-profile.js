/* Vía Traslados: presentation-only profile, no network/storage/functional behavior. */
(()=>{'use strict';
 const ua=navigator.userAgent||'';
 const android=/Android/i.test(ua);
 const samsung=/SamsungBrowser\//i.test(ua);
 const ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const firefox=/Firefox\/|FxiOS\//i.test(ua);
 const edge=/EdgA?\/|EdgiOS\//i.test(ua);
 const opera=/OPR\/|OPiOS\//i.test(ua);
 const webview=/;\s*wv\)|\bVersion\/4\.0\b/i.test(ua);
 const chrome=/Chrome\/|CriOS\//i.test(ua);
 const profile=samsung?'samsung':ios?'ios':android&&firefox?'firefox-android':android&&edge?'edge-android':android&&opera?'opera-android':android&&webview?'android-webview':android&&chrome?'chrome-android':firefox?'firefox':chrome?'chromium':'default';
 document.documentElement.dataset.viaVisual=profile;
})();