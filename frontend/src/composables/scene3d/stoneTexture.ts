import * as THREE from 'three';

/** Small, seamless weathering masks; palette and lighting stay in the shader. */
export function createStoneTexture(): THREE.DataTexture {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, seed: number) => {
    let n = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed * 7, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (u: number, v: number, period: number, seed: number) => {
    const x = u * period, y = v * period, ix = Math.floor(x), iy = Math.floor(y);
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const tx = smooth(x - ix), ty = smooth(y - iy);
    const sample = (dx: number, dy: number) => hash((ix + dx) % period, (iy + dy) % period, seed);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(0, 0), sample(1, 0), tx),
      THREE.MathUtils.lerp(sample(0, 1), sample(1, 1), tx), ty);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size, v = (y + .5) / size;
    pixels.set([
      Math.round(255 * (noise(u, v, 2, 19) * .65 + noise(u, v, 4, 41) * .35)),
      Math.round(255 * (noise(u, v, 8, 73) * .65 + noise(u, v, 16, 97) * .35)),
      Math.round(255 * (noise(u, v, 32, 131) * .55 + noise(u, v, 64, 157) * .45)), 255,
    ], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = 'shared-stone-weathering';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Linear mask data, not an sRGB surface image.
  texture.needsUpdate = true;
  return texture;
}
