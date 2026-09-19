import fs from 'node:fs';

export function readGlb(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2');
  const jsonSize = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonSize).toString());
  const bin = buffer.subarray(28 + jsonSize);
  const access = id => {
    const a = json.accessors[id], view = json.bufferViews[a.bufferView];
    if (a.sparse || view.byteStride) throw new Error('Unexpected interleaved/sparse VRF GLB accessor');
    const components = a.type === 'VEC3' ? 3 : a.type === 'SCALAR' ? 1 : 0;
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    if (!Type || !components) throw new Error('Unsupported GLB accessor');
    return new Type(bin.buffer, bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0), a.count * components);
  };
  const meshes = [];
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    const m = node.matrix;
    // VRF 20.0 leaves Source XYZ in vertices and puts its conversion on the node.
    if (!m || m[12] !== 0 || m[13] !== 0 || m[14] !== 0 || Math.abs(m[2] - 0.0254) > 1e-6 || Math.abs(m[4] - 0.0254) > 1e-6 || Math.abs(m[9] - 0.0254) > 1e-6) throw new Error(`Unexpected transform on ${node.name}`);
    for (const primitive of json.meshes[node.mesh].primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) continue;
      meshes.push({ name: node.name, extras: node.extras || {}, positions: access(primitive.attributes.POSITION), indices: access(primitive.indices) });
    }
  }
  return meshes;
}
