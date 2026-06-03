import { EntityManager } from '../Entity';
import { RenderComponent, TransformComponent } from '../components';

export class RenderSystem {
    update(entityManager: EntityManager, delta: number): void {
        const renderEntities = entityManager.query('Render', 'Transform');

        for (const entity of renderEntities) {
            // For entities with physics, the PhysicsSystem has already updated the Transform from the GameObject.
            // For non-physics entities, we sync the GameObject coordinates to the TransformComponent coordinates.
            if (entity.hasComponent('PhysicsBody')) {
                continue;
            }

            const render = entity.getComponent<RenderComponent>('Render')!;
            const transform = entity.getComponent<TransformComponent>('Transform')!;
            const gameObject = render.gameObject as any;

            if (gameObject && typeof gameObject.setPosition === 'function') {
                gameObject.setPosition(transform.x, transform.y);
            }
        }
    }
}
