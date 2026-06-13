import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create(): void {
        if (document.fonts) {
            // Explicitly load custom web fonts to prevent lazy-loading issues
            Promise.all([
                document.fonts.load('10px "Press Start 2P"'),
                document.fonts.load('10px "Outfit"')
            ]).then(() => {
                this.scene.start('PreloadScene');
            }).catch(() => {
                // Fallback in case of error
                this.scene.start('PreloadScene');
            });
        } else {
            this.scene.start('PreloadScene');
        }
    }
}
