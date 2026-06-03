import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, CAMERA } from '../constants';
import { Player } from '../entities/Player';

export class CameraSystem {
    private camera: Phaser.Cameras.Scene2D.Camera;
    private followTarget: Phaser.GameObjects.Zone;
    private currentZoom: number;
    private targetZoom: number;

    constructor(
        scene: Phaser.Scene,
        levelWidthPx: number,
        levelHeightPx: number,
    ) {
        this.camera = scene.cameras.main;

        // Create invisible zone for camera to follow
        this.followTarget = scene.add.zone(0, 0, 1, 1);

        // Initial zoom
        this.currentZoom = CAMERA.zoomLevels[CAMERA.defaultZoomIndex];
        this.targetZoom = this.currentZoom;
        this.camera.setZoom(this.currentZoom);

        // Camera follows the midpoint zone with lerp smoothing
        this.camera.startFollow(this.followTarget, false, CAMERA.followLerp, CAMERA.followLerp);

        // Set camera bounds to level dimensions
        this.camera.setBounds(0, 0, levelWidthPx, levelHeightPx);
    }

    update(player1: Player, player2: Player): void {
        // 1. Calculate midpoint between players
        const midX = (player1.x + player2.x) / 2;
        const midY = (player1.y + player2.y) / 2;
        this.followTarget.setPosition(midX, midY);

        // 2. Calculate bounding box needed to show both players
        const requiredWidth = Math.abs(player1.x - player2.x) + CAMERA.playerPaddingX * 2;
        const requiredHeight = Math.abs(player1.y - player2.y) + CAMERA.playerPaddingY * 2;

        // 3. Find the most zoomed-in discrete level that fits both players
        this.targetZoom = CAMERA.zoomLevels[CAMERA.zoomLevels.length - 1]; // start with most zoomed out
        for (const zoom of CAMERA.zoomLevels) {
            const viewWidth = GAME_WIDTH / zoom;
            const viewHeight = GAME_HEIGHT / zoom;
            if (viewWidth >= requiredWidth && viewHeight >= requiredHeight) {
                this.targetZoom = zoom;
                break;
            }
        }

        // 4. Lerp current zoom toward target for smooth-ish transition
        if (Math.abs(this.currentZoom - this.targetZoom) > 0.01) {
            this.currentZoom = Phaser.Math.Linear(
                this.currentZoom,
                this.targetZoom,
                CAMERA.zoomTransitionSpeed,
            );
        } else {
            this.currentZoom = this.targetZoom;
        }

        this.camera.setZoom(this.currentZoom);
    }
}
