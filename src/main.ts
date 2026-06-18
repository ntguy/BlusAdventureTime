import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PHYSICS } from './constants';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';
import { PauseScene } from './scenes/PauseScene';
import { VictoryScene } from './scenes/VictoryScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    pixelArt: true,
    roundPixels: false,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#1a1a2e',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: PHYSICS.gravity },
            debug: false,  // toggle with F3 in-game
            fixedStep: false,
        },
    },
    input: {
        gamepad: true,
    },
    scene: [BootScene, PreloadScene, MainMenuScene, LevelSelectScene, EditorScene, GameScene, PauseScene, VictoryScene],
};

const game = new Phaser.Game(config);

// Make game accessible for debugging
(window as any).__PHASER_GAME__ = game;

import { Settings } from './settings/Settings';

// Patch Phaser GamepadPlugin crash on shutdown when gamepads array has undefined slots (due to disconnections)
if (Phaser.Input.Gamepad && Phaser.Input.Gamepad.GamepadPlugin) {
    (Phaser.Input.Gamepad.GamepadPlugin.prototype as any).stopListeners = function (this: any) {
        if (this.gamepads) {
            this.gamepads.forEach((pad: any) => {
                if (pad && typeof pad.removeAllListeners === 'function') {
                    try {
                        pad.removeAllListeners();
                    } catch (e) {
                        console.warn('Error during gamepad removeAllListeners:', e);
                    }
                }
            });
        }
    };
}

// Patch Phaser BaseSoundManager.play and BaseSound.play to dynamically apply the global music/effect volume multipliers
if (Phaser.Sound) {
    const originalManagerPlay = Phaser.Sound.BaseSoundManager.prototype.play;
    Phaser.Sound.BaseSoundManager.prototype.play = function (this: any, key: string, extra?: any) {
        if (extra && extra.volume !== undefined) {
            const isMusic = key.startsWith('mus_');
            const multiplier = isMusic ? (Settings.musicVolume / 5) : (Settings.effectsVolume / 5);
            extra = { ...extra, volume: extra.volume * multiplier };
        }
        return originalManagerPlay.call(this, key, extra);
    };

    const originalSoundPlay = Phaser.Sound.BaseSound.prototype.play;
    Phaser.Sound.BaseSound.prototype.play = function (this: any, marker?: any, config?: any) {
        let actualConfig = config;
        let actualMarker = marker;
        if (typeof marker === 'object') {
            actualConfig = marker;
            actualMarker = undefined;
        }

        if (actualConfig && actualConfig.volume !== undefined) {
            const isMusic = this.key.startsWith('mus_');
            const multiplier = isMusic ? (Settings.musicVolume / 5) : (Settings.effectsVolume / 5);
            actualConfig = { ...actualConfig, volume: actualConfig.volume * multiplier };
        } else if (!actualConfig) {
            const isMusic = this.key.startsWith('mus_');
            const multiplier = isMusic ? (Settings.musicVolume / 5) : (Settings.effectsVolume / 5);
            actualConfig = { volume: (this.config.volume ?? 1) * multiplier };
        }

        if (typeof marker === 'object') {
            return originalSoundPlay.call(this, actualConfig);
        } else {
            return originalSoundPlay.call(this, actualMarker, actualConfig);
        }
    };
}
