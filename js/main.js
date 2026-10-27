/* ==========================================================================
   DJI Osmo Action 4 · 交互式 3D 拆解 — 主程序
   ========================================================================== */

(function () {
  'use strict';

  const PARTS = window.DJI_PARTS || [];
  const SPEC_SUMMARY = window.DJI_SPEC_SUMMARY || [];
  const container = document.getElementById('canvasWrap');
  const labelLayer = document.getElementById('labels');

  function fallback(msg) {
    const d = document.createElement('div');
    d.className = 'fallback';
    d.innerHTML = '<div><h2 style="color:#e6f1fb;margin:0 0 12px">无法启动 3D 视图</h2><p>' + msg + '</p></div>';
    document.body.appendChild(d);
    const l = document.getElementById('loading');
    if (l) l.classList.add('hidden');
  }

  if (typeof THREE === 'undefined') {
    fallback('未能加载本地 Three.js 库（lib/three.min.js）。请确认 lib 目录与 index.html 在同一个文件夹内。');
    return;
  }

  /* ------------------------------------------------------------ 渲染器 / 场景 */

  let renderer, scene, camera, controls, composer, bloomPass;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    fallback('当前浏览器或显卡不支持 WebGL：' + e.message);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  container.appendChild(renderer.domElement);
  renderer.domElement.id = 'scene';

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060b);
  scene.fog = new THREE.FogExp2(0x04060b, 0.0155);

  const HOME_CAM = new THREE.Vector3(9.4, 6.4, 13.6);
  const HOME_TARGET = new THREE.Vector3(0, 0, 0);
  camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
  camera.position.copy(HOME_CAM).multiplyScalar(1.65);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 7;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.target.copy(HOME_TARGET);
  controls.autoRotateSpeed = 0.9;

  /* ---------------------------------------------------------- 程序化环境贴图 */

  function makeEnvTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#0a1119');
    g.addColorStop(0.42, '#1b2735');
    g.addColorStop(0.52, '#0a1119');
    g.addColorStop(1, '#04060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 512);

    function softBox(x, y, rx, ry, color, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(rx / 256, ry / 256);
      const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 256);
      rg.addColorStop(0, color);
      rg.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.35)'));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 256, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    softBox(200, 110, 230, 130, 'rgba(255,255,255,1)', 0.95);   // 主光柔光箱
    softBox(770, 150, 190, 110, 'rgba(150,225,255,1)', 0.8);    // 青色轮廓光
    softBox(510, 420, 320, 150, 'rgba(96,120,255,1)', 0.45);    // 地面蓝色反弹
    softBox(60, 330, 150, 90, 'rgba(255,186,132,1)', 0.4);      // 暖色补光
    softBox(900, 360, 120, 70, 'rgba(255,255,255,1)', 0.35);

    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envSrc = makeEnvTexture();
  const envRT = pmrem.fromEquirectangular(envSrc);
  scene.environment = envRT.texture;
  envSrc.dispose();
  pmrem.dispose();

  /* ------------------------------------------------------------------ 灯光 */

  scene.add(new THREE.HemisphereLight(0x9ed6ff, 0x0a1018, 0.5));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(8, 10, 9);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x3ec6f0, 1.7);
  rimLight.position.set(-9, 5, -8);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x6a6cf5, 0.75);
  fillLight.position.set(3, -7, 5);
  scene.add(fillLight);

  const accentLight = new THREE.PointLight(0x22d3ee, 1.4, 26, 2);
  accentLight.position.set(-6, 2.5, 6);
  scene.add(accentLight);

  /* ------------------------------------------------------------ 背景科技元素 */

  const bgGroup = new THREE.Group();
  scene.add(bgGroup);

  const grid = new THREE.GridHelper(90, 72, 0x1c4761, 0x0c1d29);
  grid.position.y = -6.4;
  grid.material.transparent = true;
  grid.material.opacity = 0.24;
  grid.material.depthWrite = false;
  bgGroup.add(grid);

  function ringMesh(inner, outer, color, opacity) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 128),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -6.35;
    return m;
  }
  const ringA = ringMesh(8.2, 8.34, 0x22d3ee, 0.30);
  const ringB = ringMesh(11.2, 11.28, 0x6366f1, 0.16);
  bgGroup.add(ringA, ringB);

  // 虚线刻度环
  const dashTex = (function () {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 8;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 8);
    ctx.fillStyle = '#7ff2ff';
    for (let i = 0; i < 64; i++) {
      if (i % 2 === 0) ctx.fillRect(i * 16, 0, 9, 8);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  })();
  const ringC = new THREE.Mesh(
    new THREE.RingGeometry(9.5, 9.68, 128),
    new THREE.MeshBasicMaterial({
      map: dashTex, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: 0x9beeff
    })
  );
  ringC.rotation.x = -Math.PI / 2;
  ringC.position.y = -6.32;
  bgGroup.add(ringC);

  // 光晕地池
  const poolTex = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const rg = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    rg.addColorStop(0, 'rgba(110,215,245,0.34)');
    rg.addColorStop(0.45, 'rgba(50,150,220,0.09)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0.19, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    })
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = -6.3;
  bgGroup.add(pool);

  // 星尘粒子
  const dustCount = 900;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const c1 = new THREE.Color(0x2f6d8c), c2 = new THREE.Color(0x8fd8ff);
  for (let i = 0; i < dustCount; i++) {
    const r = 14 + Math.random() * 34;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    dustPos[i * 3 + 1] = r * Math.cos(ph) * 0.55;
    dustPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const col = c1.clone().lerp(c2, Math.random());
    dustCol[i * 3] = col.r; dustCol[i * 3 + 1] = col.g; dustCol[i * 3 + 2] = col.b;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.12, vertexColors: true, transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false
  }));
  bgGroup.add(dust);

  /* ------------------------------------------------------------------ 模型 */

  const model = window.buildDJIModel(THREE, PARTS);
  scene.add(model.root);
  const parts = model.parts;
  const shellRec = parts[model.shellId];

  /* -------------------------------------------------------------- 辉光后期 */

  try {
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloomPass = new THREE.UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.9
    );
    composer.addPass(bloomPass);
  } catch (e) {
    composer = null;   // 后期不可用时退化为直接渲染
  }

  /* ------------------------------------------------------------------ 标注 */

  const labelMap = {};
  PARTS.forEach(function (def) {
    const el = document.createElement('div');
    el.className = 'label';
    el.innerHTML =
      '<span class="label-dot" style="background:' + def.accent + ';box-shadow:0 0 10px ' + def.accent + '"></span>' +
      '<span class="label-text">' + def.name + '</span>' +
      '<span class="label-spec">' + def.shortSpec + '</span>';
    el.dataset.part = def.id;
    labelLayer.appendChild(el);
    labelMap[def.id] = el;
  });

  /* ------------------------------------------------------------------ 状态 */

  const state = {
    selected: null,
    hovered: null,
    globalTarget: 0,
    global: 0,
    autoRotate: false,
    showLabels: true,
    intro: 0,
    introDone: false,
    userZoomed: false
  };

  const accentOf = {};
  PARTS.forEach(function (d) { accentOf[d.id] = new THREE.Color(d.accent); });

  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownAt = null;

  /* --------------------------------------------------------------- 面板构建 */

  const partListEl = document.getElementById('partList');
  const detailEl = document.getElementById('detailPanel');
  const partCountEl = document.getElementById('partCount');
  if (partCountEl) partCountEl.textContent = String(PARTS.length);

  const rowMap = {};
  PARTS.slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (def) {
    const li = document.createElement('li');
    li.className = 'part-item';
    li.dataset.part = def.id;
    li.innerHTML =
      '<span class="part-index">' + String(def.order).padStart(2, '0') + '</span>' +
      '<span class="part-swatch" style="color:' + def.accent + ';background:' + def.accent + '"></span>' +
      '<span class="part-meta">' +
        '<span class="part-name">' + def.name + '</span>' +
        '<span class="part-sub">' + def.shortSpec + '</span>' +
      '</span>';
    li.addEventListener('click', function () { selectPart(def.id, true); });
    li.addEventListener('mouseenter', function () { state.hovered = def.id; });
    li.addEventListener('mouseleave', function () { if (state.hovered === def.id) state.hovered = null; });
    partListEl.appendChild(li);
    rowMap[def.id] = li;
  });

  const specListEl = document.getElementById('specSummary');
  if (specListEl) {
    SPEC_SUMMARY.forEach(function (row) {
      const li = document.createElement('li');
      li.innerHTML = '<span>' + row[0] + '</span><b>' + row[1] + '</b>';
      specListEl.appendChild(li);
    });
  }

  function renderDetail(id) {
    if (!id || !parts[id]) {
      const hl = [
        ['影像核心', '1/1.3 英寸 CMOS · 等效 2.4 μm'],
        ['录制规格', '4K 120fps · 10-bit D-Log M'],
        ['增稳', 'RockSteady 3.0 地平线增稳'],
        ['机身', '145 g · 裸机 18 m 防水']
      ];
      let h = '';
      h += '<div class="detail-title">' +
             '<span class="detail-index">DJI</span>' +
             '<div><h3>Osmo Action 4</h3><span class="en">Exploded View · Overview</span>' +
             '<span class="tag">整机概览</span></div>' +
           '</div>';
      h += '<ul class="detail-specs">';
      hl.forEach(function (r) {
        h += '<li><span class="k">' + r[0] + '</span><span class="v">' + r[1] + '</span></li>';
      });
      h += '</ul>';
      h += '<div class="detail-desc">点击模型上的任意部件，或左侧清单中的条目，即可把它单独拆出并查看规格与作用；' +
           '再次点击同一部件或按 <b>Esc</b> 复位。滚轮缩放、左键拖动自由旋转视角。</div>';
      h += '<div class="guide">' +
             '<div class="guide-row"><kbd>单击部件</kbd><span>单独拆出 + 查看参数</span></div>' +
             '<div class="guide-row"><kbd>空格</kbd><span>整机拆解 / 合体还原</span></div>' +
             '<div class="guide-row"><kbd>拖动</kbd><span>自由旋转视角</span></div>' +
             '<div class="guide-row"><kbd>滚轮</kbd><span>缩放观察细节</span></div>' +
             '<div class="guide-row"><kbd>R</kbd><span>重置视角与拆解状态</span></div>' +
           '</div>';
      detailEl.innerHTML = h;
      return;
    }
    const def = parts[id].def;
    let html = '';
    html += '<div class="detail-title">' +
              '<span class="detail-index">' + String(def.order).padStart(2, '0') + '</span>' +
              '<div><h3>' + def.name + '</h3><span class="en">' + def.en + '</span>' +
              '<span class="tag">' + def.group + '</span></div>' +
            '</div>';
    html += '<ul class="detail-specs">';
    def.specs.forEach(function (s) {
      html += '<li><span class="k">' + s[0] + '</span><span class="v">' + s[1] + '</span></li>';
    });
    html += '</ul>';
    html += '<div class="detail-desc">' + def.desc + '</div>';
    html += '<div class="detail-actions">' +
              '<button class="btn" id="btnFocus">聚焦该部件</button>' +
              '<button class="btn" id="btnClose">取消选中</button>' +
            '</div>';
    detailEl.innerHTML = html;

    const bf = document.getElementById('btnFocus');
    const bc = document.getElementById('btnClose');
    if (bf) bf.addEventListener('click', function () { selectPart(id, true); });
    if (bc) bc.addEventListener('click', function () { selectPart(null); });
  }

  /* ------------------------------------------------------------- 选中与动画 */

  function selectPart(id, force) {
    if (id && state.selected === id && !force) id = null;
    state.selected = id || null;
    PARTS.forEach(function (def) {
      const row = rowMap[def.id];
      if (row) row.classList.toggle('active', def.id === state.selected);
    });
    renderDetail(state.selected);
    updateStatusChip();
  }

  function setExplodeAll(on) {
    state.globalTarget = on ? 1 : 0;
    const btn = document.getElementById('btnExplode');
    if (btn) {
      btn.innerHTML = on ? '<span class="ico">◈</span> 合体还原' : '<span class="ico">⛓</span> 拆解全部';
      btn.classList.toggle('primary', !on);
    }
    updateStatusChip();
  }

  function resetView() {
    camera.position.copy(HOME_CAM);
    controls.target.copy(HOME_TARGET);
    controls.update();
    state.userZoomed = false;
    selectPart(null);
    setExplodeAll(false);
    state.introDone = true;
  }

  /* ------------------------------------------------------------- 指针拾取 */

  function updatePointer(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }

  function pick() {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(model.root, true);
    for (let i = 0; i < hits.length; i++) {
      const o = hits[i].object;
      if (o.userData.outline) continue;
      const id = o.userData.partId;
      if (id) return id;
    }
    return null;
  }

  renderer.domElement.addEventListener('pointermove', function (ev) {
    updatePointer(ev);
    const id = pick();
    state.hovered = id;
    renderer.domElement.classList.toggle('pointing', !!id);
  });

  renderer.domElement.addEventListener('pointerdown', function (ev) {
    pointerDownAt = { x: ev.clientX, y: ev.clientY, t: performance.now(), button: ev.button };
    renderer.domElement.classList.add('grabbing');
  });

  renderer.domElement.addEventListener('pointerup', function (ev) {
    renderer.domElement.classList.remove('grabbing');
    if (!pointerDownAt || pointerDownAt.button !== 0) { pointerDownAt = null; return; }
    const moved = Math.hypot(ev.clientX - pointerDownAt.x, ev.clientY - pointerDownAt.y);
    const dt = performance.now() - pointerDownAt.t;
    pointerDownAt = null;
    if (moved > 6 || dt > 900) return;      // 视为拖拽 / 长按，不算点击
    updatePointer(ev);
    const id = pick();
    if (id) { selectPart(id, true); setExplodeAll(false); }
    else { selectPart(null); }
  });

  renderer.domElement.addEventListener('pointerleave', function () {
    state.hovered = null;
    renderer.domElement.classList.remove('pointing', 'grabbing');
  });

  // 用户一旦手动缩放，就不再自动调整机位距离
  renderer.domElement.addEventListener('wheel', function () { state.userZoomed = true; }, { passive: true });

  /* ------------------------------------------------------------------ 按钮 */

  const btnExplode = document.getElementById('btnExplode');
  const btnAuto = document.getElementById('btnAuto');
  const btnLabels = document.getElementById('btnLabels');
  const btnReset = document.getElementById('btnReset');

  if (btnExplode) btnExplode.addEventListener('click', function () { setExplodeAll(state.globalTarget < 0.5); });
  if (btnAuto) btnAuto.addEventListener('click', function () {
    state.autoRotate = !state.autoRotate;
    controls.autoRotate = state.autoRotate;
    btnAuto.classList.toggle('is-on', state.autoRotate);
  });
  if (btnLabels) btnLabels.addEventListener('click', function () {
    state.showLabels = !state.showLabels;
    btnLabels.classList.toggle('is-on', state.showLabels);
  });
  if (btnReset) btnReset.addEventListener('click', resetView);

  window.addEventListener('keydown', function (ev) {
    if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
    if (ev.code === 'Space') { ev.preventDefault(); setExplodeAll(state.globalTarget < 0.5); }
    else if (ev.key === 'r' || ev.key === 'R') { resetView(); }
    else if (ev.key === 'Escape') { selectPart(null); }
    else if (ev.key === 'l' || ev.key === 'L') { if (btnLabels) btnLabels.click(); }
  });

  const statusChip = document.getElementById('statusChip');
  function updateStatusChip() {
    if (!statusChip) return;
    const exploded = state.global > 0.5 || state.selected;
    const name = state.selected && parts[state.selected] ? parts[state.selected].def.name : '整机';
    statusChip.innerHTML =
      '<span>MODE</span><b>' + (exploded ? 'EXPLODED' : 'ASSEMBLED') + '</b>' +
      '<span class="sep" style="color:rgba(120,190,255,.3)">|</span>' +
      '<span>FOCUS</span><b>' + name + '</b>';
  }
  updateStatusChip();
  renderDetail(null);

  /* -------------------------------------------------------------- 尺寸自适应 */

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    if (bloomPass) bloomPass.resolution.set(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ------------------------------------------------------------ 样式更新逻辑 */

  function applyStyle(rec, highlight, dim) {
    const accent = accentOf[rec.id];
    rec.matState.forEach(function (st) {
      const m = st.mat;
      if (m.isMeshBasicMaterial) {
        const boost = 1 + highlight * 0.85;
        if (st.color) m.color.copy(st.color).multiplyScalar(dim * boost);
        if (!m.map && st.color) m.color.lerp(accent, highlight * 0.6);
      } else {
        if (st.color) m.color.copy(st.color).multiplyScalar(dim);
        if (m.emissive) {
          m.emissive.copy(st.emissive).lerp(accent, highlight);
          m.emissiveIntensity = st.emissiveIntensity + highlight * 1.25;
        }
      }
    });
  }

  function updateShellFade(fade) {
    // fade: 0 = 完全不透明, 1 = 完全透视
    const opacity = 1 - 0.84 * fade;
    shellRec.matState.forEach(function (st) {
      const m = st.mat;
      m.transparent = opacity < 0.985;
      m.opacity = opacity;
      m.depthWrite = opacity > 0.6;
    });
    shellRec.outlines.forEach(function (o) {
      o.visible = state.selected === shellRec.id && fade < 0.5;
    });
  }

  /* ----------------------------------------------------------------- 主循环 */

  const clock = new THREE.Clock();
  let firstFrame = true;

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // 入场镜头
    if (!state.introDone) {
      state.intro += dt * 0.85;
      const k = Math.min(state.intro, 1);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(HOME_CAM.clone().multiplyScalar(1.65), HOME_CAM, e);
      if (k >= 1) state.introDone = true;
    }

    // 整体拆解进度
    state.global += (state.globalTarget - state.global) * Math.min(1, dt * 6.5);

    let maxFactor = state.global;

    PARTS.forEach(function (def) {
      const rec = parts[def.id];
      if (!rec) return;

      const sel = state.selected === def.id ? 1 : 0;
      const hov = state.hovered === def.id ? 1 : 0;
      rec.selFactor += (sel - rec.selFactor) * Math.min(1, dt * 7);
      rec.hoverFactor += (hov - rec.hoverFactor) * Math.min(1, dt * 9);

      const f = Math.max(state.global, rec.selFactor) + rec.hoverFactor * 0.05;
      rec.factor = f;
      if (f > maxFactor) maxFactor = f;

      rec.group.position.copy(rec.home).addScaledVector(rec.explode, f);

      // 高亮 / 变暗
      const dim = state.selected && state.selected !== def.id ? 0.38 : 1;
      const highlight = Math.max(rec.selFactor, rec.hoverFactor * 0.6);
      applyStyle(rec, highlight, dim);

      // 描边
      const showOutline = (state.selected === def.id && rec.selFactor > 0.15) ||
                          (state.hovered === def.id && !state.selected);
      rec.outlines.forEach(function (o) { o.visible = showOutline; });

      // 标注
      const el = labelMap[def.id];
      if (el) {
        const visible = state.showLabels &&
          (rec.factor > 0.12 || state.selected === def.id || state.hovered === def.id);
        if (visible) {
          _v.copy(rec.group.position).add(rec.labelAnchor);
          _v2.copy(_v).project(camera);
          if (_v2.z > 1) {
            el.classList.remove('visible');
          } else {
            const w = window.innerWidth, h = window.innerHeight;
            const x = (_v2.x * 0.5 + 0.5) * w;
            const y = (-_v2.y * 0.5 + 0.5) * h;
            el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
            el.style.left = '0px';
            el.style.top = '0px';
            el.dataset.x = x; el.dataset.y = y; el.dataset.z = _v2.z;
            el.classList.add('visible');
            el.classList.toggle('active', state.selected === def.id);
          }
        } else {
          el.classList.remove('visible');
        }
      }
    });

    updateShellFade(Math.min(1, Math.max(maxFactor * 1.15, state.selected ? 0.35 : 0)));

    // 标注避让：按 y 排序后简单堆叠
    if (state.showLabels) {
      const vis = Object.keys(labelMap)
        .map(function (k) { return labelMap[k]; })
        .filter(function (el) { return el.classList.contains('visible'); })
        .sort(function (a, b) { return parseFloat(a.dataset.y) - parseFloat(b.dataset.y); });
      for (let i = 1; i < vis.length; i++) {
        const prev = vis[i - 1], cur = vis[i];
        const dy = parseFloat(cur.dataset.y) - parseFloat(prev.dataset.adjustedY || prev.dataset.y);
        if (dy < 30) {
          const ny = parseFloat(prev.dataset.adjustedY || prev.dataset.y) + 30;
          cur.dataset.adjustedY = ny;
          cur.style.transform = 'translate(-50%,-50%) translate(' + cur.dataset.x + 'px,' + ny + 'px)';
        } else {
          cur.dataset.adjustedY = cur.dataset.y;
        }
      }
      vis.forEach(function (el, i) { if (i === 0) el.dataset.adjustedY = el.dataset.y; });
    }

    // 选中部件的相机注视点
    const wantTarget = state.selected && parts[state.selected]
      ? parts[state.selected].group.position.clone().multiplyScalar(0.62)
      : HOME_TARGET;
    controls.target.lerp(wantTarget, Math.min(1, dt * 2.4));

    // 拆解时自动后撤机位，保证所有部件都在画面内（用户手动缩放后不再干预）
    if (state.introDone && !state.userZoomed) {
      const dir = _v.copy(camera.position).sub(controls.target);
      const cur = dir.length();
      const want = HOME_CAM.length() * (1 + 0.3 * state.global);
      camera.position.copy(controls.target).addScaledVector(dir.normalize(), cur + (want - cur) * Math.min(1, dt * 1.5));
    }

    // 背景动效
    ringA.rotation.z += dt * 0.06;
    ringC.rotation.z -= dt * 0.11;
    ringB.rotation.z += dt * 0.03;
    dust.rotation.y += dt * 0.012;
    accentLight.position.x = Math.sin(t * 0.45) * 6.5;
    accentLight.position.z = Math.cos(t * 0.45) * 6.5;
    pool.material.opacity = 0.17 + Math.sin(t * 1.6) * 0.03;

    controls.update();

    if (composer) composer.render();
    else renderer.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      const l = document.getElementById('loading');
      if (l) { l.classList.add('hidden'); setTimeout(function () { l.style.display = 'none'; }, 600); }
      updateStatusChip();
    }
  }

  animate();

  /* 调试句柄：便于自动化校验渲染与交互状态（不影响正常使用） */
  window.__DJI_DEBUG = {
    THREE: THREE, state: state, parts: parts, model: model,
    camera: camera, controls: controls, scene: scene, renderer: renderer,
    selectPart: selectPart, setExplodeAll: setExplodeAll, resetView: resetView
  };
})();