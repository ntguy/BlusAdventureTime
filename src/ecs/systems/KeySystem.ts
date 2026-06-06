import { EntityManager } from '../Entity';
import { KeyComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent, RenderComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import Phaser from 'phaser';

const PICKUP_RANGE = 20; // pixels — AABB overlap range to allow pickup

export class KeySystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const keyEntities = entityManager.query('Transform', 'Key', 'Render', 'PhysicsBody');
        const players = entityManager.query('Player', 'PhysicsBody', 'Render');

        const dogEntity = players.find(p => p.getComponent<PlayerComponent>('Player')!.playerType === 'dog');
        if (!dogEntity) return;

        const dogPlayer = dogEntity.getComponent<PlayerComponent>('Player')!;
        const dogBody = dogEntity.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
        const dogRender = dogEntity.getComponent<RenderComponent>('Render')!;
        const dogSprite = dogRender.gameObject as Phaser.GameObjects.Sprite;

        for (const keyEnt of keyEntities) {
            const keyComp = keyEnt.getComponent<KeyComponent>('Key')!;
            const keyTransform = keyEnt.getComponent<TransformComponent>('Transform')!;
            const keyRender = keyEnt.getComponent<RenderComponent>('Render')!;
            const keySprite = keyRender.gameObject as Phaser.GameObjects.Sprite;
            const keyPhysBody = keyEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;

            if (!keySprite || !keySprite.scene) continue;

            if (keyComp.isPickedUp) {
                // If already picked up: follow the dog's mouth position
                if (keyComp.mouthSprite && dogSprite) {
                    const mouthOffsetX = dogSprite.flipX ? 6 : -6;
                    const mouthY = dogBody.y + dogBody.height - 4;
                    keyComp.mouthSprite.setPosition(dogBody.x + dogBody.width / 2 + mouthOffsetX, mouthY);
                }
                // If dog barks again while holding the key, that bark was the pickup — nothing extra
                continue;
            }

            // AABB overlap check between dog and key
            const dogBox = {
                x: dogBody.x, y: dogBody.y, w: dogBody.width, h: dogBody.height
            };
            const keyBox = {
                x: keyTransform.x - keyTransform.width / 2,
                y: keyTransform.y - keyTransform.height / 2,
                w: keyTransform.width,
                h: keyTransform.height
            };

            const overlapping =
                dogBox.x < keyBox.x + keyBox.w + PICKUP_RANGE &&
                dogBox.x + dogBox.w > keyBox.x - PICKUP_RANGE &&
                dogBox.y < keyBox.y + keyBox.h + PICKUP_RANGE &&
                dogBox.y + dogBox.h > keyBox.y - PICKUP_RANGE;

            if (overlapping) {
                // Glow yellow while near
                keySprite.setTint(0xffee00);

                // Pickup on bark
                if (inputManager.isJustDown(dogPlayer.playerIndex, Action.BARK)) {
                    keyComp.isPickedUp = true;

                    // Hide world key sprite
                    keySprite.setVisible(false);
                    keyPhysBody.enable = false;

                    // Create a quarter-size mouth overlay on the dog
                    const scene = dogSprite.scene;
                    const mouthOffsetX = dogSprite.flipX ? 6 : -6;
                    const mouthY = dogBody.y + dogBody.height - 4;
                    const mouthSprite = scene.add.sprite(
                        dogBody.x + dogBody.width / 2 + mouthOffsetX,
                        mouthY,
                        keySprite.texture.key,
                        keySprite.frame.name
                    );
                    mouthSprite.setScale(0.25);
                    mouthSprite.setDepth(12);
                    mouthSprite.setTint(0xffee00);

                    // Ignore on UI camera
                    const uiCamera = scene.cameras.getCamera('uiCamera') || (scene as any).uiCamera;
                    if (uiCamera) uiCamera.ignore(mouthSprite);

                    keyComp.mouthSprite = mouthSprite;

                    // Play pickup sound
                    scene.sound.play('sfx_pickup', { volume: 0.5 });
                }
            } else {
                // Not near: remove glow
                keySprite.clearTint();
            }
        }
    }
}
