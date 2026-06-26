import { EntityManager } from '../Entity';
import { SpikesComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent } from '../components';
import { MovementSystem } from './MovementSystem';
import Phaser from 'phaser';

export class SpikesSystem {
    constructor(private movementSystem: MovementSystem) {}

    update(entityManager: EntityManager, delta: number): void {
        const spikes = entityManager.query('Transform', 'Spikes');
        const players = entityManager.query('Player', 'PhysicsBody');

        for (const spikeEnt of spikes) {
            const transform = spikeEnt.getComponent<TransformComponent>('Transform')!;
            const spikesComp = spikeEnt.getComponent<SpikesComponent>('Spikes')!;
            const rotate180 = spikesComp.rotate180 === true;

            const spikeBox = {
                x: transform.x - transform.width / 2,
                y: rotate180 
                    ? transform.y - 9 // ceiling spikes: occupy the top 10px of the 18px tile
                    : transform.y + 9 - 10, // floor spikes: occupy the bottom 10px
                w: transform.width,
                h: 10
            };

            for (const playerEnt of players) {
                const player = playerEnt.getComponent<PlayerComponent>('Player')!;
                if (player.isDying) continue;

                const bodyComponent = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!;
                const body = bodyComponent.body;

                const playerBox = {
                    x: body.x, y: body.y, w: body.width, h: body.height
                };

                // AABB overlap check
                if (
                    playerBox.x < spikeBox.x + spikeBox.w &&
                    playerBox.x + playerBox.w > spikeBox.x &&
                    playerBox.y < spikeBox.y + spikeBox.h &&
                    playerBox.y + playerBox.h > spikeBox.y
                ) {
                    this.movementSystem.triggerDeath(playerEnt, player, body);
                }
            }
        }
    }
}
