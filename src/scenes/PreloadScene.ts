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

        // Load custom full-screen background image
        this.load.image('default_bg', 'assets/backgrounds/default_bg.png');

        // Load grassyMountain parallax layers
        this.load.image('grassyMountain_1', 'assets/backgrounds/grassyMountain/Plan 1.png');
        this.load.image('grassyMountain_2', 'assets/backgrounds/grassyMountain/Plan 2.png');
        this.load.image('grassyMountain_3', 'assets/backgrounds/grassyMountain/Plan 3.png');
        this.load.image('grassyMountain_4', 'assets/backgrounds/grassyMountain/Plan 4.png');

        // Load snowyMountain parallax layers
        this.load.image('snowyMountain_1', 'assets/backgrounds/snowyMountain/Plan 1.png');
        this.load.image('snowyMountain_2', 'assets/backgrounds/snowyMountain/Plan 2.png');
        this.load.image('snowyMountain_3', 'assets/backgrounds/snowyMountain/Plan 3.png');
        this.load.image('snowyMountain_4', 'assets/backgrounds/snowyMountain/Plan 4.png');
        this.load.image('snowyMountain_5', 'assets/backgrounds/snowyMountain/Plan 5.png');

        // Load Blu dog spritesheet (16x16 frames)
        this.load.spritesheet('bluSpritesheet', 'assets/sprites/bluSpritesheet.png', {
            frameWidth: 16,
            frameHeight: 16
        });

        // Load Human spritesheet (48x48 frames)
        this.load.spritesheet('humanSpritesheet', 'assets/sprites/HumanSpritesheet.png', {
            frameWidth: 48,
            frameHeight: 48
        });

        // Load White Cat Idle spritesheet (32x32 frames, vertical)
        this.load.spritesheet('catIdle', 'assets/sprites/WhiteCatIdle.png', {
            frameWidth: 32,
            frameHeight: 32
        });

        // Load White Cat Run spritesheet (32x32 frames, vertical)
        this.load.spritesheet('catRun', 'assets/sprites/WhiteCatRun.png', {
            frameWidth: 32,
            frameHeight: 32
        });

        // ── Audio ──
        // Load the single placeholder SFX for all sound effects
        const placeholderAudio = 'assets/audio/sfx/collect1.mp3';
        for (const key of Object.values(SFX)) {
            this.load.audio(key, placeholderAudio);
        }

        // Load the 7 custom barks
        for (let i = 1; i <= 7; i++) {
            this.load.audio(`sfx_bark_${i}`, `assets/audio/sfx/barks/bark ${i}.mp3`);
        }

        // Load dog death grumble SFX
        this.load.audio('sfx_grumble', 'assets/audio/sfx/grumble.mp3');

        // ── Level data ──
        this.load.json('test_level', 'assets/levels/test_level.json');
        this.load.json('Lvl1-Jun8', 'assets/levels/Lvl1-Jun8.json');
        this.load.json('Lvl2-Jun9', 'assets/levels/Lvl2-Jun9.json');
        this.load.json('Lvl3-Jun9', 'assets/levels/Lvl3-Jun9.json');
        this.load.json('Lvl4-Jun11', 'assets/levels/Lvl4-Jun11.json');
        this.load.json('LevelSelect', 'assets/levels/LevelSelect.json');
    }

    create(): void {
        // Create globally reusable animations for Blu (dog player)
        this.anims.create({
            key: 'blu_idle',
            frames: this.anims.generateFrameNumbers('bluSpritesheet', { start: 0, end: 2 }),
            frameRate: 6,
            repeat: -1
        });

        this.anims.create({
            key: 'blu_walk',
            frames: this.anims.generateFrameNumbers('bluSpritesheet', { start: 6, end: 8 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: 'blu_bark',
            frames: this.anims.generateFrameNumbers('bluSpritesheet', { start: 3, end: 4 }),
            frameRate: 8,
            repeat: 0
        });

        this.anims.create({
            key: 'blu_sit',
            frames: this.anims.generateFrameNumbers('bluSpritesheet', { start: 12, end: 13 }),
            frameRate: 4,
            repeat: -1
        });

        // Create human walking animation (row 2, images 1, 2, 3 -> frames 12, 13, 14)
        this.anims.create({
            key: 'human_walk',
            frames: this.anims.generateFrameNumbers('humanSpritesheet', { start: 12, end: 14 }),
            frameRate: 8,
            repeat: -1
        });

        // Create cat animations (6 frames each from vertical sheets)
        this.anims.create({
            key: 'cat_idle',
            frames: this.anims.generateFrameNumbers('catIdle', { start: 0, end: 5 }),
            frameRate: 5,
            repeat: -1
        });

        this.anims.create({
            key: 'cat_run',
            frames: this.anims.generateFrameNumbers('catRun', { start: 0, end: 5 }),
            frameRate: 10,
            repeat: -1
        });

        this.scene.start('MainMenuScene');
    }
}
