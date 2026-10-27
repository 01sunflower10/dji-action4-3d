/* ==========================================================================
   DJI Osmo Action 4 · 程序化建模
   所有几何体均由 Three.js 基础图元 / Shape 挤出实时生成，
   不加载任何外部模型、贴图或字体文件。
   ========================================================================== */

window.buildDJIModel = function (THREE, PARTS) {
  const byId = {};
  PARTS.forEach(function (p) { byId[p.id] = p; });

  const root = new THREE.Group();
  root.name = 'OsmoAction4';

  const parts = {};          // id -> { def, group, meshes, materials, outlines }
  let current = null;

  // 真实机身尺寸（单位：cm）70.5 × 44.2 × 32.8 mm
  const W = 7.05, H = 4.42, D = 3.28;
  const hx = W / 2, hy = H / 2, hz = D / 2;

  /* ---------------------------------------------------------------- 几何工具 */

  // 圆角矩形 Shape
  function roundedShape(w, h, r) {
    const s = new THREE.Shape();
    const x = w / 2, y = h / 2;
    r = Math.min(r, x - 0.001, y - 0.001);
    s.moveTo(-x + r, -y);
    s.lineTo(x - r, -y);
    s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r);
    s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y);
    s.quadraticCurveTo(-x, y, -x, y - r);
    s.lineTo(-x, -y + r);
    s.quadraticCurveTo(-x, -y, -x + r, -y);
    return s;
  }

  // 平滑法线：合并重复顶点后重算，让挤出圆角呈现柔和的倒角高光
  function smooth(geo) {
    try {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      const merged = THREE.BufferGeometryUtils.mergeVertices(g, 1e-4);
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      return merged;
    } catch (e) {
      geo.computeVertexNormals();
      return geo;
    }
  }

  // 圆角立方体：Shape 挤出 + 椭圆倒角。
  // 关键：挤出时倒角会沿法线外扩 bevelSize，因此截面形状需预先内缩，
  // 这样最终 XY 尺寸精确等于 w × h、圆角半径精确等于 r、厚度精确等于 d。
  function roundBox(w, h, d, r, seg) {
    r = Math.min(r, d / 2 - 0.002, w / 2 - 0.01, h / 2 - 0.01);
    const s = r / 2;                        // 倒角厚度与横向外扩量
    const R = Math.max(r - s, 0.0005);      // 截面圆角半径 = r - s
    const geo = new THREE.ExtrudeGeometry(roundedShape(w - r, h - r, R), {
      depth: d - r,
      bevelEnabled: true,
      bevelThickness: s,
      bevelSize: s,
      bevelSegments: seg || 4,
      curveSegments: 6,
      steps: 1
    });
    geo.center();
    return smooth(geo);
  }

  /* -------------------------------------------------------------- Canvas 贴图 */

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }

  function mono(size, weight) {
    return (weight || 600) + ' ' + size + 'px "JetBrains Mono", Consolas, monospace';
  }
  function sans(size, weight) {
    return (weight || 600) + ' ' + size + 'px Inter, "PingFang SC", "Microsoft YaHei", sans-serif';
  }

  // 后置屏幕取景界面
  const texRearHUD = canvasTex(1024, 566, function (ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1a26'); g.addColorStop(0.55, '#07131d'); g.addColorStop(1, '#040a11');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // 三分构图线
    ctx.strokeStyle = 'rgba(120, 200, 235, 0.13)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(w * i / 3, 0); ctx.lineTo(w * i / 3, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * i / 3); ctx.lineTo(w, h * i / 3); ctx.stroke();
    }
    // 中心对焦框
    ctx.strokeStyle = 'rgba(140, 220, 250, 0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(w / 2 - 70, h / 2 - 70, 140, 140);
    ctx.beginPath(); ctx.moveTo(w / 2 - 26, h / 2); ctx.lineTo(w / 2 + 26, h / 2);
    ctx.moveTo(w / 2, h / 2 - 26); ctx.lineTo(w / 2, h / 2 + 26); ctx.stroke();

    // 四角取景框
    ctx.strokeStyle = 'rgba(160, 235, 255, 0.75)';
    ctx.lineWidth = 5;
    const m = 34, L = 74;
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * L, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * L);
      ctx.stroke();
    });

    // 顶部信息条
    ctx.fillStyle = 'rgba(6, 16, 24, 0.72)';
    ctx.fillRect(m, m + 10, 300, 58);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = mono(38, 700);
    ctx.fillText('4K 120', m + 16, m + 54);

    ctx.fillStyle = 'rgba(6, 16, 24, 0.72)';
    ctx.fillRect(w - m - 300, m + 10, 300, 58);
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(w - m - 272, m + 40, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eaf7ff';
    ctx.font = mono(32, 700);
    ctx.fillText('REC 00:12:47', w - m - 248, m + 51);

    // 电池图标
    ctx.strokeStyle = '#8fd7ff'; ctx.lineWidth = 3;
    ctx.strokeRect(w - m - 96, m + 26, 62, 28);
    ctx.fillStyle = '#7dc9f5'; ctx.fillRect(w - m - 92, m + 30, 40, 20);
    ctx.fillRect(w - m - 32, m + 34, 6, 12);

    // 底部参数
    ctx.fillStyle = 'rgba(6, 16, 24, 0.68)';
    ctx.fillRect(m, h - m - 56, 470, 46);
    ctx.fillStyle = '#9fe4ff';
    ctx.font = mono(30, 600);
    ctx.fillText('D-Log M  ·  10-bit  ·  1/240  ·  ISO 100', m + 16, h - m - 24);

    // 增稳 / 视角
    ctx.fillStyle = 'rgba(6, 16, 24, 0.68)';
    ctx.fillRect(w - m - 400, h - m - 56, 400, 46);
    ctx.fillStyle = '#c9f2a0';
    ctx.font = mono(30, 600);
    ctx.fillText('RS 3.0  ·  FOV 155°  ·  Wi-Fi 6', w - m - 384, h - m - 24);

    // 水印
    ctx.fillStyle = 'rgba(190, 230, 250, 0.35)';
    ctx.font = sans(26, 600);
    ctx.textAlign = 'right';
    ctx.fillText('OSMO ACTION 4', w / 2 + 168, h / 2 + 150);
    ctx.textAlign = 'left';
  });

  // 前置小屏
  const texFrontHUD = canvasTex(512, 512, function (ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1d2a'); g.addColorStop(1, '#050c14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(140, 220, 250, 0.5)'; ctx.lineWidth = 6;
    ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.fillStyle = '#eaf7ff';
    ctx.font = mono(60, 700);
    ctx.fillText('1080P', 58, 120);
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(80, 232, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eaf7ff';
    ctx.font = mono(52, 700);
    ctx.fillText('REC', 118, 250);
    ctx.font = mono(44, 600);
    ctx.fillStyle = '#9fe4ff';
    ctx.fillText('00:12:47', 58, 340);
    ctx.fillStyle = '#8fd7ff';
    ctx.fillRect(58, 390, 200, 26);
    ctx.font = mono(34, 600);
    ctx.fillStyle = 'rgba(200, 240, 255, 0.75)';
    ctx.fillText('RS 3.0', 58, 462);
  });

  // DJI 品牌字标
  const texLogo = canvasTex(512, 128, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#e8f2fb';
    ctx.font = 'italic 800 78px Inter, Arial, sans-serif';
    ctx.fillText('DJI', 8, 84);
    ctx.fillStyle = 'rgba(190, 225, 250, 0.82)';
    ctx.font = sans(34, 700);
    ctx.fillText('ACTION 4', 152, 82);
  });

  // 侧面型号字
  const texSide = canvasTex(512, 96, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(214, 236, 252, 0.9)';
    ctx.font = sans(40, 600);
    ctx.fillText('OSMO  ACTION 4', 6, 60);
  });

  // 镜头规格环字
  const texLensText = canvasTex(512, 96, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(226, 240, 252, 0.88)';
    ctx.font = mono(46, 600);
    ctx.textAlign = 'center';
    ctx.fillText('155°  F2.8', w / 2, 62);
    ctx.textAlign = 'left';
  });

  // 电池标签
  const texBattery = canvasTex(512, 320, function (ctx, w, h) {
    ctx.fillStyle = '#1d2733'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b3a4b'; ctx.fillRect(0, 0, w, 58);
    ctx.fillStyle = '#eaf3ff';
    ctx.font = 'italic 800 40px Inter, Arial, sans-serif';
    ctx.fillText('DJI', 20, 42);
    ctx.font = sans(26, 600);
    ctx.fillStyle = '#9fb6cc';
    ctx.fillText('INTELLIGENT FLIGHT BATTERY', 118, 40);
    ctx.fillStyle = '#dfeaf6';
    ctx.font = mono(46, 700);
    ctx.fillText('1770 mAh', 26, 138);
    ctx.font = mono(34, 600);
    ctx.fillStyle = '#8fa6bd';
    ctx.fillText('6.8 Wh   Li-ion  7.38 V', 26, 186);
    // 触点
    ctx.fillStyle = '#c9a44a';
    [0, 1, 2].forEach(function (i) { ctx.fillRect(30 + i * 74, 214, 56, 34); });
    // 警示
    ctx.strokeStyle = '#e0b64c'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(430, 214); ctx.lineTo(464, 274); ctx.lineTo(396, 274); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#e0b64c';
    ctx.font = mono(30, 700);
    ctx.fillText('!', 426, 268);
    // 条码
    ctx.fillStyle = '#0f1620';
    ctx.fillRect(26, 268, 300, 34);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 3 ? '#e8f0f8' : '#0f1620';
      ctx.fillRect(30 + i * 4.8, 272, 2, 26);
    }
  });

  // 接口仓门标签
  const texPort = canvasTex(256, 512, function (ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(212, 236, 252, 0.85)';
    ctx.font = mono(34, 600);
    ctx.textAlign = 'center';
    ctx.fillText('USB-C 3.0', w / 2, 150);
    ctx.fillText('microSD', w / 2, 330);
    ctx.fillStyle = 'rgba(212, 236, 252, 0.45)';
    ctx.font = mono(26, 500);
    ctx.fillText('DOOR', w / 2, 250);
    ctx.textAlign = 'left';
  });

  /* ------------------------------------------------------------ 部件装配框架 */

  function begin(id) {
    const def = byId[id];
    const group = new THREE.Group();
    group.name = id;
    group.userData.partId = id;
    root.add(group);
    current = {
      id: id,
      def: def,
      group: group,
      meshes: [],
      materials: [],
      outlines: [],
      anchors: []
    };
    parts[id] = current;
    return group;
  }

  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x7ff2ff,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  });

  function add(geo, mat, pos, rot, opt) {
    opt = opt || {};
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (opt.scale) m.scale.set(opt.scale[0], opt.scale[1], opt.scale[2]);
    m.userData.partId = current.id;
    m.castShadow = true;
    current.group.add(m);
    current.meshes.push(m);
    if (current.materials.indexOf(mat) < 0) current.materials.push(mat);

    if (!opt.noOutline && !opt.noMesh) {
      const o = new THREE.Mesh(geo, outlineMat);
      o.position.copy(m.position);
      o.rotation.copy(m.rotation);
      o.scale.copy(m.scale).multiplyScalar(opt.outlineScale || 1.045);
      o.visible = false;
      o.userData.outline = true;
      o.raycast = function () {};
      current.group.add(o);
      current.outlines.push(o);
    }
    return m;
  }

  function addTextPlane(tex, w, h, pos, rot, op) {
    op = op || {};
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: op.opacity === undefined ? 0.95 : op.opacity,
      depthWrite: false,
      toneMapped: false
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.userData.partId = current.id;
    current.group.add(m);
    current.meshes.push(m);
    if (current.materials.indexOf(mat) < 0) current.materials.push(mat);
    return m;
  }

  /* ============================================================== 1. 机身外壳 */

  begin('shell');
  const mShell = new THREE.MeshPhysicalMaterial({
    color: 0x0c1017, metalness: 0.62, roughness: 0.33,
    clearcoat: 0.75, clearcoatRoughness: 0.22, envMapIntensity: 1.3
  });
  const mShellPlate = new THREE.MeshStandardMaterial({
    color: 0x11161f, metalness: 0.35, roughness: 0.68, envMapIntensity: 0.9
  });
  const mGroove = new THREE.MeshStandardMaterial({ color: 0x05070b, metalness: 0.2, roughness: 0.9 });

  add(roundBox(W, H, D, 0.46, 5), mShell, [0, 0, 0]);                       // 主机身
  add(roundBox(W - 0.36, H - 0.34, 0.16, 0.34, 3), mShellPlate, [0, 0, hz - 0.07]);   // 前面板
  add(roundBox(W - 0.36, H - 0.34, 0.16, 0.34, 3), mShellPlate, [0, 0, -(hz - 0.07)]); // 后面板
  // 侧面防滑纹（凸出侧面约 0.03）
  for (let i = 0; i < 5; i++) {
    add(new THREE.BoxGeometry(0.06, 1.5, 0.09), mGroove, [hx + 0.005, 0.15, -0.85 + i * 0.42]);
    add(new THREE.BoxGeometry(0.06, 1.5, 0.09), mGroove, [-(hx + 0.005), 0.15, -0.85 + i * 0.42]);
  }
  addTextPlane(texLogo, 1.9, 0.475, [1.05, -1.62, hz + 0.015], null, { opacity: 0.92 });   // 正面字标
  addTextPlane(texSide, 2.3, 0.43, [hx + 0.012, 1.55, 0.1], [0, Math.PI / 2, 0], { opacity: 0.7 }); // 侧面型号

  /* ============================================================ 2. 前镜头模组 */

  const LENS_HOME = [-1.75, 0.08, 1.20];
  begin('lens');
  const mLensBody = new THREE.MeshStandardMaterial({ color: 0x0e131a, metalness: 0.45, roughness: 0.62 });
  const mLensRing = new THREE.MeshStandardMaterial({ color: 0x9aa6b4, metalness: 1.0, roughness: 0.24, envMapIntensity: 1.5 });
  const mLensDark = new THREE.MeshStandardMaterial({ color: 0x14181f, metalness: 0.85, roughness: 0.4 });
  const mGlass = new THREE.MeshStandardMaterial({
    color: 0x060b14, metalness: 0.55, roughness: 0.045, envMapIntensity: 2.8
  });
  const mAmber = new THREE.MeshStandardMaterial({ color: 0x3a2a12, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.6 });

  add(roundBox(2.95, 2.95, 0.34, 0.5, 4), mLensBody, [0, 0, 0.30]);            // 镜头方形基座
  add(new THREE.CylinderGeometry(0.98, 0.98, 0.42, 56, 1, true), mLensDark,   // 镜筒
    [0, 0, 0.4], [Math.PI / 2, 0, 0]);
  add(new THREE.TorusGeometry(1.0, 0.055, 14, 64), mLensRing, [0, 0, 0.58]);   // 金属压圈
  add(new THREE.TorusGeometry(0.86, 0.035, 12, 64), mLensDark, [0, 0, 0.52]);  // 内圈
  add(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 48), mAmber,                // 光圈环
    [0, 0, 0.5], [Math.PI / 2, 0, 0]);
  add(new THREE.SphereGeometry(0.9, 64, 32), mGlass, [0, 0, 0.46], null, { scale: [1, 1, 0.26], outlineScale: 1.03 }); // 前镜片
  addTextPlane(texLensText, 1.35, 0.253, [0, -1.06, 0.49], null, { opacity: 0.85 });

  /* ========================================================== 3. CMOS 传感器 */

  const SENSOR_HOME = [-1.75, 0.08, 0.42];
  begin('sensor');
  const mSubstrate = new THREE.MeshStandardMaterial({ color: 0x0a3524, metalness: 0.3, roughness: 0.6 });
  const mDie = new THREE.MeshStandardMaterial({ color: 0x08131c, metalness: 0.9, roughness: 0.1, envMapIntensity: 2.2 });
  const mFlex = new THREE.MeshStandardMaterial({ color: 0xb8862f, metalness: 0.65, roughness: 0.42 });
  const mCopper = new THREE.MeshStandardMaterial({ color: 0xb06a34, metalness: 1.0, roughness: 0.35, envMapIntensity: 1.2 });

  add(new THREE.BoxGeometry(1.2, 0.95, 0.08), mSubstrate, [0, 0, 0]);           // 基板
  add(new THREE.BoxGeometry(1.0, 0.76, 0.06), mDie, [0, 0, 0.07]);              // 感光芯片
  add(new THREE.BoxGeometry(1.06, 0.82, 0.02), mGlass, [0, 0, 0.11], null, { noOutline: true }); // 保护玻璃
  add(new THREE.BoxGeometry(1.34, 1.05, 0.05), mCopper, [0, 0, -0.07]);         // 铜质散热背板
  add(new THREE.BoxGeometry(0.6, 0.16, 1.15), mFlex, [0, -0.55, -0.28], [0.32, 0, 0]); // 排线
  for (let i = 0; i < 8; i++) {                                                 // 焊点
    add(new THREE.BoxGeometry(0.05, 0.05, 0.12), mFlex, [-0.44 + i * 0.125, 0.5, 0.02]);
  }

  /* ========================================================= 4. 主控板 / SoC */

  const BOARD_HOME = [-0.95, -1.05, 0.05];
  begin('mainboard');
  const mPCB = new THREE.MeshStandardMaterial({ color: 0x0b3527, metalness: 0.25, roughness: 0.62 });
  const mChip = new THREE.MeshStandardMaterial({ color: 0x1a1f27, metalness: 0.7, roughness: 0.45 });
  const mShield = new THREE.MeshStandardMaterial({ color: 0x8d97a4, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.4 });
  const mGold = new THREE.MeshStandardMaterial({ color: 0xc9a44a, metalness: 1.0, roughness: 0.28, envMapIntensity: 1.3 });

  add(new THREE.BoxGeometry(4.4, 0.12, 2.7), mPCB, [0, 0, 0]);                  // PCB
  add(new THREE.BoxGeometry(4.0, 0.02, 2.35, 1), mPCB, [0, 0.07, 0], null, { noOutline: true });
  // SoC 与屏蔽罩
  add(new THREE.BoxGeometry(1.5, 0.2, 1.5), mChip, [-0.6, 0.16, 0.05]);
  add(new THREE.BoxGeometry(1.62, 0.1, 1.62), mShield, [-0.6, 0.29, 0.05]);
  add(new THREE.BoxGeometry(1.5, 0.14, 1.0), mShield, [1.0, 0.14, -0.7]);
  // 铜散热片 + 鳍片
  add(new THREE.BoxGeometry(1.8, 0.1, 1.6), mCopper, [-0.6, 0.42, 0.05]);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.05, 0.24, 1.5), mCopper, [-1.35 + i * 0.5, 0.57, 0.05]);
  }
  // 周边元件
  const chips = [
    [1.3, 0.16, 0.6, 0.4], [1.55, 0.15, 0.05, 0.3], [0.35, 0.15, 1.0, 0.36],
    [-1.9, 0.15, 0.9, 0.3], [-1.6, 0.14, -1.0, 0.26], [0.3, 0.13, -1.0, 0.3]
  ];
  chips.forEach(function (c) {
    add(new THREE.BoxGeometry(c[3], 0.14, c[3]), mChip, [c[0], c[1], c[2]]);
  });
  for (let i = 0; i < 5; i++) {                                                 // 电容
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.24, 20), mShield, [1.0 - i * 0.32, 0.18, -1.05]);
  }
  // 金手指与走线
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(2.2, 0.02, 0.05), mGold, [-0.5, 0.075, 1.0 - i * 0.22], null, { noOutline: true });
  }
  add(new THREE.BoxGeometry(0.6, 0.18, 0.36), mChip, [1.2, 0.15, 0.75]);        // 排线座
  add(new THREE.BoxGeometry(0.3, 0.12, 0.3), mChip, [-0.2, 0.14, 1.15]);        // 陀螺仪

  /* ============================================================== 5. 电池 */

  const BATTERY_HOME = [1.95, 0.42, -0.1];
  begin('battery');
  const mBattCase = new THREE.MeshStandardMaterial({ color: 0x1a2330, metalness: 0.35, roughness: 0.66 });
  const mBattLabel = new THREE.MeshStandardMaterial({ map: texBattery, metalness: 0.2, roughness: 0.72 });
  const mBattGold = new THREE.MeshStandardMaterial({ color: 0xc9a44a, metalness: 1.0, roughness: 0.3 });

  add(roundBox(2.5, 2.9, 2.3, 0.18, 3), mBattCase, [0, 0, 0]);                  // 电芯外壳
  add(new THREE.BoxGeometry(2.2, 1.4, 0.02), mBattLabel, [0, -0.1, 1.16], null, { noOutline: true });
  for (let i = 0; i < 3; i++) {                                                 // 电极触点
    add(new THREE.BoxGeometry(0.22, 0.09, 0.34), mBattGold, [-0.6 + i * 0.66, 1.47, -0.2]);
  }
  for (let i = 0; i < 3; i++) {                                                 // 侧面防滑纹
    add(new THREE.BoxGeometry(0.06, 2.4, 0.1), mBattCase, [1.28, 0, -0.6 + i * 0.62]);
  }
  add(new THREE.BoxGeometry(2.5, 0.1, 2.3), mBattCase, [0, -1.48, 0]);

  /* ======================================================== 6. 后置触摸屏 */

  begin('screenRear');
  const mScrBezel = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.3, roughness: 0.72 });
  const mScrGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0b1420, metalness: 0.7, roughness: 0.06, envMapIntensity: 2.2,
    transparent: true, opacity: 0.22, side: THREE.DoubleSide
  });

  add(roundBox(5.6, 3.35, 0.24, 0.3, 3), mScrBezel, [0, 0, 0]);                 // 边框
  addTextPlane(texRearHUD, 5.0, 2.76, [0, 0, -0.135], [0, Math.PI, 0], { opacity: 1 });
  add(new THREE.PlaneGeometry(5.2, 2.95), mScrGlass, [0, 0, -0.15], [0, Math.PI, 0], { noOutline: true });

  /* ======================================================== 7. 前置显示屏 */

  const FRONT_SCREEN_HOME = [1.92, 0.5, 1.62];
  begin('screenFront');
  const mScrBezelF = new THREE.MeshStandardMaterial({ color: 0x0a0e14, metalness: 0.3, roughness: 0.72 });

  add(roundBox(1.85, 1.85, 0.2, 0.2, 3), mScrBezelF, [0, 0, 0]);
  addTextPlane(texFrontHUD, 1.5, 1.5, [0, 0, 0.108], null, { opacity: 1 });
  add(new THREE.PlaneGeometry(1.62, 1.62), mScrGlass, [0, 0, 0.12], null, { noOutline: true });

  /* ================================================= 8. 顶部按键与麦克风 */

  const BUTTONS_HOME = [0, hy, 0.28];   // 局部原点落在机身顶面 y = +2.21
  begin('buttons');
  const mBtnDark = new THREE.MeshStandardMaterial({ color: 0x171c24, metalness: 0.55, roughness: 0.5 });
  const mBtnRing = new THREE.MeshStandardMaterial({ color: 0x8f99a6, metalness: 1.0, roughness: 0.28 });
  const mRecRing = new THREE.MeshStandardMaterial({
    color: 0x3a0d10, emissive: 0xff3b46, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.45
  });
  const mSlit = new THREE.MeshStandardMaterial({ color: 0x030507, metalness: 0.2, roughness: 0.95 });

  // 录制键
  add(new THREE.CylinderGeometry(0.44, 0.46, 0.2, 44), mBtnRing, [1.62, 0.08, 0.12]);
  add(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 40), mBtnDark, [1.62, 0.2, 0.12]);
  add(new THREE.TorusGeometry(0.4, 0.035, 12, 48), mRecRing, [1.62, 0.19, 0.12], [Math.PI / 2, 0, 0]);
  // 快速切换键
  add(new THREE.CylinderGeometry(0.36, 0.38, 0.17, 36), mBtnRing, [-1.7, 0.07, 0.12]);
  add(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 32), mBtnDark, [-1.7, 0.17, 0.12]);
  // 状态指示灯
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20), mRecRing, [-2.4, 0.02, 0.85]);
  // 顶部麦克风阵列：微凸的深色格栅板 + 开孔
  add(roundBox(1.5, 0.1, 0.66, 0.03, 2), mSlit, [0.15, 0.02, 0.1]);
  for (let i = 0; i < 5; i++) {
    add(new THREE.BoxGeometry(0.09, 0.05, 0.5), mSlit, [-0.45 + i * 0.28, 0.075, 0.1], null, { noOutline: true });
  }
  // 正面麦克风开孔（机身前面板上沿）
  add(roundBox(1.1, 0.42, 0.1, 0.03, 2), mSlit, [-0.55, -0.62, 1.39]);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.08, 0.28, 0.06), mSlit, [-0.9 + i * 0.22, -0.62, 1.46], null, { noOutline: true });
  }

  /* =================================================== 9. 接口仓门与卡槽 */

  const PORT_HOME = [-(hx - 0.065), -0.3, 0.35];   // 仓门外表面略微凸出机身左侧
  begin('port');
  const mDoor = new THREE.MeshStandardMaterial({ color: 0x12171f, metalness: 0.4, roughness: 0.6 });
  const mPortDark = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.9 });
  const mPortMetal = new THREE.MeshStandardMaterial({ color: 0x9fa9b6, metalness: 1.0, roughness: 0.3, envMapIntensity: 1.4 });
  const mCard = new THREE.MeshStandardMaterial({ color: 0x14181d, metalness: 0.2, roughness: 0.7 });

  add(roundBox(0.24, 2.7, 2.25, 0.12, 3), mDoor, [0, 0, 0]);                    // 密封仓门（外表面 x = -0.12）
  add(new THREE.BoxGeometry(0.06, 0.3, 0.2), mPortMetal, [-0.14, 1.12, -0.75]); // 开启卡扣
  // USB-C 接口（深色开孔 + 金属舌片）
  add(new THREE.BoxGeometry(0.1, 0.62, 1.06), mPortDark, [-0.1, -0.45, 0.35]);
  add(new THREE.BoxGeometry(0.08, 0.22, 0.68), mPortMetal, [-0.13, -0.45, 0.35]);
  add(new THREE.BoxGeometry(0.04, 0.1, 0.5), mPortDark, [-0.155, -0.45, 0.35], null, { noOutline: true });
  // microSD 卡槽
  add(new THREE.BoxGeometry(0.1, 0.18, 0.58), mPortDark, [-0.1, 0.45, 0.35]);
  add(new THREE.BoxGeometry(0.06, 0.1, 0.46), mCard, [-0.14, 0.45, 0.35]);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.3), mBattGold, [-0.16, 0.45, 0.35], null, { noOutline: true });
  addTextPlane(texPort, 0.5, 1.0, [-0.128, -0.42, -0.5], [0, -Math.PI / 2, 0], { opacity: 0.6 });

  /* =================================================== 10. 磁吸快拆底座 */

  const MOUNT_HOME = [0, -2.05, 0];
  begin('mount');
  const mMountPlate = new THREE.MeshStandardMaterial({ color: 0x151a22, metalness: 0.55, roughness: 0.55 });
  const mMountMetal = new THREE.MeshStandardMaterial({ color: 0xa8b2bf, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.35 });
  const mMagnet = new THREE.MeshStandardMaterial({ color: 0x2a3038, metalness: 0.95, roughness: 0.42 });
  const mPad = new THREE.MeshStandardMaterial({ color: 0x0a0c10, metalness: 0.05, roughness: 0.95 });

  add(roundBox(5.2, 0.36, 2.75, 0.16, 3), mMountPlate, [0, -0.05, 0]);          // 底座板
  add(new THREE.TorusGeometry(0.88, 0.14, 14, 48), mMagnet, [0, -0.28, 0], [Math.PI / 2, 0, 0]); // 磁环
  add(new THREE.CylinderGeometry(0.58, 0.58, 0.3, 44), mMountMetal, [0, -0.3, 0]);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 32), mMountMetal, [0, -0.5, 0]); // 1/4" 螺纹柱
  for (let i = 0; i < 4; i++) {                                                 // 螺纹牙
    add(new THREE.TorusGeometry(0.3, 0.035, 8, 32), mMountMetal, [0, -0.34 - i * 0.1, 0], [Math.PI / 2, 0, 0], { noOutline: true });
  }
  // 折叠快拆指
  add(roundBox(0.55, 0.8, 0.36, 0.08, 2), mMountPlate, [1.0, -0.42, 0]);
  add(roundBox(0.55, 0.8, 0.36, 0.08, 2), mMountPlate, [-1.0, -0.42, 0]);
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 20), mMountMetal, [1.0, -0.72, 0], [0, 0, Math.PI / 2]);
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 20), mMountMetal, [-1.0, -0.72, 0], [0, 0, Math.PI / 2]);
  // 防滑垫
  add(new THREE.BoxGeometry(1.3, 0.08, 0.6), mPad, [1.75, -0.24, 0]);
  add(new THREE.BoxGeometry(1.3, 0.08, 0.6), mPad, [-1.75, -0.24, 0]);

  /* --------------------------------------------------------------- 收尾处理 */

  // 把每个部件移到各自的初始位置（拆解动画的“家”）
  const homes = {
    shell: [0, 0, 0],
    lens: LENS_HOME,
    sensor: SENSOR_HOME,
    mainboard: BOARD_HOME,
    battery: BATTERY_HOME,
    screenRear: [0, 0.06, -1.62],
    screenFront: FRONT_SCREEN_HOME,
    buttons: BUTTONS_HOME,
    port: PORT_HOME,
    mount: MOUNT_HOME
  };

  Object.keys(parts).forEach(function (id) {
    const rec = parts[id];
    const h = homes[id] || [0, 0, 0];
    rec.group.position.set(h[0], h[1], h[2]);
    rec.home = new THREE.Vector3(h[0], h[1], h[2]);
    rec.explode = new THREE.Vector3(
      rec.def.explode[0], rec.def.explode[1], rec.def.explode[2]
    );
    rec.labelAnchor = new THREE.Vector3(
      rec.def.labelAnchor[0], rec.def.labelAnchor[1], rec.def.labelAnchor[2]
    );
    rec.factor = 0;
    rec.selFactor = 0;
    rec.hoverFactor = 0;
    // 记录材质原始状态，供高亮 / 变暗使用
    rec.matState = rec.materials.map(function (m) {
      return {
        mat: m,
        color: m.color ? m.color.clone() : null,
        emissive: m.emissive ? m.emissive.clone() : null,
        emissiveIntensity: m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity,
        opacity: m.opacity,
        transparent: m.transparent
      };
    });
  });

  const shellRec = parts.shell;
  shellRec.group.traverse(function (o) {
    if (o.isMesh && !o.userData.outline) o.renderOrder = 2;
  });

  return {
    root: root,
    parts: parts,
    dims: { W: W, H: H, D: D },
    materials: { shell: mShell, glass: mGlass, outline: outlineMat },
    shellId: 'shell'
  };
};