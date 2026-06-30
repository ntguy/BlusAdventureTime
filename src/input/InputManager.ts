import Phaser from 'phaser';

export enum Action {
    MOVE_LEFT = 'MOVE_LEFT',
    MOVE_RIGHT = 'MOVE_RIGHT',
    JUMP = 'JUMP',
    MOVE_UP = 'MOVE_UP',
    MOVE_DOWN = 'MOVE_DOWN',
    INTERACT = 'INTERACT',
    BARK = 'BARK',
    PAUSE = 'PAUSE',
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

    // Track which gamepad index maps to which player index (0 = Human, 1 = Dog)
    private gamepadPlayerMap: Map<number, number> = new Map();
    private static globalGamepadPlayerMap: Map<number, number> = new Map();

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.setupKeyboard();
        this.setupGamepadStates();

        // Restore global mappings
        for (const [gpIndex, pi] of Array.from(InputManager.globalGamepadPlayerMap.entries())) {
            this.gamepadPlayerMap.set(gpIndex, pi);
        }
 
        // Listen to global key events
        const kb = this.scene.input.keyboard!;
        if (kb) {
            kb.on('keydown', (event: KeyboardEvent) => {
                this.keysPressedThisFrame.add(event.keyCode);
            });
            kb.on('keyup', (event: KeyboardEvent) => {
                this.keysReleasedThisFrame.add(event.keyCode);
            });
        }

