/** Small metadata only: importing availability must not eagerly load Three.js. */
export interface MapArt {
  palette: { ground: number; wall: number; terrain: number; cover: number; base: number };
  patch: number;
  chalk: number;
  horizon: number;
  zenith: number;
  air: number;
  forest?: boolean;
}

export const MAP_ART: Record<string, MapArt> = {
  de_ancient: {
    palette: { ground: 0xe8eddd, wall: 0xa6b7aa, terrain: 0xa8bc94, cover: 0xb2bfa1, base: 0xbfcbb4 },
    patch: 0x648844, chalk: 0xd5ddbd, horizon: 0xeaf0df, zenith: 0xbcd3c1, air: 0xdce8d5, forest: true,
  },
  de_dust2: {
    palette: { ground: 0xece0c8, wall: 0xc9b993, terrain: 0xd1c1a2, cover: 0xc5b39b, base: 0xc8bca7 },
    patch: 0xb39668, chalk: 0xebe0c7, horizon: 0xefeadD, zenith: 0xd6ccb8, air: 0xe7e0d0,
  },
  de_mirage: {
    palette: { ground: 0xf0e0cd, wall: 0xd3ba9c, terrain: 0xd9c6ae, cover: 0xb2c3c6, base: 0xd4c7b3 },
    patch: 0xc39a7a, chalk: 0xede0cb, horizon: 0xeee8dc, zenith: 0xc4d7de, air: 0xe4e6df,
  },
  de_inferno: {
    palette: { ground: 0xe8ded2, wall: 0xcbb8ab, terrain: 0xc6c7b3, cover: 0xb5bba6, base: 0xcac0b3 },
    patch: 0xba8f78, chalk: 0xebe2d3, horizon: 0xefe9df, zenith: 0xc9d9d5, air: 0xe5e7df,
  },
  de_nuke: {
    palette: { ground: 0xe2e6e8, wall: 0xb2bbc5, terrain: 0xb7c4cf, cover: 0xb8bec4, base: 0xbdc8d1 },
    patch: 0x7f96a8, chalk: 0xdce0de, horizon: 0xe8edef, zenith: 0xbfcfdd, air: 0xdce4ec,
  },
  de_anubis: {
    palette: { ground: 0xf0e4ca, wall: 0xcbbd9d, terrain: 0xb1c7c2, cover: 0xc5bba4, base: 0xc5cec6 },
    patch: 0xb59e73, chalk: 0xeee3c9, horizon: 0xe8eee5, zenith: 0xb9d5d3, air: 0xdfe9df,
  },
  de_cache: {
    palette: { ground: 0xe0e3d7, wall: 0xacb9ae, terrain: 0xa5b69f, cover: 0xa6b6b8, base: 0xbac6b9 },
    patch: 0x849576, chalk: 0xd6dbcc, horizon: 0xe7ece1, zenith: 0xc0cfc4, air: 0xdce5d9,
  },
};

export function has3DMapAsset(name?: string): boolean {
  return !!name && Object.hasOwn(MAP_ART, name.toLowerCase());
}
export function getMapArt(name?: string): MapArt {
  return name && has3DMapAsset(name) ? MAP_ART[name.toLowerCase()] : MAP_ART.de_ancient;
}
