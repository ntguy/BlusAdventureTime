import Phaser from 'phaser';
import { TILE_SIZE, BG_TILE_SIZE } from '../constants';
import { LevelData } from '../levels/LevelSchema';
import { InputManager } from '../input/InputManager';
import { AudioManager } from '../audio/AudioManager';

// ECS Architecture
import { EntityManager, Entity } from '../ecs/Entity';
import { PhysicsBodyComponent, RenderComponent } from '../ecs/components';
import { createPlayerEntity } from '../entities/PlayerFactory';
import { MovementSystem } from '../ecs/systems/MovementSystem';
import { PhysicsSystem } from '../ecs/systems/PhysicsSystem';
import { RenderSystem } from '../ecs/systems/RenderSystem';
import { CameraSystem } from '../ecs/systems/CameraSystem';

export class GameScene extends Phaser.Scene {
    private entityManager!: EntityManager;
    private player1Entity!: Entity;
    private player2Entity!: Entity;
    private inputManager!: InputManager;
    private audioManager!: AudioManager;

    // ECS Systems
    private movementSystem!: MovementSystem;
    private physicsSystem!: PhysicsSystem;
    private renderSystem!: RenderSystem;
    private cameraSystem!: CameraSystem;

    // FPS display
    private fpsText!: Phaser.GameObjects.Text;
    private showFps: boolean = true;

    // Track grounded state for landing SFX
    private player1WasAirborne: boolean = false;
    private player2WasAirborne: boolean = false;

    constructor() {
        super({ key: 'GameScene' });
    }