        // Pre-map connected gamepads sequentially if there are no conflicts
        this.preMapConnectedGamepads();
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
            [Action.PAUSE]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC), kb.addKey(Phaser.Input.Keyboard.KeyCodes.P)],
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
            [Action.PAUSE]: [kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC), kb.addKey(Phaser.Input.Keyboard.KeyCodes.P)],
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

    public static getActiveGamepads(scene: Phaser.Scene): Phaser.Input.Gamepad.Gamepad[] {
        if (!scene.input.gamepad) return [];
        const rawGamepads = scene.input.gamepad.gamepads || [];
        return rawGamepads.filter((gp): gp is Phaser.Input.Gamepad.Gamepad => gp !== null && gp !== undefined);
    }

    private getActiveGamepads(): Phaser.Input.Gamepad.Gamepad[] {
        return InputManager.getActiveGamepads(this.scene);
    }

    public static areGamepadsDuplicate(gp1: Phaser.Input.Gamepad.Gamepad, gp2: Phaser.Input.Gamepad.Gamepad): boolean {
        // If they have the same slot index, they are the same Phaser gamepad object.
        if (gp1.index === gp2.index) {
            return true;
        }

        // If they have the exact same ID string, they must be two separate physical controllers 
        // of the same model (e.g. two identical Xbox controllers, or two identical PS5 controllers).
        if (gp1.id === gp2.id) {
            return false;
        }

        // Check if there is any active input on either gamepad.
        // We only perform duplicate detection if at least one gamepad has some user activity.
        // If both are completely idle, we do not treat them as duplicates.
        let hasAnyActivity = false;

        // Compare buttons
        const len1 = gp1.buttons ? gp1.buttons.length : 0;
        const len2 = gp2.buttons ? gp2.buttons.length : 0;
        const minButtons = Math.min(len1, len2);
        for (let i = 0; i < minButtons; i++) {
            const b1 = gp1.buttons[i];
            const b2 = gp2.buttons[i];
            if (b1 && b2) {
                // If either has activity
                if (b1.pressed || b1.value > 0.15 || b2.pressed || b2.value > 0.15) {
                    hasAnyActivity = true;
                }
                // If their states differ, they cannot be duplicates
                if (b1.pressed !== b2.pressed || Math.abs(b1.value - b2.value) > 0.15) {
                    return false;
                }
            }
        }

        // Compare axes
        const axLen1 = gp1.axes ? gp1.axes.length : 0;
        const axLen2 = gp2.axes ? gp2.axes.length : 0;
        const minAxes = Math.min(axLen1, axLen2);
        for (let i = 0; i < minAxes; i++) {
            // Skip axis 9 (D-pad hat switch on some macOS/PlayStation drivers)
            if (i === 9) continue;
            
            const a1 = gp1.axes[i];
            const a2 = gp2.axes[i];
            if (a1 && a2) {
                // Ignore trigger axes (axes 4 & 5) when checking for activity, 
                // because triggers often default to -1.0 or 1.0 on boot.
                const isTriggerAxis = i === 4 || i === 5;
                if (!isTriggerAxis) {
                    if (Math.abs(a1.value) > 0.25 || Math.abs(a2.value) > 0.25) {
                        hasAnyActivity = true;
                    }
                }
                // Compare values
                if (Math.abs(a1.value - a2.value) > 0.2) {
                    return false;
                }
            }
        }

        // If identical, they are duplicates ONLY if there was actual user activity.
        return hasAnyActivity;
    }

    private setGamepadPlayerMapping(gpIndex: number, playerIndex: number): void {
        this.gamepadPlayerMap.set(gpIndex, playerIndex);
        InputManager.globalGamepadPlayerMap.set(gpIndex, playerIndex);
    }

    private deleteGamepadPlayerMapping(gpIndex: number): void {
        this.gamepadPlayerMap.delete(gpIndex);
        InputManager.globalGamepadPlayerMap.delete(gpIndex);
    }

    private preMapConnectedGamepads(): void {
        const gamepads = this.getActiveGamepads().filter(gp => gp && gp.connected);
        // Only pre-map automatically if there is exactly 1 gamepad connected
        // to avoid mapping duplicate controllers from DS4Windows/Steam Input.
        if (gamepads.length === 1) {
            this.setGamepadPlayerMapping(gamepads[0].index, 0);
        }
    }

    /**
     * Poll gamepad/keyboard states and shift previous frames.
     * Should be called at the very beginning of the scene update loop.
     */
    update(): void {
        // Dynamic gamepad mapping based on activity
        if (this.scene.input.gamepad) {
            // Pre-map sequentially if there are no duplicate conflicts and map is empty
            if (this.gamepadPlayerMap.size === 0) {
                this.preMapConnectedGamepads();
            }

            const gamepads = this.getActiveGamepads();

            // 1. Clean up stale bindings for disconnected pads
            const connectedIndices = new Set(gamepads.map(gp => gp.index));
            for (const gpIndex of Array.from(this.gamepadPlayerMap.keys())) {
                if (!connectedIndices.has(gpIndex)) {
                    this.deleteGamepadPlayerMapping(gpIndex);
                }
            }

            // 2. Scan connected pads for button/axis activity to bind to players
            gamepads.forEach(gamepad => {
                if (!this.gamepadPlayerMap.has(gamepad.index)) {
                    if (this.hasGamepadActivity(gamepad)) {
                        const assignedPlayers = Array.from(this.gamepadPlayerMap.values());
                        if (!assignedPlayers.includes(0)) {
                            this.setGamepadPlayerMapping(gamepad.index, 0); // Bind to Player 1 (Human)
                        } else if (!assignedPlayers.includes(1)) {
                            // Avoid duplicate binding if this gamepad matches Player 1's gamepad
                            const p1Gamepad = this.getGamepadForPlayer(0);
                            if (p1Gamepad && InputManager.areGamepadsDuplicate(gamepad, p1Gamepad)) {
                                return;
                            }
                            this.setGamepadPlayerMapping(gamepad.index, 1); // Bind to Player 2 (Dog)
                        }
                    }
                }
            });
        }

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

    private hasGamepadActivity(gamepad: Phaser.Input.Gamepad.Gamepad): boolean {
        // Check standard buttons (value > 0.3)
        if (gamepad.buttons) {
            for (let i = 0; i < gamepad.buttons.length; i++) {
                const btn = gamepad.buttons[i];
                if (btn && (btn.pressed || btn.value > 0.3)) {
                    return true;
                }
            }
        }
        // Check analog sticks (axes 0, 1, 2, 3 only - ignore triggers/sliders at 4, 5, 9, etc.)
        if (gamepad.axes) {
            const axesToCheck = [0, 1, 2, 3];
            for (const axisIdx of axesToCheck) {
                if (axisIdx < gamepad.axes.length) {
                    const axis = gamepad.axes[axisIdx];
                    if (axis && Math.abs(axis.value) > 0.35) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    private getGamepadForPlayer(playerIndex: number): Phaser.Input.Gamepad.Gamepad | null {
        if (!this.scene.input.gamepad) return null;
        const gamepads = this.getActiveGamepads();
        
        // Find which gamepad index is mapped to this playerIndex
        for (const [gpIndex, pi] of Array.from(this.gamepadPlayerMap.entries())) {
            if (pi === playerIndex) {
                const gp = gamepads.find(g => g.index === gpIndex);
                if (gp) return gp;
            }
        }

        // Fallback: If no gamepad is mapped to this player yet, but they are connected,
        // and we only have 1 active player index mapped or none, we can do a default mapping
        // to avoid waiting for a button press if they want to move instantly.
        // But since we want to avoid raw silent controller issues, we only do this fallback
        // if there's exactly 1 gamepad connected (so no raw/virtual dual-controller conflicts).
        if (this.gamepadPlayerMap.size === 0 && gamepads.length === 1) {
            const fallbackGp = gamepads[0];
            if (playerIndex === 0) {
                this.setGamepadPlayerMapping(fallbackGp.index, 0);
                return fallbackGp;
            }
        }

        return null;
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
        // Map connected gamepads using dynamic bindings
        if (!this.scene.input.gamepad) return false;
        const gamepad = this.getGamepadForPlayer(playerIndex);
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
            case Action.PAUSE:
                return (gamepad.buttons[9] && gamepad.buttons[9].pressed) || (gamepad.buttons[8] && gamepad.buttons[8].pressed);
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
        const gamepad = this.getGamepadForPlayer(playerIndex);
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

