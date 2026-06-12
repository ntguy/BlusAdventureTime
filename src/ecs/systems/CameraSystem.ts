import Phaser from 'phaser';
import { EntityManager } from '../Entity';
import { PlayerComponent, TransformComponent, RenderComponent, PhysicsBodyComponent } from '../components';
import { GAME_WIDTH, GAME_HEIGHT, CAMERA } from '../../constants';

export class CameraSystem {
    private camera: Phaser.Cameras.Scene2D.Camera;
    private currentZoom: number;
    private targetZoom: number;
    private focusX: number = 0;
    private focusY: number = 0;
    private isInitialized: boolean = false;

    constructor(
        scene: Phaser.Scene,
        levelWidthPx: number,
        levelHeightPx: number,
    ) {
        this.camera = scene.cameras.main;

        // Set camera bounds to level dimensions
        this.camera.setBounds(0, 0, levelWidthPx, levelHeightPx);

        // Initial zoom
        this.currentZoom = CAMERA.zoomLevels[CAMERA.defaultZoomIndex];
        this.targetZoom = this.currentZoom;
        this.camera.setZoom(this.currentZoom);

        // Disable Phaser's default camera pixel rounding to allow manual screen-pixel snapping
        this.camera.roundPixels = false;
    }

    update(entityManager: EntityManager, delta: number): void {
        const playerEntities = entityManager.query('Player', 'Transform');
        
        let p1: TransformComponent | null = null;
        let p2: TransformComponent | null = null;

        for (const entity of playerEntities) {
            const player = entity.getComponent<PlayerComponent>('Player')!;
            const transform = entity.getComponent<TransformComponent>('Transform')!;
            
            // Check if player is active/visible
            const render = entity.getComponent<RenderComponent>('Render');
            const sprite = render?.gameObject as Phaser.GameObjects.Sprite;
            if (sprite && !sprite.visible) {
                continue;
            }

            const physBody = entity.getComponent<PhysicsBodyComponent>('PhysicsBody');
            const body = physBody?.body;
            if (body && !body.enable) {
                continue;
            }
            
            if (player.playerIndex === 0) {
                p1 = transform;
            } else if (player.playerIndex === 1) {
                p2 = transform;
            }
        }

        if (!p1 && !p2) {
            return;
        }

        // 1. Calculate midpoint and bounding box based on active players
        let midX: number;
        let midY: number;
        let requiredWidth: number;
        let requiredHeight: number;

        if (p1 && p2) {
            midX = (p1.x + p2.x) / 2;
            midY = (p1.y + p2.y) / 2;
            requiredWidth = Math.abs(p1.x - p2.x) + CAMERA.playerPaddingX * 2;
            requiredHeight = Math.abs(p1.y - p2.y) + CAMERA.playerPaddingY * 2;
        } else {
            const activePlayer = p1 || p2!;
            midX = activePlayer.x;
            midY = activePlayer.y;
            requiredWidth = CAMERA.playerPaddingX * 2;
            requiredHeight = CAMERA.playerPaddingY * 2;
        }

        if (!this.isInitialized) {
            this.focusX = midX;
            this.focusY = midY;
            this.isInitialized = true;
        }

        // 3. Keep target zoom locked to default zoom (never zoom out)
        this.targetZoom = CAMERA.zoomLevels[CAMERA.defaultZoomIndex];

        // 4. Lerp current zoom and focus position toward targets in a frame-rate independent way
        // Reference delta of 16.666ms (60 FPS)
        const followLerpFactor = 1 - Math.pow(1 - CAMERA.followLerp, delta / 16.666);
        const zoomLerpFactor = 1 - Math.pow(1 - CAMERA.zoomTransitionSpeed, delta / 16.666);

        this.focusX += (midX - this.focusX) * followLerpFactor;
        this.focusY += (midY - this.focusY) * followLerpFactor;

        if (Math.abs(this.currentZoom - this.targetZoom) > 0.015) {
            this.currentZoom += (this.targetZoom - this.currentZoom) * zoomLerpFactor;
        } else {
            this.currentZoom = this.targetZoom;
        }

        this.camera.setZoom(this.currentZoom);

        // 5. Calculate camera scroll position centering on (focusX, focusY)
        let scrollX = this.focusX - this.camera.width / 2;
        let scrollY = this.focusY - this.camera.height / 2;

        // 6. Clamp scroll position to level bounds
        scrollX = this.camera.clampX(scrollX);
        scrollY = this.camera.clampY(scrollY);

        // 7. Snap scroll coordinates to the physical screen pixel grid to avoid sub-pixel shimmering
        const roundedX = Math.round(scrollX * this.currentZoom) / this.currentZoom;
        const roundedY = Math.round(scrollY * this.currentZoom) / this.currentZoom;

        this.camera.setScroll(roundedX, roundedY);
    }
}
