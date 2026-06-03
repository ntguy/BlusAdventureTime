import { EntityManager } from '../Entity';
import { PlayerComponent, PhysicsBodyComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import { PHYSICS } from '../../constants';

export class MovementSystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const playerEntities = entityManager.query('Player', 'PhysicsBody');

        for (const entity of playerEntities) {
            const player = entity.getComponent<PlayerComponent>('Player')!;
            const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
            const body = physics.body;
            const pi = player.playerIndex;

            const config = player.playerType === 'human' ? PHYSICS.human : PHYSICS.dog;

            // Horizontal movement: direct velocity (no acceleration/deceleration delay)
            if (inputManager.isDown(pi, Action.MOVE_LEFT)) {
                body.setVelocityX(-config.moveSpeed);
            } else if (inputManager.isDown(pi, Action.MOVE_RIGHT)) {
                body.setVelocityX(config.moveSpeed);
            } else {
                body.setVelocityX(0);
            }

            // Jump: only when grounded (blocked down)
            if (inputManager.isJustDown(pi, Action.JUMP) && body.blocked.down) {
                body.setVelocityY(config.jumpVelocity);
            }
        }
    }
}
