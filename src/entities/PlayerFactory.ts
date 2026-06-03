import Phaser from 'phaser';
import { EntityManager, Entity } from '../ecs/Entity';
import { TransformComponent, RenderComponent, PhysicsBodyComponent, PlayerComponent } from '../ecs/components';
import { PHYSICS, VISUAL } from '../constants';

export function createPlayerEntity(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: 'human' | 'dog',
    playerIndex: 0 | 1,
    entityManager: EntityManager,
): Entity {
    const config = type === 'human' ? PHYSICS.human : PHYSICS.dog;
    const visual = type === 'human' ? VISUAL.human : VISUAL.dog;

    // 1. Create visual rectangle
    const color = type === 'human' ? 0x222222 : 0xffffff;
    const gameObject = scene.add.rectangle(
        x, y,
        visual.width,
        visual.height,
        color,
    );

    if (type === 'dog') {
        gameObject.setStrokeStyle(1, 0x333333);
    }

    gameObject.setDepth(10);

    // 2. Enable Arcade Physics
    scene.physics.add.existing(gameObject);
    const body = gameObject.body as Phaser.Physics.Arcade.Body;

    // Configure body size and bottom offset alignment
    body.setSize(config.width, config.height);
    body.setOffset(
        (visual.width - config.width) / 2,
        (visual.height - config.height),
    );

    body.setCollideWorldBounds(false);
    body.setDragX(config.drag);
    body.setMaxVelocityX(config.moveSpeed);

    // 3. Create ECS Entity and attach components
    const entity = entityManager.createEntity();

    entity.addComponent({
        type: 'Transform',
        x: gameObject.x,
        y: gameObject.y,
        width: visual.width,
        height: visual.height,
    } as TransformComponent);

    entity.addComponent({
        type: 'Render',
        gameObject: gameObject,
        depth: 10,
    } as RenderComponent);

    entity.addComponent({
        type: 'PhysicsBody',
        body: body,
        isGrounded: false,
    } as PhysicsBodyComponent);

    entity.addComponent({
        type: 'Player',
        playerIndex,
        playerType: type,
    } as PlayerComponent);

    return entity;
}
