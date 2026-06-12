import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../constants';

export class MainMenuScene extends Phaser.Scene {
    private selectedIndex: number = 0;
    private menuOptions = [
        { label: 'LEVEL SELECT', scene: 'LevelSelectScene' },
        { label: 'LEVEL EDITOR', scene: 'EditorScene' }
    ];

    private optionTextObjects: Phaser.GameObjects.Text[] = [];
    private titleText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'MainMenuScene' });
    }

    create(): void {
        const width = GAME_WIDTH;
        const height = GAME_HEIGHT;

        // Static background
        const bg = this.add.image(width / 2, height / 2, 'default_bg');
        bg.setDisplaySize(width, height);

        // Dark overlay
        const overlay = this.add.graphics();
        overlay.fillStyle(0x0a0a1a, 0.65);
        overlay.fillRect(0, 0, width, height);

        // Title
        this.titleText = this.add.text(width / 2, height / 2 - 100, "BLU'S ADVENTURE TIME", {
            fontFamily: '"Press Start 2P"',
            fontSize: '24px',
            color: '#ffffff',
            align: 'center',
        }).setOrigin(0.5);

        // Draw menu options
        this.optionTextObjects = [];
        const startY = height / 2 + 20;

        this.menuOptions.forEach((option, idx) => {
            const textObj = this.add.text(width / 2, startY + idx * 40, '', {
                fontFamily: '"Press Start 2P"',
                fontSize: '16px',
                color: '#ffffff',
                align: 'center',
            }).setOrigin(0.5);

            textObj.setInteractive({ useHandCursor: true });
            textObj.on('pointerover', () => this.selectOption(idx));
            textObj.on('pointerdown', () => this.confirmSelection());

            this.optionTextObjects.push(textObj);
        });

        this.updateMenuHighlight();
        this.setupInput();

        this.cameras.main.fadeIn(300, 10, 10, 26);
    }

    private selectOption(index: number): void {
        if (index === this.selectedIndex) return;
        this.selectedIndex = index;
        this.updateMenuHighlight();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.4 } as any);
    }

    private updateMenuHighlight(): void {
        this.optionTextObjects.forEach((textObj, idx) => {
            const option = this.menuOptions[idx];
            const isSelected = idx === this.selectedIndex;
            if (isSelected) {
                textObj.setText(`> ${option.label} <`);
                textObj.setColor('#ffff00'); // Retro yellow selection text
            } else {
                textObj.setText(option.label);
                textObj.setColor('#888888');
            }
        });
    }

    private confirmSelection(): void {
        const option = this.menuOptions[this.selectedIndex];
        this.sound.play('sfx_checkpoint', { volume: 0.4 });

        this.cameras.main.fadeOut(300, 10, 10, 26);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(option.scene);
        });
    }

    private setupInput(): void {
        const kb = this.input.keyboard!;
        
        const goUp = () => {
            const prevIdx = (this.selectedIndex - 1 + this.menuOptions.length) % this.menuOptions.length;
            this.selectOption(prevIdx);
        };

        const goDown = () => {
            const nextIdx = (this.selectedIndex + 1) % this.menuOptions.length;
            this.selectOption(nextIdx);
        };

        kb.addKey(Phaser.Input.Keyboard.KeyCodes.W).on('down', goUp);
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP).on('down', goUp);
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.S).on('down', goDown);
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN).on('down', goDown);

        kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).on('down', () => this.confirmSelection());
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => this.confirmSelection());

        this.input.gamepad?.on('down', (pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
            if (button.index === 12) goUp();     // D-Pad Up
            if (button.index === 13) goDown();   // D-Pad Down
            if (button.index === 0) this.confirmSelection(); // A Button
        });
    }

}
