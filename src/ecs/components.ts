import Phaser from 'phaser';
import { Component } from './Entity';

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
    isClimbing?: boolean;
    idleTime?: number;
    isBarking?: boolean;
}

export interface TriggerComponent extends Component {
    type: 'Trigger';
    channel: string;
    listenChannel?: string;
    triggerType: 'interact' | 'pressure';
    isActive: boolean;
    visualType: 'button' | 'lever';
}

export interface TriggerableComponent extends Component {
    type: 'Triggerable';
    listenChannel: string;
    state: boolean;
    targetType: 'gate' | 'platform';
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
    activated: boolean;
    playerActivated: 0 | 1 | null;
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

