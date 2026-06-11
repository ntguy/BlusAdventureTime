import { EntityManager, Entity } from '../Entity';
import { TriggerComponent, TriggerableComponent, PhysicsBodyComponent, RenderComponent, TransformComponent, PlayerComponent, MovingPlatformComponent } from '../components';
import { InputManager, Action } from '../../input/InputManager';

export class TriggerSystem {
    private channelStates: Map<string, boolean> = new Map();

    update(entityManager: EntityManager, delta: number, inputManager: InputManager): void {
        const triggers = entityManager.query('Transform', 'Trigger');
        const physicsEntities = entityManager.query('PhysicsBody', 'Transform');

        for (const triggerEnt of triggers) {
            const transform = triggerEnt.getComponent<TransformComponent>('Transform')!;
            const trigger = triggerEnt.getComponent<TriggerComponent>('Trigger')!;
            const render = triggerEnt.getComponent<RenderComponent>('Render')!;
            const sprite = render.gameObject as Phaser.GameObjects.Sprite;

            const triggerBox = {
                x: transform.x - transform.width / 2,
                y: transform.y - transform.height / 2,
                w: transform.width,
                h: transform.height
            };

            const prevActive = trigger.isActive;

            if (trigger.visualType === 'button') {
                // Button: active ONLY when a player or a cat is overlapping
                let isPressed = false;
                for (const physEnt of physicsEntities) {
                    if (physEnt.id === triggerEnt.id) continue;

                    const isPlayerOrCat = physEnt.hasComponent('Player') || physEnt.hasComponent('Cat');
                    if (!isPlayerOrCat) continue;

                    const body = physEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                    const entBox = {
                        x: body.x,
                        y: body.y,
                        w: body.width,
                        h: body.height
                    };

                    if (
                        entBox.x < triggerBox.x + triggerBox.w &&
                        entBox.x + entBox.w > triggerBox.x &&
                        entBox.y < triggerBox.y + triggerBox.h &&
                        entBox.y + entBox.h > triggerBox.y
                    ) {
                        isPressed = true;
                        break;
                    }
                }
                trigger.isActive = isPressed;
            } else if (trigger.triggerType === 'pressure') {
                // Pressure plates: check if any player or crate overlaps
                let isPressed = false;
                for (const physEnt of physicsEntities) {
                    if (physEnt.id === triggerEnt.id) continue;

                    const body = physEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                    const entBox = {
                        x: body.x,
                        y: body.y,
                        w: body.width,
                        h: body.height
                    };

                    if (
                        entBox.x < triggerBox.x + triggerBox.w &&
                        entBox.x + entBox.w > triggerBox.x &&
                        entBox.y < triggerBox.y + triggerBox.h &&
                        entBox.y + entBox.h > triggerBox.y
                    ) {
                        isPressed = true;
                        break;
                    }
                }
                trigger.isActive = isPressed;
            } else if (trigger.triggerType === 'interact') {
                // Interactable levers: check if human player overlaps and presses INTERACT
                const playerEntities = entityManager.query('Player', 'PhysicsBody');
                for (const playerEnt of playerEntities) {
                    const player = playerEnt.getComponent<PlayerComponent>('Player')!;
                    if (player.playerType !== 'human') continue;

                    const body = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                    const entBox = {
                        x: body.x,
                        y: body.y,
                        w: body.width,
                        h: body.height
                    };

                    if (
                        entBox.x < triggerBox.x + triggerBox.w &&
                        entBox.x + entBox.w > triggerBox.x &&
                        entBox.y < triggerBox.y + triggerBox.h &&
                        entBox.y + entBox.h > triggerBox.y
                    ) {
                        if (inputManager.isJustDown(player.playerIndex, Action.INTERACT)) {
                            console.log(`[TRIGGER SYSTEM DIAGNOSTIC] Interact pressed inside overlap. Player: [${entBox.x}, ${entBox.y}, ${entBox.w}, ${entBox.h}], Trigger: [${triggerBox.x}, ${triggerBox.y}, ${triggerBox.w}, ${triggerBox.h}]`);
                            trigger.isActive = !trigger.isActive;
                            
                            if (sprite && sprite.scene) {
                                sprite.scene.sound.play('sfx_pickup', { volume: 0.3 } as any);
                            }
                        }
                    } else {
                        // Log even if they didn't overlap but pressed E, to diagnose proximity
                        if (inputManager.isJustDown(player.playerIndex, Action.INTERACT)) {
                            console.log(`[TRIGGER SYSTEM DIAGNOSTIC] Interact pressed OUTSIDE overlap. Player: [${entBox.x}, ${entBox.y}, ${entBox.w}, ${entBox.h}], Trigger: [${triggerBox.x}, ${triggerBox.y}, ${triggerBox.w}, ${triggerBox.h}]`);
                        }
                    }
                }
            }

            // Sync visual representation of trigger
            if (sprite && typeof sprite.setFrame === 'function') {
                const idle = render.idleFrame !== undefined ? render.idleFrame : (trigger.visualType === 'lever' ? 64 : 148);
                const active = render.activeFrame !== undefined ? render.activeFrame : (trigger.visualType === 'lever' ? 66 : 149);
                sprite.setFrame(trigger.isActive ? active : idle);
            }

            // Render glow effect under trigger tiles if glowColor is set
            if (trigger.glowColor !== undefined) {
                if (!trigger.glowGraphics) {
                    trigger.glowGraphics = sprite.scene.add.graphics();
                    trigger.glowGraphics.setDepth(6); // above triggers (depth 5)
                    const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                    if (uiCamera) uiCamera.ignore(trigger.glowGraphics);
                }

                const g = trigger.glowGraphics;
                g.clear();

                const color = trigger.glowColor;
                // Draw a soft glow beneath the button/lever
                // Center glow - bottom strip
                g.fillStyle(color, 0.85);
                g.fillRect(transform.x - 9, transform.y + 9 - 4, 18, 5);
            }

            // Propagate if state changed
            if (trigger.isActive !== prevActive) {
                this.emitChannel(entityManager, trigger.channel, trigger.isActive);
            }
        }

        // Update overlays for gates and moving platforms
        const triggerables = entityManager.query('Triggerable');
        for (const ent of triggerables) {
            this.updateOverlay(ent, entityManager);
        }
        const platforms = entityManager.query('MovingPlatform');
        for (const ent of platforms) {
            this.updateOverlay(ent, entityManager);
        }
    }