    create(data: { levelKey: string }): void {
        // 1. Load level data
        const levelData = this.cache.json.get(data.levelKey) as LevelData;
        if (!levelData) {
            console.error('Failed to load level data:', data.levelKey);
            return;
        }

        const levelWidthPx = levelData.meta.width * TILE_SIZE;
        const levelHeightPx = levelData.meta.height * TILE_SIZE;

        // 2. Create tiled background
        this.createBackground(levelData.meta.width, levelData.meta.height);

        // 3. Create tilemap
        const map = this.make.tilemap({
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
            console.error('Failed to create tileset');
            return;
        }

        // 4. Create layers and fill
        const bgLayer = map.createBlankLayer('background', tileset, 0, 0);
        const terrainLayer = map.createBlankLayer('terrain', tileset, 0, 0);
        const fgLayer = map.createBlankLayer('foreground', tileset, 0, 0);

        if (!bgLayer || !terrainLayer || !fgLayer) {
            console.error('Failed to create tilemap layers');
            return;
        }

        this.fillLayer(bgLayer, levelData.layers.background, levelData.meta.width);
        this.fillLayer(terrainLayer, levelData.layers.terrain, levelData.meta.width);
        this.fillLayer(fgLayer, levelData.layers.foreground, levelData.meta.width);

        bgLayer.setDepth(1);
        terrainLayer.setDepth(2);
        fgLayer.setDepth(20);

        // 5. ── Arcade Physics tilemap collision ──
        terrainLayer.setCollisionByExclusion([-1]);

        // 6. Set world bounds
        this.physics.world.setBounds(0, 0, levelWidthPx, levelHeightPx);

        // Initialize ECS Entity Manager
        this.entityManager = new EntityManager();

        // 7. Create players from spawn points
        let humanSpawn = { x: 3, y: 10 };
        let dogSpawn = { x: 20, y: 10 };

        for (const entity of levelData.entities) {
            if (entity.type === 'humanSpawn') {
                humanSpawn = { x: entity.x, y: entity.y };
            } else if (entity.type === 'dogSpawn') {
                dogSpawn = { x: entity.x, y: entity.y };
            }
        }

        this.player1Entity = createPlayerEntity(
            this,
            humanSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            humanSpawn.y * TILE_SIZE,
            'human', 0,
            this.entityManager,
        );

        this.player2Entity = createPlayerEntity(
            this,
            dogSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            dogSpawn.y * TILE_SIZE,
            'dog', 1,
            this.entityManager,
        );

        // Add colliders between players and terrain
        const p1Render = this.player1Entity.getComponent<RenderComponent>('Render')!;
        const p2Render = this.player2Entity.getComponent<RenderComponent>('Render')!;
        this.physics.add.collider(p1Render.gameObject, terrainLayer);
        this.physics.add.collider(p2Render.gameObject, terrainLayer);

        // 8. Input
        this.inputManager = new InputManager(this);

        // 9. ECS Systems
        this.movementSystem = new MovementSystem();
        this.physicsSystem = new PhysicsSystem();
        this.renderSystem = new RenderSystem();
        this.cameraSystem = new CameraSystem(this, levelWidthPx, levelHeightPx);

        // 10. Audio
        this.audioManager = new AudioManager(this);

        // 11. FPS display
        this.fpsText = this.add.text(4, 4, '', {
            fontSize: '10px',
            color: '#00ff00',
            backgroundColor: '#00000088',
            padding: { x: 3, y: 2 },
        });
        this.fpsText.setDepth(100);
        this.fpsText.setScrollFactor(0);

        // 12. Debug / utility keys
        this.setupDebugKeys();
    }

    update(time: number, delta: number): void {
        // Run ECS Systems in sequential order
        this.movementSystem.update(this.entityManager, delta, this.inputManager);
        this.physicsSystem.update(this.entityManager, delta);
        this.renderSystem.update(this.entityManager, delta);

        // SFX (queries components after physics updates)
        this.handleJumpSfx();
        this.handleLandingSfx();

        // Camera
        this.cameraSystem.update(this.entityManager, delta);

        // FPS
        if (this.showFps) {
            const fps = Math.round(this.game.loop.actualFps);
            const frameTime = delta.toFixed(1);
            this.fpsText.setText(`FPS: ${fps} | ${frameTime}ms`);
            this.fpsText.setVisible(true);
        } else {
            this.fpsText.setVisible(false);
        }
    }

    // ── Background ──

    /**
     * Tiled background using Kenney bg tileset (8 cols × 3 rows, 24×24).
     * Cols 0-1 = blue theme: row 0=sky, row 1=mid/hills, row 2=ground.
     * Only 1 row of mid tiles at the bottom, rest is sky.
     */
    private createBackground(levelWidthTiles: number, levelHeightTiles: number): void {
        const SKY_TILES = [0, 1];
        const MID_TILES = [8, 9];
        const GROUND_TILES = [16, 17];

        const bgWidthTiles = Math.ceil((levelWidthTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;
        const bgHeightTiles = Math.ceil((levelHeightTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;

        // Only 1 row of mid and 1 row of ground at the very bottom of the level area
        const midRow = bgHeightTiles - 2;
        const groundRow = bgHeightTiles - 1;

        // Helper to safely get index modulo length including negative numbers
        const getTile = (arr: number[], index: number) => arr[((index % arr.length) + arr.length) % arr.length];

        // Loop beyond the level bounds to cover the viewport when zoomed out
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

                const sprite = this.add.sprite(
                    x * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    y * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    'bg_tilemap_packed',
                    tileIndex,
                );
                sprite.setDepth(0);
            }
        }
    }

    // ── Audio helpers ──

    private handleJumpSfx(): void {
        const p1Body = this.player1Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
        const p2Body = this.player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;

        if (p1Body.body.velocity.y < -0.5 && !this.player1WasAirborne && !p1Body.isGrounded) {
            this.audioManager.playJump();
        }
        if (p2Body.body.velocity.y < -0.5 && !this.player2WasAirborne && !p2Body.isGrounded) {
            this.audioManager.playJump();
        }
    }

    private handleLandingSfx(): void {
        const p1Body = this.player1Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
        const p2Body = this.player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;

        const p1Grounded = p1Body.isGrounded;
        const p2Grounded = p2Body.isGrounded;

        if (p1Grounded && this.player1WasAirborne) {
            this.audioManager.playLand();
        }
        if (p2Grounded && this.player2WasAirborne) {
            this.audioManager.playLand();
        }

        this.player1WasAirborne = !p1Grounded;
        this.player2WasAirborne = !p2Grounded;
    }

    // ── Debug tools ──

    private setupDebugKeys(): void {
        const kb = this.input.keyboard!;

        // F3: Toggle Arcade debug rendering
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3).on('down', () => {
            this.physics.world.drawDebug = !this.physics.world.drawDebug;
            if (!this.physics.world.drawDebug) {
                this.physics.world.debugGraphic.clear();
            }
        });

        // F4: Toggle FPS counter
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4).on('down', () => {
            this.showFps = !this.showFps;
        });

        // M: Toggle mute
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => {
            this.audioManager.toggleMute();
        });
    }

    /** Fill a tilemap layer from a flat array of tile indices */
    private fillLayer(
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
