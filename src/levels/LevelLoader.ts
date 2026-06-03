import Phaser from 'phaser';
import { TILE_SIZE, BG_TILE_SIZE } from '../constants';
import { LevelData } from './LevelSchema';
import { EntityManager, Entity } from '../ecs/Entity';
import { createPlayerEntity } from '../entities/PlayerFactory';
import { RenderComponent } from '../ecs/components';

export class LevelLoader {
    /**
     * Load a level JSON, set up terrain layers, background assets, spawners, 
     * and register human/dog players inside the ECS Entity Manager.
     */
    static loadLevel(
        scene: Phaser.Scene,
        levelKeyOrData: string | LevelData,
        entityManager: EntityManager,
    ): {
        levelWidthPx: number;
        levelHeightPx: number;
        terrainLayer: Phaser.Tilemaps.TilemapLayer;
        player1Entity: Entity;
        player2Entity: Entity;
    } {
        // 1. Get level data from cache or use raw data
        const levelData = typeof levelKeyOrData === 'string' 
            ? (scene.cache.json.get(levelKeyOrData) as LevelData)
            : levelKeyOrData;

        if (!levelData) {
            throw new Error(`Failed to load level data: ${levelKeyOrData}`);
        }

        const levelWidthPx = levelData.meta.width * TILE_SIZE;
        const levelHeightPx = levelData.meta.height * TILE_SIZE;

        // 2. Create background
        this.createBackground(scene, levelData.meta.width, levelData.meta.height);

        // 3. Create tilemap
        const map = scene.make.tilemap({
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
            width: levelData.meta.width,
            height: levelData.meta.height,
        });

        const tileset = map.addTilesetImage(
            'tilemap_packed',
            'tilemap_packed',
            TILE_SIZE, TILE_SIZE,
            0, 0,
        );

        if (!tileset) {
            throw new Error('Failed to create tileset');
        }

        // 4. Create layers and fill
        const bgLayer = map.createBlankLayer('background', tileset, 0, 0);
        const terrainLayer = map.createBlankLayer('terrain', tileset, 0, 0);
        const fgLayer = map.createBlankLayer('foreground', tileset, 0, 0);

        if (!bgLayer || !terrainLayer || !fgLayer) {
            throw new Error('Failed to create tilemap layers');
        }

        this.fillLayer(bgLayer, levelData.layers.background, levelData.meta.width);
        this.fillLayer(terrainLayer, levelData.layers.terrain, levelData.meta.width);
        this.fillLayer(fgLayer, levelData.layers.foreground, levelData.meta.width);

        bgLayer.setDepth(1);
        terrainLayer.setDepth(2);
        fgLayer.setDepth(20);

        // Enable Arcade physics collision on terrain layer tiles
        terrainLayer.setCollisionByExclusion([-1]);

        // 5. Create players from spawn points
        let humanSpawn = { x: 3, y: 10 };
        let dogSpawn = { x: 20, y: 10 };

        for (const entity of levelData.entities) {
            if (entity.type === 'humanSpawn') {
                humanSpawn = { x: entity.x, y: entity.y };
            } else if (entity.type === 'dogSpawn') {
                dogSpawn = { x: entity.x, y: entity.y };
            }
        }

        const player1Entity = createPlayerEntity(
            scene,
            humanSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            humanSpawn.y * TILE_SIZE,
            'human', 0,
            entityManager,
        );

        const player2Entity = createPlayerEntity(
            scene,
            dogSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            dogSpawn.y * TILE_SIZE,
            'dog', 1,
            entityManager,
        );

        // Add colliders between players and terrain layer
        const p1Render = player1Entity.getComponent<RenderComponent>('Render')!;
        const p2Render = player2Entity.getComponent<RenderComponent>('Render')!;
        scene.physics.add.collider(p1Render.gameObject, terrainLayer);
        scene.physics.add.collider(p2Render.gameObject, terrainLayer);

        return {
            levelWidthPx,
            levelHeightPx,
            terrainLayer,
            player1Entity,
            player2Entity,
        };
    }

    private static createBackground(scene: Phaser.Scene, levelWidthTiles: number, levelHeightTiles: number): void {
        const SKY_TILES = [0, 1];
        const MID_TILES = [8, 9];
        const GROUND_TILES = [16, 17];

        const bgWidthTiles = Math.ceil((levelWidthTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;
        const bgHeightTiles = Math.ceil((levelHeightTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;

        const midRow = bgHeightTiles - 2;
        const groundRow = bgHeightTiles - 1;

        const getTile = (arr: number[], index: number) => arr[((index % arr.length) + arr.length) % arr.length];

        for (let y = -20; y < bgHeightTiles + 20; y++) {
            for (let x = -25; x < bgWidthTiles + 25; x++) {
                let tileIndex: number;
                if (y === midRow) {
                    tileIndex = getTile(MID_TILES, x);
                } else if (y >= groundRow) {
                    tileIndex = getTile(GROUND_TILES, x);
                } else {
                    tileIndex = getTile(SKY_TILES, x);
                }

                const sprite = scene.add.sprite(
                    x * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    y * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    'bg_tilemap_packed',
                    tileIndex,
                );
                sprite.setDepth(0);
            }
        }
    }

    private static fillLayer(
        layer: Phaser.Tilemaps.TilemapLayer,
        data: number[],
        width: number,
    ): void {
        for (let i = 0; i < data.length; i++) {
            const tileIndex = data[i];
            if (tileIndex >= 0) {
                const x = i % width;
                const y = Math.floor(i / width);
                layer.putTileAt(tileIndex, x, y);
            }
        }
    }
}
