import * as THREE from 'three';

/** Shared team colors sampled from the visual references (sRGB). */
export const T_TEAM_COLOR = 0xe38b3b;
export const CT_TEAM_COLOR = 0x3270d2;

/** Keep toon shading, without scene exposure bleaching or shifting team hues. */
export function preserveTeamColor(material: THREE.MeshToonMaterial): void {
  const references = [T_TEAM_COLOR, CT_TEAM_COLOR].map(hex => {
    const tint = new THREE.Color(hex);
    return `vec3(${tint.r.toFixed(8)}, ${tint.g.toFixed(8)}, ${tint.b.toFixed(8)})`;
  });
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    // diffuseColor already includes instance colors. Preserve neutral instances
    // and compose with existing hooks, including the shared smoke-hole shader.
    shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
#include <tonemapping_fragment>
${references.map(reference => `{
vec3 teamTint = ${reference};
if (distance(diffuseColor.rgb, teamTint) < 0.001) {
  vec3 luminance = vec3(0.2126, 0.7152, 0.0722);
  float shade = clamp(dot(outgoingLight, luminance) / dot(teamTint, luminance), 0.55, 1.0);
  gl_FragColor.rgb = teamTint * shade;
}
}`).join('\n')}`);
  };
  material.customProgramCacheKey = () => `${cacheKey()}-team-colors-v2`;
}
