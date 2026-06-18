import { EntityManager } from '../Entity';
import { ExitDoorComponent, TransformComponent, PhysicsBodyComponent, PlayerComponent, RenderComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import Phaser from 'phaser';

/**
 * Handles exit door logic in gameplay levels.
 * When both players overlap an exit door and Player 1 presses INTERACT,
 * the system triggers a callback to return to the level-select lobby.
 */
export class ExitDoorSystem {
    private onExit: (() => void) | null = null;
    private transitioning = false;
    private promptText?: Phaser.GameObjects.Text;

    /** Set the callback that fires when an exit door is activated */
    setExitCallback(cb: () => void): void {
        this.onExit = cb;
    }

    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        if (this.transitioning) return;

        const exitDoors = entityManager.query('Transform', 'ExitDoor', 'Render');
        const players = entityManager.query('Player', 'PhysicsBody');

        if (exitDoors.length === 0) return;

        // Gather player bodies
        let p1Body: Phaser.Physics.Arcade.Body | null = null;
        let p2Body: Phaser.Physics.Arcade.Body | null = null;

        for (const playerEnt of players) {
            const player = playerEnt.getComponent<PlayerComponent>('Player')!;
            if (player.playerIndex === 0) {
                p1Body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
            } else if (player.playerIndex === 1) {
                p2Body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
            }
        }

        if (!p1Body || !p2Body) return;

        for (const doorEnt of exitDoors) {
            const transform = doorEnt.getComponent<TransformComponent>('Transform')!;
            const exitDoor = doorEnt.getComponent<ExitDoorComponent>('ExitDoor')!;
            const render = doorEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            const doorBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2,
                w: transform.width,
                h: transform.height
            };

            // Check which players overlap the door
            const p1Overlapping = this.checkOverlap(p1Body, doorBox);
            const p2Overlapping = this.checkOverlap(p2Body, doorBox);

            exitDoor.playersPresent.clear();
            if (p1Overlapping) exitDoor.playersPresent.add(0);
            if (p2Overlapping) exitDoor.playersPresent.add(1);

            const bothPresent = p1Overlapping && p2Overlapping;

            // Create/update prompt text
            if (!this.promptText && sprite?.scene) {
                this.promptText = sprite.scene.add.text(
                    transform.x,
                    transform.y - 22,
                    '[E] EXIT',
                    {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '20px',
                        color: '#ffff00',
                        align: 'center',
                    }
                ).setOrigin(0.5).setScale(0.25).setDepth(15);

                const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                if (uiCamera) {
                    uiCamera.ignore(this.promptText);
                }
            }

            if (this.promptText) {
                this.promptText.setVisible(bothPresent);
                this.promptText.setPosition(transform.x, transform.y - 22);
            }

            // Activate when both present and P1 presses interact
            if (bothPresent && inputManager.isJustDown(0, Action.INTERACT)) {
                this.transitioning = true;
                inputManager.vibrate(0, 'weak', 100);

                if (sprite?.scene) {
                    const doorSound = sprite.scene.sound.add('sfx_door_open');
                    doorSound.play({ volume: 0.4 });
                    setTimeout(() => {
                        try {
                            if (doorSound) {
                                doorSound.stop();
                                doorSound.destroy();
                            }
                        } catch (e) {
                            // ignore
                        }
                    }, 500);
                }

                if (this.onExit) {
                    this.onExit();
                }
                return;
            }
        }
    }

    private checkOverlap(
        body: Phaser.Physics.Arcade.Body,
        box: { x: number; y: number; w: number; h: number }
    ): boolean {
        return (
            body.x < box.x + box.w &&
            body.x + body.width > box.x &&
            body.y < box.y + box.h &&
            body.y + body.height > box.y
        );
    }
}
