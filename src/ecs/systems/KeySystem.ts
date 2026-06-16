import { EntityManager } from '../Entity';
import { KeyComponent, PhysicsBodyComponent, TransformComponent, PlayerComponent, RenderComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';
import Phaser from 'phaser';

const PICKUP_RANGE = 2; // pixels — AABB overlap range to allow pickup

export class KeySystem {
    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const keyEntities = entityManager.query('Transform', 'Key', 'Render', 'PhysicsBody');
        for (const keyEnt of keyEntities) {
            keyEnt.getComponent<KeyComponent>('Key')!.justDroppedThisFrame = false;
        }

        let dogCarryingState = keyEntities.some(ke => {
            const kc = ke.getComponent<KeyComponent>('Key')!;
            return kc.isPickedUp && kc.carrier === 'dog';
        });

        let humanCarryingState = keyEntities.some(ke => {
            const kc = ke.getComponent<KeyComponent>('Key')!;
            return kc.isPickedUp && kc.carrier === 'human';
        });

        const players = entityManager.query('Player', 'PhysicsBody', 'Render');

        const dogEntity = players.find(p => p.getComponent<PlayerComponent>('Player')!.playerType === 'dog');
        const humanEntity = players.find(p => p.getComponent<PlayerComponent>('Player')!.playerType === 'human');

        const dogPlayer = dogEntity?.getComponent<PlayerComponent>('Player');
        const dogBody = dogEntity?.getComponent<PhysicsBodyComponent>('PhysicsBody')?.body;
        const dogRender = dogEntity?.getComponent<RenderComponent>('Render');
        const dogSprite = dogRender?.gameObject as Phaser.GameObjects.Sprite | undefined;

        const humanPlayer = humanEntity?.getComponent<PlayerComponent>('Player');
        const humanBody = humanEntity?.getComponent<PhysicsBodyComponent>('PhysicsBody')?.body;
        const humanRender = humanEntity?.getComponent<RenderComponent>('Render');
        const humanSprite = humanRender?.gameObject as Phaser.GameObjects.Sprite | undefined;

        for (const keyEnt of keyEntities) {
            const keyComp = keyEnt.getComponent<KeyComponent>('Key')!;
            const keyTransform = keyEnt.getComponent<TransformComponent>('Transform')!;
            const keyRender = keyEnt.getComponent<RenderComponent>('Render')!;
            const keySprite = keyRender.gameObject as Phaser.GameObjects.Sprite;
            const keyPhysBody = keyEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;

            if (!keySprite || !keySprite.scene) continue;

            if (keyComp.isPickedUp) {
                // Determine carrier, default to dog if carrier is not explicitly set
                const carrier = keyComp.carrier || 'dog';

                if (carrier === 'dog' && dogBody && dogSprite && dogPlayer) {
                    // Position key at mouth: 4 pixels higher and 2 to the left
                    const mouthOffsetX = (dogSprite.flipX ? 6 : -6) - 2;
                    const mouthY = dogBody.y + dogBody.height - 8;
                    if (keyComp.mouthSprite) {
                        keyComp.mouthSprite.setPosition(dogBody.x + dogBody.width / 2 + mouthOffsetX, mouthY);
                    }

                    // Drop key on Spacebar (Action.BARK)
                    if (inputManager.isJustDown(dogPlayer.playerIndex, Action.BARK)) {
                        const isFacingRight = dogSprite.flipX;
                        const dropX = dogBody.x + dogBody.width / 2 + (isFacingRight ? 12 : -12);
                        const dropY = dogBody.y + dogBody.height / 2;

                        keyTransform.x = dropX;
                        keyTransform.y = dropY;
                        keyPhysBody.enable = true;
                        keyPhysBody.reset(dropX, dropY);
                        keySprite.setVisible(true);
                        keySprite.clearTint();

                        keyComp.isPickedUp = false;
                        keyComp.carrier = null;
                        keyComp.justDroppedThisFrame = true;
                        if (keyComp.mouthSprite) {
                            keyComp.mouthSprite.destroy();
                            keyComp.mouthSprite = undefined;
                        }
                        keySprite.scene.sound.play('sfx_pickup', { volume: 0.3, pitch: 0.8 } as any);
                    }
                } else if (carrier === 'human' && humanBody && humanSprite && humanPlayer) {
                    // Position key in hand: shifted 4px right and down
                    const handX = humanBody.x - 2 + 4;
                    const handY = humanBody.y + humanBody.height / 2 + 2 + 4;
                    if (keyComp.mouthSprite) {
                        keyComp.mouthSprite.setPosition(handX, handY);
                    }

                    // Drop key on E (Action.INTERACT)
                    if (inputManager.isJustDown(humanPlayer.playerIndex, Action.INTERACT)) {
                        const isFacingRight = !humanSprite.flipX;
                        const dropX = humanBody.x + humanBody.width / 2 + (isFacingRight ? 12 : -12);
                        const dropY = humanBody.y + humanBody.height / 2;

                        keyTransform.x = dropX;
                        keyTransform.y = dropY;
                        keyPhysBody.enable = true;
                        keyPhysBody.reset(dropX, dropY);
                        keySprite.setVisible(true);
                        keySprite.clearTint();

                        keyComp.isPickedUp = false;
                        keyComp.carrier = null;
                        keyComp.justDroppedThisFrame = true;
                        if (keyComp.mouthSprite) {
                            keyComp.mouthSprite.destroy();
                            keyComp.mouthSprite = undefined;
                        }
                        keySprite.scene.sound.play('sfx_pickup', { volume: 0.3, pitch: 0.8 } as any);
                    }
                }
                continue;
            }

            // AABB overlap check
            const keyBox = {
                x: keyTransform.x - keyTransform.width / 2,
                y: keyTransform.y - keyTransform.height / 2,
                w: keyTransform.width,
                h: keyTransform.height
            };

            let dogOverlapping = false;
            if (dogBody) {
                const dogBox = { x: dogBody.x, y: dogBody.y, w: dogBody.width, h: dogBody.height };
                dogOverlapping =
                    dogBox.x < keyBox.x + keyBox.w + PICKUP_RANGE &&
                    dogBox.x + dogBox.w > keyBox.x - PICKUP_RANGE &&
                    dogBox.y < keyBox.y + keyBox.h + PICKUP_RANGE &&
                    dogBox.y + dogBox.h > keyBox.y - PICKUP_RANGE;
            }

            let humanOverlapping = false;
            if (humanBody) {
                const humanBox = { x: humanBody.x, y: humanBody.y, w: humanBody.width, h: humanBody.height };
                humanOverlapping =
                    humanBox.x < keyBox.x + keyBox.w + PICKUP_RANGE &&
                    humanBox.x + humanBox.w > keyBox.x - PICKUP_RANGE &&
                    humanBox.y < keyBox.y + keyBox.h + PICKUP_RANGE &&
                    humanBox.y + humanBox.h > keyBox.y - PICKUP_RANGE;
            }

            if (dogOverlapping || humanOverlapping) {
                // Glow yellow while near (only if the player overlapping can actually pick it up)
                const canDogPickUp = dogOverlapping && !dogCarryingState;
                const canHumanPickUp = humanOverlapping && !humanCarryingState;
                
                if (canDogPickUp || canHumanPickUp) {
                    keySprite.setTint(0xffee00);
                } else {
                    keySprite.clearTint();
                }

                // Check pickup
                if (canDogPickUp && dogPlayer && dogBody && dogSprite && inputManager.isJustDown(dogPlayer.playerIndex, Action.BARK)) {
                    this.pickupKey(keyComp, keySprite, keyPhysBody, dogSprite, dogBody, 'dog');
                    dogCarryingState = true;
                    inputManager.vibrate(dogPlayer.playerIndex, 'weak', 100);
                } else if (canHumanPickUp && humanPlayer && humanBody && humanSprite && inputManager.isJustDown(humanPlayer.playerIndex, Action.INTERACT)) {
                    this.pickupKey(keyComp, keySprite, keyPhysBody, humanSprite, humanBody, 'human');
                    humanCarryingState = true;
                    inputManager.vibrate(humanPlayer.playerIndex, 'weak', 100);
                }
            } else {
                keySprite.clearTint();
            }
        }
    }

    private pickupKey(
        keyComp: KeyComponent,
        keySprite: Phaser.GameObjects.Sprite,
        keyPhysBody: Phaser.Physics.Arcade.Body,
        carrierSprite: Phaser.GameObjects.Sprite,
        carrierBody: Phaser.Physics.Arcade.Body,
        carrierType: 'dog' | 'human'
    ): void {
        keyComp.isPickedUp = true;
        keyComp.carrier = carrierType;

        // Hide world key sprite
        keySprite.setVisible(false);
        keyPhysBody.enable = false;

        const scene = carrierSprite.scene;
        let carryX = carrierBody.x + carrierBody.width / 2;
        let carryY = carrierBody.y + carrierBody.height / 2;

        if (carrierType === 'dog') {
            const mouthOffsetX = (carrierSprite.flipX ? 6 : -6) - 2;
            carryX += mouthOffsetX;
            carryY = carrierBody.y + carrierBody.height - 8;
        } else {
            carryX = carrierBody.x - 2 + 4;
            carryY = carrierBody.y + carrierBody.height / 2 + 2 + 4;
        }

        const carrySprite = scene.add.sprite(
            carryX,
            carryY,
            keySprite.texture.key,
            keySprite.frame.name
        );
        carrySprite.setScale(0.6);
        carrySprite.setDepth(12);
        carrySprite.setTint(0xffee00);

        // Ignore on UI camera
        const uiCamera = scene.cameras.getCamera('uiCamera') || (scene as any).uiCamera;
        if (uiCamera) uiCamera.ignore(carrySprite);

        keyComp.mouthSprite = carrySprite;

        // Play pickup sound
        scene.sound.play('sfx_pickup', { volume: 0.5 });
    }
}
