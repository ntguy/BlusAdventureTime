import { EntityManager } from '../Entity';
import { LevelDoorComponent, TransformComponent, PhysicsBodyComponent, PlayerComponent, RenderComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import Phaser from 'phaser';

/**
 * Handles player proximity detection and interaction with level doors
 * in the level-select lobby. When Player 1 presses INTERACT while
 * overlapping a door, the system calls the provided onEnterLevel callback.
 */
export class LevelDoorSystem {
    private onEnterLevel: ((levelKey: string, doorId: number) => void) | null = null;
    private transitioning = false;

    /** Set the callback that fires when a door is activated */
    setEnterCallback(cb: (levelKey: string, doorId: number) => void): void {
        this.onEnterLevel = cb;
    }

    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        if (this.transitioning) return;

        const doors = entityManager.query('Transform', 'LevelDoor', 'Render');
        const players = entityManager.query('Player', 'PhysicsBody');

        // Find Player 1 (human)
        let p1Body: Phaser.Physics.Arcade.Body | null = null;
        for (const playerEnt of players) {
            const player = playerEnt.getComponent<PlayerComponent>('Player')!;
            if (player.playerIndex === 0) {
                p1Body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                break;
            }
        }

        if (!p1Body) return;

        const playerBox = {
            x: p1Body.x,
            y: p1Body.y,
            w: p1Body.width,
            h: p1Body.height
        };

        for (const doorEnt of doors) {
            const transform = doorEnt.getComponent<TransformComponent>('Transform')!;
            const door = doorEnt.getComponent<LevelDoorComponent>('LevelDoor')!;
            const render = doorEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            const doorBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2,
                w: transform.width,
                h: transform.height
            };

            // AABB overlap check
            const overlapping =
                playerBox.x < doorBox.x + doorBox.w &&
                playerBox.x + playerBox.w > doorBox.x &&
                playerBox.y < doorBox.y + doorBox.h &&
                playerBox.y + playerBox.h > doorBox.y;

            door.isPlayerNear = overlapping;

            // Create label text if not yet created
            if (!door.labelText && sprite?.scene) {
                door.labelText = sprite.scene.add.text(
                    transform.x,
                    transform.y - 22,
                    door.label,
                    {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '24px',
                        color: '#ffffff',
                        align: 'center',
                    }
                ).setOrigin(0.5).setScale(0.25).setDepth(15);

                const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                if (uiCamera) {
                    uiCamera.ignore(door.labelText);
                }
            }

            if (door.labelText && door.labelText.text !== door.label) {
                door.labelText.setText(door.label);
            }

            // Create/update "PRESS E" prompt
            if (!door.promptText && sprite?.scene) {
                door.promptText = sprite.scene.add.text(
                    transform.x,
                    transform.y - 34,
                    '[E]',
                    {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '20px',
                        color: '#ffff00',
                        align: 'center',
                    }
                ).setOrigin(0.5).setScale(0.25).setDepth(15);

                const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                if (uiCamera) {
                    uiCamera.ignore(door.promptText);
                }
            }

            // Show/hide prompt based on proximity
            if (door.promptText) {
                door.promptText.setVisible(overlapping);
            }

            // Check for interact press
            if (overlapping && inputManager.isJustDown(0, Action.INTERACT)) {
                this.transitioning = true;

                if (sprite?.scene) {
                    sprite.scene.sound.play('sfx_checkpoint', { volume: 0.4 });
                }

                if (this.onEnterLevel) {
                    this.onEnterLevel(door.levelKey, door.doorId);
                }
                return;
            }
        }
    }
}
