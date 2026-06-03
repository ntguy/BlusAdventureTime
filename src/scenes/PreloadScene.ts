import Phaser from 'phaser';
import { TILE_SIZE, TILESET_COLS, TILESET_ROWS, BG_TILE_SIZE, BG_TILESET_COLS, BG_TILESET_ROWS, GAME_WIDTH, GAME_HEIGHT, SFX } from '../constants';

export class PreloadScene extends Phaser.Scene {
    constructor() {
        super({ key: 'PreloadScene' });
    }

    preload(): void {
        // Loading progress display
        const width = GAME_WIDTH;
        const height = GAME_HEIGHT;

        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x333333, 0.8);
        progressBox.fillRect(width / 2 - 80, height / 2 - 10, 160, 20);

        const loadingText = this.add.text(width / 2, height / 2 - 24, 'Loading...', {
            fontSize: '10px',
            color: '#ffffff',
        }).setOrigin(0.5);

        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0x4ade80, 1);
            progressBar.fillRect(width / 2 - 76, height / 2 - 6, 152 * value, 12);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        // ── Tilesets ──
        this.load.spritesheet('tilemap_packed', 'assets/tilesets/tilemap_packed.png', {
            frameWidth: TILE_SIZE,
            frameHeight: TILE_SIZE,
            startFrame: 0,
            endFrame: TILESET_COLS * TILESET_ROWS - 1,
        });

        // Background tileset (24×24 tiles, 8 cols × 3 rows)
        this.load.spritesheet('bg_tilemap_packed', 'assets/backgrounds/tilemap-backgrounds_packed.png', {
            frameWidth: BG_TILE_SIZE,
            frameHeight: BG_TILE_SIZE,
            startFrame: 0,
            endFrame: BG_TILESET_COLS * BG_TILESET_ROWS - 1,
        });

        // ── Audio ──
        // Load the single placeholder SFX for all sound effects
        const placeholderAudio = 'assets/audio/sfx/collect1.mp3';
        for (const key of Object.values(SFX)) {
            this.load.audio(key, placeholderAudio);
        }

        // ── Level data ──
        this.load.json('test_level', 'assets/levels/test_level.json');
    }

    create(): void {
        this.scene.start('MainMenuScene');
    }
}
