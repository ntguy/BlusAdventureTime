import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';
import { LevelLoader } from '../levels/LevelLoader';

interface BarkTiming {
    beat: number;
    line: number;
    word: number;
    text: string;
}

export class VictoryScene extends Phaser.Scene {
    private backgroundSprites: Phaser.GameObjects.Image[] = [];
    private human!: Phaser.GameObjects.Sprite;
    private blu!: Phaser.GameObjects.Sprite;
    private wordTexts: Phaser.GameObjects.Text[] = [];
    private currentLineIndex: number = -1;
    
    // UI elements & navigation
    private buttonsContainer!: Phaser.GameObjects.Container;
    private creditsOverlay!: Phaser.GameObjects.Container;
    
    private selectedIndex: number = 0;
    private menuOptions = [
        { label: 'CREDITS', action: 'credits' },
        { label: 'LEVEL SELECT', action: 'exit' }
    ];
    private optionTextObjects: Phaser.GameObjects.Text[] = [];
    private highlightBox!: Phaser.GameObjects.Graphics;
    
    private menuVisible: boolean = false;
    private creditsOpen: boolean = false;
    private lastAxisY: number = 0;
    private createTime: number = 0;

    // Song config: 110 BPM (approx 545ms per beat)
    private beatDuration: number = 545;
    private songTimeline: BarkTiming[] = [
        // Line 1: Happy grad day to you,
        { beat: 0,   line: 0, word: 0, text: "Hap" },
        { beat: 0.5, line: 0, word: 0, text: "py" },
        { beat: 1,   line: 0, word: 1, text: "grad" },
        { beat: 2,   line: 0, word: 2, text: "day" },
        { beat: 3,   line: 0, word: 3, text: "to" },
        { beat: 4,   line: 0, word: 4, text: "you," },

        // Line 2: Happy grad day to you! (starts at beat 6.5)
        { beat: 6.5, line: 1, word: 0, text: "Hap" },
        { beat: 7,   line: 1, word: 0, text: "py" },
        { beat: 7.5, line: 1, word: 1, text: "grad" },
        { beat: 8.5, line: 1, word: 2, text: "day" },
        { beat: 9.5, line: 1, word: 3, text: "to" },
        { beat: 10.5,line: 1, word: 4, text: "you!" },

        // Line 3: Happy grad day to mommy! (starts at beat 13.0)
        { beat: 13,  line: 2, word: 0, text: "Hap" },
        { beat: 13.5,line: 2, word: 0, text: "py" },
        { beat: 14,  line: 2, word: 1, text: "grad" },
        { beat: 15,  line: 2, word: 2, text: "day" },
        { beat: 16,  line: 2, word: 3, text: "to" },
        { beat: 17,  line: 2, word: 4, text: "mom" },
        { beat: 18,  line: 2, word: 4, text: "my!" },

        // Line 4: Happy grad day to you!!! (starts at beat 20.5)
        { beat: 20.5,line: 3, word: 0, text: "Hap" },
        { beat: 21,  line: 3, word: 0, text: "py" },
        { beat: 21.5,line: 3, word: 1, text: "grad" },
        { beat: 22.5,line: 3, word: 2, text: "day" },
        { beat: 23.5,line: 3, word: 3, text: "to" },
        { beat: 24.5,line: 3, word: 4, text: "you!!!" }
    ];
    
    private songLines: string[][] = [
        ["Happy", "grad", "day", "to", "you,"],
        ["Happy", "grad", "day", "to", "you!"],
        ["Happy", "grad", "day", "to", "mommy!"],
        ["Happy", "grad", "day", "to", "you!!!"]
    ];

    constructor() {
        super({ key: 'VictoryScene' });
    }

