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
                    trigger.glowGraphics.setDepth(3); // below players and triggers
                    const uiCamera = sprite.scene.cameras.getCamera('uiCamera') || (sprite.scene as any).uiCamera;
                    if (uiCamera) uiCamera.ignore(trigger.glowGraphics);
                }

                const g = trigger.glowGraphics;
                g.clear();

                const color = trigger.glowColor;
                // Draw a soft glow beneath the button/lever
                // Center glow - bottom strip
                g.fillStyle(color, 0.5);
                g.fillRect(transform.x - 9, transform.y + 9 - 2, 18, 3);

                // Wider, dimmer glow below
                g.fillStyle(color, 0.2);
                g.fillRect(transform.x - 11, transform.y + 9 + 1, 22, 3);

                // Cast onto left neighbor
                g.fillStyle(color, 0.15);
                g.fillRect(transform.x - 9 - 18, transform.y + 9 - 1, 18, 2);

                // Cast onto right neighbor
                g.fillStyle(color, 0.15);
                g.fillRect(transform.x + 9, transform.y + 9 - 1, 18, 2);
            }

            // Propagate if state changed
            if (trigger.isActive !== prevActive) {
                this.emitChannel(entityManager, trigger.channel, trigger.isActive);
            }
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
                const prev = target.state;
                target.state = isActive;

                if (prev !== isActive) {
                    this.applyTriggerState(ent, isActive);
                }
            }
        }

        // 3. Let moving platforms react
        const platforms = entityManager.query('MovingPlatform');
        for (const ent of platforms) {
            const plat = ent.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            if (plat.channel === channel) {
                plat.channelState = isActive;
            }
        }
    }

    private applyTriggerState(entity: Entity, isActive: boolean): void {
        const target = entity.getComponent<TriggerableComponent>('Triggerable')!;
        const render = entity.getComponent<RenderComponent>('Render')!;
        const physics = entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
        const sprite = render?.gameObject as Phaser.GameObjects.Sprite;

        if (target.targetType === 'gate') {
            if (physics && physics.body) {
                physics.body.enable = !isActive; // disable solid collision when open
            }
            if (sprite) {
                sprite.setVisible(!isActive); // make gate invisible when open
                if (sprite.scene) {
                    sprite.scene.sound.play('sfx_door_open', { volume: 0.3 } as any);
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
            const isActive = this.channelStates.get(target.listenChannel) || false;
            target.state = isActive;
            this.applyTriggerState(ent, isActive);
        }

        // Sync moving platforms
        const platforms = entityManager.query('MovingPlatform');
        for (const ent of platforms) {
            const plat = ent.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            plat.channelState = this.channelStates.get(plat.channel) || false;
        }
    }
}
