import { EntityManager } from '../Entity';
import { PlayerComponent, PhysicsBodyComponent, TransformComponent, InteractableComponent, RenderComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import { PHYSICS } from '../../constants';

export class MovementSystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const playerEntities = entityManager.query('Player', 'PhysicsBody');

        // Query all ladder entities once
        const ladderEntities = entityManager.query('Transform', 'Interactable');
        const ladders = ladderEntities.filter(ent => {
            const interact = ent.getComponent<InteractableComponent>('Interactable')!;
            return interact.interactionType === 'ladder';
        });

        for (const entity of playerEntities) {
            const player = entity.getComponent<PlayerComponent>('Player')!;
            const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const body = physics.body;
            const pi = player.playerIndex;

            const config = player.playerType === 'human' ? PHYSICS.human : PHYSICS.dog;

            // 1. Ladder Overlap Check (Only for Human)
            let overlapsLadder = false;
            if (player.playerType === 'human') {
                const playerBox = {
                    x: body.x,
                    y: body.y,
                    w: body.width,
                    h: body.height
                };

                for (const ladder of ladders) {
                    const transform = ladder.getComponent<TransformComponent>('Transform')!;
                    if (
                        playerBox.x < transform.x + transform.width &&
                        playerBox.x + playerBox.w > transform.x &&
                        playerBox.y < transform.y + transform.height &&
                        playerBox.y + playerBox.h > transform.y
                    ) {
                        overlapsLadder = true;
                        break;
                    }
                }
            }

            // 2. Handle Climbing State Transition
            if (overlapsLadder) {
                const isHoldingUp = inputManager.isDown(pi, Action.MOVE_UP);
                const isHoldingDown = inputManager.isDown(pi, Action.MOVE_DOWN);

                if (!player.isClimbing && (isHoldingUp || isHoldingDown)) {
                    player.isClimbing = true;
                    body.setVelocityY(0);
                }
            } else {
                if (player.isClimbing) {
                    player.isClimbing = false;
                    body.allowGravity = true;
                }
            }

            // 3. Movement and Physics Logic based on State
            if (player.isClimbing) {
                body.allowGravity = false;

                // Horizontal movement while on ladder
                if (inputManager.isDown(pi, Action.MOVE_LEFT)) {
                    body.setVelocityX(-config.moveSpeed * 0.8);
                } else if (inputManager.isDown(pi, Action.MOVE_RIGHT)) {
                    body.setVelocityX(config.moveSpeed * 0.8);
                } else {
                    body.setVelocityX(0);
                }

                // Vertical climbing controls
                if (inputManager.isDown(pi, Action.MOVE_UP)) {
                    body.setVelocityY(-config.moveSpeed * 0.7);
                } else if (inputManager.isDown(pi, Action.MOVE_DOWN)) {
                    body.setVelocityY(config.moveSpeed * 0.7);
                } else {
                    body.setVelocityY(0);
                }

                // Jump off ladder
                if (inputManager.isJustDown(pi, Action.JUMP)) {
                    player.isClimbing = false;
                    body.allowGravity = true;
                    body.setVelocityY(config.jumpVelocity);
                }

                // Exit climbing at the bottom of the ladder
                if (body.blocked.down && inputManager.isDown(pi, Action.MOVE_DOWN)) {
                    player.isClimbing = false;
                    body.allowGravity = true;
                }
            } else {
                body.allowGravity = true;

                // Standard walk controls
                if (inputManager.isDown(pi, Action.MOVE_LEFT)) {
                    body.setVelocityX(-config.moveSpeed);
                } else if (inputManager.isDown(pi, Action.MOVE_RIGHT)) {
                    body.setVelocityX(config.moveSpeed);
                } else {
                    body.setVelocityX(0);
                }

                // Standard jump controls
                if (inputManager.isJustDown(pi, Action.JUMP) && body.blocked.down) {
                    body.setVelocityY(config.jumpVelocity);
                }

                // Variable jump height: cut upward velocity if the jump button is released early
                if (inputManager.isJustUp(pi, Action.JUMP) && body.velocity.y < 0) {
                    body.setVelocityY(body.velocity.y * 0.5);
                }
            }

            // 4. Update Animations and Idle/Bark States for Dog
            if (player.playerType === 'dog') {
                const render = entity.getComponent<RenderComponent>('Render')!;
                const sprite = render.gameObject as Phaser.GameObjects.Sprite;
                
                // Initialize idleTime if not present
                if (player.idleTime === undefined) {
                    player.idleTime = 0;
                }

                // Handle Bark trigger
                if (inputManager.isJustDown(pi, Action.BARK)) {
                    const scene = sprite.scene;
                    scene.sound.play('sfx_bark', { volume: 0.4 });

                    sprite.play('blu_bark', true);
                    player.isBarking = true;
                    player.idleTime = 0;

                    const shockwave = scene.add.graphics();
                    shockwave.setDepth(15);

                    const targetObj = { r: 2, alpha: 1 };
                    scene.tweens.add({
                        targets: targetObj,
                        r: 36,
                        alpha: 0,
                        duration: 400,
                        onUpdate: () => {
                            // Compute dynamic position and orientation to stay locked to the dog
                            const currentStartX = sprite.flipX ? (body.x + body.width + 2) : (body.x - 2);
                            const currentStartY = body.y + body.height / 2;
                            const currentCenterAngle = sprite.flipX ? 0 : Math.PI;

                            shockwave.clear();
                            // Use square root of alpha to keep particles more opaque longer
                            const drawAlpha = Math.sqrt(targetObj.alpha);
                            shockwave.fillStyle(0xffffff, drawAlpha);
                            const baseAngles = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3];
                            const size = 4;
                            for (const relAngle of baseAngles) {
                                const angle = currentCenterAngle + relAngle;
                                const px1 = Math.round(currentStartX + Math.cos(angle) * targetObj.r);
                                const py1 = Math.round(currentStartY + Math.sin(angle) * targetObj.r);
                                shockwave.fillRect(px1 - size / 2, py1 - size / 2, size, size);

                                if (targetObj.r > 10) {
                                    const px2 = Math.round(currentStartX + Math.cos(angle) * (targetObj.r - 8));
                                    const py2 = Math.round(currentStartY + Math.sin(angle) * (targetObj.r - 8));
                                    shockwave.fillRect(px2 - size / 2, py2 - size / 2, size, size);
                                }

                                if (targetObj.r > 18) {
                                    const px3 = Math.round(currentStartX + Math.cos(angle) * (targetObj.r - 16));
                                    const py3 = Math.round(currentStartY + Math.sin(angle) * (targetObj.r - 16));
                                    shockwave.fillRect(px3 - size / 2, py3 - size / 2, size, size);
                                }
                            }
                        },
                        onComplete: () => {
                            shockwave.destroy();
                        }
                    });
                }

                // If currently barking, wait for animation to complete or motion to interrupt
                const speedX = Math.abs(body.velocity.x);
                if (player.isBarking) {
                    // Interrupt if moving or jumping
                    if (speedX > 0.1 || !body.blocked.down) {
                        player.isBarking = false;
                    } else if (sprite.anims.currentAnim?.key === 'blu_bark' && sprite.anims.isPlaying) {
                        // Let the bark animation finish playing
                        player.idleTime = 0;
                    } else {
                        // Completed bark
                        player.isBarking = false;
                    }
                }

                if (!player.isBarking) {
                    if (speedX > 0.1 && body.blocked.down) {
                        // Walking on the ground
                        player.idleTime = 0;
                        sprite.play('blu_walk', true);
                        if (body.velocity.x > 0.1) {
                            sprite.setFlipX(true); // face right
                        } else if (body.velocity.x < -0.1) {
                            sprite.setFlipX(false); // face left
                        }
                    } else if (player.isClimbing) {
                        // On ladder (no idle timer accumulation)
                        player.idleTime = 0;
                        sprite.play('blu_idle', true);
                    } else if (!body.blocked.down) {
                        // In air (use sitting animation while jumping/falling, even if moving horizontally)
                        player.idleTime = 0;
                        sprite.play('blu_sit', true);
                        
                        // Still mirror direction in mid-air if moving horizontally
                        if (speedX > 0.1) {
                            if (body.velocity.x > 0.1) {
                                sprite.setFlipX(true); // face right
                            } else if (body.velocity.x < -0.1) {
                                sprite.setFlipX(false); // face left
                            }
                        }
                    } else {
                        // Standing still on ground: accumulate idle timer (convert delta ms to seconds)
                        player.idleTime += delta / 1000;

                        if (player.idleTime < 4) {
                            sprite.play('blu_idle', true);
                        } else {
                            sprite.play('blu_sit', true);
                        }
                    }
                }
            }
        }
    }
}

