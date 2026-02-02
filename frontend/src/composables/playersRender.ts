import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Frame, PlayerState, ReplayMeta } from '@/types/replay';
import { isUtilityItem, EQUIPMENT_ID_MAP } from '@/config/equipment';

/**
 * Player Render Module
 * 
 * Handles rendering of all player entities on the map canvas with smooth animations.
 * Uses pre-sorted player IDs from the engine (frame.sortedPlayers) for optimal rendering order,
 * eliminating the need for frontend sorting on every frame.
 */

// Player style configuration
export const PLAYER_STYLE = {
  aliveRadius: 10,
  deadRadius: 5,
  nameSize: 15,
  triLen: 8,
  triWidth: 6,
  attackLen: 40,
};

// Player sprite management for smooth transitions
export interface PlayerSprite {
  graphics: Graphics;
  label: Text;
  weaponIcon: Sprite | null;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  targetYaw: number;
  currentYaw: number;
  lastUpdateFrame: number;
}

// Animation configuration
export const LERP_FACTOR = 0.3; // Smoothing factor (0-1, higher = faster transition)
export const HARD_CUT_THRESHOLD = 5; // If frame jump > this, use hard cut instead of smooth

// Player sprite map for tracking all players
const playerSpriteMap = new Map<number, PlayerSprite>();

// Texture cache for weapon icons
const weaponTextureCache: Record<string, Texture> = {};

// Animation state
let animationFrameId: number | null = null;
let lastFrameIndex = 0;

// Render context interface
interface RenderContext {
  playerLayer: Container;
  currentFrameIndex: number;
  currentRound: number; // For team color flipping in second half
  isPlaying: boolean;
  isDragging: boolean;
  worldToMap: (x: number, y: number) => { x: number; y: number };
  onPlayerPointerOver?: (e: any, player: PlayerState) => void;
  onPlayerPointerMove?: (e: any, player: PlayerState) => void;
  onPlayerPointerOut?: (player: PlayerState) => void;
}

// Get display team (flipped in second half for rounds 13+)
const getDisplayTeam = (originalTeam: number, currentRound: number): number => {
  if (currentRound >= 13) {
    return originalTeam === 2 ? 3 : (originalTeam === 3 ? 2 : originalTeam);
  }
  return originalTeam;
};

// Linear interpolation helper
const lerp = (start: number, end: number, factor: number): number => {
  return start + (end - start) * factor;
};

// Angle interpolation (handles wrapping around 360°)
const lerpAngle = (start: number, end: number, factor: number): number => {
  let diff = end - start;
  // Normalize to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return start + diff * factor;
};

// Clear all players from the layer
export const clearPlayersLayer = (playerLayer: Container | null) => {
  if (!playerLayer) return;
  playerLayer.removeChildren();
  playerSpriteMap.clear();
};

// Stop smooth animation
export const stopPlayerAnimation = () => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

// Start smooth animation loop
export const startPlayerAnimation = (playerLayer: Container, isPlaying: boolean) => {
  if (animationFrameId !== null || !isPlaying) return;

  const animate = () => {
    if (!playerLayer || !isPlaying) {
      animationFrameId = null;
      return;
    }

    let needsUpdate = false;

    // Interpolate all player sprites
    playerSpriteMap.forEach((sprite) => {
      const dx = Math.abs(sprite.targetX - sprite.currentX);
      const dy = Math.abs(sprite.targetY - sprite.currentY);
      const dYaw = Math.abs(sprite.targetYaw - sprite.currentYaw);

      if (dx > 0.5 || dy > 0.5 || dYaw > 0.5) {
        sprite.currentX = lerp(sprite.currentX, sprite.targetX, LERP_FACTOR);
        sprite.currentY = lerp(sprite.currentY, sprite.targetY, LERP_FACTOR);
        sprite.currentYaw = lerpAngle(sprite.currentYaw, sprite.targetYaw, LERP_FACTOR);

        sprite.graphics.x = sprite.currentX;
        sprite.graphics.y = sprite.currentY;
        sprite.label.x = sprite.currentX;
        sprite.label.y = sprite.currentY + (sprite.graphics as any)._radius + 2;

        needsUpdate = true;
      }
    });

    if (needsUpdate || isPlaying) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
    }
  };

  animationFrameId = requestAnimationFrame(animate);
};

