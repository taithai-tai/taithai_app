/* Restore only appearance before styles load. This never restores permissions. */
(function(){
  var expanded=false;
  try{expanded=window.localStorage.getItem('taithai.navigation.expanded.v1')==='1';}catch(_error){}
  document.documentElement.setAttribute('data-navigation-expanded',String(expanded));
})();
