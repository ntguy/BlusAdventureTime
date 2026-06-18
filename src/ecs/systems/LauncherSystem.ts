import { EntityManager } from '../Entity';
import { LauncherComponent, TransformComponent, RenderComponent, PhysicsBodyComponent, PlayerComponent } from '../components';
import { InputManager } from '../../input/InputManager';

export class LauncherSystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const launchers = entityManager.query('Transform', 'Launcher', 'Render');
        const physicsEntities = entityManager.query('PhysicsBody', 'Transform');

        for (const launcherEnt of launchers) {
            const transform = launcherEnt.getComponent<TransformComponent>('Transform')!;
            const launcher = launcherEnt.getComponent<LauncherComponent>('Launcher')!;
            const render = launcherEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            // Decelerate the launcher's activation timer
            if (launcher.isActivated) {
                launcher.activationTimer -= delta;
                if (launcher.activationTimer <= 0) {
                    launcher.isActivated = false;
                    launcher.activationTimer = 0;
                    if (sprite && typeof sprite.setFrame === 'function') {
                        const idle = render.idleFrame !== undefined ? render.idleFrame : 107;
                        sprite.setFrame(idle);
                    }
                }
            }

            const lBody = launcherEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
            // Launcher bounding box (expanded slightly upwards to reliably catch players/crates landing on/touching it)
            const lBox = {
                x: lBody.x,
                y: lBody.y - 2, // expanded 2 pixels up from physical top
                w: lBody.width,
                h: lBody.height + 2
            };

            // Check overlap with physics entities (players, crates, etc.)
            for (const physEnt of physicsEntities) {
                if (physEnt.id === launcherEnt.id) continue;

                const body = physEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                const entBox = {
                    x: body.x,
                    y: body.y,
                    w: body.width,
                    h: body.height
                };

                // AABB Overlap
                if (
                    entBox.x < lBox.x + lBox.w &&
                    entBox.x + entBox.w > lBox.x &&
                    entBox.y < lBox.y + lBox.h &&
                    entBox.y + entBox.h > lBox.y
                ) {
                    // Launch! Apply upward launch velocity (-400 px/s)
                    body.setVelocityY(launcher.launchForce);

                    // Activate spring visual state for 500ms
                    if (!launcher.isActivated) {
                        launcher.isActivated = true;
                        launcher.activationTimer = 500; // ms
                        if (sprite && typeof sprite.setFrame === 'function') {
                            const active = render.activeFrame !== undefined ? render.activeFrame : 108;
                            sprite.setFrame(active);
                        }
                        if (sprite && sprite.scene) {
                            sprite.scene.sound.play('sfx_launcher', { volume: 0.17 } as any);
                        }
                        if (physEnt.hasComponent('Player')) {
                            const player = physEnt.getComponent<PlayerComponent>('Player')!;
                            inputManager.vibrate(player.playerIndex, 'medium', 150);
                        }
                    }
                }
            }
        }
    }
}
