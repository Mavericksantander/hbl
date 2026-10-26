(() => {
  const containers = document.querySelectorAll(".hero-animated-gradient");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const presets = {
    Prism: {
      color1: "#050505", color2: "#66B3FF", color3: "#FFFFFF",
      rotation: -50, proportion: 1, scale: 0.01, speed: 30, distortion: 0,
      swirl: 50, swirlIterations: 16, softness: 47, shapeSize: 45, offset: -299, shape: "Checks"
    }
  };

  const vertexShaderSource = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}`;

  const fragmentShaderSource = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;

out vec4 fragColor;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

vec2 rotate(vec2 uv, float th) {
  return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x1 = mix(a, b, u.x);
  float x2 = mix(c, d, u.x);
  return mix(x1, x2, u.y);
}

vec4 blend_colors(vec4 c1, vec4 c2, vec4 c3, float mixer, float edgesWidth, float edge_blur) {
  vec3 color1 = c1.rgb * c1.a;
  vec3 color2 = c2.rgb * c2.a;
  vec3 color3 = c3.rgb * c3.a;
  float r1 = smoothstep(.0 + .35 * edgesWidth, .7 - .35 * edgesWidth + .5 * edge_blur, mixer);
  float r2 = smoothstep(.3 + .35 * edgesWidth, 1. - .35 * edgesWidth + edge_blur, mixer);
  vec3 blended_color_2 = mix(color1, color2, r1);
  float blended_opacity_2 = mix(c1.a, c2.a, r1);
  vec3 c = mix(blended_color_2, color3, r2);
  float o = mix(blended_opacity_2, c3.a, r2);
  return vec4(c, o);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = .5 * u_time;
  float noise_scale = .0005 + .006 * u_scale;

  uv -= .5;
  uv *= noise_scale * u_resolution;
  uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio;
  uv += .5;

  float n1 = noise(uv + t);
  float n2 = noise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv.x += 4. * u_distortion * n2 * cos(angle);
  uv.y += 4. * u_distortion * n2 * sin(angle);

  float iterations_number = ceil(clamp(u_swirlIterations, 1., 30.));
  for (float i = 1.; i <= iterations_number; i++) {
    uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
    uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * uv.x);
  }

  float proportion = clamp(u_proportion, 0., 1.);
  float shape;
  float mixer;
  if (u_shape < .5) {
    vec2 checks_shape_uv = uv * (.5 + 3.5 * u_shapeScale);
    shape = .5 + .5 * sin(checks_shape_uv.x) * cos(checks_shape_uv.y);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else if (u_shape < 1.5) {
    float stripe = fract(uv.y * (.25 + 3. * u_shapeScale));
    shape = smoothstep(0., .55, stripe) * smoothstep(1., .45, stripe);
    mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);
  } else {
    float edge = uv.y / (noise_scale * u_resolution.y);
    shape = smoothstep(.45 - .2 * (1. - u_shapeScale), .55 + .2 * (1. - u_shapeScale), edge + .3 * (proportion - .5));
    mixer = shape;
  }

  vec4 color_mix = blend_colors(
    u_color1,
    u_color2,
    u_color3,
    mixer,
    1. - clamp(u_softness, 0., 1.),
    .01 + .01 * u_scale
  );

  fragColor = vec4(color_mix.rgb, color_mix.a);
}`;

  containers.forEach((container) => {
    const canvas = container.querySelector("canvas");
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      alpha: true,
      antialias: true
    });
    if (!gl) return;

    let vertexShader;
    let fragmentShader;
    let program;
    let positionBuffer;
    let frameId;
    let resizeObserver;
    let intersectionObserver;
    let isVisible = !("IntersectionObserver" in window);
    let startTime = 0;

    const dispose = () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (program) gl.deleteProgram(program);
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
    };

    const compileShader = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("No se pudo crear un shader WebGL.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Error de compilación desconocido.";
        gl.deleteShader(shader);
        throw new Error(`No se pudo compilar el shader AnimatedGradient: ${message}`);
      }
      return shader;
    };

    const hexToRgba = (hex) => {
      const value = hex.replace("#", "");
      const normalized = value.length === 3
        ? value.split("").map((part) => part + part).join("")
        : value;
      return [
        parseInt(normalized.slice(0, 2), 16) / 255,
        parseInt(normalized.slice(2, 4), 16) / 255,
        parseInt(normalized.slice(4, 6), 16) / 255,
        normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : 1
      ];
    };

    try {
    vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    program = gl.createProgram();
    if (!program) throw new Error("No se pudo crear el programa WebGL.");
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`No se pudo enlazar el programa AnimatedGradient: ${gl.getProgramInfoLog(program) || "error desconocido."}`);
    }

    gl.useProgram(program);
    positionBuffer = gl.createBuffer();
    if (!positionBuffer) throw new Error("No se pudo crear el buffer WebGL.");
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      resolution: gl.getUniformLocation(program, "u_resolution"),
      pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
      scale: gl.getUniformLocation(program, "u_scale"),
      rotation: gl.getUniformLocation(program, "u_rotation"),
      color1: gl.getUniformLocation(program, "u_color1"),
      color2: gl.getUniformLocation(program, "u_color2"),
      color3: gl.getUniformLocation(program, "u_color3"),
      proportion: gl.getUniformLocation(program, "u_proportion"),
      softness: gl.getUniformLocation(program, "u_softness"),
      shape: gl.getUniformLocation(program, "u_shape"),
      shapeScale: gl.getUniformLocation(program, "u_shapeScale"),
      distortion: gl.getUniformLocation(program, "u_distortion"),
      swirl: gl.getUniformLocation(program, "u_swirl"),
      swirlIterations: gl.getUniformLocation(program, "u_swirlIterations")
    };

    const activePreset = () => presets[container.dataset.preset] || presets.Prism;

    const resize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(container.clientWidth * pixelRatio));
      const height = Math.max(1, Math.round(container.clientHeight * pixelRatio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    };

    const draw = (time) => {
      resize();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const elapsed = (time - startTime) / 1000;
      const preset = activePreset();
      const seconds = elapsed * ((preset.speed / 100) * 5) + preset.offset * 0.01;
      const setColor = (location, color) => gl.uniform4f(location, ...color);

      gl.uniform1f(uniforms.time, seconds);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.pixelRatio, pixelRatio);
      gl.uniform1f(uniforms.scale, preset.scale);
      gl.uniform1f(uniforms.rotation, (preset.rotation * Math.PI) / 180);
      setColor(uniforms.color1, hexToRgba(preset.color1));
      setColor(uniforms.color2, hexToRgba(preset.color2));
      setColor(uniforms.color3, hexToRgba(preset.color3));
      gl.uniform1f(uniforms.proportion, preset.proportion / 100);
      gl.uniform1f(uniforms.softness, preset.softness / 100);
      gl.uniform1f(uniforms.shape, { Checks: 0, Stripes: 1, Edge: 2 }[preset.shape]);
      gl.uniform1f(uniforms.shapeScale, preset.shapeSize / 100);
      gl.uniform1f(uniforms.distortion, preset.distortion / 50);
      gl.uniform1f(uniforms.swirl, preset.swirl / 100);
      gl.uniform1f(uniforms.swirlIterations, preset.swirlIterations);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const animate = (time) => {
      frameId = undefined;
      draw(time);
      if (!reduceMotion.matches && isVisible && !document.hidden) {
        frameId = requestAnimationFrame(animate);
      }
    };

    const scheduleFrame = () => {
      if (frameId !== undefined) cancelAnimationFrame(frameId);
      frameId = undefined;
      if (isVisible && !document.hidden) frameId = requestAnimationFrame(animate);
    };

    resizeObserver = new ResizeObserver(() => {
      resize();
      if (reduceMotion.matches && isVisible && !document.hidden) draw(performance.now());
    });
    resizeObserver.observe(container);
    if ("IntersectionObserver" in window) {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) scheduleFrame();
        else if (frameId !== undefined) {
          cancelAnimationFrame(frameId);
          frameId = undefined;
        }
      });
      intersectionObserver.observe(container);
    }
    startTime = performance.now();
    container.classList.add("is-webgl-ready");
    scheduleFrame();
    reduceMotion.addEventListener("change", scheduleFrame);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (frameId !== undefined) cancelAnimationFrame(frameId);
        frameId = undefined;
      } else {
        scheduleFrame();
      }
    });
  } catch (error) {
    dispose();
      console.error("AnimatedGradient no pudo inicializar WebGL.", error);
    }
  });
})();
