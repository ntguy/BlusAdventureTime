import Phaser from 'phaser';

export enum Action {
    MOVE_LEFT = 'MOVE_LEFT',
    MOVE_RIGHT = 'MOVE_RIGHT',
    JUMP = 'JUMP',
    MOVE_DOWN = 'MOVE_DOWN',
    INTERACT = 'INTERACT',
}

interface KeyMapping {
    [Action.MOVE_LEFT]: Phaser.Input.Keyboard.Key[];
    [Action.MOVE_RIGHT]: Phaser.Input.Keyboard.Key[];
    [Action.JUMP]: Phaser.Input.Keyboard.Key[];
    [Action.MOVE_DOWN]: Phaser.Input.Keyboard.Key[];
    [Action.INTERACT]: Phaser.Input.Keyboard.Key[];
}

export class InputManager {
    private playerKeys: KeyMapping[] = [];
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.setupKeyboard();
    }

    private setupKeyboard(): void {
        const kb = this.scene.input.keyboard!;

        // Player 1 (Human): WASD + E
        this.playerKeys[0] = {
            [Action.MOVE_LEFT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.A)],
            [Action.MOVE_RIGHT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)],
            [Action.JUMP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.W)],
            [Action.MOVE_DOWN]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.S)],
            [Action.INTERACT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.E)],
        };

        // Player 2 (Dog): Arrow keys + /
        this.playerKeys[1] = {
            [Action.MOVE_LEFT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)],
            [Action.MOVE_RIGHT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)],
            [Action.JUMP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)],
            [Action.MOVE_DOWN]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)],
            [Action.INTERACT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH)],
        };
    }

    /** Check if an action is currently held down */
    isDown(playerIndex: number, action: Action): boolean {
        const keys = this.playerKeys[playerIndex]?.[action];
        if (!keys) return false;
        return keys.some(key => key.isDown);
    }

    /** Check if an action was just pressed this frame */
    isJustDown(playerIndex: number, action: Action): boolean {
        const keys = this.playerKeys[playerIndex]?.[action];
        if (!keys) return false;
        return keys.some(key => Phaser.Input.Keyboard.JustDown(key));
    }

    /** Check if an action was just released this frame */
    isJustUp(playerIndex: number, action: Action): boolean {
        const keys = this.playerKeys[playerIndex]?.[action];
        if (!keys) return false;
        return keys.some(key => Phaser.Input.Keyboard.JustUp(key));
    }
}
