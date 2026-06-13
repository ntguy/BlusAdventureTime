import Phaser from 'phaser';

export enum Action {
    MOVE_LEFT = 'MOVE_LEFT',
    MOVE_RIGHT = 'MOVE_RIGHT',
    JUMP = 'JUMP',
    MOVE_UP = 'MOVE_UP',
    MOVE_DOWN = 'MOVE_DOWN',
    INTERACT = 'INTERACT',
    BARK = 'BARK',
}

type KeyMapping = Record<Action, Phaser.Input.Keyboard.Key[]>;

export class InputManager {
    private playerKeys: KeyMapping[] = [];
    private scene: Phaser.Scene;

    // Track gamepad button states for "JustDown" logic
    private prevGamepadStates: Map<Action, boolean>[] = [new Map(), new Map()];
    private currGamepadStates: Map<Action, boolean>[] = [new Map(), new Map()];

    // Track global keyboard events to prevent missing fast keystrokes
    private keysPressedThisFrame: Set<number> = new Set();
    private keysReleasedThisFrame: Set<number> = new Set();

    private justDownActions: Set<Action>[] = [new Set(), new Set()];
    private justUpActions: Set<Action>[] = [new Set(), new Set()];

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.setupKeyboard();
        this.setupGamepadStates();

        // Listen to global key events
        const kb = this.scene.input.keyboard!;
        kb.on('keydown', (event: KeyboardEvent) => {
            this.keysPressedThisFrame.add(event.keyCode);
        });
        kb.on('keyup', (event: KeyboardEvent) => {
            this.keysReleasedThisFrame.add(event.keyCode);
        });
    }

    private setupKeyboard(): void {
        const kb = this.scene.input.keyboard!;

        // Player 1 (Human): WASD + E
        this.playerKeys[0] = {
            [Action.MOVE_LEFT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.A)],
            [Action.MOVE_RIGHT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.D)],
            [Action.JUMP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.W)],
            [Action.MOVE_UP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.W)],
            [Action.MOVE_DOWN]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.S)],
            [Action.INTERACT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.E)],
            [Action.BARK]: [],
        };

        // Player 2 (Dog): Arrow keys + / + SPACE
        this.playerKeys[1] = {
            [Action.MOVE_LEFT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)],
            [Action.MOVE_RIGHT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)],
            [Action.JUMP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)],
            [Action.MOVE_UP]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP)],
            [Action.MOVE_DOWN]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)],
            [Action.INTERACT]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH)],
            [Action.BARK]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)],
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
     * Poll gamepad/keyboard states and shift previous frames.
     * Should be called at the very beginning of the scene update loop.
     */
    update(): void {
        for (let pi = 0; pi < 2; pi++) {
            this.justDownActions[pi].clear();
            this.justUpActions[pi].clear();

            // Map keyboard transitions
            for (const action of Object.values(Action)) {
                const keys = this.playerKeys[pi]?.[action];
                if (keys) {
                    const hasPressed = keys.some(key => this.keysPressedThisFrame.has(key.keyCode));
                    const hasReleased = keys.some(key => this.keysReleasedThisFrame.has(key.keyCode));
                    if (hasPressed) {
                        this.justDownActions[pi].add(action);
                    }
                    if (hasReleased) {
                        this.justUpActions[pi].add(action);
                    }
                }
            }

            // Shift current gamepad states to previous states
            const prevGp = this.prevGamepadStates[pi];
            const currGp = this.currGamepadStates[pi];
            for (const action of Object.values(Action)) {
                prevGp.set(action, currGp.get(action) || false);
            }

            // Poll new current gamepad states
            for (const action of Object.values(Action)) {
                currGp.set(action, this.pollGamepadAction(pi, action));
            }
        }

        // Clear transient keyboard events for this frame
        this.keysPressedThisFrame.clear();
        this.keysReleasedThisFrame.clear();
    }

    private isDpadPressed(gamepad: Phaser.Input.Gamepad.Gamepad, direction: 'up' | 'down' | 'left' | 'right'): boolean {
        // 1. Check standard buttons
        if (direction === 'up' && (gamepad.up || (gamepad.buttons[12] && gamepad.buttons[12].pressed))) return true;
        if (direction === 'down' && (gamepad.down || (gamepad.buttons[13] && gamepad.buttons[13].pressed))) return true;
        if (direction === 'left' && (gamepad.left || (gamepad.buttons[14] && gamepad.buttons[14].pressed))) return true;
        if (direction === 'right' && (gamepad.right || (gamepad.buttons[15] && gamepad.buttons[15].pressed))) return true;

        // 2. Check hat switch (axis 9) common on macOS Bluetooth for PS4/PS5 controllers
        if (gamepad.axes && gamepad.axes.length > 9) {
            const val = gamepad.axes[9].value;
            if (val >= -1.0 && val <= 1.0) {
                if (direction === 'up') return val > 0.85 || val < -0.57;
                if (direction === 'down') return val > -0.28 && val < 0.57;
                if (direction === 'left') return val > 0.28 && val < 1.01;
                if (direction === 'right') return val > -0.85 && val < -0.01;
            }
        }

        // 3. Check separate axes (axis 4/5) fallback
        if (gamepad.axes && gamepad.axes.length > 5) {
            if (direction === 'left') return gamepad.axes[4].value < -0.5;
            if (direction === 'right') return gamepad.axes[4].value > 0.5;
            if (direction === 'up') return gamepad.axes[5].value < -0.5;
            if (direction === 'down') return gamepad.axes[5].value > 0.5;
        }

        return false;
    }

    /** Helper to poll direct boolean input states for gamepads */
    private pollGamepadAction(playerIndex: number, action: Action): boolean {
        // Map connected gamepads sequentially in connection order (ignoring raw sparse browser indices)
        if (!this.scene.input.gamepad) return false;
        const gamepads = this.scene.input.gamepad.getAll();
        const gamepad = gamepads[playerIndex];
        if (!gamepad) return false;

        switch (action) {
            case Action.MOVE_LEFT:
                return this.isDpadPressed(gamepad, 'left') || gamepad.leftStick.x < -0.3;
            case Action.MOVE_RIGHT:
                return this.isDpadPressed(gamepad, 'right') || gamepad.leftStick.x > 0.3;
            case Action.JUMP:
                return gamepad.A || (gamepad.buttons[0] && gamepad.buttons[0].pressed); // South button (Cross on DualSense / A on Xbox)
            case Action.MOVE_UP:
                return this.isDpadPressed(gamepad, 'up') || gamepad.leftStick.y < -0.3;
            case Action.MOVE_DOWN:
                return this.isDpadPressed(gamepad, 'down') || gamepad.leftStick.y > 0.3;
            case Action.INTERACT:
                return gamepad.X || (gamepad.buttons[2] && gamepad.buttons[2].pressed); // West button (Square on DualSense / X on Xbox)
            case Action.BARK:
                return gamepad.X || (gamepad.buttons[2] && gamepad.buttons[2].pressed); // West button (Square on DualSense / X on Xbox)
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
        // Retrieve keyboard transition state
        const isKeyboardJustDown = this.justDownActions[playerIndex]?.has(action) || false;

        // Check gamepad: was false in previous frame, is true in current frame
        const wasGamepadDown = this.prevGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadDown = this.currGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadJustDown = isGamepadDown && !wasGamepadDown;

        return isKeyboardJustDown || isGamepadJustDown;
    }

    /** Check if an action was just released this frame (Keyboard OR Gamepad) */
    isJustUp(playerIndex: number, action: Action): boolean {
        // Retrieve keyboard transition state
        const isKeyboardJustUp = this.justUpActions[playerIndex]?.has(action) || false;

        // Check gamepad: was true in previous frame, is false in current frame
        const wasGamepadDown = this.prevGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadDown = this.currGamepadStates[playerIndex]?.get(action) || false;
        const isGamepadJustUp = !isGamepadDown && wasGamepadDown;

        return isKeyboardJustUp || isGamepadJustUp;
    }

    /**
     * Vibrate the controller for a given player index.
     * @param playerIndex 0 = Human, 1 = Dog
     * @param intensity 'weak' | 'medium' | 'strong'
     * @param durationMs duration in milliseconds
     */
    vibrate(playerIndex: number, intensity: 'weak' | 'medium' | 'strong', durationMs: number): void {
        if (!this.scene.input.gamepad) return;
        const gamepads = this.scene.input.gamepad.getAll();
        const gamepad = gamepads[playerIndex];
        if (!gamepad) return;

        const pad = gamepad.pad;
        if (pad && pad.vibrationActuator && typeof pad.vibrationActuator.playEffect === 'function') {
            let weakMagnitude = 0;
            let strongMagnitude = 0;

            if (intensity === 'weak') {
                weakMagnitude = 0.25;
                strongMagnitude = 0.0;
            } else if (intensity === 'medium') {
                weakMagnitude = 0.5;
                strongMagnitude = 0.3;
            } else if (intensity === 'strong') {
                weakMagnitude = 0.8;
                strongMagnitude = 0.8;
            }

            pad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: durationMs,
                weakMagnitude: weakMagnitude,
                strongMagnitude: strongMagnitude
            }).catch(() => {
                // Ignore actuator playEffect errors
            });
        }
    }
}

