"use strict";

function anatomyRenderer(canvas, surfaces) {
  if (!surfaces?.left || !surfaces.right) throw Error("Trūksta abiejų BigBrain pusrutulių.");
  const gl = canvas.getContext("webgl", {alpha:true, antialias:true, preserveDrawingBuffer:true});
  if (!gl) throw Error("Naršyklėje nepasiekiamas WebGL.");

  const program = gl.createProgram();
  function attach(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }

  attach(gl.VERTEX_SHADER, `
    attribute vec3 point;
    attribute vec3 normal;
    uniform mat3 camera;
    varying vec3 n;
    void main() {
      vec3 p = camera * point;
      float zoom = 300.0 * (1.0 + p.z * 0.19);
      n = camera * normal;
      gl_Position = vec4(p.x * zoom / 400.0, (p.y * zoom + 3.0) / 325.0, -p.z * 0.5, 1.0);
    }
  `);
  attach(gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec3 tissue;
    varying vec3 n;
    void main() {
      vec3 direction = normalize(n);
      float key = max(dot(direction, normalize(vec3(-0.56, 0.61, 0.75))), 0.0);
      float fill = max(dot(direction, normalize(vec3(0.67, -0.05, 0.65))), 0.0);
      float rim = pow(1.0 - abs(direction.z), 3.0);
      vec3 color = tissue * (0.29 + 0.65 * key + 0.21 * fill) + vec3(0.21, 0.24, 0.31) * rim;
      gl_FragColor = vec4(color, 1.0);
    }
  `);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);

  const point = gl.getAttribLocation(program, "point"), normal = gl.getAttribLocation(program, "normal");
  const camera = gl.getUniformLocation(program, "camera"), tissue = gl.getUniformLocation(program, "tissue");
  gl.enableVertexAttribArray(point);
  gl.enableVertexAttribArray(normal);
  gl.enable(gl.DEPTH_TEST);

  function decode(encoded, read) {
    const raw = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
    const view = new DataView(raw.buffer);
    return Array.from({length:raw.length / 2}, (_, i) => view[read](2 * i, true));
  }

  function buffer(kind, values) {
    const handle = gl.createBuffer();
    gl.bindBuffer(kind, handle);
    gl.bufferData(kind, values, gl.STATIC_DRAW);
    return handle;
  }

  function prepare({positions, triangles}, color) {
    // MNI RAS and MNE head both use right, anterior and superior positive axes.
    // One uniform visual scale preserves morphology and the gap between hemispheres.
    const origin = [0, -16, 16];
    const vertices = Float32Array.from(decode(positions, "getInt16"),
      (value, i) => (value / 100 - origin[i % 3]) * 0.0079 + (i % 3 === 2 ? 0.38 : 0));
    const indices = Uint16Array.from(decode(triangles, "getUint16"));
    const normals = new Float32Array(vertices.length);
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = 3 * indices[i], b = 3 * indices[i + 1], c = 3 * indices[i + 2];
      const abx = vertices[b] - vertices[a], aby = vertices[b + 1] - vertices[a + 1], abz = vertices[b + 2] - vertices[a + 2];
      const acx = vertices[c] - vertices[a], acy = vertices[c + 1] - vertices[a + 1], acz = vertices[c + 2] - vertices[a + 2];
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      volume += vertices[a] * nx + vertices[a + 1] * ny + vertices[a + 2] * nz;
      for (const index of [a, b, c]) {
        normals[index] += nx;
        normals[index + 1] += ny;
        normals[index + 2] += nz;
      }
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      const sign = volume >= 0 ? 1 : -1;
      for (let axis = 0; axis < 3; axis++) normals[i + axis] *= sign / length;
    }
    return {points:buffer(gl.ARRAY_BUFFER, vertices), normals:buffer(gl.ARRAY_BUFFER, normals),
      faces:buffer(gl.ELEMENT_ARRAY_BUFFER, indices), count:indices.length, color};
  }

  const meshes = {
    left:prepare(surfaces.left, [0.91, 0.64, 0.49]),
    right:prepare(surfaces.right, [0.65, 0.66, 0.91])
  };
  return (matrix, hemisphere) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix3fv(camera, false, matrix);
    for (const [side, mesh] of Object.entries(meshes)) {
      if (hemisphere !== "both" && hemisphere !== side) continue;
      gl.uniform3fv(tissue, mesh.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.points);
      gl.vertexAttribPointer(point, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normals);
      gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.faces);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
  };
}