// Create a new player sprite
const createPlayerSprite = (
  player: PlayerState,
  mapPos: { x: number; y: number },
  ctx: RenderContext,
): PlayerSprite => {
  const g = new Graphics();
  const label = new Text(player.name || 'Unknown', {
    fontFamily: 'system-ui',
    fontSize: PLAYER_STYLE.nameSize,
    fill: 0xffffff,
    stroke: { color: 0x000000, width: 4 },
  });
  label.anchor.set(0.5, 0);

  const playerSprite: PlayerSprite = {
    graphics: g,
    label: label,
    weaponIcon: null,
    targetX: mapPos.x,
    targetY: mapPos.y,
    currentX: mapPos.x,
    currentY: mapPos.y,
    targetYaw: player.yaw,
    currentYaw: player.yaw,
    lastUpdateFrame: ctx.currentFrameIndex,
  };

  playerSpriteMap.set(player.id!, playerSprite);
  ctx.playerLayer.addChild(g);
  ctx.playerLayer.addChild(label);

  // Setup event handlers
  g.eventMode = 'static';
  g.cursor = 'pointer';

  if (ctx.onPlayerPointerOver) {
    (g as any).on('pointerover', (e: any) => ctx.onPlayerPointerOver?.(e, player));
  }

  if (ctx.onPlayerPointerMove) {
    (g as any).on('pointermove', (e: any) => ctx.onPlayerPointerMove?.(e, player));
  }

  if (ctx.onPlayerPointerOut) {
    (g as any).on('pointerout', () => ctx.onPlayerPointerOut?.(player));
  }

  return playerSprite;
};

// Update player sprite targets
const updatePlayerSprite = (
  playerSprite: PlayerSprite,
  player: PlayerState,
  mapPos: { x: number; y: number },
  ctx: RenderContext,
  isSeek: boolean,
) => {
  playerSprite.targetX = mapPos.x;
  playerSprite.targetY = mapPos.y;
  playerSprite.targetYaw = player.yaw;
  playerSprite.lastUpdateFrame = ctx.currentFrameIndex;

  // Hard cut: snap to position immediately if seeking or not playing
  if (isSeek || !ctx.isPlaying) {
    playerSprite.currentX = mapPos.x;
    playerSprite.currentY = mapPos.y;
    playerSprite.currentYaw = player.yaw;
  }
};

// Draw player graphics
const drawPlayerGraphics = (
  playerSprite: PlayerSprite,
  player: PlayerState,
  ctx: RenderContext,
) => {
  const g = playerSprite.graphics;
  g.clear();

  // Get display team (flipped in second half)
  const displayTeam = getDisplayTeam(player.team || 0, ctx.currentRound);
  const color = displayTeam === 3 ? 0x3b82f6 : (displayTeam === 2 ? 0xf97316 : 0x888888);
  const radius = player.alive ? PLAYER_STYLE.aliveRadius : PLAYER_STYLE.deadRadius;
  const angleRad = (playerSprite.currentYaw * Math.PI) / -180;

  // Store radius for label positioning
  (g as any)._radius = radius;

  if (player.alive) {
    // Draw direction triangle
    const isAttacking = player.buttons?.includes(1); // 1 = common.ButtonAttack
    const triColor = isAttacking ? 0xff0000 : color;

    const tipX = Math.cos(angleRad) * (radius + PLAYER_STYLE.triLen);
    const tipY = Math.sin(angleRad) * (radius + PLAYER_STYLE.triLen);
    const baseAngle1 = angleRad + Math.PI / 2;
    const baseAngle2 = angleRad - Math.PI / 2;
    const bx1 = Math.cos(angleRad) * radius + Math.cos(baseAngle1) * PLAYER_STYLE.triWidth;
    const by1 = Math.sin(angleRad) * radius + Math.sin(baseAngle1) * PLAYER_STYLE.triWidth;
    const bx2 = Math.cos(angleRad) * radius + Math.cos(baseAngle2) * PLAYER_STYLE.triWidth;
    const by2 = Math.sin(angleRad) * radius + Math.sin(baseAngle2) * PLAYER_STYLE.triWidth;

    // Triangle fill
    g.moveTo(bx1, by1).lineTo(tipX, tipY).lineTo(bx2, by2).closePath().fill({ color: triColor, alpha: 0.95 });

    // If firing, draw a thin red line extending outward
    const activeWeaponId = player.activeWeapon ? Number(player.activeWeapon) : 0;
    const isUtility = isUtilityItem(activeWeaponId);
    if (isAttacking && !isUtility) {
      const lineLen = PLAYER_STYLE.attackLen * 6;
      const endX = tipX + Math.cos(angleRad) * lineLen;
      const endY = tipY + Math.sin(angleRad) * lineLen;
      g.moveTo(tipX, tipY).lineTo(endX, endY).stroke({ width: 1, color: 0xff0000, alpha: 0.8 });
    }
  }

  // Draw player circle body
  g.circle(0, 0, radius).fill(player.alive ? color : 0x888888);

  // Dark border for contrast
  g.circle(0, 0, radius).stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });

  // 致盲状态视觉效果 (外圈白线)
  if (player.alive && (player.isBlinded || (player.flashDuration && player.flashDuration > 0))) {
    g.circle(0, 0, radius + 3).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
  }

  if (!player.alive) {
    const crossSize = radius * 0.7;
    g.moveTo(-crossSize, -crossSize).lineTo(crossSize, crossSize);
    g.moveTo(crossSize, -crossSize).lineTo(-crossSize, crossSize);
    g.stroke({ width: 2.5, color: 0xffffff, alpha: 0.9 });
  }

  // Set position (either current interpolated or target)
  g.x = playerSprite.currentX;
  g.y = playerSprite.currentY;
  playerSprite.label.x = playerSprite.currentX;
  playerSprite.label.y = playerSprite.currentY + radius + 2;
};

