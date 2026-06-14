import Phaser from 'phaser';
import { TILE_SIZE } from '../constants';

// ECS Architecture & Loader
import { EntityManager, Entity } from '../ecs/Entity';
import { PhysicsBodyComponent, PlayerComponent } from '../ecs/components';
import { LevelLoader } from '../levels/LevelLoader';
import { LevelData } from '../levels/LevelSchema';
import { InputManager } from '../input/InputManager';
import { MovementSystem } from '../ecs/systems/MovementSystem';
import { PhysicsSystem } from '../ecs/systems/PhysicsSystem';
import { RenderSystem } from '../ecs/systems/RenderSystem';
import { CameraSystem } from '../ecs/systems/CameraSystem';
import { LevelDoorSystem } from '../ecs/systems/LevelDoorSystem';
import { SignSystem } from '../ecs/systems/SignSystem';
import { TriggerSystem } from '../ecs/systems/TriggerSystem';
import { LauncherSystem } from '../ecs/systems/LauncherSystem';
import { CheckpointSystem } from '../ecs/systems/CheckpointSystem';
import { CatSystem } from '../ecs/systems/CatSystem';
import { SpikesSystem } from '../ecs/systems/SpikesSystem';
import { FlyingSystem } from '../ecs/systems/FlyingSystem';
import { KeySystem } from '../ecs/systems/KeySystem';
import { MovingPlatformSystem } from '../ecs/systems/MovingPlatformSystem';
import { getMappingByDoorId } from '../levels/levelSelectMapping';

export class LevelSelectScene extends Phaser.Scene {
    private entityManager!: EntityManager;
    private inputManager!: InputManager;

    // ECS Systems
    private movementSystem!: MovementSystem;
    private physicsSystem!: PhysicsSystem;
    private renderSystem!: RenderSystem;
    private cameraSystem!: CameraSystem;
    private levelDoorSystem!: LevelDoorSystem;
    private signSystem!: SignSystem;
    private triggerSystem!: TriggerSystem;
    private launcherSystem!: LauncherSystem;
    private checkpointSystem!: CheckpointSystem;
    private catSystem!: CatSystem;
    private spikesSystem!: SpikesSystem;
    private flyingSystem!: FlyingSystem;
    private keySystem!: KeySystem;
    private movingPlatformSystem!: MovingPlatformSystem;

    // Player entities & airborne states for SFX
    private player1Entity!: Entity;
    private player2Entity!: Entity;
    private player1WasAirborne = false;
    private player2WasAirborne = false;

    // Background properties
    private backgroundSprites?: Phaser.GameObjects.TileSprite[];
    private backgroundOffsetY: number = 0;

    constructor() {
        super({ key: 'LevelSelectScene' });
    }

