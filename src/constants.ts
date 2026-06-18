export const TILE_SIZE = 18;
export const TILESET_COLS = 20;
export const TILESET_ROWS = 9;
export const TILESET_TOTAL = 180;

export const FALL_TILESET_COLS = 16;
export const FALL_TILESET_ROWS = 7;
export const FALL_TILESET_TOTAL = 112;

export const INDUSTRIAL_TILESET_COLS = 16;
export const INDUSTRIAL_TILESET_ROWS = 7;
export const INDUSTRIAL_TILESET_TOTAL = 112;

export const GAME_WIDTH = 954;   // 53 tiles at 18px
export const GAME_HEIGHT = 558;  // 31 tiles at 18px

export const MAX_LEVEL_WIDTH = 90;   // tiles
export const MAX_LEVEL_HEIGHT = 60;  // tiles

// Arcade physics tuning
export const PHYSICS = {
    gravity: 800,       // Arcade gravity (px/s^2)
    human: {
        width: 10,          // hitbox width
        height: 32,         // hitbox height
        moveSpeed: 105,     // horizontal speed (px/s)
        jumpVelocity: -260, // upward jump velocity (px/s, negative is up)
        drag: 800,          // deceleration drag
    },
    dog: {
        width: 12,
        height: 12,
        moveSpeed: 115,     // dog is slightly faster
        jumpVelocity: -310, // dog jumps higher
        drag: 800,
    },
} as const;

// Visual sizes (the drawn rectangles)
export const VISUAL = {
    human: {
        width: 18,
        height: 36,
    },
    dog: {
        width: 18,
        height: 14,
    },
} as const;

export const CAMERA = {
    // Zoom levels from most zoomed-in to most zoomed-out
    // 2x zoom shows 468x270 area (original default, pixel-perfect 1:1)
    // 1.5x zoom shows 624x360 area (renders tiles at exactly 27px, clean integer)
    // 1x zoom shows 936x540 area (renders tiles at exactly 18px, pixel-perfect 1:1)
    // 0.5x zoom shows 1872x1080 area (renders tiles at exactly 9px, clean integer)
    zoomLevels: [2.0, 1.5, 1.0, 0.5] as readonly number[],
    defaultZoomIndex: 0,
    zoomTransitionSpeed: 0.15,
    followLerp: 0.1,
    playerPaddingX: 40,
    playerPaddingY: 30,
} as const;



// Audio SFX keys — maps logical sounds to file paths
// All currently point to collect1.mp3 as placeholder
export const SFX = {
    jump: 'sfx_jump',
    land: 'sfx_land',
    pickup: 'sfx_pickup',
    drop: 'sfx_drop',
    doorOpen: 'sfx_door_open',
    checkpoint: 'sfx_checkpoint',
    death: 'sfx_death',
    bark: 'sfx_bark',
    jdeath: 'sfx_jdeath',
    button: 'sfx_button',
    launcher: 'sfx_launcher',
    menuSelect: 'sfx_menu_select',
    switchOn: 'sfx_switch_on',
    switchOff: 'sfx_switch_off',
    unlock: 'sfx_unlock',
    ladder: 'sfx_ladder',
} as const;

export const VISUAL_FAMILIES: Record<number, { active: number, inactive: number }> = {
    148: { active: 149, inactive: 148 }, // Button
    64: { active: 66, inactive: 64 },   // Lever
    107: { active: 108, inactive: 107 }, // Spring Launcher
};
