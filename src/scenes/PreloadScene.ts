import Phaser from 'phaser';
import { TILE_SIZE, TILESET_COLS, TILESET_ROWS, FALL_TILESET_COLS, FALL_TILESET_ROWS, INDUSTRIAL_TILESET_COLS, INDUSTRIAL_TILESET_ROWS, GAME_WIDTH, GAME_HEIGHT, SFX } from '../constants';

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

        this.load.spritesheet('tilemap_packed_fall', 'assets/tilesets/tilemap_packed_fall.png', {
            frameWidth: TILE_SIZE,
            frameHeight: TILE_SIZE,
            startFrame: 0,
            endFrame: FALL_TILESET_COLS * FALL_TILESET_ROWS - 1,
        });

        this.load.spritesheet('tilemap_packed_industrial', 'assets/tilesets/tilemap_packed_industrial.png', {
            frameWidth: TILE_SIZE,
            frameHeight: TILE_SIZE,
            startFrame: 0,
            endFrame: INDUSTRIAL_TILESET_COLS * INDUSTRIAL_TILESET_ROWS - 1,
        });

        this.load.spritesheet('tilemap_characters', 'assets/sprites/tilemap-characters_packed.png', {
            frameWidth: 24,
            frameHeight: 24,
            startFrame: 0,
            endFrame: 26,
        });



        // (default_bg.png was removed as it is not used in MainMenuScene)

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

        // Load fallTrees parallax layers
        this.load.image('fallTrees_1', 'assets/backgrounds/fallTrees/Plan-1.png');
        this.load.image('fallTrees_2', 'assets/backgrounds/fallTrees/Plan-2.png');
        this.load.image('fallTrees_3', 'assets/backgrounds/fallTrees/Plan-3.png');
        this.load.image('fallTrees_4', 'assets/backgrounds/fallTrees/Plan-4.png');
        this.load.image('fallTrees_5', 'assets/backgrounds/fallTrees/Plan-5.png');
        this.load.image('fallTrees_6', 'assets/backgrounds/fallTrees/Plan-6.png');

        // Load factory parallax layers
        this.load.image('factory_1', 'assets/backgrounds/factory/1.png');
        this.load.image('factory_2', 'assets/backgrounds/factory/2.png');
        this.load.image('factory_3', 'assets/backgrounds/factory/3.png');

        // Load Blu real-life photo for victory credits
        this.load.image('bluRealPhoto', 'assets/sprites/bluRealPhoto.jpg');

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
        const sfxFiles: Record<string, string> = {
            sfx_jump: 'assets/audio/sfx/collect1.mp3',
            sfx_land: 'assets/audio/sfx/landOnGround.mp3',
            sfx_pickup: 'assets/audio/sfx/collect1.mp3',
            sfx_drop: 'assets/audio/sfx/collect1.mp3',
            sfx_door_open: 'assets/audio/sfx/doorOpen.mp3',
            sfx_checkpoint: 'assets/audio/sfx/checkpoint.mp3',
            sfx_death: 'assets/audio/sfx/collect1.mp3',
            sfx_bark: 'assets/audio/sfx/collect1.mp3',
            sfx_jdeath: 'assets/audio/sfx/JDeath.mp3',
            sfx_button: 'assets/audio/sfx/Button.mp3',
            sfx_launcher: 'assets/audio/sfx/launcher.mp3',
            sfx_menu_select: 'assets/audio/sfx/MenuSelect.mp3',
            sfx_switch_on: 'assets/audio/sfx/SwitchOn.mp3',
            sfx_switch_off: 'assets/audio/sfx/SwitchOff.mp3',
            sfx_unlock: 'assets/audio/sfx/unlock.mp3',
            sfx_ladder: 'assets/audio/sfx/ladder.mp3'
        };

        for (const [key, path] of Object.entries(sfxFiles)) {
            this.load.audio(key, path);
        }

        // Load background music tracks
        this.load.audio('mus_summer', 'assets/audio/music/summerMusic.mp3');
        this.load.audio('mus_winter', 'assets/audio/music/WinterMusic.mp3');
        this.load.audio('mus_fall', 'assets/audio/music/fallMusic.mp3');

        // Load the 7 custom barks
        for (let i = 1; i <= 7; i++) {
            this.load.audio(`sfx_bark_${i}`, `assets/audio/sfx/barks/bark ${i}.mp3`);
        }

        // Load dog death grumble SFX
        this.load.audio('sfx_grumble', 'assets/audio/sfx/grumble.mp3');

        // ── Level data ──
        this.load.json('test_level', 'assets/levels/test_level.json');
        this.load.json('Lvl1', 'assets/levels/Lvl1.json');
        this.load.json('Lvl2', 'assets/levels/Lvl2.json');
        this.load.json('Lvl3', 'assets/levels/Lvl3.json');
        this.load.json('Lvl4', 'assets/levels/Lvl4.json');
        this.load.json('Lvl5', 'assets/levels/Lvl5.json');
        this.load.json('Lvl6', 'assets/levels/Lvl6.json');
        this.load.json('Lvl7', 'assets/levels/Lvl7.json');
        this.load.json('Lvl8', 'assets/levels/Lvl8.json');
        this.load.json('Lvl9', 'assets/levels/Lvl9.json');
        this.load.json('LevelSelect', 'assets/levels/LevelSelect.json');
    }

    create(): void {
        // Convert all background textures to POT (Power of Two) to prevent WebGL NPOT blurriness
        const bgKeys = [
            'grassyMountain_1', 'grassyMountain_2', 'grassyMountain_3', 'grassyMountain_4',
            'snowyMountain_1', 'snowyMountain_2', 'snowyMountain_3', 'snowyMountain_4', 'snowyMountain_5',
            'fallTrees_1', 'fallTrees_2', 'fallTrees_3', 'fallTrees_4', 'fallTrees_5', 'fallTrees_6',
            'factory_1', 'factory_2', 'factory_3'
        ];

        bgKeys.forEach(key => {
            const originalTexture = this.textures.get(key);
            if (!originalTexture) return;

            const img = originalTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
            if (!img) return;

            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            if (key === 'fallTrees_1') {
                canvas.height = 1024;
            } else {
                canvas.height = 512;
            }

            const ctx = canvas.getContext('2d')!;
            ctx.imageSmoothingEnabled = false;
            (ctx as any).mozImageSmoothingEnabled = false;
            (ctx as any).webkitImageSmoothingEnabled = false;
            (ctx as any).msImageSmoothingEnabled = false;

            if (key === 'fallTrees_1') {
                ctx.drawImage(img, 0, 0, 1024, 512);

                // Sample bottom-most pixel of the stretched image (at y = 511) to extend the grass color downwards
                const pixelData = ctx.getImageData(0, 511, 1, 1).data;
                const grassColor = `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`;
                ctx.fillStyle = grassColor;
                ctx.fillRect(0, 512, 1024, 512);
            } else {
                ctx.drawImage(img, 0, 0, 1024, 512);
            }

            this.textures.remove(key);
            const newTex = this.textures.addCanvas(key, canvas);
            if (newTex) {
                newTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
            }
        });

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