    public emitChannel(entityManager: EntityManager, channel: string, isActive: boolean): void {
        this.channelStates.set(channel, isActive);

        // 1. Let triggers listening to this channel react
        const triggers = entityManager.query('Trigger');
        for (const ent of triggers) {
            const trigger = ent.getComponent<TriggerComponent>('Trigger')!;
            if (trigger.listenChannel === channel) {
                const prev = trigger.isActive;
                trigger.isActive = isActive;
                if (prev !== isActive) {
                    const render = ent.getComponent<RenderComponent>('Render')!;
                    const sprite = render?.gameObject as Phaser.GameObjects.Sprite;
                    if (sprite && typeof sprite.setFrame === 'function') {
                        const idle = render.idleFrame !== undefined ? render.idleFrame : (trigger.visualType === 'lever' ? 64 : 148);
                        const active = render.activeFrame !== undefined ? render.activeFrame : (trigger.visualType === 'lever' ? 66 : 149);
                        sprite.setFrame(trigger.isActive ? active : idle);
                        // Flip visual vertical orientation on gravity flip channel
                        if (channel === 'gravity_flip') {
                            sprite.setFlipY(isActive);
                        }
                    }
                    this.emitChannel(entityManager, trigger.channel, trigger.isActive);
                }
            }
        }

        // 2. Let triggerables react
        const triggerables = entityManager.query('Triggerable');
        for (const ent of triggerables) {
            const target = ent.getComponent<TriggerableComponent>('Triggerable')!;
            if (target.listenChannel === channel) {
                let targetActive = isActive;
                if (target.requireAll) {
                    const channelTriggers = triggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.channel === channel);
                    targetActive = channelTriggers.length > 0 && channelTriggers.every(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.isActive);
                }

                const prev = target.state;
                target.state = targetActive;

                if (prev !== targetActive) {
                    this.applyTriggerState(ent, targetActive);
                }
            }
        }

