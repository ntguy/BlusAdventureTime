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
        // Initialize ECS Entity Manager
        this.entityManager = new EntityManager();

        // Load level terrain, backgrounds, and player entities via LevelLoader
        const { levelWidthPx, levelHeightPx, player1Entity, player2Entity } = LevelLoader.loadLevel(
            this,
            data.levelKey,
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
}