// Update weapon icon for player (grenades and C4 only)
const updateWeaponIcon = async (
  playerSprite: PlayerSprite,
  player: PlayerState,
  ctx: RenderContext,
) => {
  const activeWeaponId = player.activeWeapon ? Number(player.activeWeapon) : 0;
  
  // Only show icons for grenades (501-506) and C4 (404)
  const shouldShowIcon = player.alive && ((activeWeaponId >= 501 && activeWeaponId <= 506) || activeWeaponId === 404);
  
  if (!shouldShowIcon) {
    // Remove existing icon if present
    if (playerSprite.weaponIcon) {
      ctx.playerLayer.removeChild(playerSprite.weaponIcon);
      playerSprite.weaponIcon.destroy();
      playerSprite.weaponIcon = null;
    }
    return;
  }
  
  // Get weapon file name
  const fileName = EQUIPMENT_ID_MAP[activeWeaponId];
  if (!fileName) return;
  
  const assetPath = `/utility/${fileName}.svg`;
  
  try {
    // Load texture from cache or fetch
    let texture = weaponTextureCache[assetPath];
    if (!texture) {
      texture = await Assets.load(assetPath);
      weaponTextureCache[assetPath] = texture;
    }
    
    // Create or update sprite
    if (!playerSprite.weaponIcon) {
      playerSprite.weaponIcon = new Sprite(texture);
      playerSprite.weaponIcon.anchor.set(0.5);
      playerSprite.weaponIcon.width = 14;
      playerSprite.weaponIcon.height = 14;
      ctx.playerLayer.addChild(playerSprite.weaponIcon);
    } else {
      playerSprite.weaponIcon.texture = texture;
    }
    
    // Position icon at player center
    playerSprite.weaponIcon.x = playerSprite.currentX;
    playerSprite.weaponIcon.y = playerSprite.currentY;
    
    // Display icon in white color (not semi-transparent)
    playerSprite.weaponIcon.tint = 0xffffff;
    playerSprite.weaponIcon.alpha = 1.0;
    
  } catch (error) {
    console.warn(`[Player] Failed to load weapon icon: ${assetPath}`, error);
  }
};

