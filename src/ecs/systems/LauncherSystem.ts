import { EntityManager } from '../Entity';
import { LauncherComponent, TransformComponent, RenderComponent, PhysicsBodyComponent } from '../components';

export class LauncherSystem {
    update(entityManager: EntityManager, delta: number): void {
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

            // Launcher bounding box (expanded slightly upwards to reliably catch players/crates landing on/touching it)
            const lBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2 - 2, // expanded 2 pixels up
                w: transform.width,
                h: transform.height + 2
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
                            sprite.scene.sound.play('sfx_jump', { volume: 0.3 } as any);
                        }
                    }
                }
            }
        }
    }
}
