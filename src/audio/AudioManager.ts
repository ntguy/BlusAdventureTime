import Phaser from 'phaser';
import { SFX } from '../constants';

/**
 * Centralized audio manager for all game sound effects.
 */
export class AudioManager {
    private scene: Phaser.Scene;
    private volume: number = 0.5;
    private muted: boolean = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** Play a sound effect by its SFX key */
    private play(key: string, volumeOverride?: number, extraConfig?: Phaser.Types.Sound.SoundConfig): void {
        if (this.muted) return;

        try {
            this.scene.sound.play(key, {
                volume: volumeOverride ?? this.volume,
                ...extraConfig
            });
        } catch (e) {
            console.warn(`AudioManager: Failed to play "${key}"`, e);
        }
    }

    // ── Public SFX methods ──

    playJump(): void {
        this.play(SFX.jump, 0.25);
    }

    playLand(playerType?: 'dog' | 'human'): void {
        const volume = playerType === 'dog' ? 0.2 * 0.6 : 0.2;
        this.play(SFX.land, volume);
    }

    playPickup(): void {
        this.play(SFX.pickup, 0.5);
    }

    playDrop(): void {
        this.play(SFX.drop, 0.4);
    }

    playDoorOpen(): void {
        const doorSound = this.scene.sound.add(SFX.doorOpen);
        doorSound.play({ volume: 0.6 });
        setTimeout(() => {
            try {
                if (doorSound) {
                    doorSound.stop();
                    doorSound.destroy();
                }
            } catch (e) {
                // ignore
            }
        }, 500);
    }

    playCheckpoint(): void {
        this.play(SFX.checkpoint, 0.5);
    }

    playDeath(playerType: 'dog' | 'human'): void {
        if (playerType === 'dog') {
            this.play('sfx_grumble', 0.6);
        } else {
            this.play(SFX.jdeath, 0.5, { seek: 0.7, rate: 1.15, detune: 150 });
        }
    }

    playButton(pressed: boolean = true): void {
        const btnSound = this.scene.sound.add(SFX.button);
        if (pressed) {
            btnSound.play({ volume: 0.4, seek: 0.0 });
            this.scene.time.delayedCall(228, () => {
                if (btnSound && btnSound.isPlaying) {
                    btnSound.stop();
                }
                btnSound.destroy();
            });
        } else {
            btnSound.play({ volume: 0.4, seek: 0.0, rate: 0.8, detune: -300 });
            this.scene.time.delayedCall(300, () => {
                if (btnSound) {
                    btnSound.destroy();
                }
            });
        }
    }

    playLauncher(): void {
        this.play(SFX.launcher, 0.17);
    }

    playMenuSelect(): void {
        this.play(SFX.menuSelect, 0.25);
    }

    playSwitchOn(): void {
        this.play(SFX.switchOn, 0.3);
    }

    playSwitchOff(): void {
        this.play(SFX.switchOff, 0.3, { seek: 0.05 });
    }

    playUnlock(): void {
        this.play(SFX.unlock, 0.5);
    }

    // ── Controls ──

    setVolume(vol: number): void {
        this.volume = Phaser.Math.Clamp(vol, 0, 1);
    }

    toggleMute(): void {
        this.muted = !this.muted;
    }

    isMuted(): boolean {
        return this.muted;
    }
}
