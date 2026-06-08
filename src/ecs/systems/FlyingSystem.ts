import { EntityManager } from '../Entity';
import { FlyingComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent, RenderComponent } from '../components';
import { MovementSystem } from './MovementSystem';
import Phaser from 'phaser';

export class FlyingSystem {
    constructor(private movementSystem: MovementSystem) {}

    update(entityManager: EntityManager, delta: number): void {
        const flyingEntities = entityManager.query('Transform', 'Flying', 'PhysicsBody', 'Render');
        const players = entityManager.query('Player', 'PhysicsBody');

        for (const ent of flyingEntities) {
            const transform = ent.getComponent<TransformComponent>('Transform')!;
            const flying = ent.getComponent<FlyingComponent>('Flying')!;
            const bodyComp = ent.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const body = bodyComp.body;
            const render = ent.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            if (flying.collisionCooldown > 0) {
                flying.collisionCooldown -= delta;
            }

            // 1. Check for terrain collision / blocked state to reverse direction
            const isBlocked = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
            if (isBlocked && flying.collisionCooldown <= 0) {
                flying.direction = flying.direction === 1 ? -1 : 1;
                flying.collisionCooldown = 200; // 200ms cooldown to prevent rapid direction flipping
            }

            // 2. Project position onto path to check boundaries
            const dx = flying.endX - flying.startX;
            const dy = flying.endY - flying.startY;
            const pathLen2 = dx * dx + dy * dy;

            if (pathLen2 > 0.01) {
                const px = body.x + body.width / 2;
                const py = body.y + body.height / 2;
                const t = ((px - flying.startX) * dx + (py - flying.startY) * dy) / pathLen2;

                // Check if reached ends of path and reverse
                if (flying.direction === 1 && t >= 1.0) {
                    flying.direction = -1;
                    body.x = flying.endX - body.width / 2;
                    body.y = flying.endY - body.height / 2;
                } else if (flying.direction === -1 && t <= 0.0) {
                    flying.direction = 1;
                    body.x = flying.startX - body.width / 2;
                    body.y = flying.startY - body.height / 2;
                }
                
                transform.x = body.x + body.width / 2;
                transform.y = body.y + body.height / 2;
            } else {
                // Stationary flying entity
                body.x = flying.startX - body.width / 2;
                body.y = flying.startY - body.height / 2;
                transform.x = flying.startX;
                transform.y = flying.startY;
            }

            // 3. Set velocity based on direction
            if (pathLen2 > 0.01 && flying.velocity > 0) {
                const dist = Math.sqrt(pathLen2);
                const vx = (dx / dist) * flying.velocity * flying.direction;
                const vy = (dy / dist) * flying.velocity * flying.direction;
                body.setVelocity(vx, vy);
            } else {
                body.setVelocity(0, 0);
            }

            // 4. Update animation (cycle between 3 tiles)
            flying.animTimer += delta;
            if (flying.animTimer >= 150) {
                flying.animTimer = 0;
                flying.animFrame = (flying.animFrame + 1) % 3;
                if (sprite && typeof sprite.setFrame === 'function') {
                    sprite.setFrame(flying.startFrame + flying.animFrame);
                }
            }

            // 5. Overlap check with players (hazardous collision)
            const flyingBox = {
                x: body.x,
                y: body.y,
                w: body.width,
                h: body.height
            };

            for (const playerEnt of players) {
                const player = playerEnt.getComponent<PlayerComponent>('Player')!;
                if (player.isDying) continue;

                const pBody = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                const playerBox = {
                    x: pBody.x,
                    y: pBody.y,
                    w: pBody.width,
                    h: pBody.height
                };

                if (
                    playerBox.x < flyingBox.x + flyingBox.w &&
                    playerBox.x + playerBox.w > flyingBox.x &&
                    playerBox.y < flyingBox.y + flyingBox.h &&
                    playerBox.y + playerBox.h > flyingBox.y
                ) {
                    this.movementSystem.triggerDeath(playerEnt, player, pBody);
                }
            }
        }
    }
}
