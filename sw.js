const CACHE_NAME = 'fitSVT-v19';
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
          // 网络成功（2xx/3xx 都算成功，GitHub Pages 导航会有 304）
          if(resp.ok || resp.type === 'opaqueredirect' || (resp.status >= 300 && resp.status < 400)){
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(()=>{});
            return resp;
          }
          // 网络返回非成功状态码，尝试用缓存
          return caches.match(event.request).then(c => c || resp);
        })
        .catch(() => {
          // 网络完全失败，用缓存兜底
          return caches.match(event.request).then(c => c || new Response(
            '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>加载中</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fde6ee;color:#9b3a5a;text-align:center;padding:20px;}div{max-width:300px;}h2{margin:0 0 10px;}p{font-size:14px;margin:8px 0;}button{background:#ff8aab;color:#fff;border:none;padding:10px 24px;border-radius:20px;font-size:14px;margin-top:12px;cursor:pointer;}</style></head><body><div><h2>📱 网络似乎断开了</h2><p>请检查网络连接后重试</p><p style="font-size:12px;color:#888;">你的数据已保存在手机里，联网后即可恢复</p><button onclick="location.reload()">🔄 重新加载</button></div></body></html>',
            {status:200, headers:{'Content-Type':'text/html; charset=utf-8'}}
          ));
        })
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
