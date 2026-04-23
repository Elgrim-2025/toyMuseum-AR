// ── 1) 이미지 타겟 데이터 주입 ───────────────────────────────────────────────
(function () {
  var TARGET_NAMES = [
    'greet', 'timeline', 'Demon', 'super', 'starwars',
    'Gundum', 'marvel', 'lego', 'lastgreet', 'eldran', 'DC'
  ];

  var dataPromises = TARGET_NAMES.map(function (name) {
    return fetch('./assets/image-targets/' + name + '.json')
      .then(function (r) { return r.json(); })
      .catch(function (e) { console.error('[IT] 로드 실패:', name, e); return null; });
  });

  function intercept() {
    var orig = XR8.XrController.configure.bind(XR8.XrController);
    XR8.XrController.configure = function (opts) {
      opts = opts || {};
      Promise.all(dataPromises).then(function (list) {
        opts.imageTargetData = list.filter(Boolean);
        console.log('[IT] 타겟 주입:', opts.imageTargetData.map(function (d) { return d.name; }));
        orig(opts);
      });
    };
  }

  if (window.XR8) { intercept(); }
  else { window.addEventListener('xrloaded', intercept); }
})();

// ── 2) 멀티 타겟 크로마키 ────────────────────────────────────────────────────
(function () {
  'use strict';

  // ══ 크로마키 설정 ══
  var KEY_R      = 0.0;
  var KEY_G      = 1.0;
  var KEY_B      = 0.0;
  var SIMILARITY = 0.35;
  var SMOOTHNESS = 0.08;
  var SPILL      = 3.0;

  // ══ 핀치줌 설정 ══
  var MIN_SCALE = 0.3;
  var MAX_SCALE = 3.0;

  // ══ 타겟 → 영상 URL ══
  var VIDEO_MAP = {
    'greet':     'https://toyarassets.elgrim.kr/01.mp4',
    'timeline':  'https://toyarassets.elgrim.kr/timeline.mp4',
    'Demon':     'https://toyarassets.elgrim.kr/Demon.mp4',
    'super':     'https://toyarassets.elgrim.kr/super-ranger.mp4',
    'starwars':  'https://toyarassets.elgrim.kr/starwars.mp4',
    'Gundum':    'https://toyarassets.elgrim.kr/robot.mp4',
    'marvel':    'https://toyarassets.elgrim.kr/marvel.mp4',
    'lego':      'https://toyarassets.elgrim.kr/lego.mp4',
    'lastgreet': 'https://toyarassets.elgrim.kr/last.mp4',
    'eldran':    'https://toyarassets.elgrim.kr/Eldran.mp4',
    'DC':        'https://toyarassets.elgrim.kr/DC.mp4'
  };

  var vertSrc =
    'varying vec2 vUv;' +
    'void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';

  var fragSrc =
    'precision mediump float;' +
    'uniform sampler2D map;uniform vec3 keyColor;' +
    'uniform float similarity;uniform float smoothness;uniform float spill;' +
    'varying vec2 vUv;' +
    'void main(){' +
    '  vec4 c=texture2D(map,vUv);' +
    '  float Y1=0.299*keyColor.r+0.587*keyColor.g+0.114*keyColor.b;' +
    '  float Cr1=keyColor.r-Y1;float Cb1=keyColor.b-Y1;' +
    '  float Y2=0.299*c.r+0.587*c.g+0.114*c.b;' +
    '  float Cr2=c.r-Y2;float Cb2=c.b-Y2;' +
    '  float d=sqrt((Cr2-Cr1)*(Cr2-Cr1)+(Cb2-Cb1)*(Cb2-Cb1));' +
    '  float a=smoothstep(similarity,similarity+smoothness,d);' +
    '  float spillVal=max(0.0,c.g-max(c.r,c.b));' +
    '  a=min(a,1.0-clamp(spillVal*spill,0.0,1.0));' +
    '  gl_FragColor=vec4(c.rgb,a);' +
    '}';

  var entries = {};  // name → { anchor, video, mesh }

  function getXrScene() {
    if (!window.XR8) return null;
    if (XR8.CloudStudioThreejs && XR8.CloudStudioThreejs.xrScene)
      return XR8.CloudStudioThreejs.xrScene();
    if (XR8.Threejs && XR8.Threejs.xrScene)
      return XR8.Threejs.xrScene();
    return null;
  }

  function createEntry(name) {
    var xr = getXrScene();
    if (!xr || !window.THREE) { console.warn('[CK] scene 없음:', name); return null; }

    var vid = document.createElement('video');
    vid.src = VIDEO_MAP[name] || '';
    vid.loop = true;
    vid.muted = true;
    vid.playsInline = true;
    vid.setAttribute('playsinline', '');
    vid.crossOrigin = 'anonymous';
    vid.load();

    var vTex = new THREE.VideoTexture(vid);
    vTex.minFilter = THREE.LinearFilter;
    vTex.magFilter = THREE.LinearFilter;
    vTex.generateMipmaps = false;

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        map:        { value: vTex },
        keyColor:   { value: new THREE.Color(KEY_R, KEY_G, KEY_B) },
        similarity: { value: SIMILARITY },
        smoothness: { value: SMOOTHNESS },
        spill:      { value: SPILL }
      },
      vertexShader:       vertSrc,
      fragmentShader:     fragSrc,
      transparent:        true,
      depthWrite:         false,
      blending:           THREE.NormalBlending,
      premultipliedAlpha: false,
      side:               THREE.DoubleSide
    });

    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.scale.set(0.8, 1.2, 1.2);
    mesh.position.set(0, 0.06, 0.3);

    var anchor = new THREE.Object3D();
    anchor.add(mesh);
    anchor.visible = false;
    xr.scene.add(anchor);

    console.log('[CK] 엔트리 생성:', name);
    return { anchor: anchor, video: vid, mesh: mesh };
  }

  function getOrCreate(name) {
    if (!entries[name]) entries[name] = createEntry(name);
    return entries[name];
  }

  function registerPipeline() {
    XR8.addCameraPipelineModules([{
      name: 'chromakey-multi',

      listeners: [
        {
          event: 'reality.imagefound',
          process: function (e) {
            var name   = e.detail.name;
            var detail = e.detail;
            var entry  = getOrCreate(name);
            if (!entry) return;

            entry.anchor.position.copy(detail.position);
            entry.anchor.quaternion.copy(detail.rotation);
            entry.anchor.visible = true;

            entry.video.muted = false;
            entry.video.play().catch(function () {});
            console.log('[CK] 인식:', name);
          }
        },
        {
          event: 'reality.imageupdated',
          process: function (e) {
            var entry = entries[e.detail.name];
            if (!entry) return;
            entry.anchor.position.copy(e.detail.position);
            entry.anchor.quaternion.copy(e.detail.rotation);
          }
        },
        {
          event: 'reality.imagelost',
          process: function (e) {
            var entry = entries[e.detail.name];
            if (!entry) return;
            entry.anchor.visible = false;
            entry.video.pause();
            console.log('[CK] 소실:', e.detail.name);
          }
        }
      ],

      onStart: function () { console.log('[CK] pipeline 시작'); }
    }]);
  }

  if (window.XR8) { registerPipeline(); }
  else { window.addEventListener('xrloaded', registerPipeline); }

  // ── 핀치줌 ──────────────────────────────────────────────────────────────────
  var pinching    = false;
  var initDist    = 0;
  var initScale   = { x: 0, y: 0 };
  var pinchTarget = null;

  function touchDist(t) {
    var dx = t[0].clientX - t[1].clientX;
    var dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getVisibleEntry() {
    var keys = Object.keys(entries);
    for (var i = 0; i < keys.length; i++) {
      if (entries[keys[i]] && entries[keys[i]].anchor.visible) return keys[i];
    }
    return null;
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 2) return;
    var name = getVisibleEntry();
    if (!name) return;
    pinchTarget = name;
    pinching    = true;
    initDist    = touchDist(e.touches);
    initScale   = { x: entries[name].mesh.scale.x, y: entries[name].mesh.scale.y };
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!pinching || e.touches.length !== 2 || !pinchTarget) return;
    var entry = entries[pinchTarget];
    if (!entry) return;
    var ratio = touchDist(e.touches) / initDist;
    entry.mesh.scale.set(
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, initScale.x * ratio)),
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, initScale.y * ratio)),
      entry.mesh.scale.z
    );
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) { pinching = false; pinchTarget = null; }
  }, { passive: true });
})();
