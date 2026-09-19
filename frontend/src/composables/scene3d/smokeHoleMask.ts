import * as THREE from 'three';
import { smokeHoleRadius, type SmokeDispersalEvent } from './smokeDispersal';

const CAPACITY = 256;
// More than the simultaneous HE loadout of a standard match; bounded shader cost.
const MAX_HOLES = 16;

/** Local spherical cut-outs on the existing instanced puffs. Cloud transforms,
 * colors, opacity and natural lifecycle remain untouched outside each blast.
 */
export class SmokeHoleMask {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshToonMaterial;
  readonly data = new Float32Array(CAPACITY * MAX_HOLES * 4);
  readonly texture = new THREE.DataTexture(this.data, MAX_HOLES, CAPACITY, THREE.RGBAFormat, THREE.FloatType);
  readonly rows = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 2), 2);

  constructor(geometry: THREE.BufferGeometry, gradientMap: THREE.DataTexture) {
    this.geometry = geometry.clone();
    this.geometry.setAttribute('smokeMask', this.rows);
    this.rows.setUsage(THREE.DynamicDrawUsage);
    this.texture.minFilter = this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this.material = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap, transparent: true, opacity: 0.5, depthWrite: false });
    this.material.onBeforeCompile = shader => {
      shader.uniforms.smokeHoles = { value: this.texture };
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
attribute vec2 smokeMask;
varying vec2 vSmokeMask;
varying vec3 vSmokeWorldPosition;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
vSmokeMask = smokeMask;
vSmokeWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D smokeHoles;
varying vec2 vSmokeMask;
varying vec3 vSmokeWorldPosition;`)
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
for (int i = 0; i < ${MAX_HOLES}; i++) {
  if (float(i) >= vSmokeMask.y) break;
  vec4 hole = texture2D(smokeHoles, vec2((float(i) + 0.5) / ${MAX_HOLES}.0, (vSmokeMask.x + 0.5) / ${CAPACITY}.0));
  float distanceToBlast = distance(vSmokeWorldPosition, hole.xyz);
  float rim = min(8.0, hole.w * 0.12);
  if (distanceToBlast <= hole.w - rim) discard;
  diffuseColor.a *= smoothstep(hole.w - rim, hole.w, distanceToBlast);
}`);
    };
    this.material.customProgramCacheKey = () => 'smoke-local-holes-v1';
  }

  set(instance: number, events: readonly SmokeDispersalEvent[] | undefined, timeMs: number, fadeStartMs: number): void {
    let count = 0;
    for (let i = (events?.length ?? 0) - 1; i >= 0 && count < MAX_HOLES; i--) {
      const event = events![i];
      const radius = smokeHoleRadius(event, timeMs, fadeStartMs);
      if (radius <= 0) continue;
      const offset = (instance * MAX_HOLES + count++) * 4;
      this.data[offset] = event.x;
      this.data[offset + 1] = event.z;
      this.data[offset + 2] = -event.y;
      this.data[offset + 3] = radius;
    }
    this.rows.setXY(instance, instance, count);
  }

  update(): void {
    this.rows.needsUpdate = true;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
