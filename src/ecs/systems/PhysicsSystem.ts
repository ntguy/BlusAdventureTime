import { EntityManager } from '../Entity';
import { PhysicsBodyComponent, TransformComponent } from '../components';

export class PhysicsSystem {
    update(entityManager: EntityManager, delta: number): void {
        const physicsEntities = entityManager.query('PhysicsBody', 'Transform');

        for (const entity of physicsEntities) {
            const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const transform = entity.getComponent<TransformComponent>('Transform')!;
            const body = physics.body;
            const gameObject = body.gameObject as any;

            // Sync visual transform back from the Phaser Game Object which has been updated by the Arcade physics engine
            if (gameObject) {
                transform.x = gameObject.x;
                transform.y = gameObject.y;
                transform.width = gameObject.width;
                transform.height = gameObject.height;
            }

            // Sync grounded state with jitter smoothing (coyote time / grounded buffer)
            const physicalGround = body.blocked.down || body.touching.down;
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
