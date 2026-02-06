/**
 * 玩家按键位掩码常量定义
 * 与后端 common.ButtonBitMask 对应
 * @see pkg/demoinfocs/common/common.go
 */
export const BUTTON_MASKS = {
  NONE: 0x0,
  ATTACK: 0x1,        // 鼠标左键 (攻击)
  JUMP: 0x2,          // 跳跃
  DUCK: 0x4,          // 蹲下
  FORWARD: 0x8,       // W (前进)
  BACK: 0x10,         // S (后退)
  USE: 0x20,          // E (使用)
  TURN_LEFT: 0x80,    // 左转
  TURN_RIGHT: 0x100,  // 右转
  MOVE_LEFT: 0x200,   // A (左移)
  MOVE_RIGHT: 0x400,  // D (右移)
  ATTACK2: 0x800,     // 鼠标右键 (瞄准/副攻击)
  RELOAD: 0x2000,     // R (换弹)
  SPEED: 0x10000,     // Shift (静步)
} as const;

/**
 * 检查按键是否被按下
 * @param buttons 按键状态数组 (从帧数据获取)
 * @param mask 要检查的按键掩码
 * @returns 是否按下
 */
export function isButtonPressed(buttons: number[] | undefined, mask: number): boolean {
  if (!buttons || buttons.length === 0) return false;
  // buttons 数组中每个元素都是一个按键的掩码值
  // 如果数组中包含该掩码，说明按键被按下
  return buttons.includes(mask);
}

/**
 * WASD 按键配置
 */
export const MOVEMENT_KEYS = [
  { key: 'W', mask: BUTTON_MASKS.FORWARD, position: 'top' },
  { key: 'A', mask: BUTTON_MASKS.MOVE_LEFT, position: 'left' },
  { key: 'S', mask: BUTTON_MASKS.BACK, position: 'bottom' },
  { key: 'D', mask: BUTTON_MASKS.MOVE_RIGHT, position: 'right' },
] as const;

/**
 * 鼠标按键配置
 */
export const MOUSE_KEYS = [
  { key: 'LMB', mask: BUTTON_MASKS.ATTACK, label: '左键' },
  { key: 'RMB', mask: BUTTON_MASKS.ATTACK2, label: '右键' },
] as const;

/**
 * 其他按键配置
 */
export const OTHER_KEYS = [
  { key: 'JUMP', mask: BUTTON_MASKS.JUMP, label: '跳跃' },
  { key: 'DUCK', mask: BUTTON_MASKS.DUCK, label: '蹲下' },
] as const;
