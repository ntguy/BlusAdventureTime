import { EntityManager, Entity } from '../Entity';
import { PlayerComponent, PhysicsBodyComponent, TransformComponent, InteractableComponent, RenderComponent, KeyComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import { PHYSICS } from '../../constants';

const DEATH_FADE_MS = 250;

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

            // 0. Skip input while dying (fade tween is in progress)
            if (player.isDying) continue;

            // Out-of-bounds death trigger
            if (body.y > body.world.bounds.height) {
                this.triggerDeath(entity, player, body);
                continue;
            }

            const config = player.playerType === 'human' ? PHYSICS.human : PHYSICS.dog;

            // 1. Ladder Overlap Check (Only for Human)
            let overlapsLadder = false;
            let currentLadderTopY = Infinity;
            if (player.playerType === 'human') {
                const playerBox = {
                    x: body.x, y: body.y, w: body.width, h: body.height
                };

                for (const ladder of ladders) {
                    const transform = ladder.getComponent<TransformComponent>('Transform')!;
                    const ladderLeft = transform.x - transform.width / 2;
                    const ladderRight = transform.x + transform.width / 2;
                    const ladderTop = transform.y - transform.height / 2;
                    const ladderBottom = transform.y + transform.height / 2;

                    if (
                        playerBox.x < ladderRight &&
                        playerBox.x + playerBox.w > ladderLeft &&
                        playerBox.y < ladderBottom &&
                        playerBox.y + playerBox.h > ladderTop
                    ) {
                        overlapsLadder = true;
                        // Track the topmost edge of all overlapping ladder tiles
                        if (ladderTop < currentLadderTopY) currentLadderTopY = ladderTop;
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

                // Vertical climbing controls with top-clamp
                if (inputManager.isDown(pi, Action.MOVE_UP)) {
                    // Allow climbing until the player is halfway above the final ladder piece
                    // Midpoint of topmost ladder tile is currentLadderTopY + 9, so body.y clamp is currentLadderTopY - 16
                    const clampY = currentLadderTopY - 16;
                    if (body.y <= clampY) {
                        body.setVelocityY(0);
                        body.y = clampY;
                    } else {
                        body.setVelocityY(-config.moveSpeed * 0.7);
                    }
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
                if (physics.isGrounded && inputManager.isDown(pi, Action.MOVE_DOWN)) {
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
                if (inputManager.isJustDown(pi, Action.JUMP) && physics.isGrounded) {
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
                if (player.idleTime === undefined) player.idleTime = 0;

                // Check if dog is near a key (KeySystem handles actual pickup, but we block bark SFX/shockwave)
                const keyEntities = entityManager.query('Key');
                const nearKey = keyEntities.some(keyEnt => {
                    const keyComp = keyEnt.getComponent<KeyComponent>('Key')!;
                    return !keyComp.isPickedUp && keyComp.mouthSprite === undefined;
                    // KeySystem detects proximity; if KeySystem already handled pickup on this frame we skip shockwave
                });

                // Handle Bark trigger
                if (inputManager.isJustDown(pi, Action.BARK)) {
                    // Check if KeySystem is handling a key pickup this frame (any key nearby)
                    const allKeyEnts = entityManager.query('Key');
                    const keyPickingUp = allKeyEnts.some(ke => {
                        const kc = ke.getComponent<KeyComponent>('Key')!;
                        return kc.isPickedUp && kc.mouthSprite;
                    });
                    // Only do bark shockwave / sound if not picking up a key
                    if (!keyPickingUp) {
                        const scene = sprite.scene;
                        const barkIndex = Phaser.Math.Between(1, 7);
                        scene.sound.play(`sfx_bark_${barkIndex}`, { volume: 0.4 });

                        sprite.play('blu_bark', true);
                        player.isBarking = true;
                        player.idleTime = 0;

                        const shockwave = scene.add.graphics();
                        shockwave.setDepth(15);

                        const targetObj = { r: 2, alpha: 1 };
                        scene.tweens.add({
                            targets: targetObj,
                            r: 32,
                            alpha: 0,
                            duration: 200,
                            onUpdate: () => {
                                const currentStartX = sprite.flipX ? (body.x + body.width + 2) : (body.x - 2);
                                const currentStartY = body.y + body.height / 2;
                                const currentCenterAngle = sprite.flipX ? 0 : Math.PI;

                                shockwave.clear();
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
                }

                // If currently barking, wait for animation to complete or motion to interrupt
                const speedX = Math.abs(body.velocity.x);
                if (player.isBarking) {
                    if (speedX > 0.1 || !physics.isGrounded) {
                        player.isBarking = false;
                    } else if (sprite.anims.currentAnim?.key === 'blu_bark' && sprite.anims.isPlaying) {
                        player.idleTime = 0;
                    } else {
                        player.isBarking = false;
                    }
                }

                if (!player.isBarking) {
                    if (speedX > 0.1 && physics.isGrounded) {
                        player.idleTime = 0;
                        sprite.play('blu_walk', true);
                        if (body.velocity.x > 0.1) {
                            sprite.setFlipX(true);
                        } else if (body.velocity.x < -0.1) {
                            sprite.setFlipX(false);
                        }
                    } else if (player.isClimbing) {
                        player.idleTime = 0;
                        sprite.play('blu_idle', true);
                    } else if (!physics.isGrounded) {
                        player.idleTime = 0;
                        sprite.play('blu_sit', true);

                        if (speedX > 0.1) {
                            if (body.velocity.x > 0.1) {
                                sprite.setFlipX(true);
                            } else if (body.velocity.x < -0.1) {
                                sprite.setFlipX(false);
                            }
                        }
                    } else {
                        player.idleTime += delta / 1000;
                        if (player.idleTime < 4) {
                            sprite.play('blu_idle', true);
                        } else {
                            sprite.play('blu_sit', true);
                        }
                    }
                }
            }

            if (player.playerType === 'human') {
                const render = entity.getComponent<RenderComponent>('Render')!;
                const sprite = render.gameObject as Phaser.GameObjects.Sprite;
                const speedX = Math.abs(body.velocity.x);

                // Track time spent in air
                if (player.isClimbing || physics.isGrounded) {
                    player.airTime = 0;
                } else {
                    player.airTime = (player.airTime || 0) + delta;
                }

                if (player.isClimbing) {
                    sprite.anims.stop();
                    sprite.setFrame(46);

                    // Alternate flipX while actively climbing up or down
                    if (Math.abs(body.velocity.y) > 0.1) {
                        const alt = Math.floor(sprite.scene.time.now / 300) % 2 === 0;
                        sprite.setFlipX(alt);
                    } else {
                        sprite.setFlipX(false);
                    }
                } else if (!physics.isGrounded) {
                    // Airborne (jump / fall)
                    sprite.anims.stop();
                    if ((player.airTime || 0) >= 125) {
                        sprite.setFrame(19); // Row 2, image 8
                    } else {
                        sprite.setFrame(18); // Row 2, image 7
                    }

                    if (body.velocity.x > 0.1) {
                        sprite.setFlipX(false);
                    } else if (body.velocity.x < -0.1) {
                        sprite.setFlipX(true);
                    }
                } else if (speedX > 0.1) {
                    // Walk animation
                    sprite.play('human_walk', true);
                    if (body.velocity.x > 0.1) {
                        sprite.setFlipX(false);
                    } else if (body.velocity.x < -0.1) {
                        sprite.setFlipX(true);
                    }
                } else {
                    // Standing idle (Row 2, image 2)
                    sprite.anims.stop();
                    sprite.setFrame(13);
                }
            }
        }
    }

    /**
     * Freeze the player, fade them out over DEATH_FADE_MS, then respawn.
     * Dog deaths play sfx_grumble; all deaths play sfx_death.
     */
    triggerDeath(entity: Entity, player: PlayerComponent, body: Phaser.Physics.Arcade.Body): void {
        if (player.isDying) return;
        player.isDying = true;

        // Freeze physics
        body.setVelocity(0, 0);
        body.allowGravity = false;

        const scene = body.gameObject?.scene;
        if (!scene) {
            // No scene — instant respawn fallback
            this.doRespawn(player, body);
            return;
        }

        // Play death SFX
        scene.sound.play('sfx_death', { volume: 0.5 });
        if (player.playerType === 'dog') {
            scene.sound.play('sfx_grumble', { volume: 0.6 });
        }

        // Get the visual game object to tween its alpha
        const render = entity.getComponent<RenderComponent>('Render');
        const gameObj = render?.gameObject as Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.GameObject | undefined;

        if (gameObj && typeof (gameObj as any).setAlpha === 'function') {
            const go = gameObj as any;
            go.setAlpha(1);
            scene.tweens.add({
                targets: go,
                alpha: 0,
                duration: DEATH_FADE_MS,
                ease: 'Linear',
                onComplete: () => {
                    go.setAlpha(1);
                    this.doRespawn(player, body);
                }
            });
        } else {
            // Fallback: just delay and respawn
            scene.time.delayedCall(DEATH_FADE_MS, () => {
                this.doRespawn(player, body);
            });
        }
    }

    private doRespawn(player: PlayerComponent, body: Phaser.Physics.Arcade.Body): void {
        body.reset(player.spawnX, player.spawnY);
        player.isClimbing = false;
        body.allowGravity = true;
        body.setVelocity(0, 0);
        player.isDying = false;
    }
}
