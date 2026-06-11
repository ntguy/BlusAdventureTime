import { EntityManager } from '../Entity';
import { CatComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import { MovementSystem } from './MovementSystem';
import Phaser from 'phaser';

function normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

export class CatSystem {
    constructor(private movementSystem: MovementSystem) {}

    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const cats = entityManager.query('Transform', 'Cat', 'PhysicsBody');
        const dogEntity = entityManager.query('Player', 'PhysicsBody').find(ent => {
            const player = ent.getComponent<PlayerComponent>('Player')!;
            return player.playerType === 'dog';
        });

        // Check if human touches any cat (and dies)
        const humanEntity = entityManager.query('Player', 'PhysicsBody').find(ent => {
            const player = ent.getComponent<PlayerComponent>('Player')!;
            return player.playerType === 'human';
        });
        if (humanEntity) {
            const player = humanEntity.getComponent<PlayerComponent>('Player')!;
            if (!player.isDying) {
                const humanBody = humanEntity.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                const humanBox = {
                    x: humanBody.x,
                    y: humanBody.y,
                    w: humanBody.width,
                    h: humanBody.height
                };

                for (const catEnt of cats) {
                    const catBody = catEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                    const catCenterX = catBody.x + catBody.width / 2;
                    const catCenterY = catBody.y + catBody.height / 2;

                    // 18px wide/high contact box
                    const catContactBox = {
                        x: catCenterX - 9,
                        y: catCenterY - 9,
                        w: 18,
                        h: 18
                    };

                    if (
                        humanBox.x < catContactBox.x + catContactBox.w &&
                        humanBox.x + humanBox.w > catContactBox.x &&
                        humanBox.y < catContactBox.y + catContactBox.h &&
                        humanBox.y + humanBox.h > catContactBox.y
                    ) {
                        this.movementSystem.triggerDeath(humanEntity, player, humanBody);
                        break;
                    }
                }
            }
        }

        // 1. Check if the dog barked on this frame
        if (dogEntity) {
            const player = dogEntity.getComponent<PlayerComponent>('Player')!;
            const dogBody = dogEntity.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;

            if (inputManager.isJustDown(player.playerIndex, Action.BARK)) {
                const dogCenterX = dogBody.x + dogBody.width / 2;
                const dogCenterY = dogBody.y + dogBody.height / 2;
                
                // Get dog facing angle (flipX === true means facing right (0), false means facing left (Math.PI))
                const dogSprite = dogBody.gameObject as Phaser.GameObjects.Sprite;
                const dogFacingAngle = (dogSprite && dogSprite.flipX) ? 0 : Math.PI;

                for (const catEnt of cats) {
                    const cat = catEnt.getComponent<CatComponent>('Cat')!;
                    const catBody = catEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                    const catTransform = catEnt.getComponent<TransformComponent>('Transform')!;

                    const catCenterX = catBody.x + catBody.width / 2;
                    const catCenterY = catBody.y + catBody.height / 2;

                    const dx = catCenterX - dogCenterX;
                    const dy = catCenterY - dogCenterY;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    // Check if within bark range (50 pixels, reduced by 4px from 54)
                    if (distance <= 50) {
                        const angleToCat = Math.atan2(dy, dx);
                        const angleDiff = Math.abs(normalizeAngle(angleToCat - dogFacingAngle));

                        // Check if within 120-degree cone (60 degrees on either side: Math.PI / 3)
                        if (angleDiff <= Math.PI / 3) {
                            // Dog's bark touched this cat!
                            if (cat.state === 'sleeping') {
                                // Query adjacent tilemap cells to see if there is a solid wall
                                const scene = catBody.gameObject.scene;
                                const terrainLayer = scene.children.list.find((child: any) => child.layer && child.layer.name === 'terrain') as Phaser.Tilemaps.TilemapLayer;
                                const catTileX = Math.floor(catCenterX / 18);
                                const catTileY = Math.floor(catCenterY / 18);
                                
                                const leftTile = terrainLayer ? terrainLayer.getTileAt(catTileX - 1, catTileY) : null;
                                const rightTile = terrainLayer ? terrainLayer.getTileAt(catTileX + 1, catTileY) : null;
                                
                                const isBlockedLeft = (leftTile && leftTile.index !== -1) || catBody.blocked.left;
                                const isBlockedRight = (rightTile && rightTile.index !== -1) || catBody.blocked.right;

                                let direction = 0; // -1 for left, 1 for right

                                if (isBlockedLeft && !isBlockedRight) {
                                    direction = 1; // Blocked left: run right regardless of bark direction
                                } else if (isBlockedRight && !isBlockedLeft) {
                                    direction = -1; // Blocked right: run left regardless of bark direction
                                } else if (isBlockedLeft && isBlockedRight) {
                                    direction = 0; // Blocked on both sides: cannot move
                                } else {
                                    // Run opposite to the bark direction relative to dog position
                                    direction = dogCenterX < catCenterX ? 1 : -1;
                                }

                                if (direction !== 0) {
                                    cat.state = 'startled';
                                    cat.startleTimer = 250; // 250ms delay
                                    cat.direction = direction;

                                    if (cat.exclamation) {
                                        cat.exclamation.destroy();
                                    }
                                    cat.exclamation = scene.add.text(catBody.x + catBody.width / 2, catBody.y - 12, '!', {
                                        fontFamily: '"Press Start 2P"',
                                        fontSize: '14px',
                                        color: '#ff0000',
                                        align: 'center'
                                    }).setOrigin(0.5).setDepth(20);
                                    cat.exclamation.setScale(0);
                                    cat.exclamation.setAlpha(0);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Update Cat Movement & State pathing
        for (const catEnt of cats) {
            const cat = catEnt.getComponent<CatComponent>('Cat')!;
            const catBody = catEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
            const sprite = catBody.gameObject as Phaser.GameObjects.Sprite;

            if (cat.state === 'startled') {
                catBody.setVelocityX(0);
                cat.startleTimer -= delta;

                if (sprite) {
                    if (sprite.anims.currentAnim?.key !== 'cat_idle') {
                        sprite.play('cat_idle');
                    }
                    sprite.setFlipX(cat.direction === -1);
                    catBody.setOffset(8, 5);
                }

                if (cat.exclamation) {
                    // Make the exclamation point follow the cat's head
                    cat.exclamation.setPosition(catBody.x + catBody.width / 2, catBody.y - 12);

                    // Flash in (0-125ms) and out (125-250ms)
                    const elapsed = 250 - cat.startleTimer;
                    if (elapsed <= 125) {
                        const progress = elapsed / 125;
                        cat.exclamation.setAlpha(progress);
                        cat.exclamation.setScale(progress);
                    } else {
                        const progress = Math.max(0, cat.startleTimer / 125);
                        cat.exclamation.setAlpha(progress);
                        cat.exclamation.setScale(progress);
                    }
                }

                if (cat.startleTimer <= 0) {
                    if (cat.exclamation) {
                        cat.exclamation.destroy();
                        cat.exclamation = undefined;
                    }
                    cat.state = 'running';
                    cat.startX = catBody.x;
                }
            } else if (cat.state === 'running') {
                catBody.setVelocityX(cat.direction * cat.runSpeed);

                if (sprite) {
                    if (sprite.anims.currentAnim?.key !== 'cat_run') {
                        sprite.play('cat_run');
                    }
                    sprite.setFlipX(cat.direction === -1);
                    catBody.setOffset(8, 5);
                }

                const distanceTraveled = Math.abs(catBody.x - cat.startX);

                // Stop if we hit target distance (5 spaces = 90px)
                const reachedDistance = distanceTraveled >= cat.targetDistance;

                // Stop if we hit a wall in our running direction
                const hitWall = (cat.direction === 1 && catBody.blocked.right) || 
                                (cat.direction === -1 && catBody.blocked.left);

                if (reachedDistance || hitWall) {
                    catBody.setVelocityX(0);
                    cat.state = 'sleeping';
                }
            } else {
                // Sleep: stationary
                catBody.setVelocityX(0);

                if (sprite) {
                    if (sprite.anims.currentAnim?.key !== 'cat_idle') {
                        sprite.play('cat_idle');
                    }
                    if (cat.direction !== 0) {
                        sprite.setFlipX(cat.direction === -1);
                    } else {
                        sprite.setFlipX(cat.initialFacing === 'left');
                    }
                    catBody.setOffset(8, 5);
                }

                if (cat.exclamation) {
                    cat.exclamation.destroy();
                    cat.exclamation = undefined;
                }
            }
        }
    }
}
