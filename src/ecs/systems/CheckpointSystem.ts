import { EntityManager } from '../Entity';
import { CheckpointComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent, RenderComponent } from '../components';
import { InputManager } from '../../input/InputManager';
import Phaser from 'phaser';

const HUMAN_ICON = [
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1]
];

const PAW_ICON = [
    [0,0,1,1,0,1,1,0,0],
    [0,0,1,1,0,1,1,0,0],
    [1,1,0,0,0,0,0,1,1],
    [1,1,0,1,1,1,0,1,1],
    [0,0,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,0],
    [0,0,1,1,0,1,1,0,0]
];

export class CheckpointSystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const checkpoints = entityManager.query('Transform', 'Checkpoint', 'Render');
        const players = entityManager.query('Player', 'PhysicsBody');

        for (const checkpointEnt of checkpoints) {
            const transform = checkpointEnt.getComponent<TransformComponent>('Transform')!;
            const checkpoint = checkpointEnt.getComponent<CheckpointComponent>('Checkpoint')!;
            const render = checkpointEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            // 1. Initialize graphics object if not present
            if (!checkpoint.graphics && sprite && sprite.scene) {
                checkpoint.graphics = sprite.scene.add.graphics();
                checkpoint.graphics.setDepth(15);
                
                // Ignore in UI Camera
                const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                if (uiCamera) {
                    uiCamera.ignore(checkpoint.graphics);
                }
                
                // Initial draw (in case they start active, though usually false)
                this.redrawIcons(checkpoint, transform);
            }

            const checkpointBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2,
                w: transform.width,
                h: transform.height
            };

            let stateChanged = false;

            for (const playerEnt of players) {
                const player = playerEnt.getComponent<PlayerComponent>('Player')!;
                const body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;

                const playerBox = {
                    x: body.x,
                    y: body.y,
                    w: body.width,
                    h: body.height
                };

                // AABB overlap check
                if (
                    playerBox.x < checkpointBox.x + checkpointBox.w &&
                    playerBox.x + playerBox.w > checkpointBox.x &&
                    playerBox.y < checkpointBox.y + checkpointBox.h &&
                    playerBox.y + playerBox.h > checkpointBox.y
                ) {
                    if (checkpoint.isHD) {
                        if (!checkpoint.humanActive || !checkpoint.dogActive) {
                            checkpoint.humanActive = true;
                            checkpoint.dogActive = true;
                            stateChanged = true;

                            // Update spawn coordinates for both players
                            for (const pEnt of players) {
                                const pComp = pEnt.getComponent<PlayerComponent>('Player')!;
                                pComp.spawnX = transform.x;
                                pComp.spawnY = transform.y - 4;
                            }

                            this.deactivateOtherCheckpoints(entityManager, checkpointEnt.id, 'human');
                            this.deactivateOtherCheckpoints(entityManager, checkpointEnt.id, 'dog');

                            if (sprite && sprite.scene) {
                                sprite.scene.sound.play('sfx_checkpoint', { volume: 0.4 });
                            }
                            inputManager.vibrate(0, 'medium', 200);
                            inputManager.vibrate(1, 'medium', 200);
                        }
                    } else {
                        if (player.playerType === 'human') {
                            if (!checkpoint.humanActive) {
                                checkpoint.humanActive = true;
                                stateChanged = true;
                                player.spawnX = transform.x;
                                player.spawnY = transform.y - 4; // Spawn slightly above checkpoint surface
                                this.deactivateOtherCheckpoints(entityManager, checkpointEnt.id, 'human');
                                
                                if (sprite && sprite.scene) {
                                    sprite.scene.sound.play('sfx_checkpoint', { volume: 0.4 });
                                }
                                inputManager.vibrate(player.playerIndex, 'medium', 200);
                            }
                        } else if (player.playerType === 'dog') {
                            if (!checkpoint.dogActive) {
                                checkpoint.dogActive = true;
                                stateChanged = true;
                                player.spawnX = transform.x;
                                player.spawnY = transform.y - 4; // Spawn slightly above checkpoint surface
                                this.deactivateOtherCheckpoints(entityManager, checkpointEnt.id, 'dog');
                                
                                if (sprite && sprite.scene) {
                                    sprite.scene.sound.play('sfx_checkpoint', { volume: 0.4 });
                                }
                                inputManager.vibrate(player.playerIndex, 'medium', 200);
                            }
                        }
                    }
                }
            }

            // 2. Flicker logic
            checkpoint.flickerTimer += delta;
            if (checkpoint.flickerTimer >= checkpoint.flickerRate) {
                checkpoint.flickerTimer %= checkpoint.flickerRate;
                checkpoint.showingAlt = !checkpoint.showingAlt;

                if (sprite && typeof sprite.setFrame === 'function') {
                    if (checkpoint.showingAlt) {
                        const altGid = checkpoint.flickerTile;
                        const frame = altGid >= 180 ? altGid - 180 : altGid;
                        sprite.setFrame(frame);
                    } else {
                        const idleGid = render.idleFrame !== undefined ? render.idleFrame : 111;
                        const frame = idleGid >= 180 ? idleGid - 180 : idleGid;
                        sprite.setFrame(frame);
                    }
                }
            }

            // 3. Redraw icons if state changed
            if (stateChanged && checkpoint.graphics) {
                this.redrawIcons(checkpoint, transform);
            }
        }
    }

    private deactivateOtherCheckpoints(entityManager: EntityManager, activeId: string, playerType: 'human' | 'dog'): void {
        const checkpoints = entityManager.query('Checkpoint', 'Transform');
        for (const cpEnt of checkpoints) {
            if (cpEnt.id === activeId) continue;
            const checkpoint = cpEnt.getComponent<CheckpointComponent>('Checkpoint')!;
            const transform = cpEnt.getComponent<TransformComponent>('Transform')!;

            let changed = false;
            if (playerType === 'human' && checkpoint.humanActive) {
                checkpoint.humanActive = false;
                changed = true;
            } else if (playerType === 'dog' && checkpoint.dogActive) {
                checkpoint.dogActive = false;
                changed = true;
            }

            if (changed && checkpoint.graphics && transform) {
                this.redrawIcons(checkpoint, transform);
            }
        }
    }

    private redrawIcons(checkpoint: CheckpointComponent, transform: TransformComponent): void {
        const graphics = checkpoint.graphics;
        if (!graphics) return;

        graphics.clear();
        const topY = transform.y - transform.height / 2 - 12; // 12 pixels above top edge

        if (checkpoint.humanActive && checkpoint.dogActive) {
            this.drawPixelArt(graphics, HUMAN_ICON, transform.x - 10, topY, 1, 0xff3333); // Red
            this.drawPixelArt(graphics, PAW_ICON, transform.x + 1, topY, 1, 0x0055ff); // Pure Blue
        } else if (checkpoint.humanActive) {
            this.drawPixelArt(graphics, HUMAN_ICON, transform.x - 4, topY, 1, 0xff3333);
        } else if (checkpoint.dogActive) {
            this.drawPixelArt(graphics, PAW_ICON, transform.x - 4, topY, 1, 0x0055ff); // Pure Blue
        }
    }

    private drawPixelArt(graphics: Phaser.GameObjects.Graphics, art: number[][], startX: number, startY: number, pixelSize: number, color: number): void {
        graphics.fillStyle(color, 1);
        for (let r = 0; r < art.length; r++) {
            for (let c = 0; c < art[r].length; c++) {
                if (art[r][c] === 1) {
                    graphics.fillRect(startX + c * pixelSize, startY + r * pixelSize, pixelSize, pixelSize);
                }
            }
        }
    }
}
