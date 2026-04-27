// ── 1) 이미지 타겟 데이터 주입 ───────────────────────────────────────────────
(function () {
  var TARGET_NAMES = [
    'greet', 'timeline', 'Demon', 'super', 'starwars',
    'Gundum', 'marvel', 'lego', 'lastgreet', 'eldran', 'DC',
    'game', 'harrypotter'
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
    'lego':      'https://toyarassets.elgrim.kr/Lego.mp4',
    'lastgreet': 'https://toyarassets.elgrim.kr/last.mp4',
    'eldran':    'https://toyarassets.elgrim.kr/Eldran.mp4',
    'DC':          'https://toyarassets.elgrim.kr/DC.mp4',
    'game':        'https://toyarassets.elgrim.kr/game.mp4',
    'harrypotter': 'https://toyarassets.elgrim.kr/Harrypotter.mp4'
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

  var LOST_GRACE_MS = 2500;  // imagelost 후 실제로 숨기기까지 대기 시간(ms)

  var entries = {};  // name → { anchor, video, mesh, lostTimer }

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
    if (name === 'harrypotter') {
      mesh.scale.set(1.6, 0.9, 1.0);  // 16:9
    } else {
      mesh.scale.set(1.1, 1.5, 1.0);
    }
    mesh.position.set(0, 0, 0.35);

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

            clearTimeout(entry.lostTimer);
            entry.anchor.position.copy(detail.position);
            entry.anchor.quaternion.copy(detail.rotation);
            if (detail.scale) entry.anchor.scale.setScalar(detail.scale);
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
            clearTimeout(entry.lostTimer);
            entry.anchor.position.copy(e.detail.position);
            entry.anchor.quaternion.copy(e.detail.rotation);
            if (e.detail.scale) entry.anchor.scale.setScalar(e.detail.scale);
          }
        },
        {
          event: 'reality.imagelost',
          process: function (e) {
            var entry = entries[e.detail.name];
            if (!entry) return;
            var name = e.detail.name;
            console.log('[CK] 소실 감지 (유예 중):', name);
            clearTimeout(entry.lostTimer);
            entry.lostTimer = setTimeout(function () {
              entry.anchor.visible = false;
              entry.video.pause();
              console.log('[CK] 소실 확정:', name);
            }, LOST_GRACE_MS);
          }
        }
      ],

      onStart: function () {
        console.log('[CK] pipeline 시작');
        var overlay = document.getElementById('tap-overlay');
        if (overlay && overlay.style.display !== 'none') {
          overlay.style.opacity = '0';
          setTimeout(function () { overlay.style.display = 'none'; }, 350);
        }
        var hint = document.getElementById('ar-hint');
        if (hint && hint.style.opacity === '0') {
          hint.style.opacity = '1';
          setTimeout(function () { hint.style.opacity = '0'; }, 4000);
          setTimeout(function () { hint.style.display = 'none'; }, 4700);
        }
      }
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
    var rawRatio   = touchDist(e.touches) / initDist;
    var maxRatio   = MAX_SCALE / Math.max(initScale.x, initScale.y);
    var minRatio   = MIN_SCALE / Math.min(initScale.x, initScale.y);
    var clampedRatio = Math.min(maxRatio, Math.max(minRatio, rawRatio));
    entry.mesh.scale.set(
      initScale.x * clampedRatio,
      initScale.y * clampedRatio,
      entry.mesh.scale.z
    );
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) { pinching = false; pinchTarget = null; }
  }, { passive: true });
})();

// ── 3) 사진 촬영 ────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  // 셔터 버튼
  var btn = document.createElement('button');
  btn.style.cssText =
    'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);' +
    'width:72px;height:72px;border-radius:50%;' +
    'background:#fff;' +
    'border:4px solid rgba(255,255,255,0.35);' +
    'box-shadow:0 0 0 4px rgba(255,255,255,0.15),0 6px 24px rgba(0,0,0,0.35);' +
    'cursor:pointer;z-index:1000;outline:none;' +
    'touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
    'transition:transform .12s ease,box-shadow .12s ease,opacity .12s ease';
  document.body.appendChild(btn);

  // 플래시 오버레이
  var flash = document.createElement('div');
  flash.style.cssText =
    'position:fixed;inset:0;background:#fff;opacity:0;' +
    'pointer-events:none;z-index:998';
  document.body.appendChild(flash);

  var pendingCapture = false;

  function doFlash() {
    flash.style.transition = 'none';
    flash.style.opacity = '0.9';
    requestAnimationFrame(function () {
      flash.style.transition = 'opacity 0.5s ease';
      flash.style.opacity = '0';
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    var mime = parts[0].match(/:(.*?);/)[1];
    var binary = atob(parts[1]);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function savePhoto(dataUrl) {
    var blob = dataUrlToBlob(dataUrl);
    var file = new File([blob], 'ar-photo-' + Date.now() + '.jpg', { type: 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function (e) {
        if (e.name !== 'AbortError') openFallback(dataUrl);
      });
    } else if (!navigator.share) {
      downloadFile(dataUrl);
    } else {
      openFallback(dataUrl);
    }
  }

  function downloadFile(dataUrl) {
    var a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'ar-photo-' + Date.now() + '.jpg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openFallback(dataUrl) {
    var w = window.open('', '_blank');
    if (w) w.document.write(
      '<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}</style>' +
      '<img src="' + dataUrl + '" style="max-width:100%;max-height:100vh;display:block">'
    );
  }

  function captureCanvas() {
    var canvases = document.querySelectorAll('canvas');
    var target = null;
    var maxArea = 0;
    canvases.forEach(function (c) {
      if (c.width * c.height > maxArea) { maxArea = c.width * c.height; target = c; }
    });
    if (!target) { console.warn('[Photo] canvas 없음'); return; }
    try {
      var dataUrl = target.toDataURL('image/jpeg', 0.92);
      savePhoto(dataUrl);
    } catch (e) {
      console.error('[Photo] 캡처 실패:', e);
    }
  }

  function registerCapture() {
    XR8.addCameraPipelineModules([{
      name: 'photo-capture',
      onProcessGpu: function () {
        if (!pendingCapture) return;
        pendingCapture = false;
        captureCanvas();
      }
    }]);
  }

  if (window.XR8) { registerCapture(); }
  else { window.addEventListener('xrloaded', registerCapture); }

  btn.addEventListener('pointerdown', function () {
    btn.style.transform = 'translateX(-50%) scale(0.88)';
    btn.style.opacity = '0.75';
    btn.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.15),0 2px 10px rgba(0,0,0,0.2)';
  });
  btn.addEventListener('pointerup', function () {
    btn.style.transform = 'translateX(-50%) scale(1)';
    btn.style.opacity = '1';
    btn.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.15),0 6px 24px rgba(0,0,0,0.35)';
  });
  btn.addEventListener('pointercancel', function () {
    btn.style.transform = 'translateX(-50%) scale(1)';
    btn.style.opacity = '1';
  });
  btn.addEventListener('click', function () {
    doFlash();
    pendingCapture = true;
  });
})();
