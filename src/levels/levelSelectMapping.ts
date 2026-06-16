/**
 * Mapping between level-select door IDs and their corresponding level JSON keys.
 * 
 * doorId   – A stable numeric ID used by "levelDoor" entities in LevelSelect.json.
 *            It determines which door the player spawns at when returning from a level.
 * levelKey – The Phaser cache key for the level JSON (must match the key used in PreloadScene).
 * label    – Display text shown above the door in the level-select lobby.
 */
export interface LevelDoorMapping {
    doorId: number;
    levelKey: string;
    label: string;
}

export const LEVEL_SELECT_MAPPINGS: LevelDoorMapping[] = [
    { doorId: 1, levelKey: 'Lvl1',  label: 'LEVEL 1' },
    { doorId: 2, levelKey: 'Lvl2',  label: 'LEVEL 2' },
    { doorId: 3, levelKey: 'Lvl3',  label: 'LEVEL 3' },
    { doorId: 4, levelKey: 'Lvl4', label: 'LEVEL 4' },
    { doorId: 5, levelKey: 'Lvl5', label: 'LEVEL 5' },
    { doorId: 6, levelKey: 'Lvl6', label: 'LEVEL 6' },
    { doorId: 7, levelKey: 'Lvl7', label: 'LEVEL 7' },
    { doorId: 8, levelKey: 'Lvl8', label: 'LEVEL 8' },
    { doorId: 9, levelKey: 'Lvl9', label: 'LEVEL 9' },
];

/** Look up the mapping for a given doorId */
export function getMappingByDoorId(doorId: number): LevelDoorMapping | undefined {
    return LEVEL_SELECT_MAPPINGS.find(m => m.doorId === doorId);
}

/** Look up the mapping for a given levelKey */
export function getMappingByLevelKey(levelKey: string): LevelDoorMapping | undefined {
    return LEVEL_SELECT_MAPPINGS.find(m => m.levelKey === levelKey);
}
