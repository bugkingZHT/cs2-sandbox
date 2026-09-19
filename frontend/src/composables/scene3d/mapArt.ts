import * as THREE from 'three';
import { getMapArt, type MapArt } from './mapCatalog';

/** Softly lit forest ruins; actor/effect palettes are independent. */
export const MAP_PALETTE = getMapArt().palette;

export function createMapGradient(): THREE.DataTexture {
  const pixels = new Uint8Array(32 * 4);
  for (let i = 0; i < 32; i++) {
    const t = i / 31, soft = t * t * (3 - 2 * t);
    const value = Math.round(96 + 140 * soft);
    pixels.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, 32, 1, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createSkyBackground(art: MapArt = getMapArt()): THREE.DataTexture {
  const pixels = new Uint8Array(64 * 4);
  const rgb = (hex: number) => [hex >> 16 & 255, hex >> 8 & 255, hex & 255];
  const horizon = rgb(art.horizon), zenith = rgb(art.zenith);
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    pixels.set([...horizon.map((v, axis) => Math.round(v + (zenith[axis] - v) * t)), 255], i * 4);
  }
  const texture = new THREE.DataTexture(pixels, 1, 64, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Soft matte stone with warm key light, cool fill and a restrained airy edge.
 * This changes only map materials; renderer exposure, scene lights, player toon
 * ramps and projectile materials are intentionally shared with the prior style.
 */
export function createMapMaterial(color: number, gradient: THREE.DataTexture, extent = 4500,
  stoneTexture?: THREE.DataTexture, art: MapArt = getMapArt()): THREE.MeshToonMaterial {
  // An enumerable texture reference lets the scene's shared-resource disposer
  // release the custom sampler exactly once, just like gradientMap.
  const material = Object.assign(new THREE.MeshToonMaterial({ color, gradientMap: gradient, side: THREE.DoubleSide }), { stoneTexture });
  material.name = 'map-sky-stone';
  material.onBeforeCompile = shader => {
    shader.uniforms.mapExtent = { value: extent };
    shader.uniforms.mapAirColor = { value: new THREE.Color(art.air) };
    shader.uniforms.mapKeyTint = { value: art.forest ? new THREE.Vector3(.86, .83, .70) : new THREE.Vector3(.86, .80, .70) };
    shader.uniforms.mapFillTint = { value: art.forest ? new THREE.Vector3(.29, .36, .30) : new THREE.Vector3(.27, .32, .40) };
    shader.fragmentShader = 'uniform float mapExtent;\nuniform vec3 mapAirColor;\nuniform vec3 mapKeyTint;\nuniform vec3 mapFillTint;\n' + shader.fragmentShader;
    if (stoneTexture) {
      shader.uniforms.mapStoneTexture = { value: stoneTexture };
      shader.uniforms.mapMossColor = { value: new THREE.Color(art.patch) };
      shader.uniforms.mapChalkColor = { value: new THREE.Color(art.chalk) };
      shader.vertexShader = 'varying vec3 vStonePosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvStonePosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = `varying vec3 vStonePosition;
        uniform sampler2D mapStoneTexture;
        uniform vec3 mapMossColor;
        uniform vec3 mapChalkColor;\n` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // World-space triplanar mapping: UV-free, continuous across mesh pieces,
        // anchored to the map rather than the moving camera or each triangle.
        vec3 stoneNormal = abs( inverseTransformDirection( normal, viewMatrix ) );
        vec3 stoneWeights = pow( stoneNormal, vec3( 4.0 ) );
        stoneWeights /= max( dot( stoneWeights, vec3( 1.0 ) ), 0.0001 );
        vec3 stoneCoord = vStonePosition / 768.0;
        vec3 stoneMask = texture2D( mapStoneTexture, stoneCoord.yz ).rgb * stoneWeights.x
          + texture2D( mapStoneTexture, stoneCoord.xz ).rgb * stoneWeights.y
          + texture2D( mapStoneTexture, stoneCoord.xy ).rgb * stoneWeights.z;
        float stoneMoss = smoothstep( 0.30, 0.60, stoneMask.r );
        float stoneChalk = smoothstep( 0.58, 0.84, stoneMask.g );
        diffuseColor.rgb = mix( diffuseColor.rgb, mapMossColor, stoneMoss * 0.92 );
        diffuseColor.rgb = mix( diffuseColor.rgb, mapChalkColor, stoneChalk * 0.32 );
        diffuseColor.rgb *= 0.90 + stoneMask.g * 0.16 + ( stoneMask.b - 0.5 ) * 0.07;`);
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `// Local art direction: no scene-wide fog, exposure or bloom affecting actors.
      vec3 mapWorldNormal = inverseTransformDirection( normal, viewMatrix );
      float mapTop = smoothstep( 0.45, 0.9, abs( mapWorldNormal.y ) );
      float mapPlaneValue = mix( 0.86, 1.0, mapTop );
      vec3 outgoingLight = ( reflectedLight.directDiffuse * mapKeyTint
        + reflectedLight.indirectDiffuse * mapFillTint ) * mapPlaneValue + totalEmissiveRadiance;
      float mapRim = pow( 1.0 - max( dot( normal, normalize( vViewPosition ) ), 0.0 ), 3.0 );
      outgoingLight += vec3( 0.027, 0.025, 0.020 ) * mapRim * ( 0.35 + 0.65 * mapTop );
      float mapHaze = 0.055 * smoothstep( mapExtent * 1.15, mapExtent * 2.4, length( vViewPosition ) );
      outgoingLight = mix( outgoingLight, mapAirColor, mapHaze );`,
    );
  };
  material.customProgramCacheKey = () => stoneTexture ? 'map-sky-themed-stone-v1' : 'map-sky-themed-v1';
  return material;
}
