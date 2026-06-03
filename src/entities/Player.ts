import Phaser from 'phaser';
import { PHYSICS, VISUAL } from '../constants';
import { InputManager, Action } from '../input/InputManager';

export type PlayerType = 'human' | 'dog';

export class Player {
    public gameObject: Phaser.GameObjects.Rectangle;
    public body: Phaser.Physics.Arcade.Body;
    public playerIndex: number;
    public type: PlayerType;

    private config: typeof PHYSICS.human | typeof PHYSICS.dog;
    private visual: typeof VISUAL.human | typeof VISUAL.dog;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        type: PlayerType,
        playerIndex: number,
    ) {
        this.type = type;
        this.playerIndex = playerIndex;
        this.config = type === 'human' ? PHYSICS.human : PHYSICS.dog;
        this.visual = type === 'human' ? VISUAL.human : VISUAL.dog;

        // Create visual rectangle
        const color = type === 'human' ? 0x222222 : 0xffffff;
        this.gameObject = scene.add.rectangle(
            x, y,
            this.visual.width,
            this.visual.height,
            color,
        );

        // Add outline for the dog to distinguish from bright backgrounds
        if (type === 'dog') {
            this.gameObject.setStrokeStyle(1, 0x333333);
        }

        // Set depth: players render above terrain
        this.gameObject.setDepth(10);

        // Enable physics
        scene.physics.add.existing(this.gameObject);
        this.body = this.gameObject.body as Phaser.Physics.Arcade.Body;

        // Configure physics body
        // The body is smaller than the visual for forgiving collision
        this.body.setSize(this.config.width, this.config.height);
        
        // Center the body within the visual, and align the bottom edges
        this.body.setOffset(
            (this.visual.width - this.config.width) / 2,
            (this.visual.height - this.config.height),
        );

        this.body.setCollideWorldBounds(false);
        this.body.setDragX(this.config.drag);
        this.body.setMaxVelocityX(this.config.moveSpeed);
    }

    update(inputManager: InputManager): void {
        const pi = this.playerIndex;

        // Horizontal movement: instant velocity setting (no friction/momentum delay)
        if (inputManager.isDown(pi, Action.MOVE_LEFT)) {
            this.body.setVelocityX(-this.config.moveSpeed);
        } else if (inputManager.isDown(pi, Action.MOVE_RIGHT)) {
            this.body.setVelocityX(this.config.moveSpeed);
        } else {
            this.body.setVelocityX(0);
        }

        // Jump: only when grounded
        if (inputManager.isJustDown(pi, Action.JUMP) && this.body.blocked.down) {
            this.body.setVelocityY(this.config.jumpVelocity);
        }
    }

    /** Get the center position of the player */
    get x(): number { return this.gameObject.x; }
    get y(): number { return this.gameObject.y; }

    get isGrounded(): boolean {
        return this.body.blocked.down;
    }

    setPosition(x: number, y: number): void {
        this.gameObject.setPosition(x, y);
    }
}
