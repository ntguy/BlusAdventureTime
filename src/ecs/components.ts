import Phaser from 'phaser';
import { Component, Entity } from './Entity';

export interface TransformComponent extends Component {
    type: 'Transform';
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PhysicsBodyComponent extends Component {
    type: 'PhysicsBody';
    body: Phaser.Physics.Arcade.Body;
    isGrounded: boolean;
    groundedTimer?: number; // buffer time in ms to handle physics jitter on dynamic entities
}

export interface RenderComponent extends Component {
    type: 'Render';
    gameObject: Phaser.GameObjects.GameObject;
    depth: number;
    idleFrame?: number;
    activeFrame?: number;
}

export interface PlayerComponent extends Component {
    type: 'Player';
    playerIndex: 0 | 1; // 0 = Human (Player 1), 1 = Dog (Player 2)
    playerType: 'human' | 'dog';
    spawnX: number;
    spawnY: number;
    isClimbing?: boolean;
    idleTime?: number;
    isBarking?: boolean;
    isDying?: boolean;
    dyingTimer?: number;
    airTime?: number;
    ladderSound?: Phaser.Sound.BaseSound;
}

export interface TriggerComponent extends Component {
    type: 'Trigger';
    channel: string;
    listenChannel?: string;
    triggerType: 'interact' | 'pressure';
    isActive: boolean;
    visualType: 'button' | 'lever';
    glowColor?: number;         // hex color for glow effect, e.g. 0xff5500
    glowGraphics?: Phaser.GameObjects.Graphics;  // cached glow rendering
}

export interface TriggerableComponent extends Component {
    type: 'Triggerable';
    listenChannel: string;
    state: boolean;
    targetType: 'gate' | 'platform';
    glowColor?: number;
    glowGraphics?: Phaser.GameObjects.Graphics;
    requireAll?: boolean;
    overlaySprite?: Phaser.GameObjects.Sprite;
}

// Future components to be used in Milestone 3
export interface CarryableComponent extends Component {
    type: 'Carryable';
    carriedBy: string | null; // entity id of carrier, or null
    weight: 'heavy' | 'light';
}

export interface CarrierComponent extends Component {
    type: 'Carrier';
    carrying: string | null; // entity id of carried object, or null
    canCarry: 'heavy' | 'light' | 'both';
}

export interface InteractableComponent extends Component {
    type: 'Interactable';
    interactionType: 'switch' | 'door' | 'checkpoint' | 'ladder';
    range: number;
}

export interface CheckpointComponent extends Component {
    type: 'Checkpoint';
    humanActive: boolean;
    dogActive: boolean;
    flickerRate: number;      // milliseconds between flickers
    flickerTile: number;      // GID of the alternative flicker tile
    flickerTimer: number;     // time accumulated for flicker
    showingAlt: boolean;      // currently showing alternative frame
    graphics?: Phaser.GameObjects.Graphics;
    isHD?: boolean;           // true if this is a combined Human/Dog spawn/checkpoint
}

export interface ExitDoorComponent extends Component {
    type: 'ExitDoor';
    playersPresent: Set<number>;
}

export interface LauncherComponent extends Component {
    type: 'Launcher';
    launchForce: number;
    isActivated: boolean;
    activationTimer: number;
}

export interface CatComponent extends Component {
    type: 'Cat';
    state: 'sleeping' | 'startled' | 'running';
    startX: number;
    direction: number;
    runSpeed: number;
    targetDistance: number;
    startleTimer: number;
    exclamation?: any;
    initialFacing?: 'left' | 'right';
}

export interface SignComponent extends Component {
    type: 'Sign';
    text: string;
    textObject?: Phaser.GameObjects.Text;
}

export interface FlyingComponent extends Component {
    type: 'Flying';
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    velocity: number;
    direction: 1 | -1;
    startFrame: number;
    animTimer: number;
    animFrame: number;
    collisionCooldown: number;
}

export interface SpikesComponent extends Component {
    type: 'Spikes';
    rotate180?: boolean;
}

export interface KeyComponent extends Component {
    type: 'Key';
    isPickedUp: boolean;
    carrier?: 'dog' | 'human' | null;
    mouthSprite?: Phaser.GameObjects.Sprite; // quarter-size key overlay on dog/human mouth/hand
    justDroppedThisFrame?: boolean;
}

export interface LGComponent extends Component {
    type: 'LG';
}

export interface MovingPlatformComponent extends Component {
    type: 'MovingPlatform';
    channel: string;
    startX: number;             // world px, center of origin tile at start position
    startY: number;
    endX: number;               // world px, center of origin tile at end position
    endY: number;
    velocity: number;           // px/s
    t: number;                  // 0..1 lerp parameter (0 = start, 1 = end)
    direction: 1 | -1 | 0;     // 1 = toward end, -1 = toward start, 0 = stopped
    channelState: boolean;      // last known trigger channel state
    triggerMode: 'lever' | 'button';  // determines direction behavior
    tileSprites: Phaser.GameObjects.Sprite[];
    tileBodies: Phaser.Physics.Arcade.Body[];
    tileOffsets: { dx: number; dy: number }[];  // relative offsets for multi-tile
    glowColor: number;          // hex glow color matching trigger pair
    glowGraphics?: Phaser.GameObjects.Graphics;
    prevX: number;              // previous frame world X (for rider delta calc)
    prevY: number;              // previous frame world Y
    movingDirection?: 1 | -1;   // tracks travel direction when button is held
    carriedEntities?: Entity[];  // entities attached to and moving with this platform
    requireAll?: boolean;
    overlaySprite?: Phaser.GameObjects.Sprite;
}

export interface LevelDoorComponent extends Component {
    type: 'LevelDoor';
    doorId: number;         // matches doorId in levelSelectMapping
    levelKey: string;       // Phaser cache key for the level JSON
    label: string;          // display text above the door, e.g. "LEVEL 1"
    labelText?: Phaser.GameObjects.Text;   // cached label text object
    promptText?: Phaser.GameObjects.Text;  // "E" prompt shown when player is near
    isPlayerNear: boolean;  // true when player overlaps the door
}
