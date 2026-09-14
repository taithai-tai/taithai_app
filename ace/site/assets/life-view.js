/* ACE life overview: original volumetric mesh, local WebGL, no AI requests. */
(() => {
  'use strict';
  const stage = document.getElementById('human-stage');
  const canvas = document.getElementById('human-canvas');
  const button = document.getElementById('human-rotation-toggle');
  const label = document.getElementById('human-rotation-label');
  const status = document.getElementById('human-rotation-status');
  if (!stage || !canvas || !button || !label || !status) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pauseIcon = document.getElementById('rotation-pause-icon');
  const playIcon = document.getElementById('rotation-play-icon');
  let gl, program, meshBuffer, indexBuffer, uniforms, indexCount;
  let ready = false, failed = false, paused = false, visible = true;
  let frame = 0, lastTime = 0, yaw = -0.12;
  let width = 0, height = 0;
  let fetchController;
  const reduced = () => motion.matches || document.documentElement.dataset.reduceEffects === 'true';
  const canRotate = () => ready && !failed && !paused && !reduced() && visible && !document.hidden;
  const setHidden = (element, value) => { if (element) element.toggleAttribute('hidden', value); };

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
  }

  function fallback() {
    if (failed) return;
    failed = true;
    ready = false;
    stop();
    fetchController?.abort();
    stage.dataset.render = 'poster';
    stage.setAttribute('aria-label', 'ภาพนิ่งคนกางแขนและขา ประกอบการจัดการชีวิต');
    button.disabled = true;
    label.textContent = 'แสดงภาพนิ่ง';
    status.textContent = 'ใช้ภาพนิ่งแทน ลองโหลดหน้าใหม่เพื่อเปิด 3D';
    setHidden(pauseIcon, true);
    setHidden(playIcon, true);
    if (gl && !gl.isContextLost()) {
      if (meshBuffer) gl.deleteBuffer(meshBuffer);
      if (indexBuffer) gl.deleteBuffer(indexBuffer);
      if (program) gl.deleteProgram(program);
    }
  }

  function updateControls() {
    if (!ready) return;
    const isReduced = reduced();
    const isStopped = paused || isReduced;
    button.disabled = isReduced;
    button.setAttribute('aria-label', isStopped ? 'เริ่มหมุนโมเดลคนสามมิติ' : 'หยุดหมุนโมเดลคนสามมิติ');
    label.textContent = isReduced ? 'ลดเอฟเฟกต์อยู่' : paused ? 'หมุนต่อ' : 'หยุดหมุน';
    status.textContent = isReduced ? 'แสดง 3D แบบหยุดนิ่ง' : paused ? 'หยุดหมุนแล้ว' : 'หมุนรอบตัว 360°';
    setHidden(pauseIcon, isStopped);
    setHidden(playIcon, !isStopped);
  }

  const vertexSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute float a_occlusion;
    uniform float u_yaw;
    uniform float u_scale;
    uniform vec2 u_extent;
    varying vec3 v_normal;
    varying vec3 v_position;
    varying float v_occlusion;
    void main() {
      float c = cos(u_yaw), s = sin(u_yaw);
      mat3 rotation = mat3(c, 0., -s, 0., 1., 0., s, 0., c);
      vec3 p = rotation * a_position * u_scale;
      v_position = p;
      v_normal = rotation * a_normal;
      v_occlusion = a_occlusion;
      gl_Position = vec4(p.x / u_extent.x, (p.y + .015) / u_extent.y, -p.z / 4., 1.);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 v_normal;
    varying vec3 v_position;
    varying float v_occlusion;
    void main() {
      vec3 n = normalize(v_normal);
      vec3 light = normalize(vec3(-3., 4., 5.));
      vec3 viewDirection = vec3(0., 0., 1.);
      float diffuse = max(dot(n, light), 0.);
      float fill = max(dot(n, normalize(vec3(4., 1., 2.))), 0.);
      float rim = pow(1. - max(dot(n, viewDirection), 0.), 3.);
      float specular = pow(max(dot(n, normalize(light + viewDirection)), 0.), 52.);
      float broadSpecular = pow(max(dot(n, normalize(light + viewDirection)), 0.), 10.);
      vec3 pearl = vec3(.77, .80, .85) * (.58 + .34 * diffuse);
      pearl += vec3(.70, .83, 1.) * fill * .09;
      pearl += mix(vec3(.75, .78, 1.), vec3(.68, .86, 1.), .5 + .5 * n.x) * rim * .14;
      pearl += vec3(1.) * (specular * .27 + broadSpecular * .07);
      pearl *= mix(.78, 1., v_occlusion);
      gl_FragColor = vec4(clamp(pearl, 0., 1.), 1.);
    }
  `;

  function compile(source, type) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('shader-unavailable');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('shader-compile-failed');
    }
    return shader;
  }

  function resize() {
    if (!ready) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const newWidth = Math.min(1200, Math.round(rect.width * ratio));
    const newHeight = Math.min(1200, Math.round(rect.height * ratio));
    if (newWidth !== width || newHeight !== height) {
      canvas.width = width = newWidth;
      canvas.height = height = newHeight;
      gl.viewport(0, 0, width, height);
      const halfHeight = Math.max(1.57, 1.28 * height / width);
      gl.uniform2f(uniforms.extent, halfHeight * width / height, halfHeight);
    }
    draw();
  }

  function draw() {
    if (!ready || failed) return;
    if (gl.isContextLost()) { fallback(); return; }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform1f(uniforms.yaw, yaw);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
  }

  function tick(time) {
    frame = 0;
    if (!canRotate()) { lastTime = 0; return; }
    if (lastTime) yaw = (yaw + Math.min(time - lastTime, 60) * Math.PI * 2 / 24000) % (Math.PI * 2);
    lastTime = time;
    draw();
    if (canRotate()) frame = requestAnimationFrame(tick);
  }

  function sync() {
    if (!ready || failed) return;
    updateControls();
    if (canRotate()) {
      if (!frame) frame = requestAnimationFrame(tick);
    } else {
      stop();
      draw();
    }
  }

  async function initialize() {
    let timeout;
    try {
      label.textContent = 'กำลังเตรียมภาพ 3D';
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!gl) { fallback(); return; }
      const vertexShader = compile(vertexSource, gl.VERTEX_SHADER);
      const fragmentShader = compile(fragmentSource, gl.FRAGMENT_SHADER);
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader-link-failed');
      gl.useProgram(program);
      fetchController = new AbortController();
      timeout = setTimeout(() => fetchController.abort(), 12000);
      const response = await fetch('/assets/ace-human.bin', { signal: fetchController.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('mesh-unavailable');
      const data = await response.arrayBuffer();
      clearTimeout(timeout);
      if (failed) return;
      if (data.byteLength < 16 || data.byteLength > 1500000) throw new Error('mesh-invalid');
      const header = new DataView(data);
      if (header.getUint32(0, true) !== 0x33454341) throw new Error('mesh-format');
      const vertexCount = header.getUint32(4, true);
      indexCount = header.getUint32(8, true);
      const scale = header.getFloat32(12, true);
      const indexOffset = 16 + vertexCount * 14;
      if (vertexCount < 3 || vertexCount > 65535 || indexCount < 3 || indexCount % 3 || !Number.isFinite(scale) || scale <= 0 || scale > 4 || data.byteLength !== indexOffset + indexCount * 2) throw new Error('mesh-invalid');
      const indices = new Uint16Array(data, indexOffset, indexCount);
      for (const index of indices) if (index >= vertexCount) throw new Error('mesh-index');
      meshBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, meshBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Int16Array(data, 16, vertexCount * 7), gl.STATIC_DRAW);
      for (const [name, size, offset] of [['a_position', 3, 0], ['a_normal', 3, 6], ['a_occlusion', 1, 12]]) {
        const location = gl.getAttribLocation(program, name);
        if (location < 0) throw new Error('mesh-attribute');
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.SHORT, true, 14, offset);
      }
      indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      uniforms = {
        yaw: gl.getUniformLocation(program, 'u_yaw'),
        scale: gl.getUniformLocation(program, 'u_scale'),
        extent: gl.getUniformLocation(program, 'u_extent')
      };
      gl.uniform1f(uniforms.scale, scale);
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      ready = true;
      resize();
      if (gl.getError() !== gl.NO_ERROR) throw new Error('render-failed');
      stage.dataset.render = '3d';
      sync();
    } catch {
      fallback();
    } finally {
      clearTimeout(timeout);
    }
  }

  button.addEventListener('click', () => {
    if (!ready || reduced()) return;
    paused = !paused;
    sync();
  });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', sync);
  motion.addEventListener('change', sync);
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-effects'] });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize, { passive: true });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: 0 }).observe(stage);
  }
  // The fallback is already visible; setup never delays the page's text or controls.
  requestAnimationFrame(initialize);
})();
