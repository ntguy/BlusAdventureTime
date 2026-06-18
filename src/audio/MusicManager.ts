import Phaser from 'phaser';
import { Settings } from '../settings/Settings';

export class MusicManager {
    private static instance: MusicManager;
    private soundManager: Phaser.Sound.BaseSoundManager | null = null;

    private activeSection: 'summer' | 'winter' | 'fall' | null = null;
    private currentTrackKey: string | null = null;
    
    // Store reference to the currently playing sound instance
    private currentSound: Phaser.Sound.BaseSound | null = null;
    
    // Timer/timeout IDs for crossfading loops
    private loopTimeoutId: any = null;
    private activeFades: Map<Phaser.Sound.BaseSound, any> = new Map();

    private readonly CROSSFADE_MS = 3000;
    private readonly MAX_VOLUME = 0.06; // Quiet background music

    private readonly MUSIC_DURATIONS: Record<string, number> = {
        mus_summer: 113658,
        mus_winter: 194377,
        mus_fall: 145763
    };

    private constructor() {}

    public static getInstance(): MusicManager {
        if (!MusicManager.instance) {
            MusicManager.instance = new MusicManager();
        }
        return MusicManager.instance;
    }

    /** Set the sound manager reference */
    public setSoundManager(soundManager: Phaser.Sound.BaseSoundManager): void {
        this.soundManager = soundManager;
    }

    /** Called when entering the Main Menu */
    public onMainMenuEnter(): void {
        this.stopAllMusic();
        this.activeSection = null;
        this.currentTrackKey = null;
    }

    /** Called when a level starts */
    public onLevelStart(levelKey: string, scene: Phaser.Scene): void {
        if (!this.soundManager) {
            this.soundManager = scene.sound;
        }

        const section = this.getSectionForLevel(levelKey);
        if (!section) return; // No music for test/editor levels

        if (this.activeSection === section) {
            // Same section, keep playing the current loop, do nothing
            return;
        }

        // Section changed!
        this.activeSection = section;
        const newTrackKey = `mus_${section}`;
        this.transitionToTrack(newTrackKey);
    }

    private getSectionForLevel(levelKey: string): 'summer' | 'winter' | 'fall' | null {
        if (['Lvl1', 'Lvl2', 'Lvl3'].includes(levelKey)) return 'summer';
        if (['Lvl4', 'Lvl5', 'Lvl6'].includes(levelKey)) return 'winter';
        if (['Lvl7', 'Lvl8', 'Lvl9'].includes(levelKey)) return 'fall';
        return null;
    }

    private getMaxVolumeForTrack(trackKey: string | null): number {
        if (!trackKey) return 0;
        const base = this.MAX_VOLUME * (Settings.musicVolume / 5);
        if (trackKey === 'mus_fall') {
            return base * 0.85; // reduced by 15%
        }
        return base;
    }

    public updateVolume(): void {
        if (this.currentSound && this.currentTrackKey) {
            const isFading = this.activeFades.has(this.currentSound);
            if (!isFading && (this.currentSound as any).isPlaying) {
                (this.currentSound as any).volume = this.getMaxVolumeForTrack(this.currentTrackKey);
            }
        }
    }

    private transitionToTrack(newTrackKey: string): void {
        if (!this.soundManager) return;

        // Clear loops
        if (this.loopTimeoutId) {
            clearTimeout(this.loopTimeoutId);
            this.loopTimeoutId = null;
        }

        // Fade out current playing track
        const oldSound = this.currentSound;
        const oldTrackKey = this.currentTrackKey;
        if (oldSound && oldTrackKey) {
            this.fadeOutAndDestroy(oldSound, oldTrackKey);
            this.currentSound = null;
        }

        // Start playing the new track
        const duration = this.MUSIC_DURATIONS[newTrackKey];
        if (!duration) return;

        this.currentTrackKey = newTrackKey;
        const newSound = this.soundManager.add(newTrackKey);
        this.currentSound = newSound;

        // Start at 0 volume and fade in
        (newSound as any).volume = 0;
        newSound.play();
        this.fadeIn(newSound, newTrackKey);

        // Schedule the loop crossfade before it ends
        const nextPlayDelay = duration - this.CROSSFADE_MS;
        this.loopTimeoutId = setTimeout(() => {
            this.triggerLoopCrossfade(newTrackKey);
        }, nextPlayDelay);
    }

