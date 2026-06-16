import Phaser from 'phaser';
import { InputManager, Action } from '../input/InputManager';
import { AudioManager } from '../audio/AudioManager';
import { TILE_SIZE } from '../constants';
import { LEVEL_SELECT_MAPPINGS } from '../levels/levelSelectMapping';

// ECS Architecture & Loader
import { EntityManager, Entity } from '../ecs/Entity';
import { PhysicsBodyComponent } from '../ecs/components';
import { LevelLoader } from '../levels/LevelLoader';
import { LevelData } from '../levels/LevelSchema';
import { MovementSystem } from '../ecs/systems/MovementSystem';
import { PhysicsSystem } from '../ecs/systems/PhysicsSystem';
import { RenderSystem } from '../ecs/systems/RenderSystem';
import { CameraSystem } from '../ecs/systems/CameraSystem';
import { TriggerSystem } from '../ecs/systems/TriggerSystem';
import { LauncherSystem } from '../ecs/systems/LauncherSystem';
import { CheckpointSystem } from '../ecs/systems/CheckpointSystem';
import { CatSystem } from '../ecs/systems/CatSystem';
import { SignSystem } from '../ecs/systems/SignSystem';
import { SpikesSystem } from '../ecs/systems/SpikesSystem';
import { FlyingSystem } from '../ecs/systems/FlyingSystem';
import { KeySystem } from '../ecs/systems/KeySystem';
import { MovingPlatformSystem } from '../ecs/systems/MovingPlatformSystem';
import { ExitDoorSystem } from '../ecs/systems/ExitDoorSystem';

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
    private triggerSystem!: TriggerSystem;
    private launcherSystem!: LauncherSystem;
    private checkpointSystem!: CheckpointSystem;
    private catSystem!: CatSystem;
    private signSystem!: SignSystem;
    private spikesSystem!: SpikesSystem;
    private flyingSystem!: FlyingSystem;
    private keySystem!: KeySystem;
    private movingPlatformSystem!: MovingPlatformSystem;
    private exitDoorSystem!: ExitDoorSystem;

    // FPS display
    private fpsText!: Phaser.GameObjects.Text;
    private showFps: boolean = true;

    // Track grounded state for landing SFX
    private player1WasAirborne: boolean = false;
    private player2WasAirborne: boolean = false;

    // Playtest mode states
    private isTestMode: boolean = false;
    private playtestLevelData: any = null;
    private backgroundSprites?: Phaser.GameObjects.TileSprite[];
    private backgroundOffsetY: number = 0;
    private fromLobbyDoorId: number = 0;
    private terrainLayer!: Phaser.Tilemaps.TilemapLayer;
    private levelKey: string = 'test_level';

    constructor() {
        super({ key: 'GameScene' });
    }

    create(data?: { levelKey?: string; levelData?: any; isTestMode?: boolean; fromLobbyDoorId?: number }): void {
        this.isTestMode = data?.isTestMode || false;
        this.playtestLevelData = data?.levelData || null;
        this.fromLobbyDoorId = data?.fromLobbyDoorId || 0;
        this.levelKey = data?.levelKey || 'test_level';

        // Initialize ECS Entity Manager
        this.entityManager = new EntityManager();

        // Load level terrain, backgrounds, and player entities via LevelLoader
        const levelKeyOrData = data?.levelData || data?.levelKey || 'test_level';

        // Extract backgroundOffsetY from level JSON
        const levelData = typeof levelKeyOrData === 'string'
            ? (this.cache.json.get(levelKeyOrData) as LevelData)
            : levelKeyOrData;
        this.backgroundOffsetY = levelData?.meta?.backgroundOffsetY || 0;

        const { levelWidthPx, levelHeightPx, player1Entity, player2Entity, backgroundSprites, terrainLayer } = LevelLoader.loadLevel(
            this,
            levelKeyOrData,
            this.entityManager,
        );
        this.backgroundSprites = backgroundSprites;
        this.terrainLayer = terrainLayer;

        this.player1Entity = player1Entity;
        this.player2Entity = player2Entity;

        // Set Arcade Physics world bounds
        this.physics.world.setBounds(0, 0, levelWidthPx, levelHeightPx);

        // 8. Input
        this.inputManager = new InputManager(this);

        // 9. ECS Systems
        this.movementSystem = new MovementSystem();
        this.physicsSystem = new PhysicsSystem();
        this.renderSystem = new RenderSystem();
        this.cameraSystem = new CameraSystem(this, levelWidthPx, levelHeightPx);
        this.triggerSystem = new TriggerSystem();
        this.launcherSystem = new LauncherSystem();
        this.checkpointSystem = new CheckpointSystem();
        this.catSystem = new CatSystem(this.movementSystem);
        this.signSystem = new SignSystem();
        this.spikesSystem = new SpikesSystem(this.movementSystem);
        this.flyingSystem = new FlyingSystem(this.movementSystem);
        this.keySystem = new KeySystem();
        this.movingPlatformSystem = new MovingPlatformSystem();
        this.exitDoorSystem = new ExitDoorSystem();

        // Wire exit door to return to level select lobby or victory scene if it is the last level
        if (!this.isTestMode && this.fromLobbyDoorId > 0) {
            this.exitDoorSystem.setExitCallback(() => {
                this.cameras.main.fadeOut(300, 10, 10, 26);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    const lastMapping = LEVEL_SELECT_MAPPINGS[LEVEL_SELECT_MAPPINGS.length - 1];
                    if (lastMapping && this.levelKey === lastMapping.levelKey) {
                        this.scene.start('VictoryScene');
                    } else {
                        this.scene.start('LevelSelectScene', { spawnDoorId: this.fromLobbyDoorId });
                    }
                });
            });
        }

        // Sync initial trigger/target states
        this.triggerSystem.syncAll(this.entityManager);

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

        // 13. Camera fade-in from dark overlay color
        this.cameras.main.fadeIn(300, 10, 10, 26);
    }

    update(time: number, delta: number): void {
        // Poll and update gamepad action states at the start of each frame
        this.inputManager.update();

        // Check for Pause input (Start/Options on gamepad, Esc/P on keyboard)
        const p1Pause = this.inputManager.isJustDown(0, Action.PAUSE);
        const p2Pause = this.inputManager.isJustDown(1, Action.PAUSE);
        if (p1Pause || p2Pause) {
            let isEscExit = false;
            if (this.isTestMode) {
                const escKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
                if (escKey && Phaser.Input.Keyboard.JustDown(escKey)) {
                    isEscExit = true;
                }
            }
            if (!isEscExit) {
                this.pauseGame();
                return;
            }
        }

        // Run ECS Systems in sequential order
        this.keySystem.update(this.entityManager, delta, this.inputManager);
        this.movementSystem.update(this.entityManager, delta, this.inputManager);
        this.launcherSystem.update(this.entityManager, delta, this.inputManager);
        this.checkpointSystem.update(this.entityManager, delta, this.inputManager);
        this.triggerSystem.update(this.entityManager, delta, this.inputManager);
        this.catSystem.update(this.entityManager, delta, this.inputManager);
        this.signSystem.update(this.entityManager, delta);
        this.spikesSystem.update(this.entityManager, delta);
        this.flyingSystem.update(this.entityManager, delta);
        this.movingPlatformSystem.update(this.entityManager, delta);
        this.exitDoorSystem.update(this.entityManager, delta, this.inputManager);
        this.physicsSystem.update(this.entityManager, delta, this.terrainLayer);
        this.renderSystem.update(this.entityManager, delta);

        // SFX (queries components after physics updates)
        this.handleJumpSfx();
        this.handleLandingSfx();

        // Camera
        this.cameraSystem.update(this.entityManager, delta);

        // Update background positions dynamically based on current zoom and scrollX/Y to ensure perfect pixel alignment
        if (this.backgroundSprites) {
            const camera = this.cameras.main;
            const levelHeightPx = this.physics.world.bounds.height;
            const zoom = camera.zoom;
            const scrollX = camera.scrollX;
            const scrollY = camera.scrollY;
            const vh = camera.height / zoom;
            const maxScrollY = Math.max(0, levelHeightPx - vh);
            const numLayers = this.backgroundSprites.length;
            let xScrollFactors = [0.05, 0.2, 0.5, 0.8];
            let yScrollFactors = [0.05, 0.1, 0.15, 0.2];
            if (numLayers === 5) {
                xScrollFactors = [0.02, 0.1, 0.3, 0.6, 0.8];
                yScrollFactors = [0.02, 0.06, 0.1, 0.15, 0.2];
            } else if (numLayers === 6) {
                xScrollFactors = [0.01, 0.05, 0.15, 0.35, 0.55, 0.8];
                yScrollFactors = [0.005, 0.01, 0.03, 0.05, 0.07, 0.1];
            }
            const halfWidth = camera.width / 2;
            const halfHeight = camera.height / 2;

            const baseScale = 1.0;

            const scaleX = (baseScale / zoom) * (576 / 1024);
            const scaleY = (baseScale / zoom) * (324 / 512);

            this.backgroundSprites.forEach((sprite, index) => {
                const scrollFactorX = xScrollFactors[index] || 0;
                const scrollFactorY = yScrollFactors[index] || 0;

                const bgKey = (sprite as any).bgKey || sprite.texture.key;

                // Adjust tile scale to be constant in screen-space
                sprite.tileScaleX = scaleX;
                sprite.tileScaleY = scaleY;

                // Set dynamic height matching the texture scale to prevent vertical repeating
                let currentBgHeight = 512;
                if (bgKey === 'fallTrees_1') {
                    currentBgHeight = 1024;
                }
                sprite.height = currentBgHeight * sprite.tileScaleY;
                const bgHeight = sprite.height;

                // Position the background smoothly without snapping to avoid jagged scrolling
                sprite.x = halfWidth - scrollX * scrollFactorX;

                // Calculations based on the standard 512-height scaleY
                const bgHeightOther = 512 * scaleY;
                let bgY = halfHeight / zoom + halfHeight - TILE_SIZE - bgHeightOther / 2 + (maxScrollY - scrollY) * scrollFactorY - this.backgroundOffsetY;
                if (bgKey === 'fallTrees_5') {
                    bgY -= 64;
                }

                if (bgKey === 'fallTrees_1') {
                    sprite.y = bgY + 256 * scaleY;
                } else {
                    sprite.y = bgY;
                }
            });
        }

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
            this.inputManager.vibrate(0, 'weak', 100);
        }
        if (p2Grounded && this.player2WasAirborne) {
            this.audioManager.playLand();
            this.inputManager.vibrate(1, 'weak', 100);
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

        // ESC: Exit playtest if in test mode
        if (this.isTestMode) {
            kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
                this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
                this.cameras.main.fadeOut(300, 10, 10, 26);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('EditorScene', { levelData: this.playtestLevelData });
                });
            });
        }
    }

    public pauseGame(): void {
        this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
        this.scene.pause();
        this.scene.launch('PauseScene', { parentScene: this });
    }
}