        // 3. Let moving platforms react
        const platforms = entityManager.query('MovingPlatform');
        for (const ent of platforms) {
            const plat = ent.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            if (plat.channel === channel) {
                let targetActive = isActive;
                if (plat.requireAll) {
                    const channelTriggers = triggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.channel === channel);
                    targetActive = channelTriggers.length > 0 && channelTriggers.every(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.isActive);
                }
                plat.channelState = targetActive;
            }
        }
    }

    private applyTriggerState(entity: Entity, isActive: boolean): void {
        const target = entity.getComponent<TriggerableComponent>('Triggerable')!;
        const render = entity.getComponent<RenderComponent>('Render')!;
        const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
        const sprite = render?.gameObject as Phaser.GameObjects.Sprite;
        const transform = entity.getComponent<TransformComponent>('Transform')!;

        if (target.targetType === 'gate') {
            if (physics && physics.body) {
                physics.body.enable = !isActive; // disable solid collision when open
            }
            if (sprite) {
                sprite.setVisible(!isActive); // make gate invisible when open
                if (sprite.scene) {
                    sprite.scene.sound.play('sfx_door_open', { volume: 0.3 } as any);
                }

                // Render/Toggle glow if color is set
                if (target.glowColor !== undefined) {
                    if (!target.glowGraphics) {
                        target.glowGraphics = sprite.scene.add.graphics();
                        target.glowGraphics.setDepth(9); // above gates (depth 8)
                        const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                        if (uiCamera) uiCamera.ignore(target.glowGraphics);

                        // Draw center bottom strip glow
                        const g = target.glowGraphics;
                        g.clear();
                        g.fillStyle(target.glowColor, 0.85);
                        g.fillRect(transform.x - 9, transform.y + 9 - 4, 18, 5);
                    }
                    target.glowGraphics.setVisible(!isActive);
                }
            }
        }
    }

    syncAll(entityManager: EntityManager): void {
        const triggers = entityManager.query('Trigger');
        for (const trEnt of triggers) {
            const tr = trEnt.getComponent<TriggerComponent>('Trigger')!;
            this.channelStates.set(tr.channel, tr.isActive);
        }

        const triggerables = entityManager.query('Triggerable');
        for (const ent of triggerables) {
            const target = ent.getComponent<TriggerableComponent>('Triggerable')!;
            let isActive = this.channelStates.get(target.listenChannel) || false;
            if (target.requireAll) {
                const channelTriggers = triggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.channel === target.listenChannel);
                isActive = channelTriggers.length > 0 && channelTriggers.every(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.isActive);
            }
            target.state = isActive;
            this.applyTriggerState(ent, isActive);
            this.updateOverlay(ent, entityManager);
        }

        // Sync moving platforms
        const platforms = entityManager.query('MovingPlatform');
        for (const ent of platforms) {
            const plat = ent.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            let isActive = this.channelStates.get(plat.channel) || false;
            if (plat.requireAll) {
                const channelTriggers = triggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.channel === plat.channel);
                isActive = channelTriggers.length > 0 && channelTriggers.every(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.isActive);
            }
            plat.channelState = isActive;
            this.updateOverlay(ent, entityManager);
        }
    }

    private updateOverlay(entity: Entity, entityManager: EntityManager): void {
        const triggerable = entity.getComponent<TriggerableComponent>('Triggerable');
        const movingPlatform = entity.getComponent<MovingPlatformComponent>('MovingPlatform');

        const requireAll = triggerable?.requireAll || movingPlatform?.requireAll;
        const channel = triggerable?.listenChannel || movingPlatform?.channel;

        if (!requireAll || !channel) {
            // Clean up overlay sprite if they were disabled
            const overlaySprite = triggerable?.overlaySprite || movingPlatform?.overlaySprite;
            if (overlaySprite) {
                overlaySprite.destroy();
                if (triggerable) triggerable.overlaySprite = undefined;
                if (movingPlatform) movingPlatform.overlaySprite = undefined;
            }
            return;
        }

        // Find all triggers for this channel
        const triggers = entityManager.query('Trigger');
        const channelTriggers = triggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.channel === channel);
        const total = channelTriggers.length;
        const active = channelTriggers.filter(trEnt => trEnt.getComponent<TriggerComponent>('Trigger')!.isActive).length;
        const remaining = Math.max(0, total - active);

        // Get position to draw the overlay sprite
        let x = 0;
        let y = 0;
        let scene: Phaser.Scene | undefined;

        if (triggerable && triggerable.targetType === 'gate') {
            const render = entity.getComponent<RenderComponent>('Render')!;
            const sprite = render?.gameObject as Phaser.GameObjects.Sprite;
            if (sprite) {
                x = sprite.x;
                y = sprite.y;
                scene = sprite.scene;
            }
        } else if (movingPlatform) {
            if (movingPlatform.tileSprites && movingPlatform.tileSprites.length > 0) {
                const sprite = movingPlatform.tileSprites[0];
                x = sprite.x;
                y = sprite.y;
                scene = sprite.scene;
            }
        }

        if (!scene) return;

        let overlaySprite = triggerable ? triggerable.overlaySprite : movingPlatform?.overlaySprite;

        if (remaining > 0) {
            const frameIndex = 160 + Math.min(9, remaining);
            if (!overlaySprite) {
                overlaySprite = scene.add.sprite(x, y, 'tilemap_packed', frameIndex);
                overlaySprite.setDepth(11); // above players (depth 10)
                if (triggerable) {
                    triggerable.overlaySprite = overlaySprite;
                } else if (movingPlatform) {
                    movingPlatform.overlaySprite = overlaySprite;
                }
                const uiCamera = scene.cameras.getCamera('uiCamera') || (scene as any).uiCamera;
                if (uiCamera) uiCamera.ignore(overlaySprite);
            } else {
                overlaySprite.setFrame(frameIndex);
                overlaySprite.setPosition(x, y);
                overlaySprite.setVisible(true);
            }
        } else {
            if (overlaySprite) {
                overlaySprite.setVisible(false);
            }
        }
    }
}
