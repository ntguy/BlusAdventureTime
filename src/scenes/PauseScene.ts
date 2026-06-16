import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class PauseScene extends Phaser.Scene {
    private selectedIndex: number = 0;
    private menuOptions = [
        { label: 'RESUME GAME', action: 'resume' },
        { label: 'RESTART LEVEL', action: 'restart' },
        { label: 'LEVEL SELECT', action: 'exit' }
    ];

    private optionTextObjects: Phaser.GameObjects.Text[] = [];
    private highlightBox!: Phaser.GameObjects.Graphics;
    private parentScene!: Phaser.Scene;
    private createTime: number = 0;
    private lastAxisY: number = 0;
    private isClosing: boolean = false;

    constructor() {
        super({ key: 'PauseScene' });
    }

    init(data: { parentScene: Phaser.Scene }): void {
        this.parentScene = data.parentScene;
        this.selectedIndex = 0;
        this.isClosing = false;
    }

    create(): void {
        this.createTime = this.time.now;

        const width = GAME_WIDTH;
        const height = GAME_HEIGHT;

        // 1. Semi-transparent dark overlay with fade-in
        const overlay = this.add.graphics();
        overlay.fillStyle(0x080710, 0.82);
        overlay.fillRect(0, 0, width, height);
        overlay.setAlpha(0.0);

        this.tweens.add({
            targets: overlay,
            alpha: 1.0,
            duration: 180
        });

        // 2. Pause Card Panel dimensions
        const pW = 380;
        const pH = 210;
        const pX = width / 2 - pW / 2;
        const pY = height / 2 - pH / 2;

        const cardContainer = this.add.container(0, 0);

        // Graphics for background and woody borders
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

        cardContainer.add(graphics);

        // 3. Game Paused Title (Gold color with deep bark shadow)
        const titleText = this.add.text(width / 2, pY + 36, "GAME PAUSED", {
            fontFamily: '"Press Start 2P"',
            fontSize: '22px',
            color: '#e9c46a',
            align: 'center'
        }).setOrigin(0.5);
        titleText.setShadow(2, 2, '#25140b', 0);
        
        // Pulsing floating animation for Title
        this.tweens.add({
            targets: titleText,
            y: pY + 39,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        cardContainer.add(titleText);

        // 4. Highlight box graphics
        this.highlightBox = this.add.graphics();
        cardContainer.add(this.highlightBox);

        // 5. Options
        this.optionTextObjects = [];
        const startY = pY + 86;
        const spacing = 36;

        this.menuOptions.forEach((option, idx) => {
            const textObj = this.add.text(width / 2, startY + idx * spacing, option.label, {
                fontFamily: '"Press Start 2P"',
                fontSize: '13px',
                color: '#ffffff',
                align: 'center'
            }).setOrigin(0.5);

            textObj.setInteractive({ useHandCursor: true });
            textObj.on('pointerover', () => {
                if (this.isClosing || this.time.now - this.createTime < 200) return;
                this.selectOption(idx);
            });
            textObj.on('pointerdown', () => {
                if (this.isClosing || this.time.now - this.createTime < 200) return;
                this.confirmSelection();
            });

            this.optionTextObjects.push(textObj);
            cardContainer.add(textObj);
        });

        // Initial highlights
        this.updateMenuHighlight();

        // 7. Setup inputs (keyboard and gamepad event handlers)
        this.setupInputs();

        // Scale-in card animation
        cardContainer.setScale(0.85);
        cardContainer.setAlpha(0.0);
        this.tweens.add({
            targets: cardContainer,
            scaleX: 1.0,
            scaleY: 1.0,
            alpha: 1.0,
            duration: 200,
            ease: 'Back.easeOut'
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
        const boxW = 260;
        const boxH = 26;
        this.highlightBox.fillStyle(0x386641, 0.2); // Forest moss green background
        this.highlightBox.fillRoundedRect(GAME_WIDTH / 2 - boxW / 2, selectedText.y - boxH / 2, boxW, boxH, 4);

        // Caramel wood glowing selection border
        this.highlightBox.lineStyle(1.5, 0xd4a373, 0.85);
        this.highlightBox.strokeRoundedRect(GAME_WIDTH / 2 - boxW / 2, selectedText.y - boxH / 2, boxW, boxH, 4);
    }

    private setupInputs(): void {
        const cooldown = 200; // delay to prevent initial double triggers

        const goUp = () => {
            if (this.isClosing || this.time.now - this.createTime < cooldown) return;
            const prev = (this.selectedIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
            this.selectOption(prev);
        };

        const goDown = () => {
            if (this.isClosing || this.time.now - this.createTime < cooldown) return;
            const next = (this.selectedIndex + 1) % this.menuOptions.length;
            this.selectOption(next);
        };

        const select = () => {
            if (this.isClosing || this.time.now - this.createTime < cooldown) return;
            this.confirmSelection();
        };

        const cancel = () => {
            if (this.isClosing || this.time.now - this.createTime < cooldown) return;
            this.resumeGame();
        };

        // Keyboard inputs
        const kb = this.input.keyboard!;
        kb.on('keydown', (event: KeyboardEvent) => {
            if (event.key === 'w' || event.key === 'W' || event.keyCode === Phaser.Input.Keyboard.KeyCodes.UP) {
                goUp();
            } else if (event.key === 's' || event.key === 'S' || event.keyCode === Phaser.Input.Keyboard.KeyCodes.DOWN) {
                goDown();
            } else if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ENTER || event.keyCode === Phaser.Input.Keyboard.KeyCodes.SPACE) {
                select();
            } else if (event.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC || event.key === 'p' || event.key === 'P') {
                cancel();
            }
        });

        // Gamepad inputs
        this.input.gamepad?.on('down', (pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
            const idx = button.index;
            if (idx === 12) { // D-pad Up
                goUp();
            } else if (idx === 13) { // D-pad Down
                goDown();
            } else if (idx === 0) { // A button
                select();
            } else if (idx === 9 || idx === 8 || idx === 1) { // Start, Options/Select, or B button
                cancel();
            }
        });

        // Gamepad sticks
        this.input.gamepad?.on('axis', (pad: Phaser.Input.Gamepad.Gamepad, index: number, value: number) => {
            if (index === 1) { // Left Stick Y
                const threshold = 0.5;
                if (value < -threshold && this.lastAxisY >= -threshold) {
                    goUp();
                } else if (value > threshold && this.lastAxisY <= threshold) {
                    goDown();
                }
                this.lastAxisY = value;
            }
        });
    }

    private confirmSelection(): void {
        const option = this.menuOptions[this.selectedIndex];
        this.sound.play('sfx_checkpoint', { volume: 0.4 });
        this.isClosing = true;

        if (option.action === 'resume') {
            this.resumeGame();
        } else if (option.action === 'restart') {
            const parent = this.parentScene;
            this.scene.resume(parent.scene.key);
            
            parent.cameras.main.fadeOut(300, 10, 10, 26);
            parent.cameras.main.once('camerafadeoutcomplete', () => {
                parent.scene.restart({
                    levelKey: (parent as any).levelKey,
                    levelData: (parent as any).playtestLevelData,
                    isTestMode: (parent as any).isTestMode,
                    fromLobbyDoorId: (parent as any).fromLobbyDoorId
                });
            });
            this.scene.stop();
        } else if (option.action === 'exit') {
            const parent = this.parentScene;
            this.scene.resume(parent.scene.key);
            
            parent.cameras.main.fadeOut(300, 10, 10, 26);
            parent.cameras.main.once('camerafadeoutcomplete', () => {
                parent.scene.start('LevelSelectScene', {
                    spawnDoorId: (parent as any).fromLobbyDoorId
                });
            });
            this.scene.stop();
        }
    }

    private resumeGame(): void {
        this.isClosing = true;
        this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
        this.scene.resume(this.parentScene.scene.key);
        this.scene.stop();
    }
}
