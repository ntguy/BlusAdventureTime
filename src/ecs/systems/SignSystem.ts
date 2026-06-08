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
                const cam = sprite.scene.cameras.main;
                const distToLeft = transform.x - cam.worldView.x;
                const distToRight = (cam.worldView.x + cam.worldView.width) - transform.x;
                const isCloseToEdge = distToLeft < 120 || distToRight < 120;
                const wrapLength = isCloseToEdge ? 25 : 50;
                const wrappedText = wrapText(sign.text, wrapLength);

                if (!sign.textObject) {
                    // Create text object above the sign
                    sign.textObject = sprite.scene.add.text(transform.x, transform.y - 12, wrappedText, {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '24px',
                        color: '#ffffff',
                        align: 'center',
                        backgroundColor: '#000000aa',
                        padding: { x: 16, y: 8 }
                    }).setOrigin(0.5, 1).setScale(0.25).setDepth(20);

                    // Ignore in UI Camera
                    const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                    if (uiCamera) {
                        uiCamera.ignore(sign.textObject);
                    }
                } else {
                    if (sign.textObject.text !== wrappedText) {
                        sign.textObject.setText(wrappedText);
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

/**
 * Wraps text so that no line exceeds maxChars, breaking on space boundaries where possible.
 */
function wrapText(text: string, maxChars: number = 50): string {
    if (!text) return '';
    return text.split('\n').map(line => {
        if (line.length <= maxChars) return line;
        const words = line.split(' ');
        const wrappedLines: string[] = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            if (testLine.length <= maxChars) {
                currentLine = testLine;
            } else {
                if (currentLine) {
                    wrappedLines.push(currentLine);
                }
                currentLine = word;
            }
        }
        if (currentLine) {
            wrappedLines.push(currentLine);
        }
        return wrappedLines.join('\n');
    }).join('\n');
}

