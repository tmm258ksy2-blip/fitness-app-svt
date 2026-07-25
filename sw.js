const CACHE_NAME = 'fitSVT-v21';

// 安装时跳过等待，立即激活
self.addEventListener('install', event => {
  self.skipWaiting();
});

// 激活时清掉旧缓存，立即接管所有客户端
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

// 一个永远可用的兜底离线页
const OFFLINE_HTML = '<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>加载中</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fde6ee;color:#9b3a5a;text-align:center;padding:20px;}div{max-width:300px;}h2{margin:0 0 10px;}p{font-size:14px;margin:8px 0;color:#8a5a6a;}button{background:#ff8aab;color:#fff;border:none;padding:10px 24px;border-radius:20px;font-size:14px;margin-top:12px;cursor:pointer;}</style></head><body><div><h2>📱 正在连接</h2><p>请稍等或检查网络</p><p style="font-size:12px;color:#aaa;">数据已保存在手机里</p><button onclick="location.reload()">🔄 重新加载</button></div></body></html>';

self.addEventListener('fetch', event => {
  const req = event.request;

  // 只处理 GET 请求，其他请求直接放行
  if(req.method !== 'GET'){
    return;
  }

  // 导航请求（HTML 页面）：网络优先，失败用缓存，都没了用兜底页
  if(req.mode === 'navigation'){
    event.respondWith(
      (async () => {
        try {
          const resp = await fetch(req);
          if(resp && (resp.ok || resp.status === 0)){
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, resp.clone()).catch(()=>{});
            return resp;
          }
          // 网络返回非成功，尝试缓存
          const cached = await caches.match(req);
          if(cached) return cached;
          return resp;  // 返回网络响应（即使是错误页也比 null 强）
        } catch(e) {
          // 网络完全失败
          const cached = await caches.match(req);
          if(cached) return cached;
          return new Response(OFFLINE_HTML, {status:200, headers:{'Content-Type':'text/html; charset=utf-8'}});
        }
      })()
    );
    return;
  }

  // 非导航请求（JS/CSS/图片/JSON 等）：stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then(resp => {
          if(resp && resp.ok){
            cache.put(req, resp.clone()).catch(()=>{});
          }
          return resp;
        })
        .catch(() => null);  // 失败返回 null，不抛错
      // 有缓存先用缓存，没有就等网络；网络也失败就返回空 Response
      if(cached) return cached;
      const netResp = await fetchPromise;
      if(netResp) return netResp;
      return new Response('', {status:200});
    })()
  );
});
