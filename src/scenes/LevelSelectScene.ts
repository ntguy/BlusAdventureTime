import Phaser from 'phaser';
import { TILE_SIZE } from '../constants';

// ECS Architecture & Loader
import { EntityManager } from '../ecs/Entity';
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
import { getMappingByDoorId } from '../levels/levelSelectMapping';

export class LevelSelectScene extends Phaser.Scene {
    private entityManager!: EntityManager;
    private inputManager!: InputManager;

    // ECS Systems (subset — lobby doesn't need triggers, launchers, etc.)
    private movementSystem!: MovementSystem;
    private physicsSystem!: PhysicsSystem;
    private renderSystem!: RenderSystem;
    private cameraSystem!: CameraSystem;
    private levelDoorSystem!: LevelDoorSystem;
    private signSystem!: SignSystem;

    // Player 1 only
    private player1WasAirborne = false;

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

        const { levelWidthPx, levelHeightPx, player1Entity, player2Entity } = LevelLoader.loadLevel(
            this,
            levelData,
            this.entityManager,
        );

        // Hide the dog (player 2) — lobby is single-player
        const p2Render = player2Entity.getComponent<any>('Render');
        if (p2Render?.gameObject) {
            (p2Render.gameObject as Phaser.GameObjects.Sprite).setVisible(false);
            const p2Body = player2Entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
            if (p2Body?.body) {
                p2Body.body.enable = false;
            }
        }

        // 3. If returning from a level, spawn player at the corresponding door position
        if (data?.spawnDoorId) {
            const doorMapping = getMappingByDoorId(data.spawnDoorId);
            if (doorMapping) {
                // Find the door entity with matching doorId and spawn player there
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
                        break;
                    }
                }
            }
        }

        // 4. Physics world bounds
        this.physics.world.setBounds(0, 0, levelWidthPx, levelHeightPx);

        // 5. Input
        this.inputManager = new InputManager(this);

        // 6. ECS Systems (minimal set for the lobby)
        this.movementSystem = new MovementSystem();
        this.physicsSystem = new PhysicsSystem();
        this.renderSystem = new RenderSystem();
        this.cameraSystem = new CameraSystem(this, levelWidthPx, levelHeightPx);
        this.levelDoorSystem = new LevelDoorSystem();
        this.signSystem = new SignSystem();

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
        this.input.gamepad?.on('down', (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
            if (button.index === 1) { // B Button
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

        // Run ECS systems
        this.movementSystem.update(this.entityManager, delta, this.inputManager);
        this.levelDoorSystem.update(this.entityManager, delta, this.inputManager);
        this.signSystem.update(this.entityManager, delta);
        this.physicsSystem.update(this.entityManager, delta);
        this.renderSystem.update(this.entityManager, delta);

        // Landing SFX for player 1
        this.handleP1LandingSfx();

        // Camera
        this.cameraSystem.update(this.entityManager, delta);
    }

    private handleP1LandingSfx(): void {
        const players = this.entityManager.query('Player', 'PhysicsBody');
        for (const playerEnt of players) {
            const player = playerEnt.getComponent<PlayerComponent>('Player')!;
            if (player.playerIndex !== 0) continue;

            const body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const grounded = body.isGrounded;

            if (grounded && this.player1WasAirborne) {
                this.sound.play('sfx_land', { volume: 0.15 });
            }

            this.player1WasAirborne = !grounded;
            break;
        }
    }
}
