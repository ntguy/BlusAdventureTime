import Phaser from 'phaser';
import { SFX } from '../constants';

/**
 * Centralized audio manager for all game sound effects.
 * 
 * Currently all SFX keys point to the same placeholder audio file (collect1.mp3).
 * To use different sounds, add new files to public/assets/audio/sfx/ and update
 * the PreloadScene to load them with the matching SFX key.
 */
export class AudioManager {
    private scene: Phaser.Scene;
    private volume: number = 0.5;
    private muted: boolean = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /** Play a sound effect by its SFX key */
    private play(key: string, volumeOverride?: number): void {
        if (this.muted) return;

        try {
            this.scene.sound.play(key, {
                volume: volumeOverride ?? this.volume,
            });
        } catch (e) {
            console.warn(`AudioManager: Failed to play "${key}"`, e);
        }
    }

    // ── Public SFX methods ──

    playJump(): void {
        this.play(SFX.jump, 0.3);
    }

    playLand(): void {
        this.play(SFX.land, 0.2);
    }

    playPickup(): void {
        this.play(SFX.pickup, 0.5);
    }

    playDrop(): void {
        this.play(SFX.drop, 0.4);
    }

    playDoorOpen(): void {
        this.play(SFX.doorOpen, 0.6);
    }

    playCheckpoint(): void {
        this.play(SFX.checkpoint, 0.5);
    }

    playDeath(): void {
        this.play(SFX.death, 0.5);
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