    create(): void {
        this.createTime = this.time.now;
        this.selectedIndex = 0;
        this.menuVisible = false;
        this.creditsOpen = false;

        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        const floorY = centerY + 70; // ground level where characters stand

        // 1. Create Parallax Background (scaled statically to fit screen without looping)
        this.cameras.main.setBackgroundColor('#c9d7e7');
        const bgLayers = ['grassyMountain_4', 'grassyMountain_3', 'grassyMountain_2', 'grassyMountain_1'];
        bgLayers.forEach(key => {
            const tex = this.textures.get(key);
            if (tex) tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
            const img = this.add.image(centerX, centerY, key);
            img.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
            this.backgroundSprites.push(img);
        });

        // 2. Draw ground platform (cohesive with pause menu card styling)
        const pW = 380;
        const pH = 190;
        const pX = centerX - pW / 2;
        const pY = floorY;

        const graphics = this.add.graphics();
        
        // Shadow
        graphics.fillStyle(0x000000, 0.5);
        graphics.fillRoundedRect(pX + 6, pY + 6, pW, pH, 8);

        // Very dark forest wood bark brown background
        graphics.fillStyle(0x1a110a, 0.96);
        graphics.fillRoundedRect(pX, pY, pW, pH, 8);

        // Outer border (Rich walnut brown)
        graphics.lineStyle(3, 0x3d2314, 1);
        graphics.strokeRoundedRect(pX, pY, pW, pH, 8);

        // Inner border (Warm caramel/gold)
        graphics.lineStyle(1.5, 0xd4a373, 0.65);
        graphics.strokeRoundedRect(pX + 4, pY + 4, pW - 8, pH - 8, 6);

        // Forest moss green corner brackets
        graphics.lineStyle(2, 0x386641, 0.9);
        const len = 12;
        const pad = 10;
        
        // Top-Left
        graphics.beginPath();
        graphics.moveTo(pX + pad, pY + pad + len);
        graphics.lineTo(pX + pad, pY + pad);
        graphics.lineTo(pX + pad + len, pY + pad);
        graphics.strokePath();

        // Top-Right
        graphics.beginPath();
        graphics.moveTo(pX + pW - pad, pY + pad + len);
        graphics.lineTo(pX + pW - pad, pY + pad);
        graphics.lineTo(pX + pW - pad - len, pY + pad);
        graphics.strokePath();

        // Bottom-Left
        graphics.beginPath();
        graphics.moveTo(pX + pad, pY + pH - pad - len);
        graphics.lineTo(pX + pad, pY + pH - pad);
        graphics.lineTo(pX + pad + len, pY + pH - pad);
        graphics.strokePath();

        // Bottom-Right
        graphics.beginPath();
        graphics.moveTo(pX + pW - pad, pY + pH - pad - len);
        graphics.lineTo(pX + pW - pad, pY + pH - pad);
        graphics.lineTo(pX + pW - pad - len, pY + pH - pad);
        graphics.strokePath();

        // 3. Create characters
        // Human on the left, facing right, 4X scale (Y-offset adjusted to ground feet perfectly on top of platform)
        this.human = this.add.sprite(centerX - 80, floorY - 72, 'humanSpritesheet', 13);
        this.human.setScale(4);
        this.human.setFlipX(false);
        this.human.setDepth(10);

        // Blu on the right, facing left, 4X scale
        this.blu = this.add.sprite(centerX + 80, floorY - 32, 'bluSpritesheet', 0);
        this.blu.setScale(4);
        this.blu.setFlipX(false);
        this.blu.setDepth(10);
        
        // Start idle animation for Blu
        this.blu.play('blu_idle');

        // 4. Create victory text title
        const songTitle = this.add.text(centerX, centerY - 140, "YOU WON!", {
            fontFamily: '\"Press Start 2P\"',
            fontSize: '24px',
            color: '#e9c46a'
        }).setOrigin(0.5, 0.5);
        songTitle.setShadow(2, 2, '#25140b', 0);

        // Fade in camera
        this.cameras.main.fadeIn(500, 10, 10, 26);

        // 5. Schedule song timeline barks (start after 1.5 seconds)
        this.songTimeline.forEach(bark => {
            const delay = bark.beat * this.beatDuration + 1500;
            this.time.delayedCall(delay, () => {
                this.playBarkEvent(bark);
            });
        });

        // 6. Joyous jump after song ends (only Blu hops, human stays static/unanimated)
        const songEndDelay = 26 * this.beatDuration + 1500;
        this.time.delayedCall(songEndDelay, () => {
            this.playCelebration();
        });

        // 7. Menu Setup (Display menu inside the platform box after celebration)
        const menuDisplayDelay = songEndDelay + 1800;
        this.time.delayedCall(menuDisplayDelay, () => {
            this.showVictoryMenu();
        });

        this.buttonsContainer = this.add.container(0, 0);
        this.buttonsContainer.setAlpha(0);
        this.buttonsContainer.setDepth(20);

        this.highlightBox = this.add.graphics();
        this.buttonsContainer.add(this.highlightBox);

        // 8. Bind Input Handlers
        this.setupInputs();
    }

