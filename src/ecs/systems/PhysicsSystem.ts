import { EntityManager } from '../Entity';
import { PhysicsBodyComponent, TransformComponent } from '../components';

export class PhysicsSystem {
    update(entityManager: EntityManager, delta: number, terrainLayer?: Phaser.Tilemaps.TilemapLayer): void {
        const physicsEntities = entityManager.query('PhysicsBody', 'Transform');

        for (const entity of physicsEntities) {
            const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const transform = entity.getComponent<TransformComponent>('Transform')!;
            const body = physics.body;
            const gameObject = body.gameObject as any;

            // Reset side collisions to true by default (in case they were disabled by player-crate top-standing logic)
            if (body.checkCollision) {
                body.checkCollision.left = true;
                body.checkCollision.right = true;
            }

            // Sync visual transform back from the Phaser Game Object which has been updated by the Arcade physics engine
            if (gameObject) {
                transform.x = gameObject.x;
                transform.y = gameObject.y;
                transform.width = gameObject.width;
                transform.height = gameObject.height;
            }

            // ── Custom Slope Physics for Tile Codes 248 and 251 ──
            let stoodOnSlope = false;
            if (terrainLayer && body.enable && body.velocity.y >= -10) {
                const feetX = body.x + body.width / 2;
                const feetY = body.bottom;
                const tileX = Math.floor(feetX / 18);
                const baseTileY = Math.floor(feetY / 18);

                const leftSlopes = [248, 202, 244];
                const rightSlopes = [251, 203, 247];

                // Check rows baseTileY - 1, baseTileY, and baseTileY + 1 to find a slope tile the feet are touching
                for (let dy = -1; dy <= 1; dy++) {
                    const ty = baseTileY + dy;
                    const tile = terrainLayer.getTileAt(tileX, ty);

                    if (tile && (leftSlopes.includes(tile.index) || rightSlopes.includes(tile.index))) {
                        // Calculate relative X position within the tile (0 to 18)
                        const dx = Phaser.Math.Clamp(feetX - tile.pixelX, 0, 18);
                        
                        let targetY = tile.pixelY;
                        if (leftSlopes.includes(tile.index)) {
                            // Slopes up to the right: left side of roof
                            targetY = tile.pixelY + 18 - dx;
                        } else if (rightSlopes.includes(tile.index)) {
                            // Slopes down to the right: right side of roof
                            targetY = tile.pixelY + dx;
                        }

                        const prevFeetY = body.prev.y + body.height;
                        const isStanding = feetY >= targetY - 4 && feetY <= targetY + 10;
                        const isFallingOnto = prevFeetY <= targetY + 2 && feetY >= targetY - 4;

                        if (isStanding || isFallingOnto) {
                            body.y = targetY - body.height;
                            body.velocity.y = 0;
                            body.blocked.down = true;
                            stoodOnSlope = true;
                            break; // Found the active slope we are colliding with
                        }
                    }
                }
            }

            // Sync grounded state with jitter smoothing (coyote time / grounded buffer)
            const physicalGround = body.blocked.down || body.touching.down || stoodOnSlope;
            if (physics.groundedTimer === undefined) {
                physics.groundedTimer = 0;
            }

            if (physicalGround) {
                physics.isGrounded = true;
                physics.groundedTimer = 80; // 80ms buffer (approx 5 frames at 60fps)
            } else if (body.velocity.y < -10) {
                // Moving upwards (jumping/launched) - immediately lose grounded state
                physics.isGrounded = false;
                physics.groundedTimer = 0;
            } else {
                // Tick down the buffer
                if (physics.groundedTimer > 0) {
                    physics.groundedTimer -= delta;
                    physics.isGrounded = true;
                } else {
                    physics.isGrounded = false;
                }
            }
        }
    }
}
