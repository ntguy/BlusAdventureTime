import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    create(): void {
        if (document.fonts) {
            document.fonts.ready.then(() => {
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
