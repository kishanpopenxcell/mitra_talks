/**
 * GLSL for the particle globe. One program draws both the dense core and the
 * sparse outer shell (`aKind` = 0 / 1). All motion is computed on the GPU from
 * a handful of uniforms; JavaScript only eases those uniforms toward targets.
 */

export const VERT = /* glsl */ `
precision highp float;
attribute vec3 aPos;
attribute float aSeed;
attribute float aKind;
uniform float uTime, uRadius, uTurb, uFreq, uSpeed, uYaw, uTilt, uPulse, uSwirl, uScatter, uWobble, uSparkle, uSize, uGravity, uRipple, uShell;
varying float vAlpha, vSpark, vDepth;

vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }

void main(){
  vec3 p = aPos;
  float shell = aKind;
  float t = uTime;

  // thinking: twist around the axis, stronger toward the poles
  float twist = uSwirl * sin(t * 0.7) * p.y * 2.2;
  p = rotY(twist) * p;

  // organic surface
  float n  = snoise(p * uFreq + vec3(0.0, t * uSpeed, t * uSpeed * 0.6));
  float n2 = snoise(p * uFreq * 2.3 + vec3(t * uSpeed * 1.3, 0.0, 0.0));
  float turb = uTurb * (n + 0.35 * n2) * (1.0 + shell * 2.5);
  float r = uRadius * (1.0 + shell * 0.17) * (1.0 + turb + uPulse * (0.6 + 0.4 * n));

  // listening: a wave that travels across the surface toward the viewer
  r += uRipple * 0.06 * sin(p.z * 7.0 - t * 5.0) * (1.0 - shell);

  // error: a share of points drift off the surface
  r += uScatter * step(0.82, aSeed) * (aSeed - 0.82) * 3.5 * (0.7 + 0.3 * sin(t + aSeed * 20.0));

  p *= r;
  p.y -= uGravity;

  float wob = uWobble * sin(t * 9.0) * 0.28;
  p = rotX(uTilt + wob) * rotY(uYaw) * p;

  float persp = 1.0 / (2.7 - p.z);
  gl_Position = vec4(p.xy * persp * 2.1, 0.0, 1.0);

  vDepth = p.z;
  float depthFade = smoothstep(-1.25, 0.95, p.z);
  float shellAlpha = mix(1.0, 0.32 * uShell, shell);
  vAlpha = (0.12 + 0.88 * depthFade) * shellAlpha;

  // rare bright specks; the sparkle uniform makes more of them
  float spark = step(0.988 - uSparkle * 0.05, fract(aSeed * 7.13 + floor(t * 2.0) * 0.37));
  vSpark = spark;

  gl_PointSize = uSize * persp * 2.6 * (1.0 + shell * 0.25) * (1.0 + spark * 1.6) * (0.6 + 0.4 * depthFade);
}`;

export const FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uTint, uBase;
uniform float uTintAmt, uDesat, uBright;
varying float vAlpha, vSpark, vDepth;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float soft = 1.0 - smoothstep(0.15, 1.0, d);
  // particles wear the STATE colour; the MOOD tint lives in the core
  float core = 1.0 - smoothstep(-0.6, 0.85, vDepth);
  vec3 col = mix(uBase, uTint, uTintAmt * (0.2 + 0.8 * core));
  col = mix(col, vec3(dot(col, vec3(0.3333))), uDesat);
  col *= uBright;
  col += vSpark * 0.55;
  gl_FragColor = vec4(col, soft * vAlpha * (0.84 + vSpark * 0.16));
}`;