// Main draw function for players
export const drawPlayersForFrame = (options: {
  frame: Frame | undefined;
  meta?: ReplayMeta | null;
  playerLayer: Container | null;
  currentFrameIndex: number;
  isPlaying: boolean;
  isDragging: boolean;
  worldToMap: (x: number, y: number) => { x: number; y: number };
  onPlayerPointerOver?: (e: any, player: PlayerState) => void;
  onPlayerPointerMove?: (e: any, player: PlayerState) => void;
  onPlayerPointerOut?: (player: PlayerState) => void;
}) => {
  const {
    frame,
    meta,
    playerLayer,
    currentFrameIndex,
    isPlaying,
    isDragging,
    worldToMap,
    onPlayerPointerOver,
    onPlayerPointerMove,
    onPlayerPointerOut,
  } = options;

  if (!playerLayer || !frame) {
    if (playerLayer) {
      clearPlayersLayer(playerLayer);
    }
    return;
  }

  const ctx: RenderContext = {
    playerLayer,
    currentFrameIndex,
    currentRound: frame.round, // For team color flipping in second half
    isPlaying,
    isDragging,
    worldToMap,
    onPlayerPointerOver,
    onPlayerPointerMove,
    onPlayerPointerOut,
  };

  // Detect if this is a seek (large frame jump) or smooth playback
  const frameJump = Math.abs(currentFrameIndex - lastFrameIndex);
  const isSeek = frameJump > HARD_CUT_THRESHOLD && !isDragging;
  lastFrameIndex = currentFrameIndex;

  // Track which players exist in current frame
  const currentPlayers = new Set<number>();

  if (frame.players && meta?.serverPlayer) {
    // Use sorted player IDs from meta.serverPlayer
    const serverPlayers = meta.serverPlayer;
    const playerMap = frame.players;

    for (const playerInfo of serverPlayers) {
      const playerId = playerInfo.id;
      const frameData = playerMap[playerId];
      
      // Skip if player not found in current frame
      if (!frameData) continue;
      
      // Merge metadata with frame data to create complete player object
      const displayTeam = getDisplayTeam(playerInfo.team, ctx.currentRound);
      const player: PlayerState = {
        ...frameData,
        id: playerInfo.id,
        name: playerInfo.name,
        team: displayTeam, // Use display team for correct coloring in second half
        steamID: playerInfo.steamID,
        isBot: playerInfo.isBot
      };
      
      currentPlayers.add(player.id!);
      const mapPos = worldToMap(player.x, player.y);

      // Check if player sprite already exists
      let playerSprite = playerSpriteMap.get(player.id!);

      if (!playerSprite) {
        // Create new player sprite
        playerSprite = createPlayerSprite(player, mapPos, ctx);
      } else {
        // Update existing player sprite targets
        updatePlayerSprite(playerSprite, player, mapPos, ctx, isSeek);
      }

      // Redraw player graphics
      drawPlayerGraphics(playerSprite, player, ctx);
      
      // Update weapon icon (grenades and C4) - non-blocking
      updateWeaponIcon(playerSprite, player, ctx);
    }
  } else if (frame.players) {
    // Fallback: if no serverPlayer metadata, use frame keys (backward compatibility)
    const playerIds = Object.keys(frame.players).map(Number);
    const playerMap = frame.players;

    for (const playerId of playerIds) {
      const frameData = playerMap[playerId];
      if (!frameData) continue;
      
      // Use frame data only (missing metadata fields)
      const player: PlayerState = {
        ...frameData,
        id: playerId
      };
      
      currentPlayers.add(player.id!);
      const mapPos = worldToMap(player.x, player.y);

      let playerSprite = playerSpriteMap.get(player.id!);

      if (!playerSprite) {
        playerSprite = createPlayerSprite(player, mapPos, ctx);
      } else {
        updatePlayerSprite(playerSprite, player, mapPos, ctx, isSeek);
      }

      drawPlayerGraphics(playerSprite, player, ctx);
      updateWeaponIcon(playerSprite, player, ctx);
    }
  }

  // Remove players that are no longer in the frame
  const toRemove: number[] = [];
  playerSpriteMap.forEach((sprite, playerId) => {
    if (!currentPlayers.has(playerId)) {
      playerLayer.removeChild(sprite.graphics);
      playerLayer.removeChild(sprite.label);
      if (sprite.weaponIcon) {
        playerLayer.removeChild(sprite.weaponIcon);
        sprite.weaponIcon.destroy();
      }
      sprite.graphics.destroy();
      sprite.label.destroy();
      toRemove.push(playerId);
    }
  });
  toRemove.forEach((id) => playerSpriteMap.delete(id));

  // Start animation loop only if playing AND not seeking
  if (isPlaying && !isSeek) {
    startPlayerAnimation(playerLayer, isPlaying);
  }
};

// Reset last frame index (useful when switching demos)
export const resetPlayerRenderer = () => {
  lastFrameIndex = 0;
  stopPlayerAnimation();
  playerSpriteMap.clear();
};
