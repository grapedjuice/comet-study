"use client";

import { useEffect, useRef } from "react";
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";

/*
 * Fluid-field shader from the 21st.dev "Fluid Field Background" prompt
 * (ThreeUI / Aura UI), rebuilt natively instead of in an iframe and extended:
 * the field drifts with scroll depth, the palette travels indigo → violet →
 * teal down the page, the cursor lights it, and parallax stars plus comets
 * pass through it.
 */
const fragmentShader = /* glsl */ `
precision highp float;
uniform float u_time;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_depth;
uniform float u_velocity;
uniform vec2 u_mouse;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 stars(vec2 uv, float scale, float parallax) {
  vec2 p = uv * scale;
  p.y += u_depth * scale * parallax;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash(id);
  if (h < 0.93) return vec3(0.0);
  vec2 offset = vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5;
  float d = length(f - offset * 0.7);
  float twinkle = 0.55 + 0.45 * sin(u_time * (0.8 + h * 2.5) + h * 40.0);
  float streak = 1.0 + u_velocity * 6.0;
  float s = smoothstep(0.07, 0.0, d / vec2(1.0, streak).y) * twinkle * (h - 0.93) * 14.0;
  return s * mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.88, 0.76), hash(id + 5.0));
}

vec3 comet(vec2 uv, float seed, float aspect) {
  float period = 11.0 + seed * 4.0;
  float t = mod(u_time + seed * 23.0, period) / period;
  float life = t / 0.28;
  if (life > 1.0) return vec3(0.0);
  vec2 start = vec2(hash(vec2(seed, 1.0)) * aspect * 0.7 - 0.1, 1.12);
  vec2 dir = normalize(vec2(0.85, -0.5 - hash(vec2(seed, 2.0)) * 0.35));
  vec2 head = start + dir * life * (aspect + 0.9);
  vec2 rel = uv - head;
  float along = dot(rel, -dir);
  float perp = length(rel + dir * along);
  float tail = step(0.0, along) * smoothstep(0.42, 0.0, along)
             * smoothstep(0.0025 + along * 0.018, 0.0, perp);
  float glow = 0.0009 / (dot(rel, rel) + 0.0009);
  float fade = sin(life * 3.14159);
  return (vec3(1.0, 0.86, 0.7) * glow * 0.55 + vec3(0.62, 0.72, 1.0) * tail * 0.9) * fade;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  vec3 base = vec3(0.010, 0.011, 0.028);

  vec2 st = uv * 0.7 + vec2(0.0, u_depth * 0.18);
  st += vec2(snoise(st + u_time * 0.05), snoise(st - u_time * 0.05)) * 0.3;
  float beam = smoothstep(0.1, 0.8, snoise(vec2(st.x + st.y * 1.5 - u_time * 0.15, u_time * 0.02)));
  float beam2 = smoothstep(0.35, 0.95, snoise(vec2(st.x * 1.3 - st.y * 0.8 + u_time * 0.1 + 4.0, u_time * 0.03 + 2.0)));

  vec3 a = mix(vec3(0.15, 0.25, 0.85), vec3(0.36, 0.16, 0.78), smoothstep(0.0, 0.6, u_progress));
  vec3 b = mix(vec3(0.40, 0.20, 0.90), vec3(0.06, 0.52, 0.62), smoothstep(0.35, 1.0, u_progress));
  vec3 glowColor = mix(a, b, snoise(uv * 1.5 + u_time * 0.1) * 0.5 + 0.5);

  vec3 col = base + glowColor * beam * 0.62 + vec3(0.10, 0.48, 0.56) * beam2 * 0.16;

  vec2 m = vec2(u_mouse.x * aspect, u_mouse.y);
  col += vec3(0.38, 0.32, 0.95) * 0.14 * exp(-dot(uv - m, uv - m) * 5.0);

  col += stars(uv, 70.0, 0.05) * 0.9;
  col += stars(uv + 3.7, 140.0, 0.025) * 0.55;
  col += comet(uv, 1.0, aspect) + comet(uv, 2.0, aspect) * 0.75 + comet(uv, 3.0, aspect) * 0.55;

  vec2 q = gl_FragCoord.xy / u_res;
  col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.22);
  col += (hash(gl_FragCoord.xy + fract(u_time) * 97.0) - 0.5) * 0.022;

  gl_FragColor = vec4(col, 1.0);
}
`;

const vertexShader = /* glsl */ `void main() { gl_Position = vec4(position, 1.0); }`;

export default function Cosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      return; // CSS gradient fallback stays visible.
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const uniforms = {
      u_time: { value: 0 },
      u_res: { value: new Vector2(1, 1) },
      u_progress: { value: 0 },
      u_depth: { value: 0 },
      u_velocity: { value: 0 },
      u_mouse: { value: new Vector2(0.5, 0.7) },
    };
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
    });
    scene.add(new Mesh(geometry, material));

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(ratio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      uniforms.u_res.value.set(
        Math.floor(window.innerWidth * ratio),
        Math.floor(window.innerHeight * ratio),
      );
    };
    const target = { x: 0.5, y: 0.7 };
    const pointer = (event: PointerEvent) => {
      target.x = event.clientX / window.innerWidth;
      target.y = 1 - event.clientY / window.innerHeight;
    };

    let frame = 0;
    let lastScroll = window.scrollY;
    const started = performance.now();
    const render = (now: number) => {
      const scrollY = window.scrollY;
      const max = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const velocity = Math.min(1, Math.abs(scrollY - lastScroll) / 60);
      lastScroll = scrollY;
      uniforms.u_time.value = reduced ? 8 : (now - started) / 1000;
      uniforms.u_progress.value = scrollY / max;
      uniforms.u_depth.value = scrollY / window.innerHeight;
      uniforms.u_velocity.value += (velocity - uniforms.u_velocity.value) * 0.1;
      const mouse = uniforms.u_mouse.value;
      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;
      renderer.render(scene, camera);
      if (!reduced && !document.hidden) frame = requestAnimationFrame(render);
    };
    const restart = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("visibilitychange", restart);
    if (reduced) window.addEventListener("scroll", restart, { passive: true });
    restart();
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", pointer);
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("scroll", restart);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="cosmos" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
