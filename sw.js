const CACHE_NAME = 'fitSVT-v15';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './assets/svt.jpg'
];
// 这些资源永远走网络（不缓存旧版）
const NETWORK_ONLY = [
  './d/inbox.json',
  './d/app-version.json',
  './index.html',
  './',
  './manifest.json'
];

self.addEventListener('install', event => {
  // 不再预先缓存，让 fetch 时按需拉取，避免 install 阶段失败
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // 立即接管所有客户端
  event.waitUntil(self.clients.claim());
  // 通知所有页面：有新 SW 激活了，建议刷新
  self.clients.matchAll({includeUncontrolled:true}).then(clients =>
    clients.forEach(c => c.postMessage({type:'SW_UPDATED'}))
  );
});

// 收到主页面发来的 SKIP_WAITING 消息，立即激活
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 导航请求（HTML 页面）和网络优先资源：先去网络拿最新的
  if(event.request.mode === 'navigation' || NETWORK_ONLY.some(p => url.pathname.endsWith(p.replace('./','/')))){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          // 拿到新版，顺便更新缓存
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(()=>{});
          return resp;
        })
        .catch(() => caches.match(event.request).then(c => c || new Response('离线模式', {status:200})))
    );
    return;
  }

  // 其他资源：stale-while-revalidate（先用缓存，后台更新）
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(()=>{});
          return resp;
        }).catch(()=>cached);
      return cached || networkFetch;
    })
  );
});
