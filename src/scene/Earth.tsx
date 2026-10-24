/**
 * Textured Earth, rotated by GMST, with day/night blending driven by the
 * real Sun direction, ocean specular highlight and a fresnel atmosphere.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { getSimDate } from '../store/simulationClock';
import { gmstAt, sunDirectionScene } from '../orbital/astro';
import { earthRotationY } from '../orbital/frames';

const BASE = import.meta.env.BASE_URL;

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform vec3 uSunDir;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 l = normalize(uSunDir);
    vec3 v = normalize(cameraPosition - vPosW);
    float ndl = dot(n, l);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float water = texture2D(uWater, vUv).r;

    // Soft terminator (twilight band of a few degrees).
    float dayMix = smoothstep(-0.12, 0.18, ndl);
    vec3 lit = day * (0.04 + 1.1 * max(ndl, 0.0));
    // The night map carries a bluish base layer: keep it very dim and let
    // only the bright city lights glow, with a warm sodium tint.
    float lum = dot(night, vec3(0.299, 0.587, 0.114));
    float cityMask = smoothstep(0.06, 0.32, lum);
    vec3 nightBase = night * 0.28;
    vec3 cityLights = vec3(1.0, 0.78, 0.48) * cityMask * 2.8;
    vec3 color = mix(nightBase + cityLights, lit, dayMix);

    // Ocean specular highlight.
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 120.0) * water * max(ndl, 0.0);
    color += vec3(0.55, 0.7, 0.9) * spec * 0.1;

    // Thin atmospheric scattering at the limb on the day side.
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    color += vec3(0.25, 0.55, 1.0) * rim * 0.3 * smoothstep(-0.1, 0.5, ndl);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const atmosphereFragment = /* glsl */ `
  uniform vec3 uSunDir;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vPosW);
    float fresnel = pow(1.0 - abs(dot(n, v)), 2.5);
    float sunSide = smoothstep(-0.35, 0.6, dot(n, normalize(uSunDir)));
    vec3 color = vec3(0.22, 0.55, 1.0);
    float alpha = fresnel * (0.25 + 0.75 * sunSide) * 0.9;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

export function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  const { day, night, water } = useTexture({
    day: `${BASE}textures/earth_day.jpg`,
    night: `${BASE}textures/earth_night.jpg`,
    water: `${BASE}textures/earth_water_mask.png`,
  });

  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;
    water.colorSpace = THREE.NoColorSpace;
    for (const t of [day, night, water]) t.anisotropy = 8;
  }, [day, night, water]);

  const earthUniforms = useMemo(
    () => ({
      uDay: { value: day },
      uNight: { value: night },
      uWater: { value: water },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    }),
    [day, night, water],
  );
  const atmosphereUniforms = useMemo(() => ({ uSunDir: { value: new THREE.Vector3(1, 0, 0) } }), []);

  useFrame(() => {
    const date = getSimDate();
    const [sx, sy, sz] = sunDirectionScene(date);
    earthUniforms.uSunDir.value.set(sx, sy, sz);
    atmosphereUniforms.uSunDir.value.set(sx, sy, sz);
    if (earthRef.current) earthRef.current.rotation.y = earthRotationY(gmstAt(date));
  });

  return (
    <group>
      <mesh ref={earthRef} name="earth">
        <sphereGeometry args={[1, 128, 64]} />
        <shaderMaterial vertexShader={earthVertex} fragmentShader={earthFragment} uniforms={earthUniforms} />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[1, 96, 48]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          uniforms={atmosphereUniforms}
          side={THREE.BackSide}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
