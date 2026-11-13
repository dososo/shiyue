/* 拾月 · gfx.js — 极简 WebGL 渲染器:正交等距、三调面光、雾中淡出、水面。零依赖。 */
(function (root) {
  'use strict';
  // 列主序 4x4
  var M = {
    id: function () { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    mul: function (a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      return o;
    },
    tr: function (x, y, z) { var m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; },
    sc: function (x, y, z) { var m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; },
    rot: function (axis, a) {
      var m = M.id(), c = Math.cos(a), s = Math.sin(a);
      if (axis === 'x') { m[5] = c; m[6] = s; m[9] = -s; m[10] = c; }
      else if (axis === 'y') { m[0] = c; m[2] = -s; m[8] = s; m[10] = c; }
      else { m[0] = c; m[1] = s; m[4] = -s; m[5] = c; }
      return m;
    },
    chain: function () { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = M.mul(m, arguments[i]); return m; }
  };

  // 顶点: pos3 nor3 col3 emis1
  function Geo() { this.d = []; this.e = 0; }
  Geo.prototype.v = function (p, n, c) { this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], this.e); };
  Geo.prototype.tri = function (a, b, c, n, col) { this.v(a, n, col); this.v(b, n, col); this.v(c, n, col); };
  Geo.prototype.quad = function (a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); };
  Geo.prototype.box = function (cx, cy, cz, hx, hy, hz, col) {
    var x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], col);
  };
  // 四棱台(屋顶、基座): 底半宽 hb,顶半宽 ht,高 h,底面在 by
  Geo.prototype.frustum = function (cx, by, cz, hb, ht, h, col) {
    var s = [[-1, -1], [1, -1], [1, 1], [-1, 1]], b = [], t = [], i;
    for (i = 0; i < 4; i++) { b.push([cx + s[i][0] * hb, by, cz + s[i][1] * hb]); t.push([cx + s[i][0] * ht, by + h, cz + s[i][1] * ht]); }
    for (i = 0; i < 4; i++) {
      var j = (i + 1) % 4, mx = (s[i][0] + s[j][0]) / 2, mz = (s[i][1] + s[j][1]) / 2;
      var ny = (hb - ht) / h, l = Math.sqrt(1 + ny * ny), n = [mx / l, ny / l, mz / l];
      this.quad(b[i], b[j], t[j], t[i], n, col);
    }
    if (ht > 0) this.quad(t[0], t[1], t[2], t[3], [0, 1, 0], col);
    this.quad(b[0], b[1], b[2], b[3], [0, -1, 0], col);
  };
  // 圆柱/圆锥: 底面圆心 (cx,by,cz),沿 axis 延伸 h
  Geo.prototype.cyl = function (cx, by, cz, r0, r1, h, col, seg, axis) {
    seg = seg || 14; axis = axis || 'y';
    var self = this, mp = function (p) { return axis === 'y' ? p : axis === 'x' ? [p[1], p[0], p[2]] : [p[0], p[2], p[1]]; };
    var P = function (p) { var q = mp(p); return [q[0] + cx, q[1] + by, q[2] + cz]; };
    var sl = (r0 - r1) / h, nl = Math.sqrt(1 + sl * sl);
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * 6.2831853, a1 = (i + 1) / seg * 6.2831853, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      var n0 = mp([c0 / nl, sl / nl, s0 / nl]), n1 = mp([c1 / nl, sl / nl, s1 / nl]);
      var b0 = P([r0 * c0, 0, r0 * s0]), b1 = P([r0 * c1, 0, r0 * s1]), t0 = P([r1 * c0, h, r1 * s0]), t1 = P([r1 * c1, h, r1 * s1]);
      self.v(b0, n0, col); self.v(b1, n1, col); self.v(t1, n1, col);
      self.v(b0, n0, col); self.v(t1, n1, col); self.v(t0, n0, col);
      if (r1 > 0) self.tri(P([0, h, 0]), t0, t1, mp([0, 1, 0]), col);
      if (r0 > 0) self.tri(P([0, 0, 0]), b1, b0, mp([0, -1, 0]), col);
    }
  };
  Geo.prototype.sphere = function (cx, cy, cz, rx, ry, rz, col, seg) {
    if (ry === undefined || typeof ry !== 'number') { col = ry; ry = rz = rx; }
    var m = seg || 12, n = Math.max(3, m >> 1) + 2, self = this;
    var pt = function (i, j) {
      var th = i / n * Math.PI, ph = j / m * 6.2831853, sx = Math.sin(th) * Math.cos(ph), sy = Math.cos(th), sz = Math.sin(th) * Math.sin(ph);
      var nx = sx / rx, ny = sy / ry, nz = sz / rz, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      return [[cx + sx * rx, cy + sy * ry, cz + sz * rz], [nx / l, ny / l, nz / l]];
    };
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) {
      var a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      self.v(a[0], a[1], col); self.v(b[0], b[1], col); self.v(c[0], c[1], col);
      self.v(a[0], a[1], col); self.v(c[0], c[1], col); self.v(d[0], d[1], col);
    }
  };

  var VS = [
    'attribute vec3 aP,aN,aC;attribute float aE;uniform mat4 uM;uniform vec3 uCen;uniform vec3 uSc;',
    'varying vec3 vN,vC,vW;varying float vE;',
    'void main(){vec4 w=uM*vec4(aP,1.);vec3 d=w.xyz-uCen;',
    'float sx=dot(d,vec3(.70710678,0.,-.70710678));float sy=dot(d,vec3(-.40824829,.81649658,-.40824829));float sz=dot(d,vec3(.57735027));',
    'gl_Position=vec4(sx*uSc.x,sy*uSc.y+uSc.z,-sz*.012,1.);vN=(uM*vec4(aN,0.)).xyz;vC=aC;vW=w.xyz;vE=aE;}'
  ].join('\n');
  var FS = [
    'precision mediump float;varying vec3 vN,vC,vW;varying float vE;',
    'uniform vec3 uShade,uLight,uFogC,uWat;uniform vec4 uFog,uOpt;',
    'void main(){vec3 n=normalize(vN);float e=max(vE,uOpt.x);',
    'float l=.72+.28*n.y+.08*n.x-.08*n.z;float t=clamp((l-.44)/.56,0.,1.);',
    'vec3 c=vC*mix(uShade,uLight,t);c=mix(c,vC,e);',
    'float f=smoothstep(uFog.x,uFog.y,vW.y);c=mix(uFogC,c,mix(.3+.7*f,1.,e));',
    'float a=smoothstep(uFog.z,uFog.w,vW.y)*uOpt.y;',
    'if(uOpt.z>.5){float d=distance(vW.xz,uWat.xy);a*=smoothstep(1.,.45,d/uWat.z);c+=.011*sin(d*3.4-uOpt.w*1.1);}',
    'gl_FragColor=vec4(c*a,a);}'
  ].join('\n');

  function Renderer(canvas) {
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) ||
      canvas.getContext('experimental-webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    var sh = function (type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var self = this; this.a = {}; this.u = {};
    ['aP', 'aN', 'aC', 'aE'].forEach(function (k) { self.a[k] = gl.getAttribLocation(pr, k); gl.enableVertexAttribArray(self.a[k]); });
    ['uM', 'uCen', 'uSc', 'uShade', 'uLight', 'uFogC', 'uWat', 'uFog', 'uOpt'].forEach(function (k) { self.u[k] = gl.getUniformLocation(pr, k); });
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.time = 0; this.ga = 1;
  }
  Renderer.prototype.mesh = function (geo) {
    var gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geo.d), gl.STATIC_DRAW);
    return { buf: b, n: geo.d.length / 10 };
  };
  Renderer.prototype.free = function (m) { if (m) this.gl.deleteBuffer(m.buf); };
  Renderer.prototype.begin = function (v) {
    var gl = this.gl, u = this.u;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3fv(u.uCen, v.center); gl.uniform3f(u.uSc, v.sx, v.sy, v.offY);
    gl.uniform3fv(u.uShade, v.shade); gl.uniform3fv(u.uLight, v.light); gl.uniform3fv(u.uFogC, v.fogC);
    gl.uniform4fv(u.uFog, v.fog); gl.uniform3fv(u.uWat, v.wat || [0, 0, 1]);
    this.time = v.time; this.ga = v.ga;
  };
  Renderer.prototype.draw = function (m, model, o) {
    if (!m || !m.n) return;
    o = o || {};
    var gl = this.gl, a = this.a;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
    gl.vertexAttribPointer(a.aP, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(a.aN, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(a.aC, 3, gl.FLOAT, false, 40, 24);
    gl.vertexAttribPointer(a.aE, 1, gl.FLOAT, false, 40, 36);
    gl.uniformMatrix4fv(this.u.uM, false, model);
    gl.uniform4f(this.u.uOpt, o.emis || 0, (o.alpha === undefined ? 1 : o.alpha) * this.ga, o.water ? 1 : 0, this.time);
    gl.depthMask(!o.noDepth);
    gl.drawArrays(gl.TRIANGLES, 0, m.n);
    gl.depthMask(true);
  };

  root.SY_GFX = { M: M, Geo: Geo, Renderer: Renderer };
})(window);