    private triggerLoopCrossfade(trackKey: string): void {
        if (!this.soundManager || this.currentTrackKey !== trackKey) return;

        // Fade out the current sound
        const oldSound = this.currentSound;
        if (oldSound) {
            this.fadeOutAndDestroy(oldSound, trackKey);
        }

        // Start a new instance of the same track to crossfade with it
        const newSound = this.soundManager.add(trackKey);
        this.currentSound = newSound;

        (newSound as any).volume = 0;
        newSound.play();
        this.fadeIn(newSound, trackKey);

        // Schedule the next loop crossfade
        const duration = this.MUSIC_DURATIONS[trackKey];
        const nextPlayDelay = duration - this.CROSSFADE_MS;
        this.loopTimeoutId = setTimeout(() => {
            this.triggerLoopCrossfade(trackKey);
        }, nextPlayDelay);
    }

    private fadeIn(sound: Phaser.Sound.BaseSound, trackKey: string): void {
        // Clear any existing fade for this sound
        this.clearFade(sound);

        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.CROSSFADE_MS, 1);
            const currentVolume = progress * this.getMaxVolumeForTrack(trackKey);

            try {
                if (sound && (sound as any).isPlaying) {
                    (sound as any).volume = currentVolume;
                } else {
                    clearInterval(interval);
                    this.activeFades.delete(sound);
                }
            } catch (e) {
                clearInterval(interval);
                this.activeFades.delete(sound);
            }

            if (progress >= 1) {
                clearInterval(interval);
                this.activeFades.delete(sound);
            }
        }, 50);

        this.activeFades.set(sound, interval);
    }

    private fadeOutAndDestroy(sound: Phaser.Sound.BaseSound, trackKey: string): void {
        this.clearFade(sound);

        const startTime = Date.now();
        const startVolume = (sound as any).volume;
        const startMaxVal = this.getMaxVolumeForTrack(trackKey) || 0.001;
        const startProgress = Math.min(startVolume / startMaxVal, 1);

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.CROSSFADE_MS, 1);
            const relVol = startProgress * (1 - progress);
            const currentVolume = relVol * this.getMaxVolumeForTrack(trackKey);

            try {
                if (sound && (sound as any).isPlaying) {
                    (sound as any).volume = currentVolume;
                } else {
                    clearInterval(interval);
                    this.activeFades.delete(sound);
                    sound.destroy();
                }
            } catch (e) {
                clearInterval(interval);
                this.activeFades.delete(sound);
            }

            if (progress >= 1) {
                clearInterval(interval);
                this.activeFades.delete(sound);
                try {
                    sound.stop();
                    sound.destroy();
                } catch (e) {}
            }
        }, 50);

        this.activeFades.set(sound, interval);
    }

    private clearFade(sound: Phaser.Sound.BaseSound): void {
        const existingInterval = this.activeFades.get(sound);
        if (existingInterval) {
            clearInterval(existingInterval);
            this.activeFades.delete(sound);
        }
    }

    private stopAllMusic(): void {
        if (this.loopTimeoutId) {
            clearTimeout(this.loopTimeoutId);
            this.loopTimeoutId = null;
        }

        // Fade out current sound
        if (this.currentSound && this.currentTrackKey) {
            this.fadeOutAndDestroy(this.currentSound, this.currentTrackKey);
            this.currentSound = null;
        }

        // Clean up any other active fades/sounds
        for (const [sound, interval] of this.activeFades.entries()) {
            clearInterval(interval);
            try {
                sound.stop();
                sound.destroy();
            } catch (e) {}
        }
        this.activeFades.clear();
    }
}
