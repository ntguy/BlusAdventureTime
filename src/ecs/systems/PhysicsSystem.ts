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

            // Sync grounded state
            physics.isGrounded = body.blocked.down;
        }
    }
}