    private playBarkEvent(event: BarkTiming): void {
        if (!this.blu || !this.blu.active) return;

        // 1. Play bark SFX and animation on Blu
        const barkIndex = Phaser.Math.Between(1, 7);
        this.sound.play(`sfx_bark_${barkIndex}`, { volume: 0.4 });
        this.blu.play('blu_bark', true);

        // 2. Trigger shockwave radiating from Blu's mouth towards left (Human)
        this.triggerBarkShockwave(this.blu.x, this.blu.y - 12);

        // 3. Update the active lyric line if it has changed
        if (event.line !== this.currentLineIndex) {
            this.currentLineIndex = event.line;
            this.displayLyricLine(event.line);
        }

        // 4. Highlight the active word
        this.highlightWord(event.word);
    }

    private displayLyricLine(lineIdx: number): void {
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        const textY = centerY - 80;

        // Clear existing texts
        this.wordTexts.forEach(t => t.destroy());
        this.wordTexts = [];

        const words = this.songLines[lineIdx];
        const tempTexts: Phaser.GameObjects.Text[] = [];

        // Create text objects for measuring widths
        words.forEach(word => {
            const txt = this.add.text(0, 0, word, {
                fontFamily: '\"Press Start 2P\"',
                fontSize: '14px',
                color: '#a3b19b'
            }).setOrigin(0.5, 0.5);
            txt.setShadow(1, 1, '#1a110a', 0);
            tempTexts.push(txt);
        });

        // Align horizontally and center the line
        let totalWidth = 0;
        const spacing = 12; // pixels between words
        tempTexts.forEach((t, i) => {
            totalWidth += t.width;
            if (i < tempTexts.length - 1) totalWidth += spacing;
        });

        let currentX = centerX - totalWidth / 2;
        tempTexts.forEach(t => {
            t.x = currentX + t.width / 2;
            t.y = textY;
            currentX += t.width + spacing;
            
            // Add subtle fade-in tween
            t.setAlpha(0);
            this.tweens.add({
                targets: t,
                alpha: 1,
                duration: 200
            });
            
            this.wordTexts.push(t);
        });
    }

    private highlightWord(wordIdx: number): void {
        this.wordTexts.forEach((txt, idx) => {
            if (idx === wordIdx) {
                txt.setColor('#e9c46a'); // Active gold
                txt.setScale(1.2);
                txt.setDepth(12);
            } else {
                txt.setColor('#a3b19b'); // Inactive muted green
                txt.setScale(1.0);
                txt.setDepth(11);
            }
        });
    }

