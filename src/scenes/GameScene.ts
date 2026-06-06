import Phaser from 'phaser';
import { InputManager } from '../input/InputManager';
import { AudioManager } from '../audio/AudioManager';

// ECS Architecture & Loader
import { EntityManager, Entity } from '../ecs/Entity';
import { PhysicsBodyComponent } from '../ecs/components';
import { LevelLoader } from '../levels/LevelLoader';
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
import { KeySystem } from '../ecs/systems/KeySystem';
import { MovingPlatformSystem } from '../ecs/systems/MovingPlatformSystem';

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
    private keySystem!: KeySystem;
    private movingPlatformSystem!: MovingPlatformSystem;

    // FPS display
    private fpsText!: Phaser.GameObjects.Text;
    private showFps: boolean = true;

    // Track grounded state for landing SFX
    private player1WasAirborne: boolean = false;
    private player2WasAirborne: boolean = false;

    // Playtest mode states
    private isTestMode: boolean = false;
    private playtestLevelData: any = null;

    constructor() {
        super({ key: 'GameScene' });
    }

    create(data?: { levelKey?: string; levelData?: any; isTestMode?: boolean }): void {
        this.isTestMode = data?.isTestMode || false;
        this.playtestLevelData = data?.levelData || null;

        // Initialize ECS Entity Manager
        this.entityManager = new EntityManager();

        // Load level terrain, backgrounds, and player entities via LevelLoader
        const levelKeyOrData = data?.levelData || data?.levelKey || 'test_level';
        const { levelWidthPx, levelHeightPx, player1Entity, player2Entity } = LevelLoader.loadLevel(
            this,
            levelKeyOrData,
            this.entityManager,
        );

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
        this.catSystem = new CatSystem();
        this.signSystem = new SignSystem();
        this.spikesSystem = new SpikesSystem(this.movementSystem);
        this.keySystem = new KeySystem();
        this.movingPlatformSystem = new MovingPlatformSystem();

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
    }

    update(time: number, delta: number): void {
        // Poll and update gamepad action states at the start of each frame
        this.inputManager.update();

        // Run ECS Systems in sequential order
        this.keySystem.update(this.entityManager, delta, this.inputManager);
        this.movementSystem.update(this.entityManager, delta, this.inputManager);
        this.launcherSystem.update(this.entityManager, delta);
        this.checkpointSystem.update(this.entityManager, delta);
        this.triggerSystem.update(this.entityManager, delta, this.inputManager);
        this.catSystem.update(this.entityManager, delta, this.inputManager);
        this.signSystem.update(this.entityManager, delta);
        this.spikesSystem.update(this.entityManager, delta);
        this.movingPlatformSystem.update(this.entityManager, delta);
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
}
