/* ============================================================
   TRADE FUNDING - "DRAWN STENCIL" HERO ENGINE
   One shared renderer for every channel hero: each part of a scene is
   first traced as a stencil outline in the page's theme colour (like a pen
   sketching its edges), then settles into a flat, mostly-white fill. Pages
   supply scene builders (see tf-drawn-scenes.js); this file owns the
   renderer, lighting, draw sequencing, idle motion, drag/parallax, the
   optional scene carousel, and the reduced-motion / visibility handling.

   Usage:
     var ctrl = TFDrawn.mount(stageEl, { scenes: [sceneDef, ...], ... });
     ctrl.goTo(i); ctrl.onChange(fn); ctrl.destroy();

   A sceneDef is { key, label, color, camera, idle, build(ctx) → {update} }.
   ============================================================ */
(function (global) {
  'use strict';

  var THREE = global.THREE;
  if (!THREE) { global.TFDrawn = null; return; }

  var hasFatLines = !!(THREE.LineSegments2 && THREE.LineSegmentsGeometry && THREE.LineMaterial);

  var DEFAULTS = {
    draw:  { duration: 5.5, partSpan: 0.34, drawFraction: 0.6 },
    cycle: { hold: 5.0, erase: 1.3 },
    idle:  { rotateSpeed: 0, bob: 0, bobSpeed: 0.5, sway: 0, swaySpeed: 0.3, restAngle: 0, tilt: 0, dragReturn: false },
    parallax: { strength: 0.07, ease: 0.06 },
    drag:  { speed: 0.007, decay: 0.94 },
    camera: { fov: 28, position: { x: 0, y: 1.2, z: 6.5 }, lookAt: { x: 0, y: 0.5, z: 0 }, baseAspect: 1.2 },
    navy: 0x001C44,
    lineWidth: 1.75,
    lineOpacity: 0.95,
    pixelRatioCap: 2,
    reducedMotionSceneIndex: 0
  };

  function clamp01(x) { return Math.min(1, Math.max(0, x)); }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i]; if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }
  function mixHex(a, b, t) {
    var ca = new THREE.Color(a), cb = new THREE.Color(b);
    return ca.lerp(cb, clamp01(t)).getHex();
  }
  function cssHex(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }

  /* ---------------- edge outline (fat lines when available) -------------- */
  function makeEdgeLine(geometry, colorHex, lineWidth, edgeAngle, resolution) {
    var edges = new THREE.EdgesGeometry(geometry, edgeAngle == null ? 12 : edgeAngle);
    var positions = edges.attributes.position.array;
    var segCount = edges.attributes.position.count / 2;
    edges.dispose();

    if (hasFatLines) {
      var geo = new THREE.LineSegmentsGeometry();
      geo.setPositions(positions);
      geo.instanceCount = 0;
      var mat = new THREE.LineMaterial({
        color: new THREE.Color(colorHex),
        linewidth: lineWidth,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      mat.resolution.copy(resolution);
      var obj = new THREE.LineSegments2(geo, mat);
      obj.frustumCulled = false;
      obj.computeLineDistances();
      return {
        object: obj, total: segCount, material: mat, fat: true,
        setCount: function (n) { geo.instanceCount = Math.max(0, Math.min(segCount, n)); },
        dispose: function () { geo.dispose(); mat.dispose(); }
      };
    }

    var bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    bgeo.setDrawRange(0, 0);
    var bmat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0, depthWrite: false });
    var bobj = new THREE.LineSegments(bgeo, bmat);
    bobj.frustumCulled = false;
    return {
      object: bobj, total: segCount, material: bmat, fat: false,
      setCount: function (n) { bgeo.setDrawRange(0, Math.max(0, Math.min(segCount, n)) * 2); },
      dispose: function () { bgeo.dispose(); bmat.dispose(); }
    };
  }

  /* ---------------- canvas text texture ---------------------------------- */
  function makeTextTexture(text, o) {
    var fontPx = 96;
    var weight = o.weight || 600;
    var font = weight + ' ' + fontPx + 'px "DM Sans", -apple-system, sans-serif';
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    ctx.font = font;
    var m = ctx.measureText(text);
    var padX = fontPx * 0.25;
    c.width = Math.ceil(m.width + padX * 2);
    c.height = Math.ceil(fontPx * 1.3);
    ctx = c.getContext('2d');
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (o.letterSpacing && ctx.letterSpacing !== undefined) ctx.letterSpacing = o.letterSpacing;
    ctx.fillStyle = o.color || '#001C44';
    ctx.fillText(text, padX, c.height / 2 + fontPx * 0.04);
    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { texture: tex, aspect: c.width / c.height };
  }

  /* ======================================================================
     MOUNT
  ====================================================================== */
  function mount(stage, options) {
    if (!stage) return null;
    var opt = assign({}, DEFAULTS, options || {});
    opt.draw = assign({}, DEFAULTS.draw, options && options.draw);
    opt.cycle = assign({}, DEFAULTS.cycle, options && options.cycle);
    opt.parallax = assign({}, DEFAULTS.parallax, options && options.parallax);
    opt.drag = assign({}, DEFAULTS.drag, options && options.drag);

    var scenes = opt.scenes || [];
    if (!scenes.length) return null;

    var reduceMotion = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var isTouch = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
    var loadingEl = stage.querySelector('.scene-loading');
    /* Removed rather than just hidden: display:none would leave it in the DOM where a screen
       reader could still reach it on some engines, and it has no aria-hidden of its own. */
    function hideLoading() {
      if (!loadingEl) return;
      if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
      loadingEl = null;
    }

    /* ---- renderer / scene / camera ---- */
    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, opt.pixelRatioCap));
    renderer.setClearColor(0x000000, 0);
    var canvas = renderer.domElement;
    canvas.className = 'tf-drawn-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);

    var scene3 = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    var world = new THREE.Group();
    scene3.add(world);

    scene3.add(new THREE.HemisphereLight(0xffffff, 0xd6dfeb, 0.95));
    var key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(3, 6, 4);
    scene3.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.22);
    fill.position.set(-4, 2, -3);
    scene3.add(fill);

    var resolution = new THREE.Vector2(1, 1);
    var lineMaterials = [];
    var aspect = 1;

    /* ---- state ---- */
    var current = null;       // { def, parts, api, idle, rot, g, pickables }
    var index = -1;
    var phase = 'drawing';    // 'drawing' | 'hold' | 'erasing'
    var phaseStart = 0;
    var eraseFrom = 1;
    var pendingIndex = null;
    var elapsed = 0;
    var lastTs = null;
    var visible = true;
    var destroyed = false;
    var changeHandlers = [];
    var rafId = null;

    var pointer = { x: 0, y: 0 };
    var parallax = { x: 0, y: 0 };
    var drag = { rot: 0, vel: 0, state: null, moved: false };

    /* ---- camera ---- */
    function applyCamera(camDef) {
      var c = assign({}, DEFAULTS.camera, opt.camera, camDef || {});
      var fov = c.fov;
      var baseAspect = c.baseAspect || 1.2;
      if (aspect < baseAspect) {
        var vRad = THREE.MathUtils.degToRad(fov);
        var hRad = 2 * Math.atan(Math.tan(vRad / 2) * baseAspect);
        fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hRad / 2) / aspect));
      }
      camera.fov = fov;
      camera.aspect = aspect;
      camera.position.set(c.position.x, c.position.y, c.position.z);
      camera.lookAt(c.lookAt.x, c.lookAt.y, c.lookAt.z);
      camera.updateProjectionMatrix();
    }

    function resize() {
      var w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      aspect = w / h;
      renderer.setSize(w, h, false);
      resolution.set(w, h);
      for (var i = 0; i < lineMaterials.length; i++) lineMaterials[i].resolution.set(w, h);
      applyCamera(current ? current.def.camera : null);
      if (reduceMotion || !visible) renderOnce();
    }

    /* ---- part registry ---- */
    function setPartLocal(p, local) {
      var drawFrac = opt.draw.drawFraction;
      var drawT = clamp01(local / drawFrac);
      var solidT = clamp01((local - drawFrac) / (1 - drawFrac));
      var dE = easeOutCubic(drawT);
      var sE = easeOutCubic(solidT);

      if (p.line) {
        p.line.setCount(Math.round(p.line.total * dE));
        p.line.material.opacity = drawT > 0 ? p.lineOpacity * (1 - 0.08 * sE) : 0;
      }
      for (var i = 0; i < p.mats.length; i++) p.mats[i].opacity = p.fillOpacity * sE;
      var s = 1 - p.pop * (1 - sE);
      p.mesh.scale.set(p.baseScale.x * s, p.baseScale.y * s, p.baseScale.z * s);
      p.mesh.visible = local > 0.0005;
    }

    function applyDraw(C, g) {
      for (var i = 0; i < C.parts.length; i++) {
        var p = C.parts[i];
        var local = p.manual ? p.manualValue * clamp01(g) : clamp01((g - p.appearAt) / p.duration);
        setPartLocal(p, local);
      }
    }

    function schedule(parts) {
      var seq = parts.filter(function (p) { return !p.manual; });
      var span = opt.draw.partSpan;
      var step = seq.length > 1 ? (1 - span) / (seq.length - 1) : 0;
      for (var i = 0; i < seq.length; i++) { seq[i].appearAt = i * step; seq[i].duration = span; }
    }

    function makeCtx(def, parts, pickables) {
      var color = def.color == null ? opt.navy : def.color;
      var ctx = {
        THREE: THREE,
        world: world,
        color: color,
        navy: opt.navy,
        white: 0xFFFFFF,
        isTouch: isTouch,
        reduceMotion: reduceMotion,
        tint: function (hex, t) { return mixHex(hex, 0xFFFFFF, t); },
        mix: mixHex,
        mat: function (hex, o) {
          o = o || {};
          return new THREE.MeshLambertMaterial({
            color: hex == null ? 0xFFFFFF : hex,
            transparent: true, opacity: 0,
            side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
          });
        },
        flatMat: function (hex, o) {
          o = o || {};
          return new THREE.MeshBasicMaterial({
            color: hex == null ? 0xFFFFFF : hex,
            transparent: true, opacity: 0, depthWrite: o.depthWrite !== false,
            side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
            polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
          });
        },
        part: function (mesh, o) {
          o = o || {};
          var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (var i = 0; i < mats.length; i++) {
            mats[i].transparent = true;
            mats[i].opacity = 0;
            if (o.fill != null && mats[i].color) mats[i].color.setHex(o.fill);
          }
          var line = null;
          if (!o.noLine) {
            line = makeEdgeLine(mesh.geometry, o.line == null ? color : o.line, o.lineWidth || opt.lineWidth, o.edgeAngle, resolution);
            line.object.renderOrder = 2;
            mesh.add(line.object);
            lineMaterials.push(line.material);
          }
          var p = {
            mesh: mesh, mats: mats, line: line,
            baseScale: mesh.scale.clone(),
            fillOpacity: o.fillOpacity == null ? 1 : o.fillOpacity,
            lineOpacity: o.lineOpacity == null ? opt.lineOpacity : o.lineOpacity,
            pop: o.pop == null ? 0.06 : o.pop,
            manual: !!o.manual, manualValue: 0,
            appearAt: 0, duration: 1
          };
          p.set = function (v) { setPartLocal(p, clamp01(v)); };
          p.setManual = function (v) { p.manualValue = clamp01(v); setPartLocal(p, p.manualValue); };
          parts.push(p);
          setPartLocal(p, 0);
          return p;
        },
        label: function (text, o) {
          o = o || {};
          var t = makeTextTexture(text, { color: o.color || cssHex(opt.navy), weight: o.weight, letterSpacing: o.letterSpacing });
          var w, h;
          if (o.height) {
            h = o.height; w = h * t.aspect;
            if (o.maxWidth && w > o.maxWidth) { w = o.maxWidth; h = w / t.aspect; }
          } else {
            w = o.width || 0.5; h = w / t.aspect;
          }
          var geo = new THREE.PlaneGeometry(w, h);
          var mat = new THREE.MeshBasicMaterial({ map: t.texture, transparent: true, opacity: 0, depthWrite: false });
          var mesh = new THREE.Mesh(geo, mat);
          mesh.renderOrder = 3;
          mesh.userData.tfTexture = t.texture;
          var p = ctx.part(mesh, { noLine: true, pop: o.pop == null ? 0 : o.pop, manual: o.manual, fillOpacity: o.opacity });
          p.height = h; p.width = w;
          return p;
        },
        shadow: function (o) {
          o = o || {};
          var geo = new THREE.CircleGeometry(o.radius || 1, 48);
          var mat = new THREE.MeshBasicMaterial({ color: opt.navy, transparent: true, opacity: 0, depthWrite: false });
          var mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(o.x || 0, o.y == null ? 0.003 : o.y, o.z || 0);
          mesh.scale.set(o.scaleX || 1, o.scaleZ || 0.45, 1);
          mesh.renderOrder = 0;
          (o.parent || world).add(mesh);
          return ctx.part(mesh, { noLine: true, fillOpacity: o.opacity == null ? 0.07 : o.opacity, pop: 0 });
        },
        pick: function (object, handler) {
          object.userData.tfPick = handler;
          pickables.push(object);
        }
      };
      return ctx;
    }

    function disposeObject(obj) {
      obj.traverse(function (node) {
        if (node.geometry) node.geometry.dispose();
        var m = node.material;
        if (m) {
          var arr = Array.isArray(m) ? m : [m];
          for (var i = 0; i < arr.length; i++) { if (arr[i].map) arr[i].map.dispose(); arr[i].dispose(); }
        }
        if (node.userData && node.userData.tfTexture) node.userData.tfTexture.dispose();
      });
    }

    function unloadCurrent() {
      if (!current) return;
      if (current.api && current.api.dispose) { try { current.api.dispose(); } catch (e) { /* noop */ } }
      for (var i = 0; i < current.parts.length; i++) {
        var p = current.parts[i];
        if (p.line) {
          var li = lineMaterials.indexOf(p.line.material);
          if (li >= 0) lineMaterials.splice(li, 1);
          p.line.dispose();
        }
      }
      while (world.children.length) {
        var child = world.children[0];
        world.remove(child);
        disposeObject(child);
      }
      current = null;
    }

    function loadScene(i) {
      unloadCurrent();
      var def = scenes[i];
      index = i;
      var parts = [], pickables = [];
      var ctx = makeCtx(def, parts, pickables);
      var api = def.build(ctx) || {};
      schedule(parts);
      world.rotation.set(0, 0, 0);
      world.position.set(0, 0, 0);
      drag.rot = 0; drag.vel = 0;
      current = { def: def, parts: parts, api: api, pickables: pickables, idle: 0, rot: 0, g: 0,
                  idleCfg: assign({}, DEFAULTS.idle, opt.idle, def.idle) };
      applyCamera(def.camera);
      for (var h = 0; h < changeHandlers.length; h++) changeHandlers[h](i, def);
    }

    /* ---- interaction ---- */
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();

    function setNDC(e) {
      var r = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    }
    function pickAt(e) {
      if (!current || !current.pickables.length) return null;
      setNDC(e);
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(current.pickables, true);
      if (!hits.length) return null;
      var node = hits[0].object;
      while (node && !node.userData.tfPick) node = node.parent;
      return node || null;
    }

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      drag.state = { id: e.pointerId, lastX: e.clientX, startX: e.clientX, startY: e.clientY, t0: performance.now() };
      drag.moved = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      canvas.style.cursor = 'grabbing';
    }
    function onPointerMove(e) {
      if (!isTouch && !reduceMotion) {
        pointer.x = (e.clientX / global.innerWidth) * 2 - 1;
        pointer.y = (e.clientY / global.innerHeight) * 2 - 1;
      }
      if (drag.state && e.pointerId === drag.state.id) {
        var dx = e.clientX - drag.state.lastX;
        if (Math.abs(e.clientX - drag.state.startX) > 6 || Math.abs(e.clientY - drag.state.startY) > 6) drag.moved = true;
        drag.rot += dx * opt.drag.speed;
        drag.vel = dx * opt.drag.speed;
        drag.state.lastX = e.clientX;
        if (drag.moved) e.preventDefault();
        return;
      }
      if (e.target === canvas && current && current.pickables.length) {
        canvas.style.cursor = pickAt(e) ? 'pointer' : 'grab';
      }
    }
    function onPointerUp(e) {
      if (!drag.state || e.pointerId !== drag.state.id) return;
      var wasTap = !drag.moved && (performance.now() - drag.state.t0) < 600;
      drag.state = null;
      canvas.style.cursor = 'grab';
      if (wasTap) {
        var hit = pickAt(e);
        if (hit && hit.userData.tfPick) hit.userData.tfPick(hit, e);
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    global.addEventListener('pointermove', onPointerMove, { passive: false });
    global.addEventListener('pointerup', onPointerUp);
    global.addEventListener('pointercancel', onPointerUp);

    /* ---- phase machine ---- */
    function startErase(fromG) {
      eraseFrom = fromG;
      phase = 'erasing';
      phaseStart = elapsed;
    }

    function step(dt) {
      if (!current) return;
      var C = current, ic = C.idleCfg;

      if (phase === 'drawing') {
        C.g = clamp01((elapsed - phaseStart) / opt.draw.duration);
        applyDraw(C, C.g);
        if (C.g >= 1) { phase = 'hold'; phaseStart = elapsed; C.idle = 0; }
        if (pendingIndex !== null) startErase(C.g);
      } else if (phase === 'hold') {
        C.idle += dt;
        C.rot += dt * ic.rotateSpeed;
        if (C.api.update) C.api.update(C.idle, dt);
        if (pendingIndex !== null || (scenes.length > 1 && C.idle >= opt.cycle.hold)) startErase(1);
      } else if (phase === 'erasing') {
        var k = clamp01((elapsed - phaseStart) / opt.cycle.erase);
        applyDraw(C, eraseFrom * (1 - easeInOutCubic(k)));
        if (k >= 1) {
          var next = pendingIndex !== null ? pendingIndex : (index + 1) % scenes.length;
          pendingIndex = null;
          loadScene(next);
          phase = 'drawing';
          phaseStart = elapsed;
          return;
        }
      }

      /* world pose: rest + idle spin/sway + drag + parallax */
      if (!drag.state) {
        if (ic.dragReturn) { drag.rot *= 0.9; drag.vel = 0; }
        else { drag.rot += drag.vel; drag.vel *= opt.drag.decay; }
      }
      parallax.x += (pointer.x - parallax.x) * opt.parallax.ease;
      parallax.y += (pointer.y - parallax.y) * opt.parallax.ease;

      var sway = ic.sway ? Math.sin(C.idle * ic.swaySpeed) * ic.sway : 0;
      world.rotation.y = ic.restAngle + C.rot + sway + drag.rot + parallax.x * opt.parallax.strength;
      world.rotation.x = ic.tilt - parallax.y * opt.parallax.strength * 0.5;
      world.position.y = ic.bob ? Math.sin(C.idle * ic.bobSpeed) * ic.bob : 0;
    }

    function renderOnce() { renderer.render(scene3, camera); }

    function frame(ts) {
      if (destroyed) return;
      rafId = global.requestAnimationFrame(frame);
      if (!visible) { lastTs = null; return; }
      if (lastTs === null) lastTs = ts;
      var dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      elapsed += dt;
      step(dt);
      renderOnce();
      hideLoading();
    }

    /* ---- reduced motion: fully drawn, static ---- */
    function renderStatic() {
      if (!current) return;
      applyDraw(current, 1);
      if (current.api.update) current.api.update(0, 0);
      var ic = current.idleCfg;
      world.rotation.y = ic.restAngle;
      world.rotation.x = ic.tilt;
      renderOnce();
      hideLoading();
    }

    /* ---- visibility ---- */
    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        visible = entries.some(function (en) { return en.isIntersecting; });
      }, { rootMargin: '80px' });
      io.observe(stage);
    }
    var ro = null;
    if (global.ResizeObserver) { ro = new ResizeObserver(function () { resize(); }); ro.observe(stage); }
    else global.addEventListener('resize', resize);

    /* ---- boot (wait for the label font so canvas text renders in DM Sans) ---- */
    var booted = false;
    function boot() {
      if (booted || destroyed) return;
      booted = true;
      resize();
      var first = Math.min(scenes.length - 1, reduceMotion ? opt.reducedMotionSceneIndex : 0);
      loadScene(first);
      /* Retire the "Loading…" placeholder here, as soon as a scene exists - not only on the
         first rendered frame. `frame()` returns early while the canvas is off-screen (see the
         `!visible` guard), so a hero that is scrolled past on load, or in a background tab,
         could otherwise keep the placeholder on screen indefinitely. The later hides are kept
         as belt-and-braces; `hideLoading()` is idempotent. */
      hideLoading();
      if (reduceMotion) { renderStatic(); return; }
      phase = 'drawing';
      phaseStart = 0;
      elapsed = 0;
      rafId = global.requestAnimationFrame(frame);
    }
    var fontReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('600 40px "DM Sans"'), document.fonts.load('700 40px "DM Sans"')]).catch(function () { return null; })
      : Promise.resolve(null);
    var timer = setTimeout(boot, 1500);
    fontReady.then(function () { clearTimeout(timer); boot(); });

    /* ---- controller ---- */
    var controller = {
      /* Deterministically advance the animation by `seconds` and render one
         frame - used by tests/tooling where requestAnimationFrame is paused. */
      advance: function (seconds, stepSize) {
        if (destroyed || !current) return;
        var stepSz = stepSize || 1 / 60;
        var remaining = Math.max(0, seconds || 0);
        while (remaining > 0) {
          var dt = Math.min(stepSz, remaining);
          elapsed += dt;
          step(dt);
          remaining -= dt;
        }
        renderOnce();
        hideLoading();
      },
      goTo: function (i) {
        if (i < 0 || i >= scenes.length || i === index || destroyed) return;
        if (reduceMotion) { loadScene(i); renderStatic(); return; }
        pendingIndex = i;
      },
      next: function () { this.goTo((index + 1) % scenes.length); },
      getIndex: function () { return index; },
      onChange: function (fn) { changeHandlers.push(fn); if (index >= 0) fn(index, scenes[index]); },
      destroy: function () {
        destroyed = true;
        if (rafId) global.cancelAnimationFrame(rafId);
        canvas.removeEventListener('pointerdown', onPointerDown);
        global.removeEventListener('pointermove', onPointerMove);
        global.removeEventListener('pointerup', onPointerUp);
        global.removeEventListener('pointercancel', onPointerUp);
        if (io) io.disconnect();
        if (ro) ro.disconnect(); else global.removeEventListener('resize', resize);
        unloadCurrent();
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        var at = instances.indexOf(controller);
        if (at >= 0) instances.splice(at, 1);
      }
    };
    instances.push(controller);
    return controller;
  }

  var instances = [];
  global.TFDrawn = { mount: mount, mixHex: mixHex, hasFatLines: hasFatLines, instances: instances };
})(window);
