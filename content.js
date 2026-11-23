// Meko's BiliVRCParser - 页面脚本
// by Meko
//
// 【按钮呈现】零侵入悬浮层（视频页 / 直播页共用同一套按钮）
// 按钮挂在一个 fixed 定位的独立容器里（只 append 到 body），靠坐标实时贴合目标位置：
//   · 视频页  → 工具栏「···」右边（左侧按钮由 content.css 静态左移腾位置）
//   · 直播页  → 「主播名 / 人气 / 关注」那一组的右边
// 外观与 B 站原生按钮一致，但完全不进入 B 站的 DOM 树。
//
// 为什么不直接插进工具栏？
// 实测：往 .video-toolbar-right 插入节点会与 B 站顶栏脚本 bili-header 的挂载过程
// 产生「时序竞态」——延时 1.0s / 1.5s / 2.5s / 3.0s 插入都安全，但 2.0s 插入会让
// bili-header 抛 "Cannot read properties of null (reading 'nextSibling')"，
// 整个顶部导航栏直接消失。既然是竞态，就不存在"绝对安全的延时"，故改用悬浮层。
//
// 【解析方式】页面上下文直连 B 站官方接口（纯匿名，不获取登录态）
// B 站 API 的 CORS 只对 https://www.bilibili.com 放行，所以请求必须放在页面上下文；
// 请求使用 credentials: 'omit'（完全不碰你的登录态）：
//   · 视频：单文件 mp4 通道（durl），实测上限 720P（1080P+ 只在 DASH 通道，VRChat 播不了）
//   · 直播：HLS(m3u8) 通道，匿名约 250/超清
(() => {
  if (window.__vrcParserInjected) return;
  window.__vrcParserInjected = true;

  const HOST_ID = 'vrc-parse-host';
  const BTN_ID = 'vrc-parse-btn';

  const QUALITY_MAP = {
    127: '8K 超高清', 126: '杜比视界', 125: 'HDR 真彩',
    120: '4K 超清', 116: '1080P 60帧', 112: '1080P 高码率',
    80: '1080P 高清', 74: '720P 60帧', 64: '720P 高清',
    32: '480P 清晰', 16: '360P 流畅'
  };

  function qualityName(q) {
    const n = parseInt(q, 10);
    return QUALITY_MAP[n] || (n ? n + 'P' : '');
  }

  function extractBvid(url) {
    let m = url.match(/\/video\/(BV[0-9A-Za-z]+)/i);
    if (m) return m[1];
    m = url.match(/BV([0-9A-Za-z]+)/i);
    if (m) return 'BV' + m[1];
    m = url.match(/\/video\/av(\d+)/i);
    if (m) return 'av' + m[1];
    m = url.match(/av(\d{4,})/i);
    if (m) return 'av' + m[1];
    return null;
  }

  function extractPage(url) {
    const m = url.match(/[?&]p=(\d+)/);
    return m ? parseInt(m[1], 10) : 1;
  }

  function isVideoPage() {
    const p = location.pathname;
    return /\/video\//.test(p) || /\/bangumi\/play\//.test(p) || /\/list\//.test(p);
  }

  /* ==================== 直播页 ==================== */

  function isLivePage() {
    return location.hostname === 'live.bilibili.com';
  }

  // 从 live.bilibili.com/{房间号} 提取房间号
  function extractRoomId() {
    const m = location.pathname.match(/^\/(\d+)/);
    return m ? m[1] : null;
  }

  /* ==================== 悬浮宿主（零侵入） ==================== */

  let host = null;

  function makeButton() {
    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.className = 'vrc-parse-btn';
    btn.title = '解析为 VRChat 可播放链接并复制';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5L8 5.5z"/>
      </svg>
      <span>解析</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function ensureHost() {
    if (host && document.body && document.body.contains(host)) return host;
    if (!document.body) return null;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.appendChild(makeButton());
    document.body.appendChild(host); // 只挂 body，安全
    return host;
  }

  // 说明：「稿件举报 / 做笔记 / ···」的左移腾位由 content.css 静态完成
  // （从 document_start 生效，避免页面加载后出现"跳一下"的动态感），此处不再用 JS 搬运。

  // 只「读取」B 站元素坐标，不做任何修改
  function positionHost() {
    if (!document.body) return;

    // -------- 直播页：贴在「名字 / 人气 / 关注」组右边 --------
    if (isLivePage()) {
      const h = ensureHost();
      if (!h) return;

      const anchor = findLiveAnchor();
      if (!anchor) { h.style.display = 'none'; return; }

      const btn = h.querySelector('#' + BTN_ID);
      const bw = (btn && btn.offsetWidth) || 68;
      const bh = (btn && btn.offsetHeight) || 28;
      h.style.right = 'auto';
      h.style.bottom = 'auto';
      h.style.display = 'block';
      h.style.left = Math.round(anchor.right + 12) + 'px';
      h.style.top = Math.round(anchor.top + (anchor.height - bh) / 2) + 'px';
      return;
    }

    // -------- 视频页 --------
    if (!isVideoPage()) return;
    const h = ensureHost();
    if (!h) return;

    const more = document.querySelector('.video-tool-more');
    const bar = document.querySelector('.video-toolbar-right');
    const anchor = more ? null : (bar || document.querySelector('.video-toolbar-container'));
    if (!more && !anchor) { h.style.display = 'none'; return; }

    const btn = h.querySelector('#' + BTN_ID);
    const bw = (btn && btn.offsetWidth) || 68;
    const bh = (btn && btn.offsetHeight) || 28;

    let x, y, ref;
    if (more) {
      // 目标：「···」右边（举报 / 做笔记 / ··· 已由静态 CSS 左移腾出位置）
      const mr = more.getBoundingClientRect();
      ref = mr;
      x = mr.right + 6;
      y = mr.top + (mr.height - bh) / 2;
    } else {
      const r = anchor.getBoundingClientRect();
      ref = r;
      x = r.right - bw;
      y = r.top + (r.height - bh) / 2;
    }

    const vh = window.innerHeight;
    if (ref.width === 0 || ref.bottom < 80 || ref.top > vh - 20) { h.style.display = 'none'; return; }

    h.style.display = 'block';
    h.style.left = Math.round(x) + 'px';
    h.style.top = Math.max(74, Math.round(y)) + 'px';
  }

  /* ---------- 直播页锚点 ---------- */

  // 找直播页的定位锚点，返回页面坐标 { right, top, height }
  //
  // 「主播名 / 人气点赞 / 关注」这一整组在不同页面里位置不同：
  //   · 赛事 / 活动直播间：整组在播放器 iframe（/blanc/）内部
  //   · 普通直播间（如 room 605）：整组直接在主页面
  // 但它们的 class 都是 .left-anchor-section，所以两处都找一遍。
  const LIVE_ANCHOR_SELS = ['.left-anchor-section', '.follow-ctnr', '.head-info-section .content'];

  function pickAnchorEl(doc) {
    for (const sel of LIVE_ANCHOR_SELS) {
      const el = doc.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findLiveAnchor() {
    // ① 先在播放器 iframe 内找（赛事 / 活动直播间）
    const iframe = document.querySelector('iframe[src*="/blanc/"]');
    if (iframe) {
      let doc = null;
      try { doc = iframe.contentDocument; } catch (e) {}
      if (doc) {
        const el = pickAnchorEl(doc);
        if (el) {
          const ir = iframe.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            return { right: ir.left + r.right, top: ir.top + r.top, height: r.height };
          }
        }
      }
    }

    // ② 再在主页面找（普通直播间）
    const el = pickAnchorEl(document);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { right: r.right, top: r.top, height: r.height };
  }

  let rafPending = false;
  function schedulePosition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; positionHost(); });
  }

  /* ==================== 提示 & 复制 ==================== */

  function toast(text, isError) {
    let t = document.getElementById('vrc-parse-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vrc-parse-toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.className = 'vrc-parse-toast ' + (isError ? 'error' : 'ok');
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => t.classList.remove('show'), 4200);
    requestAnimationFrame(() => t.classList.add('show'));
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  /* ==================== 视频解析（页面上下文，纯匿名） ==================== */

  async function parseInPage(pageUrl) {
    const bvid = extractBvid(pageUrl);
    if (!bvid) throw new Error('未识别到视频 ID（BV/av），请确认在视频播放页。');
    const page = extractPage(pageUrl);

    // 1) 视频信息 + 分集 cid
    const vres = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { credentials: 'omit' });
    const vj = await vres.json();
    if (vj.code !== 0) throw new Error('获取视频信息失败: ' + (vj.message || ('code ' + vj.code)));
    const pageList = vj.data.pages || [];
    let cid = vj.data.cid;
    let partTitle = '';
    if (pageList.length) {
      const target = pageList.find(p => p.page === page) || pageList[0];
      cid = target.cid;
      partTitle = target.part || '';
    }
    const meta = { title: vj.data.title, partTitle, pageCount: pageList.length, page };

    const settings = await chrome.storage.sync.get({ apiUrl: '' });

    // 2) 自定义接口（可选）
    const api = (settings.apiUrl || '').trim();
    if (api) {
      try {
        const url = api.replace(/\{url\}/g, encodeURIComponent(pageUrl))
                       .replace(/\{bvid\}/g, bvid)
                       .replace(/\{cid\}/g, cid);
        const cres = await fetch(url, { credentials: 'omit' });
        const text = await cres.text();
        let data = null;
        try { data = JSON.parse(text); } catch (e) {}
        const link = (data && (data.url || (data.data && data.data.url))) || '';
        if (link) return Object.assign({ url: link, quality: '', thirdParty: true }, meta);
        const m = text.match(/https?:\/\/[^\s"'<>]+\.mp4(\?[^\s"'<>]*)?/i);
        if (m) return Object.assign({ url: m[0], quality: '', thirdParty: true }, meta);
        throw new Error('自定义接口未返回 mp4 链接');
      } catch (e) {
        console.warn('[BiliVRCParser] 自定义接口失败，改用官方接口:', e.message);
      }
    }

    // 3) 官方 playurl：platform=html5 返回音画合一的 mp4 单文件
    // 匿名请求：单文件 mp4 通道（durl）上限就是 720P，带不带登录态结果一样，
    // 所以不碰登录态，保持纯净。
    const purl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=120&fnval=0&fnver=0&fourk=1&platform=html5`;
    const pres = await fetch(purl, { credentials: 'omit' });
    const pj = await pres.json();
    if (pj.code !== 0) throw new Error('B站接口返回错误: ' + (pj.message || ('code ' + pj.code)));

    const d = pj.data || {};

    if (d.durl && d.durl.length) {
      return Object.assign({
        url: d.durl[0].url,
        quality: qualityName(d.quality),
        isDash: false
      }, meta);
    }
    if (d.dash && d.dash.video && d.dash.video.length) {
      return Object.assign({
        url: d.dash.video[0].baseUrl || d.dash.video[0].base_url,
        quality: qualityName(d.dash.video[0].id),
        isDash: true
      }, meta);
    }
    throw new Error('未能获取到播放地址（该视频可能受限）');
  }

  /* ==================== 直播解析 ==================== */

  // 直播：取 HLS(m3u8) 流。VRChat 播放器支持 HLS，FLV 播不了。
  // 匿名请求：qn=10000（原画）请求，B 站按匿名权限给 250（超清）。
  // 实测：m3u8 无 Referer 防盗链，可直接拉流。
  async function parseLive() {
    const roomId = extractRoomId();
    if (!roomId) throw new Error('无法识别直播间号');

    const api = `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${roomId}&protocol=0,1&format=0,1,2&codec=0,1&qn=10000&platform=web&ptype=8`;
    const res = await fetch(api, { credentials: 'omit' });
    const j = await res.json();
    if (j.code !== 0) throw new Error('直播接口返回错误: ' + (j.message || j.code));

    const pi = j.data && j.data.playurl_info && j.data.playurl_info.playurl;
    if (!pi) throw new Error('该直播间未开播（或房间不存在）');

    // 必须选 HLS
    const hls = pi.stream.find(s => s.protocol_name === 'http_hls');
    if (!hls) throw new Error('未找到 HLS 直播流');

    // 优先 fmp4 + avc（兼容性最好），退化到其它
    const fmt = hls.format.find(f => f.format_name === 'fmp4') || hls.format[0];
    const codec = fmt.codec.find(c => c.codec_name === 'avc') || fmt.codec[0];

    const ui = codec.url_info[0];
    const url = ui.host + codec.base_url + ui.extra;
    const qnName = ({
      10000: '原画', 400: '蓝光', 250: '超清', 150: '高清', 80: '流畅'
    })[codec.current_qn] || ('qn' + codec.current_qn);

    return {
      url,
      quality: qnName,
      isLive: true,
      title: document.title
    };
  }

  /* ==================== 点击 ==================== */

  async function onClick() {
    const btn = document.getElementById(BTN_ID);
    if (btn) {
      btn.classList.add('loading');
      const s = btn.querySelector('span');
      if (s) s.textContent = '解析中';
    }
    try {
      const d = isLivePage() ? await parseLive() : await parseInPage(location.href);
      if (!d || !d.url) throw new Error('未获取到链接');

      const ok = await copyText(d.url);
      if (!ok) throw new Error('复制失败，请手动复制');

      if (d.isLive) {
        toast(`已复制直播流链接（${d.quality}）。提示：直播地址约 1 小时过期，过期后重新点「解析」即可。`);
      } else {
        const label = d.pageCount > 1 ? (`P${d.page} ${d.partTitle || ''}`.trim()) : (d.title || '');
        const suffix = label ? ' · ' + label.slice(0, 20) : '';
        if (d.isDash) {
          toast(`已复制视频流链接（${d.quality}）${suffix}。注意：该流为音画分离，VRChat 可能无法正常播放。`);
        } else if (d.thirdParty) {
          toast(`已复制 VRChat 可播放链接${d.quality ? '（' + d.quality + '）' : ''}${suffix}`);
        } else {
          toast(`已复制 VRChat 可播放链接（${d.quality}）${suffix}`);
        }
      }
    } catch (e) {
      toast(e.message || '解析失败', true);
    } finally {
      if (btn) {
        btn.classList.remove('loading');
        const s = btn.querySelector('span');
        if (s) s.textContent = '解析';
      }
    }
  }

  /* ==================== 启动 ==================== */

  window.addEventListener('scroll', schedulePosition, { passive: true });
  window.addEventListener('resize', schedulePosition);

  // 只读观察 DOM，用于感知工具栏出现/位置变化（不修改 B 站任何节点）
  let obsTimer = null;
  const obs = new MutationObserver(() => {
    if (obsTimer) return;
    obsTimer = setTimeout(() => { obsTimer = null; schedulePosition(); }, 400);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });

  positionHost();
  setTimeout(positionHost, 600);
  setTimeout(positionHost, 1500);
  setTimeout(positionHost, 3000);
  setInterval(positionHost, 2000); // 兜底：只读定位，开销极小
})();
