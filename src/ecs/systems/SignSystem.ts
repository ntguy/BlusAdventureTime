import { EntityManager } from '../Entity';
import { SignComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent, RenderComponent } from '../components';
import Phaser from 'phaser';

export class SignSystem {
    update(entityManager: EntityManager, delta: number): void {
        const signs = entityManager.query('Transform', 'Sign', 'Render');
        const players = entityManager.query('Player', 'PhysicsBody');

        // Find human player
        const humanPlayer = players.find(p => p.getComponent<PlayerComponent>('Player')!.playerType === 'human');

        for (const signEnt of signs) {
            const transform = signEnt.getComponent<TransformComponent>('Transform')!;
            const sign = signEnt.getComponent<SignComponent>('Sign')!;
            const render = signEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            if (!sprite || !sprite.scene) continue;

            const signBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2,
                w: transform.width,
                h: transform.height
            };

            let isOverlap = false;

            if (humanPlayer) {
                const body = humanPlayer.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                const playerBox = {
                    x: body.x,
                    y: body.y,
                    w: body.width,
                    h: body.height
                };

                // AABB overlap check
                if (
                    playerBox.x < signBox.x + signBox.w &&
                    playerBox.x + playerBox.w > signBox.x &&
                    playerBox.y < signBox.y + signBox.h &&
                    playerBox.y + playerBox.h > signBox.y
                ) {
                    isOverlap = true;
                }
            }

            if (isOverlap) {
                if (!sign.textObject) {
                    // Create text object above the sign
                    sign.textObject = sprite.scene.add.text(transform.x, transform.y - 16, sign.text, {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '6px',
                        color: '#ffffff',
                        align: 'center',
                        backgroundColor: '#000000aa',
                        padding: { x: 4, y: 2 }
                    }).setOrigin(0.5).setDepth(20);

                    // Ignore in UI Camera
                    const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                    if (uiCamera) {
                        uiCamera.ignore(sign.textObject);
                    }
                }
            } else {
                if (sign.textObject) {
                    sign.textObject.destroy();
                    sign.textObject = undefined;
                }
            }
        }
    }
}