    create(data?: { spawnDoorId?: number }): void {
        // 1. Initialize ECS
        this.entityManager = new EntityManager();

        // 2. Load the LevelSelect level JSON
        const levelData = this.cache.json.get('LevelSelect') as LevelData;
        if (!levelData) {
            console.error('LevelSelect level data not found!');
            this.scene.start('MainMenuScene');
            return;
        }

        const { levelWidthPx, levelHeightPx, player1Entity, player2Entity, backgroundSprites } = LevelLoader.loadLevel(
            this,
            levelData,
            this.entityManager,
        );
        this.backgroundSprites = backgroundSprites;
        this.backgroundOffsetY = levelData?.meta?.backgroundOffsetY || 0;
        this.player1Entity = player1Entity;
        this.player2Entity = player2Entity;

        // 3. If returning from a level, spawn both players at the corresponding door position
        if (data?.spawnDoorId) {
            const doorMapping = getMappingByDoorId(data.spawnDoorId);
            if (doorMapping) {
                // Find the door entity with matching doorId and spawn players there
                const doors = this.entityManager.query('Transform', 'LevelDoor');
                for (const doorEnt of doors) {
                    const doorComp = doorEnt.getComponent<any>('LevelDoor')!;
                    if (doorComp.doorId === data.spawnDoorId) {
                        const transform = doorEnt.getComponent<any>('Transform')!;
                        
                        const p1Body = player1Entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
                        const p1Render = player1Entity.getComponent<any>('Render');
                        if (p1Body?.body) {
                            p1Body.body.reset(transform.x - p1Body.body.width / 2, transform.y - p1Body.body.height);
                        }
                        if (p1Render?.gameObject) {
                            (p1Render.gameObject as Phaser.GameObjects.Sprite).setPosition(transform.x, transform.y - 6);
                        }

                        const p2Body = player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
                        const p2Render = player2Entity.getComponent<any>('Render');
                        if (p2Body?.body) {
                            p2Body.body.reset(transform.x - p2Body.body.width / 2, transform.y - p2Body.body.height);
                        }
                        if (p2Render?.gameObject) {
                            (p2Render.gameObject as Phaser.GameObjects.Sprite).setPosition(transform.x, transform.y - 6);
                        }
                        break;
                    }
                }
            }
        }

        // 4. Physics world bounds
        this.physics.world.setBounds(0, 0, levelWidthPx, levelHeightPx);

        // 5. Input
        this.inputManager = new InputManager(this);

        // 6. ECS Systems
        this.movementSystem = new MovementSystem();
        this.physicsSystem = new PhysicsSystem();
        this.renderSystem = new RenderSystem();
        this.cameraSystem = new CameraSystem(this, levelWidthPx, levelHeightPx);
        this.levelDoorSystem = new LevelDoorSystem();
        this.signSystem = new SignSystem();
        this.triggerSystem = new TriggerSystem();
        this.launcherSystem = new LauncherSystem();
        this.checkpointSystem = new CheckpointSystem();
        this.catSystem = new CatSystem(this.movementSystem);
        this.spikesSystem = new SpikesSystem(this.movementSystem);
        this.flyingSystem = new FlyingSystem(this.movementSystem);
        this.keySystem = new KeySystem();
        this.movingPlatformSystem = new MovingPlatformSystem();

        // Sync initial trigger/target states
        this.triggerSystem.syncAll(this.entityManager);

        // 7. Wire up door activation to scene transition
        this.levelDoorSystem.setEnterCallback((levelKey: string, doorId: number) => {
            this.cameras.main.fadeOut(300, 10, 10, 26);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene', { levelKey, fromLobbyDoorId: doorId });
            });
        });

        // 8. ESC to return to main menu
        const kb = this.input.keyboard!;
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
            this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
            this.cameras.main.fadeOut(300, 10, 10, 26);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('MainMenuScene');
            });
        });

        // Gamepad B button to go back
        let lastBackTime = 0;
        this.input.gamepad?.on('down', (pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
            if (button.index === 1) { // B Button
                const now = this.time.now;
                if (now - lastBackTime < 300) return;
                lastBackTime = now;

                this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
                this.cameras.main.fadeOut(300, 10, 10, 26);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.start('MainMenuScene');
                });
            }
        });

        this.cameras.main.fadeIn(300, 10, 10, 26);
    }

    update(time: number, delta: number): void {
        if (!this.inputManager) return;

        this.inputManager.update();

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
        this.levelDoorSystem.update(this.entityManager, delta, this.inputManager);
        this.physicsSystem.update(this.entityManager, delta);
        this.renderSystem.update(this.entityManager, delta);

        // SFX
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
            const isFiveLayer = this.backgroundSprites.length === 5;
            const xScrollFactors = isFiveLayer
                ? [0.02, 0.1, 0.3, 0.6, 0.8]
                : [0.05, 0.2, 0.5, 0.8];
            const yScrollFactors = isFiveLayer
                ? [0.02, 0.06, 0.1, 0.15, 0.2]
                : [0.05, 0.1, 0.15, 0.2];
            const halfWidth = camera.width / 2;
            const halfHeight = camera.height / 2;

            this.backgroundSprites.forEach((sprite, index) => {
                const scrollFactorX = xScrollFactors[index] || 0;
                const scrollFactorY = yScrollFactors[index] || 0;

                // Adjust tile scale to be constant in screen-space (1.0X screen scale)
                sprite.tileScaleX = 1.0 / zoom;
                sprite.tileScaleY = 1.0 / zoom;

                // Set dynamic height matching the texture scale to prevent vertical repeating
                sprite.height = 324 * sprite.tileScaleY;
                const bgHeight = sprite.height;

                // Position the background smoothly without snapping to avoid jagged scrolling
                sprite.x = halfWidth - scrollX * scrollFactorX;
                sprite.y = halfHeight / zoom + halfHeight - TILE_SIZE - bgHeight / 2 + (maxScrollY - scrollY) * scrollFactorY - this.backgroundOffsetY;
            });
        }
    }

    private handleJumpSfx(): void {
        const p1Body = this.player1Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
        const p2Body = this.player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;

        if (p1Body.body.velocity.y < -0.5 && !this.player1WasAirborne && !p1Body.isGrounded) {
            this.sound.play('sfx_jump', { volume: 0.15 });
        }
        if (p2Body.body.velocity.y < -0.5 && !this.player2WasAirborne && !p2Body.isGrounded) {
            this.sound.play('sfx_jump', { volume: 0.15 });
        }
    }

    private handleLandingSfx(): void {
        const p1Body = this.player1Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
        const p2Body = this.player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;

        const p1Grounded = p1Body.isGrounded;
        const p2Grounded = p2Body.isGrounded;

        if (p1Grounded && this.player1WasAirborne) {
            this.sound.play('sfx_land', { volume: 0.15 });
            this.inputManager.vibrate(0, 'weak', 100);
        }
        if (p2Grounded && this.player2WasAirborne) {
            this.sound.play('sfx_land', { volume: 0.15 });
            this.inputManager.vibrate(1, 'weak', 100);
        }

        this.player1WasAirborne = !p1Grounded;
        this.player2WasAirborne = !p2Grounded;
    }
}
