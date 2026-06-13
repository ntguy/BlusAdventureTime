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

        // Random background selection (excluding default_bg)
        const bgTypes = ['grassyMountain', 'snowyMountain'];
        const chosenBg = bgTypes[Math.floor(Math.random() * bgTypes.length)];

        if (chosenBg === 'grassyMountain') {
            this.cameras.main.setBackgroundColor('#c9d7e7');
            const layers = ['grassyMountain_4', 'grassyMountain_3', 'grassyMountain_2', 'grassyMountain_1'];
            layers.forEach(key => {
                const img = this.add.image(width / 2, height / 2, key);
                img.setDisplaySize(width, height);
            });
        } else {
            this.cameras.main.setBackgroundColor('#e9f1f6');
            const layers = ['snowyMountain_5', 'snowyMountain_4', 'snowyMountain_3', 'snowyMountain_2', 'snowyMountain_1'];
            layers.forEach(key => {
                const img = this.add.image(width / 2, height / 2, key);
                img.setDisplaySize(width, height);
            });
        }

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
            padding: { top: 8, bottom: 8 }
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
                padding: { top: 6, bottom: 6 }
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
            if (button.index === 0) this.confirmSelection(); // A Button (Cross on PS)
        });

        let lastAxis9State = 3.2857; // Neutral
        let lastAxis5Pressed = 0;    // -1 = up, 0 = neutral, 1 = down
        this.input.gamepad?.on('axis', (pad: Phaser.Input.Gamepad.Gamepad, index: number, value: number) => {
            if (index === 9) {
                const wasNeutral = lastAxis9State > 1.0 || lastAxis9State < -1.0;
                const isNeutral = value > 1.0 || value < -1.0;

                if (wasNeutral && !isNeutral) {
                    if (value > 0.85 || value < -0.57) {
                        goUp();
                    } else if (value > -0.28 && value < 0.57) {
                        goDown();
                    }
                }
                lastAxis9State = value;
            } else if (index === 5) {
                const isUp = value < -0.5;
                const isDown = value > 0.5;
                const currentPressedState = isUp ? -1 : (isDown ? 1 : 0);

                if (currentPressedState !== lastAxis5Pressed) {
                    if (currentPressedState === -1) goUp();
                    else if (currentPressedState === 1) goDown();
                }
                lastAxis5Pressed = currentPressedState;
            }
        });
    }

}
