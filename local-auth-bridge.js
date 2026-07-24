(function () {
  if (window.location.protocol !== 'file:') return;

  function getLocalUrl() {
    const marker = '/taithai_app/';
    const pathname = decodeURIComponent(window.location.pathname);
    const markerIndex = pathname.lastIndexOf(marker);
    const relativePath = markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : '';
    const folderPath = relativePath.endsWith('/index.html')
      ? relativePath.slice(0, -'index.html'.length)
      : relativePath;
    return `http://localhost:3000/${folderPath.split('/').map(encodeURIComponent).join('/')}`;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const loginButton = document.getElementById('googleLoginBtn');
    if (!loginButton) return;

    loginButton.title = 'เปิดผ่าน localhost เพื่อเข้าสู่ระบบ';
    loginButton.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.href = getLocalUrl();
    }, true);
  });
})();
