/* ============================================================
   TRADE FUNDING - DRAWN HERO SCENES
   The three channel illustrations, each built from simple primitives so the
   engine (tf-drawn.js) can trace every edge as a stencil outline in the
   channel colour before settling into a flat, mostly-white fill.

     TFDrawnScenes.houseAndCar({ color }) - Personal & Property
     TFDrawnScenes.invoices({ color }) - Connect (invoices getting PAID)
     TFDrawnScenes.productCards({ color, products, onPick }) - Commercial
     TFDrawnScenes.trio({ colors, hrefs }) - Home (all three at once)

   Every builder takes `compact: true`, which strips the small canvas text and
   fine detail and tightens the layout - the version used when the illustration
   is drawn small. The home page composes all three compact scenes into one
   scene (trio) so a single pen stroke sweeps across the whole row.
   ============================================================ */
(function (global) {
  'use strict';

  var S = global.TFDrawnScenes = {};

  var GREY = 0xE4E9F1;        // placeholder "text" bars
  var INK_400 = '#7A8AA3';
  var NAVY_CSS = '#001C44';

  function clamp01(x) { return Math.min(1, Math.max(0, x)); }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function cssHex(hex) { return '#' + ('000000' + hex.toString(16)).slice(-6); }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i]; if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  /* ======================================================================
     PERSONAL & PROPERTY - house and car
  ====================================================================== */
  S.houseAndCar = function (o) {
    o = o || {};
    var color = o.color == null ? 0xFF5D5C : o.color;
    var compact = !!o.compact;

    return {
      key: o.key || 'personal-and-property',
      label: o.label || 'Personal & Property',
      href: o.href,
      color: color,
      camera: { fov: 29, position: { x: 4.7, y: 3.25, z: 5.9 }, lookAt: { x: 0.55, y: 0.42, z: 0.1 }, baseAspect: 1.0 },
      idle: { rotateSpeed: 0.045, bob: 0.018, bobSpeed: 0.5, restAngle: 0.45, tilt: 0 },

      build: function (ctx) {
        var T = ctx.THREE, W = ctx.world;
        var C = { white: 0xFFFFFF, roof: ctx.tint(color, 0.42), accent: color, soft: ctx.tint(color, 0.72), navy: ctx.navy };
        var H = { width: 1.7, depth: 1.5, wallHeight: 1.05, roofHeight: 0.72, roofOverhang: 0.16, roofThickness: 0.07,
                  doorWidth: 0.32, doorHeight: 0.62, windowSize: 0.26, chimney: { w: 0.16, h: 0.42 } };

        function box(w, h, d, mat) { return new T.Mesh(new T.BoxGeometry(w, h, d), mat); }

        /* ---- house ---- */
        var house = new T.Group();
        house.position.set(-0.2, 0, -0.1);
        W.add(house);

        var walls = box(H.width, H.wallHeight, H.depth, ctx.mat(C.white));
        walls.position.y = H.wallHeight / 2;
        house.add(walls); ctx.part(walls);

        // gable prism fills the triangle under the roof so the outline reads as one solid house
        var gable = new T.Shape();
        gable.moveTo(-H.width / 2, 0); gable.lineTo(H.width / 2, 0); gable.lineTo(0, H.roofHeight); gable.lineTo(-H.width / 2, 0);
        var gableGeo = new T.ExtrudeGeometry(gable, { depth: H.depth, bevelEnabled: false });
        gableGeo.translate(0, 0, -H.depth / 2);
        var gableMesh = new T.Mesh(gableGeo, ctx.mat(C.white));
        gableMesh.position.y = H.wallHeight;
        house.add(gableMesh); ctx.part(gableMesh);

        var roofRun = H.width / 2 + H.roofOverhang;
        var roofLen = Math.sqrt(roofRun * roofRun + H.roofHeight * H.roofHeight) + 0.04;
        var roofAngle = Math.atan2(H.roofHeight, roofRun);
        var roofDepth = H.depth + H.roofOverhang * 2;
        var roofY = H.wallHeight + H.roofHeight / 2 + H.roofThickness * 0.5;

        var roofA = box(roofLen, H.roofThickness, roofDepth, ctx.mat(C.roof));
        roofA.position.set(-roofRun / 2, roofY, 0); roofA.rotation.z = roofAngle;
        house.add(roofA); ctx.part(roofA);
        var roofB = box(roofLen, H.roofThickness, roofDepth, ctx.mat(C.roof));
        roofB.position.set(roofRun / 2, roofY, 0); roofB.rotation.z = -roofAngle;
        house.add(roofB); ctx.part(roofB);

        var chimney = box(H.chimney.w, H.chimney.h, H.chimney.w, ctx.mat(C.white));
        chimney.position.set(H.width * 0.24, H.wallHeight + H.roofHeight * 0.72, H.depth * 0.15);
        house.add(chimney); ctx.part(chimney);

        var door = box(H.doorWidth, H.doorHeight, 0.03, ctx.mat(C.accent));
        door.position.set(0, H.doorHeight / 2, H.depth / 2 + 0.015);
        house.add(door); ctx.part(door, { pop: 0.03 });

        [-1, 1].forEach(function (side) {
          var win = box(H.windowSize, H.windowSize, 0.03, ctx.mat(C.soft));
          win.position.set(side * (H.width * 0.32), H.wallHeight * 0.62, H.depth / 2 + 0.015);
          house.add(win); ctx.part(win, { pop: 0.03 });
        });
        // the side window only reads from the sub-page's corner camera
        if (!compact) {
          var sideWin = box(H.windowSize, H.windowSize, 0.03, ctx.mat(C.soft));
          sideWin.rotation.y = Math.PI / 2;
          sideWin.position.set(H.width / 2 + 0.015, H.wallHeight * 0.62, -0.15);
          house.add(sideWin); ctx.part(sideWin, { pop: 0.03 });
        }

        /* ---- car ---- */
        var CAR = { bodyLength: 0.8, bodyWidth: 0.42, bodyHeight: 0.24, cabinLength: 0.4, cabinWidth: 0.34, cabinHeight: 0.19,
                    cabinOffsetX: -0.04, wheelRadius: 0.11, wheelWidth: 0.08, axleInsetX: 0.25, trackHalfWidth: 0.19,
                    start: { x: 1.65, z: 1.05 }, park: { x: 0.98, z: 0.92 }, driveDelay: 0.35, driveDuration: 2.3 };
        // drawn small, the car parks tighter against the house so the pair reads as one shape
        if (compact) { CAR.start = { x: 1.5, z: 1.0 }; CAR.park = { x: 0.86, z: 0.86 }; }
        var car = new T.Group();
        car.position.set(CAR.start.x, 0, CAR.start.z);
        car.rotation.y = Math.PI;
        W.add(car);

        var wheelBaseY = CAR.wheelRadius;
        var bodyBaseY = CAR.wheelRadius * 1.25;
        var body = box(CAR.bodyLength, CAR.bodyHeight, CAR.bodyWidth, ctx.mat(C.white));
        body.position.y = bodyBaseY + CAR.bodyHeight / 2;
        car.add(body); ctx.part(body);

        var cabin = box(CAR.cabinLength, CAR.cabinHeight, CAR.cabinWidth, ctx.mat(C.soft));
        cabin.position.set(CAR.cabinOffsetX, bodyBaseY + CAR.bodyHeight + CAR.cabinHeight / 2, 0);
        car.add(cabin); ctx.part(cabin);

        var headlight = box(0.025, 0.06, CAR.bodyWidth - 0.1, ctx.mat(C.accent));
        headlight.position.set(CAR.bodyLength / 2 + 0.006, bodyBaseY + CAR.bodyHeight * 0.58, 0);
        car.add(headlight); ctx.part(headlight, { pop: 0.02 });

        var wheelGeo = new T.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, CAR.wheelWidth, 18);
        wheelGeo.rotateX(Math.PI / 2);
        var wheels = [];
        [-1, 1].forEach(function (xs) {
          [-1, 1].forEach(function (zs) {
            var wheel = new T.Mesh(wheelGeo, ctx.mat(C.navy));
            wheel.position.set(xs * CAR.axleInsetX, wheelBaseY, zs * CAR.trackHalfWidth);
            car.add(wheel); ctx.part(wheel, { edgeAngle: 40, pop: 0.03 });
            wheels.push(wheel);
          });
        });

        /* ---- shadows last, so they settle in after the drawing ---- */
        ctx.shadow({ parent: house, radius: 1.35, scaleX: 1.05, scaleZ: 0.9, opacity: 0.06 });
        ctx.shadow({ parent: car, radius: 0.55, scaleX: 1.0, scaleZ: 0.55, opacity: 0.07 });

        var prevX = CAR.start.x;
        return {
          update: function (t) {
            var local = clamp01((t - CAR.driveDelay) / CAR.driveDuration);
            var e = easeOut(local);
            var x = lerp(CAR.start.x, CAR.park.x, e);
            var z = lerp(CAR.start.z, CAR.park.z, e);
            var spin = (x - prevX) / CAR.wheelRadius;
            prevX = x;
            for (var i = 0; i < wheels.length; i++) wheels[i].rotation.z += spin;
            car.position.x = x; car.position.z = z;
          }
        };
      }
    };
  };

  /* ======================================================================
     CONNECT - invoices between businesses, stamped PAID one by one
  ====================================================================== */
  S.invoices = function (o) {
    o = o || {};
    var color = o.color == null ? 0xFBB766 : o.color;
    var compact = !!o.compact;

    return {
      key: o.key || 'connect',
      label: o.label || 'Connect',
      href: o.href,
      color: color,
      camera: { fov: 26, position: { x: 0.3, y: 1.5, z: 6.3 }, lookAt: { x: 0, y: 0.74, z: 0 }, baseAspect: 1.25 },
      idle: { rotateSpeed: 0, sway: 0.05, swaySpeed: 0.32, restAngle: 0, tilt: 0.02, dragReturn: true },

      build: function (ctx) {
        var T = ctx.THREE, W = ctx.world;
        var CARD = compact ? { w: 1.05, h: 1.4, d: 0.04 } : { w: 1.15, h: 1.5, d: 0.04 };
        var zFront = CARD.d / 2;
        var defs = compact
          ? [ { x: -0.62, z: -0.34, ry: 0.42 },
              { x: 0,     z: 0.16,  ry: 0 },
              { x: 0.62,  z: -0.34, ry: -0.42 } ]
          : [ { x: -1.08, z: -0.3, ry: 0.34, num: 'INV-1042', amount: '$4,850.00' },
              { x: 0,     z: 0.12, ry: 0,    num: 'INV-1043', amount: '$12,300.00' },
              { x: 1.08,  z: -0.3, ry: -0.34, num: 'INV-1044', amount: '$2,190.00' } ];

        function detail(parent, w, h, x, y, fill, lineOpacity) {
          var m = new T.Mesh(new T.BoxGeometry(w, h, 0.012), ctx.mat(fill));
          m.position.set(x, y, zFront + 0.006);
          parent.add(m);
          ctx.part(m, { lineOpacity: lineOpacity == null ? 0.5 : lineOpacity, pop: 0.03 });
          return m;
        }

        /* A tick, built from two bars so the engine traces it like everything
           else - stands in for the PAID wordmark when the card is drawn small. */
        function tick(parent) {
          var g = new T.Group();
          parent.add(g);
          var short = new T.Mesh(new T.BoxGeometry(0.05, 0.14, 0.012), ctx.flatMat(color));
          short.position.set(-0.058, -0.036, 0); short.rotation.z = 0.72;
          g.add(short);
          var long = new T.Mesh(new T.BoxGeometry(0.05, 0.27, 0.012), ctx.flatMat(color));
          long.position.set(0.042, 0.018, 0); long.rotation.z = -0.6;
          g.add(long);
          return [ctx.part(short, { manual: true, pop: 0 }), ctx.part(long, { manual: true, pop: 0 })];
        }

        var invoices = defs.map(function (d, i) {
          var g = new T.Group();
          g.position.set(d.x, 0, d.z);
          g.rotation.y = d.ry;
          W.add(g);

          var card = new T.Mesh(new T.BoxGeometry(CARD.w, CARD.h, CARD.d), ctx.mat(0xFFFFFF));
          card.position.y = CARD.h / 2;
          g.add(card); ctx.part(card);

          var top = CARD.h;
          var half = CARD.w / 2;

          if (compact) {
            // logo square, two placeholder lines and the amount - no small type
            detail(g, 0.15, 0.15, -half + 0.19, top - 0.2, color, 0.95);
            detail(g, 0.5, 0.065, -half + 0.16 + 0.25, top - 0.52, GREY);
            detail(g, 0.34, 0.065, -half + 0.16 + 0.17, top - 0.66, GREY);
            detail(g, 0.42, 0.11, -half + 0.16 + 0.21, top - 1.1, color, 0.9);
          } else {
            detail(g, 0.17, 0.17, -0.40, top - 0.22, color, 0.95);

            var num = ctx.label(d.num, { height: 0.075, color: INK_400, weight: 600, letterSpacing: '2px' });
            num.mesh.position.set(0.46 - num.width / 2, top - 0.215, zFront + 0.014);
            g.add(num.mesh);

            var rows = [0.62, 0.46, 0.55];
            for (var r = 0; r < 3; r++) {
              var y = top - 0.55 - r * 0.15;
              detail(g, rows[r], 0.055, -0.485 + rows[r] / 2, y, GREY);
              detail(g, 0.16, 0.055, 0.38, y, GREY);
            }

            var tot = ctx.label('TOTAL', { height: 0.07, color: INK_400, weight: 700, letterSpacing: '3px' });
            tot.mesh.position.set(-0.485 + tot.width / 2, top - 1.15, zFront + 0.014);
            g.add(tot.mesh);
            var amt = ctx.label(d.amount, { height: 0.14, color: NAVY_CSS, weight: 700, maxWidth: 0.62 });
            amt.mesh.position.set(0.46 - amt.width / 2, top - 1.15, zFront + 0.014);
            g.add(amt.mesh);
          }

          /* PAID stamp - drawn during the idle loop, not the initial build */
          var stamp = new T.Group();
          stamp.position.set(compact ? 0.2 : 0.17, top - (compact ? 0.72 : 0.74), zFront + 0.035);
          stamp.rotation.z = 0.26;
          g.add(stamp);
          var ring = new T.Mesh(new T.RingGeometry(compact ? 0.2 : 0.235, compact ? 0.232 : 0.27, 56), ctx.flatMat(color, { doubleSide: true }));
          stamp.add(ring);
          var marks = [ctx.part(ring, { manual: true, pop: 0 })];
          if (compact) {
            marks = marks.concat(tick(stamp));
          } else {
            var paid = ctx.label('PAID', { height: 0.15, color: cssHex(color), weight: 700, manual: true, letterSpacing: '3px' });
            paid.mesh.position.z = 0.004;
            stamp.add(paid.mesh);
            marks.push(paid);
          }

          ctx.shadow({ parent: g, radius: 0.62, scaleX: 1, scaleZ: 0.32, opacity: 0.07 });

          return { g: g, stamp: stamp, marks: marks };
        });

        var CYCLE = 8.2, FIRST = 0.9, GAP = 1.25, STAMP = 0.55, FADE_AT = 7.0, FADE = 0.6;
        return {
          update: function (t) {
            var cyc = t % CYCLE;
            for (var i = 0; i < invoices.length; i++) {
              var inv = invoices[i];
              var s = clamp01((cyc - (FIRST + i * GAP)) / STAMP);
              var out = 1 - clamp01((cyc - FADE_AT) / FADE);
              var v = s * out;
              for (var m = 0; m < inv.marks.length; m++) inv.marks[m].setManual(v);
              var e = easeOut(s);
              inv.stamp.scale.setScalar(1 + 0.45 * (1 - e));
              inv.g.position.y = 0.05 * e * out + Math.sin(t * 0.8 + i * 2.1) * 0.012;
            }
          }
        };
      }
    };
  };

  /* ======================================================================
     COMMERCIAL - product category cards on a slowly spinning ring
  ====================================================================== */
  S.DEFAULT_PRODUCTS = [
    { label: 'Business Loans' },
    { label: 'Lines of Credit' },
    { label: 'Invoice Finance' },
    { label: 'Trade Finance' },
    { label: 'Equipment Finance' },
    { label: 'Commercial Property' }
  ];

  /* Wrap a blurb onto at most `max` lines of roughly `per` characters, so the
     detail text sits inside the card instead of running off its edge. */
  function wrapLines(text, per, max) {
    var words = String(text).split(/\s+/), lines = [], line = '';
    for (var i = 0; i < words.length; i++) {
      var next = line ? line + ' ' + words[i] : words[i];
      if (next.length > per && line) { lines.push(line); line = words[i]; }
      else line = next;
      if (lines.length === max - 1 && line.length > per) break;
    }
    if (line) lines.push(line);
    if (lines.length > max) { lines = lines.slice(0, max); }
    return lines;
  }

  S.productCards = function (o) {
    o = o || {};
    var color = o.color == null ? 0x54B4F6 : o.color;
    var compact = !!o.compact;
    var products = o.products || S.DEFAULT_PRODUCTS;
    var onReady = o.onReady;

    return {
      key: o.key || 'commercial',
      label: o.label || 'Commercial',
      href: o.href,
      color: color,
      camera: { fov: 27, position: { x: 0, y: 1.35, z: 6.1 }, lookAt: { x: 0, y: 0.4, z: 0 }, baseAspect: 1.25 },
      idle: { rotateSpeed: o.rotateSpeed == null ? 0.26 : o.rotateSpeed, restAngle: 0.3, tilt: 0.1 },

      build: function (ctx) {
        var T = ctx.THREE, W = ctx.world;
        /* Drawn small, a six-card ring collapses into an unreadable sliver, so
           compact steps three of the same landscape cards up and across like a
           fanned deck of quotes - the same card, arranged for the space. */
        var n = compact ? 3 : products.length;
        var R = 1.55;
        var CARD = compact ? { w: 1.2, h: 0.78, d: 0.035 } : { w: 1.22, h: 0.82, d: 0.035 };
        var zf = CARD.d / 2;
        var BASE_Y = 0.6;
        var STEP = { x: 0.28, y: 0.22, z: 0.12, ry: 0.05 };

        /* Where a chosen card comes to rest: forward of the ring, squared up to
           the camera, so it reads as the card stepping out of the row rather
           than a panel appearing over the top of it. */
        var FEATURE = { x: 0, y: 0.55, z: 2.05, scale: 1.28 };

        var cards = [];
        for (var i = 0; i < n; i++) {
          var p = products[i % products.length];
          var g = new T.Group();
          var baseY;
          if (compact) {
            baseY = CARD.h / 2 + 0.06 + i * STEP.y;
            g.position.set((i - 1) * STEP.x, baseY, (i - 1) * STEP.z);
            g.rotation.y = -0.1 + i * STEP.ry;
          } else {
            var a = (i / n) * Math.PI * 2;
            baseY = BASE_Y;
            g.position.set(Math.sin(a) * R, baseY, Math.cos(a) * R);
            g.rotation.y = a;
          }
          W.add(g);

          var card = new T.Mesh(new T.BoxGeometry(CARD.w, CARD.h, CARD.d), ctx.mat(0xFFFFFF));
          g.add(card); ctx.part(card);

          var half = CARD.w / 2;
          var chip = new T.Mesh(new T.BoxGeometry(0.15, 0.15, 0.012), ctx.mat(color));
          chip.position.set(-half + 0.155, CARD.h / 2 - 0.165, zf + 0.006);
          g.add(chip); ctx.part(chip, { pop: 0.03 });

          var entry = { g: g, baseY: baseY, angle: compact ? 0 : (i / n) * Math.PI * 2,
                        ry: compact ? (-0.1 + i * STEP.ry) : (i / n) * Math.PI * 2,
                        sel: 0, target: 0, product: p, detail: [] };

          if (compact) {
            // no type at this size: a title rule and the rate, in channel colour
            var barA = new T.Mesh(new T.BoxGeometry(0.52, 0.07, 0.012), ctx.mat(GREY));
            barA.position.set(-half + 0.08 + 0.26, -0.02, zf + 0.006);
            g.add(barA); ctx.part(barA, { lineOpacity: 0.5, pop: 0.03 });

            var rate = new T.Mesh(new T.BoxGeometry(0.34, 0.1, 0.012), ctx.mat(color));
            rate.position.set(-half + 0.08 + 0.17, -CARD.h / 2 + 0.2, zf + 0.006);
            g.add(rate); ctx.part(rate, { lineOpacity: 0.9, pop: 0.03 });
          } else {
            var lab = ctx.label(p.label, { height: 0.105, color: NAVY_CSS, weight: 600, maxWidth: 0.98 });
            lab.mesh.position.set(-0.53 + lab.width / 2, -0.01, zf + 0.014);
            g.add(lab.mesh);
            entry.title = lab;

            /* The placeholder rule under the title is what resolves into the
               real detail: it fades out as the blurb lines fade in, so the
               card gains text rather than growing a second panel. */
            var bar = new T.Mesh(new T.BoxGeometry(0.6, 0.05, 0.012), ctx.mat(GREY));
            bar.position.set(-0.53 + 0.3, -0.21, zf + 0.006);
            g.add(bar); entry.bar = ctx.part(bar, { lineOpacity: 0.5, pop: 0.03 });

            var arrow = ctx.label('→', { height: 0.15, color: cssHex(color), weight: 700 });
            arrow.mesh.position.set(0.47, -0.2, zf + 0.014);
            g.add(arrow.mesh);
            entry.arrow = arrow;

            /* Detail is built as `manual` parts: the engine leaves their
               visibility to us, so they stay dark through the draw-in and only
               appear once this card is the one that has been chosen. */
            var lines = wrapLines(p.blurb || '', 30, 3);
            for (var li = 0; li < lines.length; li++) {
              var dl = ctx.label(lines[li], { height: 0.044, color: '#5A6B85', weight: 500, maxWidth: 1.02, manual: true });
              dl.mesh.position.set(-0.53 + dl.width / 2, -0.088 - li * 0.068, zf + 0.014);
              g.add(dl.mesh);
              entry.detail.push(dl);
            }
            if (p.href) {
              var cue = ctx.label('View →', { height: 0.058, color: cssHex(color), weight: 700, manual: true });
              cue.mesh.position.set(-0.53 + cue.width / 2, -CARD.h / 2 + 0.085, zf + 0.014);
              g.add(cue.mesh);
              entry.detail.push(cue);
            }

            /* Back sits on the card itself, with its own hit area in front of
               it, so the click that dismisses the card can't be mistaken for
               the click that opens the product. */
            var back = ctx.label('← Back', { height: 0.05, color: INK_400, weight: 600, manual: true });
            back.mesh.position.set(half - 0.085 - back.width / 2, CARD.h / 2 - 0.145, zf + 0.014);
            g.add(back.mesh);
            entry.detail.push(back);

            var hit = new T.Mesh(
              new T.PlaneGeometry(back.width + 0.13, 0.17),
              new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
            );
            hit.position.copy(back.mesh.position);
            hit.position.z = zf + 0.03;
            hit.visible = false;
            g.add(hit);
            entry.backHit = hit;
            (function (h) { ctx.pick(h, function (obj, ev) { api.dismiss(ev); }); })(hit);
          }

          if (!compact && (p.href || o.onOpen)) {
            (function (idx) {
              ctx.pick(g, function (obj, ev) { api.choose(idx, ev); });
            })(i);
          }
          cards.push(entry);
        }

        ctx.shadow(compact
          ? { radius: 0.72, x: -0.12, scaleX: 1, scaleZ: 0.34, opacity: 0.06 }
          : { radius: R + 0.75, scaleX: 1, scaleZ: 0.42, opacity: 0.05 });

        var selected = -1;
        var lastEvent = null;
        var qInv = new T.Quaternion();
        var qRing = new T.Quaternion();
        var eRing = new T.Euler();
        var vRing = new T.Vector3();
        var vFeat = new T.Vector3();

        var api = {
          /* First click lifts the card out and reveals its detail; clicking the
             card once it is already out follows it through to the product. */
          choose: function (i, ev) {
            lastEvent = ev || null;
            if (selected === i) {
              var href = cards[i].product.href;
              if (o.onOpen) o.onOpen(cards[i].product, i);
              else if (href) global.location.href = href;
              return;
            }
            selected = i;
            for (var k = 0; k < cards.length; k++) cards[k].target = (k === i ? 1 : 0);
          },
          /* Same as clear(), but marks the pointer event as handled so the
             page's click-away listener doesn't fire on the same tap. */
          dismiss: function (ev) {
            lastEvent = ev || null;
            api.clear();
          },
          clear: function () {
            if (selected < 0) return;
            selected = -1;
            for (var k = 0; k < cards.length; k++) cards[k].target = 0;
          },
          /* True when a card already handled this exact pointer event - lets
             the page dismiss on a click that missed every card, without a
             timing window that could swallow a fast second click. */
          handled: function (ev) { return !!ev && ev === lastEvent; },
          selectedIndex: function () { return selected; },

          update: function (t, dt) {
            var k = Math.min(1, (dt || 1 / 60) * 7);
            /* The world keeps turning under the cards, so the chosen card is
               posed against the inverse of that rotation: it holds still and
               square to the camera while the ring carries on behind it. */
            qInv.copy(W.quaternion).invert();

            for (var i = 0; i < cards.length; i++) {
              var c = cards[i];
              c.sel += (c.target - c.sel) * k;
              if (c.sel < 0.0005) c.sel = 0;
              var e = easeOut(c.sel);

              var bob = Math.sin(t * 0.9 + i * 1.3) * (compact ? 0.016 : 0.02);
              if (compact || (c.sel === 0 && c.target === 0)) {
                c.g.position.y = c.baseY + bob;
                if (compact) continue;
                c.g.position.x = Math.sin(c.angle) * R;
                c.g.position.z = Math.cos(c.angle) * R;
                c.g.rotation.set(0, c.ry, 0);
                c.g.scale.setScalar(1);
              } else {
                vRing.set(Math.sin(c.angle) * R, c.baseY + bob, Math.cos(c.angle) * R);
                vFeat.set(FEATURE.x, FEATURE.y, FEATURE.z).applyQuaternion(qInv);
                c.g.position.lerpVectors(vRing, vFeat, e);
                eRing.set(0, c.ry, 0);
                qRing.setFromEuler(eRing);
                c.g.quaternion.copy(qRing).slerp(qInv, e);
                c.g.scale.setScalar(1 + (FEATURE.scale - 1) * e);
              }

              if (!compact) {
                /* Title steps up to clear the blurb; the placeholder rule and
                   the corner arrow give way to the real text. */
                if (c.title) c.title.mesh.position.y = -0.01 + 0.085 * e;
                if (c.bar) c.bar.set(1 - e);
                if (c.arrow) c.arrow.set(1 - e);
                for (var d = 0; d < c.detail.length; d++) c.detail[d].setManual(e);
                if (c.backHit) c.backHit.visible = e > 0.55;
              }
            }
          }
        };
        if (onReady) onReady(api);
        return api;
      }
    };
  };

  /* ======================================================================
     HOME - all three channel illustrations, drawn small and side by side
     One scene, one renderer: the engine schedules every part of all three
     across a single draw pass, so the pen sweeps left to right across the
     row and each channel keeps its own outline colour.
  ====================================================================== */
  S.trio = function (o) {
    o = o || {};
    var colors = assign({ property: 0xFF5D5C, connect: 0xFBB766, commercial: 0x54B4F6 }, o.colors);
    var hrefs = o.hrefs || {};
    var onReady = o.onReady;

    /* An inverted triangle: two channels across the top, the third centred
       below. All three sit at the same depth so none is foreshortened and
       each can be drawn large; they float on their own shadows rather than
       sharing a ground line, which is what keeps the group compact.
       Order is draw order - across the top, then down to the point. */
    var SLOTS = [
      /* Sways rather than spins. `spin` accumulates as `t * spin`, so it is unbounded: this
         slot used to rotate ~2.6°/s forever, which after a minute or two turns the house away
         from the camera and swings the car - parked front-right of it - around into the
         foreground, hiding the house behind it. The other two channels sway, and a house has a
         definite front, so it needs to keep facing the viewer. Amplitude matches its siblings;
         the speed is stepped down from theirs (0.34, 0.26) so the three stay out of phase
         instead of rocking in unison. */
      { key: 'personal-and-property', label: 'Personal & Property', color: colors.property,
        href: hrefs.property, scene: S.houseAndCar({ color: colors.property, compact: true }),
        x: -1.15, y: 0.76, ry: 0.72, scale: 0.53, sway: 0.06, swaySpeed: 0.22, bob: 0.024, bobSpeed: 0.5 },
      { key: 'connect', label: 'Connect', color: colors.connect,
        href: hrefs.connect, scene: S.invoices({ color: colors.connect, compact: true }),
        x: 1.15, y: 0.76, ry: -0.2, scale: 0.71, sway: 0.07, swaySpeed: 0.34 },
      { key: 'commercial', label: 'Commercial', color: colors.commercial,
        href: hrefs.commercial, scene: S.productCards({ color: colors.commercial, compact: true }),
        x: 0, y: -0.58, ry: 0.14, scale: 0.82, sway: 0.05, swaySpeed: 0.26 }
    ];

    /* Each channel builds into its own group, with its own outline colour. */
    function subCtx(ctx, group, color) {
      var sub = Object.create(ctx);
      sub.world = group;
      sub.color = color;
      sub.part = function (mesh, opts) {
        opts = assign({}, opts);
        if (!opts.noLine && opts.line == null) opts.line = color;
        return ctx.part(mesh, opts);
      };
      sub.shadow = function (opts) {
        opts = assign({}, opts);
        if (!opts.parent) opts.parent = group;
        opts.opacity = (opts.opacity == null ? 0.07 : opts.opacity) * 0.7;
        return ctx.shadow(opts);
      };
      return sub;
    }

    return {
      key: o.key || 'home-trio',
      label: o.label || 'Three channels',
      color: colors.property,
      camera: { fov: 30, position: { x: 0, y: 1.02, z: 5.53 }, lookAt: { x: 0, y: 0.65, z: 0 }, baseAspect: 1.65 },
      idle: { rotateSpeed: 0, bob: 0, sway: 0.02, swaySpeed: 0.22, restAngle: 0, tilt: 0.015, dragReturn: true },

      build: function (ctx) {
        var T = ctx.THREE;
        /* With reduced motion the engine renders one settled frame, so run the
           per-channel loops far enough in that the car has parked and every
           invoice is stamped rather than freezing them mid-story. */
        var settled = ctx.reduceMotion ? 4 : 0;
        var built = SLOTS.map(function (s) {
          var g = new T.Group();
          g.position.set(s.x, s.y || 0, s.z || 0);
          g.rotation.y = s.ry;
          g.scale.setScalar(s.scale);
          ctx.world.add(g);
          var api = s.scene.build(subCtx(ctx, g, s.color)) || {};
          if (s.href) {
            ctx.pick(g, function () { global.location.href = s.href; });
          }
          return { slot: s, g: g, api: api, focus: 0, target: 0 };
        });

        var api = {
          /* Hovering a channel pill lifts its illustration a little. */
          setFocus: function (i) {
            for (var k = 0; k < built.length; k++) built[k].target = (k === i) ? 1 : 0;
          },
          update: function (t, dt) {
            var k = Math.min(1, (dt || 1 / 60) * 8);
            for (var i = 0; i < built.length; i++) {
              var b = built[i], s = b.slot;
              b.focus += (b.target - b.focus) * k;
              if (b.api.update) b.api.update(t + settled, dt);
              /* `spin` is deliberate continuous rotation and is UNBOUNDED - only safe for a
                 shape with no fixed front (a coin, a ring). Anything with a face, like the
                 house, should use `sway`, which stays within ry ± sway. */
              b.g.rotation.y = s.ry
                + (s.spin ? t * s.spin : 0)
                + (s.sway ? Math.sin(t * s.swaySpeed) * s.sway : 0);
              b.g.position.y = (s.y || 0)
                + (s.bob ? Math.sin(t * s.bobSpeed) * s.bob : 0)
                + b.focus * 0.09;
              b.g.scale.setScalar(s.scale * (1 + b.focus * 0.07));
            }
          }
        };
        if (onReady) onReady(api, SLOTS);
        return api;
      }
    };
  };
})(window);
