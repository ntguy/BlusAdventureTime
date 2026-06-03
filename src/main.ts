import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, PHYSICS } from './constants';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { EditorScene } from './scenes/EditorScene';
import { GameScene } from './scenes/GameScene';

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
    scene: [BootScene, PreloadScene, MainMenuScene, LevelSelectScene, EditorScene, GameScene],
};

const game = new Phaser.Game(config);

// Make game accessible for debugging
(window as any).__PHASER_GAME__ = game;
