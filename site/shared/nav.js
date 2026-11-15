(() => {
  const piece = document.currentScript?.dataset.piece;
  const host = document.createElement('div');
  host.id = 'lab-navigation';
  const shadow = host.attachShadow({ mode: 'open' });
  let position = 'left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));';
  if (piece === 'dither-motion') position = 'right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));';
  if (piece === 'architecture') position = 'left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);';
  shadow.innerHTML = `<style>
    :host{position:fixed;${position}z-index:2147483000;display:flex;flex-direction:column;gap:8px}
    a{display:grid;place-items:center;width:36px;height:36px;box-sizing:border-box;border-radius:50%;color:#536050;background:#fafbf5d9;border:1px solid #52624b22;box-shadow:0 2px 10px #26352308;backdrop-filter:blur(10px);text-decoration:none;font:18px/1 system-ui,sans-serif;transition:background .2s}
    a:hover{background:#fff}a:focus-visible{outline:2px solid #52754c;outline-offset:3px}
    @media(max-width:600px){${piece === 'watercat' ? ':host{top:68px}' : ''}${piece === 'architecture' ? ':host{left:12px;top:61px;transform:none}' : ''}}
  </style><a href="../" aria-label="返回交互实验室" title="返回交互实验室">←</a><a href="https://charlo.cn/video-library/videos/${piece}/" aria-label="观看演示视频" title="观看演示视频"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="m10 9 6 3-6 3V9Z" fill="currentColor"/></svg></a>`;
  document.body.appendChild(host);
})();
