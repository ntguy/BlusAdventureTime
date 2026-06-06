import { EntityManager } from '../Entity';
import {
    MovingPlatformComponent,
    PhysicsBodyComponent,
    PlayerComponent,
    TransformComponent,
} from '../components';
import { TILE_SIZE } from '../../constants';

/**
 * Moves platforms between start and end positions based on trigger channel state.
 * 
 * Lever mode: toggle ON → move to end; toggle OFF → move to start.
 * Button mode: held → move toward end; released → stop in place; pressed again → resume.
 * 
 * Handles rider detection: any player whose bottom edge is within RIDER_TOLERANCE
 * of a platform tile's top edge gets the platform's frame delta added to their position.
 */
const RIDER_TOLERANCE = 4; // px — how close the player's feet must be to the platform top

export class MovingPlatformSystem {
    update(entityManager: EntityManager, delta: number): void {
        const platforms = entityManager.query('MovingPlatform');
        const players = entityManager.query('Player', 'PhysicsBody');

        const dtSec = delta / 1000;

        for (const platEnt of platforms) {
            const plat = platEnt.getComponent<MovingPlatformComponent>('MovingPlatform')!;

            // Calculate total travel distance
            const dx = plat.endX - plat.startX;
            const dy = plat.endY - plat.startY;
            const totalDist = Math.sqrt(dx * dx + dy * dy);

            if (totalDist < 0.01) continue; // no travel distance

            // Determine direction based on trigger mode
            if (plat.triggerMode === 'lever') {
                // Lever: ON → move to end (direction 1); OFF → move to start (direction -1)
                if (plat.channelState) {
                    plat.direction = plat.t >= 1 ? 0 : 1;
                } else {
                    plat.direction = plat.t <= 0 ? 0 : -1;
                }
            } else {
                // Button: active → move back and forth (bounce); inactive → stop in place
                if (plat.channelState) {
                    if (!plat.movingDirection) {
                        plat.movingDirection = 1;
                    }
                    if (plat.t >= 1) {
                        plat.movingDirection = -1;
                    } else if (plat.t <= 0) {
                        plat.movingDirection = 1;
                    }
                    plat.direction = plat.movingDirection;
                } else {
                    plat.direction = 0; // freeze in place
                }
            }

            // Advance t
            if (plat.direction !== 0) {
                const tDelta = (plat.velocity * dtSec) / totalDist;
                plat.t = Math.max(0, Math.min(1, plat.t + tDelta * plat.direction));
            }

            // Calculate new world position for origin tile
            const newX = plat.startX + dx * plat.t;
            const newY = plat.startY + dy * plat.t;

            // Frame delta for rider carrying
            const frameDX = newX - plat.prevX;
            const frameDY = newY - plat.prevY;

            // Move all tile sprites and bodies
            for (let i = 0; i < plat.tileSprites.length; i++) {
                const offset = plat.tileOffsets[i];
                const tileX = newX + offset.dx * TILE_SIZE;
                const tileY = newY + offset.dy * TILE_SIZE;
                const sprite = plat.tileSprites[i];
                const body = plat.tileBodies[i];

                sprite.setPosition(tileX, tileY);
                body.reset(tileX - body.width / 2, tileY - body.height / 2);
            }

            // Carry riders — check each player against each tile
            for (const playerEnt of players) {
                const playerComp = playerEnt.getComponent<PlayerComponent>('Player')!;
                if (playerComp.isDying) continue;

                const pBody = playerEnt.getComponent<PhysicsBodyComponent>('PhysicsBody')!.body;
                const playerBottom = pBody.y + pBody.height;
                const playerLeft = pBody.x;
                const playerRight = pBody.x + pBody.width;

                let isRiding = false;
                for (let i = 0; i < plat.tileBodies.length; i++) {
                    const tBody = plat.tileBodies[i];
                    const tileTop = tBody.y;
                    const tileLeft = tBody.x;
                    const tileRight = tBody.x + tBody.width;

                    // Player is standing on this tile if:
                    // 1. Player bottom is within RIDER_TOLERANCE of tile top
                    // 2. Player horizontally overlaps the tile
                    if (
                        Math.abs(playerBottom - tileTop) < RIDER_TOLERANCE &&
                        playerRight > tileLeft &&
                        playerLeft < tileRight &&
                        pBody.velocity.y >= 0 // not jumping upward through
                    ) {
                        isRiding = true;
                        break;
                    }
                }

                if (isRiding && (frameDX !== 0 || frameDY !== 0)) {
                    pBody.x += frameDX;
                    pBody.y += frameDY;
                }
            }

            // Update prev position for next frame
            plat.prevX = newX;
            plat.prevY = newY;

            // Render glow effect under platform tiles
            this.renderGlow(plat);
        }
    }

    /**
     * Called by TriggerSystem when a channel state changes.
     * Updates all platforms listening to that channel.
     */
    updateChannel(entityManager: EntityManager, channel: string, isActive: boolean): void {
        const platforms = entityManager.query('MovingPlatform');
        for (const platEnt of platforms) {
            const plat = platEnt.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            if (plat.channel === channel) {
                plat.channelState = isActive;
            }
        }
    }

    /**
     * Sync all platforms to their channels' current states.
     */
    syncAll(entityManager: EntityManager, channelStates: Map<string, boolean>): void {
        const platforms = entityManager.query('MovingPlatform');
        for (const platEnt of platforms) {
            const plat = platEnt.getComponent<MovingPlatformComponent>('MovingPlatform')!;
            plat.channelState = channelStates.get(plat.channel) || false;
        }
    }

    private renderGlow(plat: MovingPlatformComponent): void {
        if (!plat.glowGraphics) {
            // Create the graphics object on the first tile's scene
            if (plat.tileSprites.length > 0) {
                const scene = plat.tileSprites[0].scene;
                plat.glowGraphics = scene.add.graphics();
                plat.glowGraphics.setDepth(3); // below the platform sprites
                // Ignore on UI camera
                const uiCamera = scene.cameras.getCamera('uiCamera') || (scene as any).uiCamera;
                if (uiCamera) uiCamera.ignore(plat.glowGraphics);
            }
        }
        if (!plat.glowGraphics) return;

        const g = plat.glowGraphics;
        g.clear();

        const color = plat.glowColor;
        // Draw a glow rectangle beneath each tile (bottom edge)
        for (let i = 0; i < plat.tileSprites.length; i++) {
            const sprite = plat.tileSprites[i];
            const cx = sprite.x;
            const cy = sprite.y;
            const halfW = TILE_SIZE / 2;
            const halfH = TILE_SIZE / 2;

            // Center glow — bottom strip
            g.fillStyle(color, 0.5);
            g.fillRect(cx - halfW, cy + halfH - 2, TILE_SIZE, 3);

            // Wider, dimmer glow below
            g.fillStyle(color, 0.2);
            g.fillRect(cx - halfW - 2, cy + halfH + 1, TILE_SIZE + 4, 3);

            // Cast onto left neighbor
            g.fillStyle(color, 0.15);
            g.fillRect(cx - halfW - TILE_SIZE, cy + halfH - 1, TILE_SIZE, 2);

            // Cast onto right neighbor
            g.fillStyle(color, 0.15);
            g.fillRect(cx + halfW, cy + halfH - 1, TILE_SIZE, 2);
        }
    }
}