    private triggerBarkShockwave(x: number, y: number): void {
        const shockwave = this.add.graphics();
        shockwave.setDepth(15);

        const targetObj = { r: 8, alpha: 1 };
        this.tweens.add({
            targets: targetObj,
            r: 80,
            alpha: 0,
            duration: 300,
            onUpdate: () => {
                const currentStartX = x - 20;
                const currentStartY = y;
                const currentCenterAngle = Math.PI; // looking left

                shockwave.clear();
                const drawAlpha = Math.sqrt(targetObj.alpha);
                shockwave.fillStyle(0xffffff, drawAlpha);
                const baseAngles = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3];
                const size = 6;
                for (const relAngle of baseAngles) {
                    const angle = currentCenterAngle + relAngle;
                    const px1 = Math.round(currentStartX + Math.cos(angle) * targetObj.r);
                    const py1 = Math.round(currentStartY + Math.sin(angle) * targetObj.r);
                    shockwave.fillRect(px1 - size / 2, py1 - size / 2, size, size);

                    if (targetObj.r > 25) {
                        const px2 = Math.round(currentStartX + Math.cos(angle) * (targetObj.r - 20));
                        const py2 = Math.round(currentStartY + Math.sin(angle) * (targetObj.r - 20));
                        shockwave.fillRect(px2 - size / 2, py2 - size / 2, size, size);
                    }

                    if (targetObj.r > 45) {
                        const px3 = Math.round(currentStartX + Math.cos(angle) * (targetObj.r - 40));
                        const py3 = Math.round(currentStartY + Math.sin(angle) * (targetObj.r - 40));
                        shockwave.fillRect(px3 - size / 2, py3 - size / 2, size, size);
                    }
                }
            },
            onComplete: () => {
                if (shockwave && shockwave.active) {
                    shockwave.destroy();
                }
            }
        });
    }

    private playCelebration(): void {
        if (!this.blu || !this.blu.active) return;

        // Clear last active word highlight and make it white
        this.wordTexts.forEach(txt => {
            txt.setColor('#f4f1de');
            txt.setScale(1.0);
        });

        // Jump of joy only for Blu
        const hopCount = 3;
        for (let i = 0; i < hopCount; i++) {
            const delay = i * 600;
            this.time.delayedCall(delay, () => {
                if (!this.blu || !this.blu.active) return;
                
                this.tweens.add({
                    targets: this.blu,
                    y: this.blu.y - 25,
                    duration: 200,
                    yoyo: true,
                    ease: 'Quad.easeOut',
                    onStart: () => {
                        this.sound.play('sfx_jump', { volume: 0.2, pitch: 1.5 } as any);
                        this.blu.play('blu_bark', true);
                    },
                    onComplete: () => {
                        if (this.blu && this.blu.active) {
                            this.blu.play('blu_idle');
                        }
                    }
                });
            });
        }
    }

    private showVictoryMenu(): void {
        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;
        const startY = centerY + 140; // centered inside the platform box vertically
        const spacing = 45;

        this.optionTextObjects = [];

        this.menuOptions.forEach((option, idx) => {
            const textObj = this.add.text(centerX, startY + idx * spacing, option.label, {
                fontFamily: '\"Press Start 2P\"',
                fontSize: '15px',
                color: '#a3b19b',
                align: 'center'
            }).setOrigin(0.5);

            textObj.setInteractive({ useHandCursor: true });
            textObj.on('pointerover', () => {
                if (this.creditsOpen) return;
                this.selectOption(idx);
            });
            textObj.on('pointerdown', () => {
                if (this.creditsOpen) return;
                this.confirmSelection();
            });

            this.optionTextObjects.push(textObj);
            this.buttonsContainer.add(textObj);
        });

        // Initial menu highlights
        this.updateMenuHighlight();
        this.menuVisible = true;

        // Fade in container
        this.tweens.add({
            targets: this.buttonsContainer,
            alpha: 1,
            duration: 400
        });
    }

    private selectOption(idx: number): void {
        if (idx === this.selectedIndex) return;
        this.selectedIndex = idx;
        this.updateMenuHighlight();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.4 } as any);
    }

    private updateMenuHighlight(): void {
        this.optionTextObjects.forEach((textObj, idx) => {
            const isSelected = idx === this.selectedIndex;
            if (isSelected) {
                textObj.setColor('#f4f1de'); // Warm cream
                textObj.setScale(1.05);
            } else {
                textObj.setColor('#a3b19b'); // Sage green / muted green
                textObj.setScale(1.0);
            }
        });

        const selectedText = this.optionTextObjects[this.selectedIndex];
        this.highlightBox.clear();
        
        // Draw highlight background behind text
        const boxW = 280;
        const boxH = 30;
        this.highlightBox.fillStyle(0x386641, 0.2); // Forest moss green background
        this.highlightBox.fillRoundedRect(GAME_WIDTH / 2 - boxW / 2, selectedText.y - boxH / 2, boxW, boxH, 4);

        // Caramel wood glowing selection border
        this.highlightBox.lineStyle(1.5, 0xd4a373, 0.85);
        this.highlightBox.strokeRoundedRect(GAME_WIDTH / 2 - boxW / 2, selectedText.y - boxH / 2, boxW, boxH, 4);
    }

    private confirmSelection(): void {
        const option = this.menuOptions[this.selectedIndex];
        this.sound.play('sfx_checkpoint', { volume: 0.4 });

        if (option.action === 'credits') {
            this.showCreditsOverlay();
        } else if (option.action === 'exit') {
            this.cameras.main.fadeOut(300, 10, 10, 26);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('LevelSelectScene', { spawnDoorId: 9 });
            });
        }
    }

    private setupInputs(): void {
        // Keyboard inputs
        const kb = this.input.keyboard!;
        kb.on('keydown', (event: KeyboardEvent) => {
            if (!this.menuVisible) return;

            if (this.creditsOpen) {
                // Any confirming or canceling key closes the credits overlay
                if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER ||
                    event.keyCode === Phaser.Input.Keyboard.KeyCodes.SPACE ||
                    event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC ||
                    event.key === 'p' || event.key === 'P') {
                    this.closeCreditsOverlay();
                }
                return;
            }

            if (event.key === 'w' || event.key === 'W' || event.keyCode === Phaser.Input.Keyboard.KeyCodes.UP) {
                const prev = (this.selectedIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
                this.selectOption(prev);
            } else if (event.key === 's' || event.key === 'S' || event.keyCode === Phaser.Input.Keyboard.KeyCodes.DOWN) {
                const next = (this.selectedIndex + 1) % this.menuOptions.length;
                this.selectOption(next);
            } else if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER || event.keyCode === Phaser.Input.Keyboard.KeyCodes.SPACE) {
                this.confirmSelection();
            }
        });

        // Gamepad buttons
        this.input.gamepad?.on('down', (pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
            if (!this.menuVisible) return;

            if (this.creditsOpen) {
                this.closeCreditsOverlay();
                return;
            }

            const idx = button.index;
            if (idx === 12) { // D-pad Up
                const prev = (this.selectedIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
                this.selectOption(prev);
            } else if (idx === 13) { // D-pad Down
                const next = (this.selectedIndex + 1) % this.menuOptions.length;
                this.selectOption(next);
            } else if (idx === 0) { // A button
                this.confirmSelection();
            } else if (idx === 9 || idx === 8 || idx === 1) { // Start, Options, B Button
                // cancel: do nothing or close if menu?
            }
        });

        // Gamepad axes
        this.input.gamepad?.on('axis', (pad: Phaser.Input.Gamepad.Gamepad, index: number, value: number) => {
            if (!this.menuVisible || this.creditsOpen) return;

            if (index === 1) { // Left Stick Y
                const threshold = 0.5;
                if (value < -threshold && this.lastAxisY >= -threshold) {
                    const prev = (this.selectedIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
                    this.selectOption(prev);
                } else if (value > threshold && this.lastAxisY <= threshold) {
                    const next = (this.selectedIndex + 1) % this.menuOptions.length;
                    this.selectOption(next);
                }
                this.lastAxisY = value;
            }
        });
    }

    private showCreditsOverlay(): void {
        this.buttonsContainer.setActive(false);
        this.buttonsContainer.setVisible(false);
        this.creditsOpen = true;

        const centerX = GAME_WIDTH / 2;
        const centerY = GAME_HEIGHT / 2;

        this.creditsOverlay = this.add.container(centerX, centerY);
        this.creditsOverlay.setDepth(30);

        // 1. Semi-transparent black backdrop
        const backdrop = this.add.graphics();
        backdrop.fillStyle(0x000000, 0.75);
        backdrop.fillRect(-centerX, -centerY, GAME_WIDTH, GAME_HEIGHT);
        backdrop.setInteractive(new Phaser.Geom.Rectangle(-centerX, -centerY, GAME_WIDTH, GAME_HEIGHT), Phaser.Geom.Rectangle.Contains);
        this.creditsOverlay.add(backdrop);

        // 2. Walnut styled panel box
        const panelWidth = 460;
        const panelHeight = 360;
        const panelBg = this.add.graphics();
        
        // Background
        panelBg.fillStyle(0x1a110a, 1);
        panelBg.fillRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
        
        // Borders
        panelBg.lineStyle(4, 0x3d2314, 1);
        panelBg.strokeRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight);
        panelBg.lineStyle(2, 0xd4a373, 1);
        panelBg.strokeRect(-panelWidth / 2 + 6, -panelHeight / 2 + 6, panelWidth - 12, panelHeight - 12);
        
        // Corner brackets
        const bSize = 16;
        panelBg.fillStyle(0x386641, 1);
        panelBg.fillRect(-panelWidth / 2 + 6, -panelHeight / 2 + 6, bSize, 4);
        panelBg.fillRect(-panelWidth / 2 + 6, -panelHeight / 2 + 6, 4, bSize);
        panelBg.fillRect(panelWidth / 2 - 6 - bSize, -panelHeight / 2 + 6, bSize, 4);
        panelBg.fillRect(panelWidth / 2 - 10, -panelHeight / 2 + 6, 4, bSize);
        panelBg.fillRect(-panelWidth / 2 + 6, panelHeight / 2 - 10, bSize, 4);
        panelBg.fillRect(-panelWidth / 2 + 6, panelHeight / 2 - 6 - bSize, 4, bSize);
        panelBg.fillRect(panelWidth / 2 - 6 - bSize, panelHeight / 2 - 10, bSize, 4);
        panelBg.fillRect(panelWidth / 2 - 10, panelHeight / 2 - 6 - bSize, 4, bSize);

        this.creditsOverlay.add(panelBg);

        // 3. Credits Title
        const title = this.add.text(0, -panelHeight / 2 + 30, "CREDITS", {
            fontFamily: '\"Press Start 2P\"',
            fontSize: '18px',
            color: '#e9c46a'
        }).setOrigin(0.5, 0.5);
        title.setShadow(2, 2, '#000', 0);
        this.creditsOverlay.add(title);

        // 4. Credits Text (left column)
        const textX = -75;
        const creditsData = [
            { title: "Created By", value: "Blu Light Games" },
            { title: "Voice Acting", value: "Blu Himself" },
            { title: "World Assets", value: "Kenny Game Assets" },
            { title: "Backgrounds", value: "Craftpix" }
        ];

        let currentY = -panelHeight / 2 + 80;
        creditsData.forEach(item => {
            const titleTxt = this.add.text(textX, currentY, item.title, {
                fontFamily: '\"Press Start 2P\"',
                fontSize: '10px',
                color: '#a3b19b'
            }).setOrigin(0.5, 0);
            titleTxt.setShadow(1, 1, '#000', 0);
            this.creditsOverlay.add(titleTxt);

            currentY += 16;

            const valueTxt = this.add.text(textX, currentY, item.value, {
                fontFamily: '\"Press Start 2P\"',
                fontSize: '11px',
                color: '#f4f1de'
            }).setOrigin(0.5, 0);
            valueTxt.setShadow(1, 1, '#000', 0);
            this.creditsOverlay.add(valueTxt);

            currentY += 28;
        });

        // 5. Display photo of real-life Blu (right column)
        const photo = this.add.image(115, -10, 'bluRealPhoto');
        photo.setOrigin(0.5, 0.5);
        
        // Scale to 160px width
        const targetWidth = 160;
        const photoScale = targetWidth / photo.width;
        photo.setScale(photoScale);

        // Draw a gold photo frame
        const pFrame = this.add.graphics();
        pFrame.lineStyle(3, 0xd4a373, 1);
        pFrame.strokeRect(
            115 - (photo.width * photoScale) / 2 - 2, 
            -10 - (photo.height * photoScale) / 2 - 2, 
            photo.width * photoScale + 4, 
            photo.height * photoScale + 4
        );
        
        // Label below photo
        const photoLabel = this.add.text(115, -10 + (photo.height * photoScale) / 2 + 15, "The Real Blu!", {
            fontFamily: '\"Press Start 2P\"',
            fontSize: '9px',
            color: '#e9c46a'
        }).setOrigin(0.5, 0.5);
        photoLabel.setShadow(1, 1, '#000', 0);

        this.creditsOverlay.add(photo);
        this.creditsOverlay.add(pFrame);
        this.creditsOverlay.add(photoLabel);

        // 6. Close option text button (visually styled cohesive with menu options)
        const closeText = this.add.text(0, panelHeight / 2 - 35, "CLOSE", {
            fontFamily: '\"Press Start 2P\"',
            fontSize: '13px',
            color: '#f4f1de'
        }).setOrigin(0.5, 0.5);
        closeText.setScale(1.05);
        this.creditsOverlay.add(closeText);

        // Selection highlight bar behind CLOSE text
        const closeHighlight = this.add.graphics();
        closeHighlight.fillStyle(0x386641, 0.2); // Moss green
        closeHighlight.fillRoundedRect(-140, panelHeight / 2 - 49, 280, 28, 4);
        closeHighlight.lineStyle(1.5, 0xd4a373, 0.85); // Caramel gold border
        closeHighlight.strokeRoundedRect(-140, panelHeight / 2 - 49, 280, 28, 4);
        this.creditsOverlay.add(closeHighlight);

        // Interaction
        closeText.setInteractive({ useHandCursor: true });
        closeText.on('pointerover', () => {
            closeText.setColor('#e9c46a');
            this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.4 } as any);
        });
        closeText.on('pointerout', () => {
            closeText.setColor('#f4f1de');
        });
        closeText.on('pointerdown', () => {
            this.sound.play('sfx_checkpoint', { volume: 0.4 });
            this.closeCreditsOverlay();
        });

        // Fade in
        this.creditsOverlay.setAlpha(0);
        this.tweens.add({
            targets: this.creditsOverlay,
            alpha: 1,
            duration: 300
        });
    }

    private closeCreditsOverlay(): void {
        if (!this.creditsOpen) return;
        this.sound.play('sfx_checkpoint', { volume: 0.4 });

        this.creditsOverlay.destroy();
        this.creditsOpen = false;

        this.buttonsContainer.setActive(true);
        this.buttonsContainer.setVisible(true);
        this.updateMenuHighlight();
    }
}
