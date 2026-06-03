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

    // Track gamepad button states for "JustDown" logic
    private prevGamepadStates: Map<Action, boolean>[] = [new Map(), new Map()];
    private currGamepadStates: Map<Action, boolean>[] = [new Map(), new Map()];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.setupKeyboard();
        this.setupGamepadStates();
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

    private setupGamepadStates(): void {
        for (let pi = 0; pi < 2; pi++) {
            for (const action of Object.values(Action)) {
                this.prevGamepadStates[pi].set(action, false);
                this.currGamepadStates[pi].set(action, false);
            }
        }
    }

    /**
     * Poll gamepad states and shift previous frames.
     * Should be called at the very beginning of the scene update loop.
     */
    update(): void {
        for (let pi = 0; pi < 2; pi++) {
            const prev = this.prevGamepadStates[pi];
            const curr = this.currGamepadStates[pi];

            // 1. Shift current states to previous states
            for (const action of Object.values(Action)) {
                prev.set(action, curr.get(action) || false);
            }

            // 2. Poll new current states
            for (const action of Object.values(Action)) {
                curr.set(action, this.pollGamepadAction(pi, action));
            }
        }
    }

    /** Helper to poll direct boolean input states for gamepads */
    private pollGamepadAction(playerIndex: number, action: Action): boolean {
        // Player 1 (Human) maps to Gamepad index 0, Player 2 (Dog) maps to Gamepad index 1
        if (!this.scene.input.gamepad) return false;
        const gamepad = this.scene.input.gamepad.getPad(playerIndex);
        if (!gamepad) return false;

        switch (action) {
            case Action.MOVE_LEFT:
                return gamepad.left || gamepad.leftStick.x < -0.3;
            case Action.MOVE_RIGHT:
                return gamepad.right || gamepad.leftStick.x > 0.3;
            case Action.JUMP:
                return gamepad.A; // South button (Cross on DualSense / A on Xbox)
            case Action.MOVE_DOWN:
                return gamepad.down || gamepad.leftStick.y > 0.3;
            case Action.INTERACT:
                return gamepad.X || gamepad.B; // West or East buttons (Square/Circle on DualSense / X/B on Xbox)
            default:
                return false;
        }
    }

    /** Check if an action is currently held down (Keyboard OR Gamepad) */
    isDown(playerIndex: number, action: Action): boolean {
        // Check keyboard first
        const keys = this.playerKeys[playerIndex]?.[action];
        const isKeyboardDown = keys ? keys.some(key => key.isDown) : false;

        // Check gamepad
        const isGamepadDown = this.currGamepadStates[playerIndex]?.get(action) || false;

        return isKeyboardDown || isGamepadDown;
    }

    /** Check if an action was just pressed this frame (Keyboard OR Gamepad) */
    isJustDown(playerIndex: number, action: Action): boolean {
        // Check keyboard first
        const keys = this.playerKeys[playerIndex]?.[action];
        const isKeyboardJustDown = keys ? keys.some(key => Phaser.Input.Keyboard.JustDown(key)) : false;

        // Check gamepad: was false in previous frame, is true in current frame
        const wasGamepadDown = this.prevGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadDown = this.currGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadJustDown = isGamepadDown && !wasGamepadDown;

        return isKeyboardJustDown || isGamepadJustDown;
    }

    /** Check if an action was just released this frame (Keyboard OR Gamepad) */
    isJustUp(playerIndex: number, action: Action): boolean {
        // Check keyboard first
        const keys = this.playerKeys[playerIndex]?.[action];
        const isKeyboardJustUp = keys ? keys.some(key => Phaser.Input.Keyboard.JustUp(key)) : false;

        // Check gamepad: was true in previous frame, is false in current frame
        const wasGamepadDown = this.prevGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadDown = this.currGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadJustUp = !isGamepadDown && wasGamepadDown;

        return isKeyboardJustUp || isGamepadJustUp;
    }
}

