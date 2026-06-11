export interface LevelMeta {
    name: string;
    width: number;          // in tiles
    height: number;         // in tiles
    tileWidth: number;      // always 18
    tileHeight: number;     // always 18
    version: number;        // schema version for future migrations
    background?: string;    // parallax preset name
    backgroundOffsetY?: number; // parallax vertical offset in world pixels (positive shifts background up)
}

export interface EntityData {
    type: string;           // 'humanSpawn' | 'dogSpawn' | 'exitDoor' | 'crate' | 'key' | 'switch' | 'checkpoint'
    x: number;              // tile column
    y: number;              // tile row
    properties?: Record<string, unknown>;
}

export interface LevelData {
    meta: LevelMeta;
    layers: {
        background: number[];   // flat array, -1 = empty, tile index otherwise
        terrain: number[];      // flat array, collision tiles
        foreground: number[];   // flat array, decorative front layer
    };
    entities: EntityData[];
}
