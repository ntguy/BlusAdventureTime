import Phaser from 'phaser';

export class BackgroundEffectsManager {
    private scene: Phaser.Scene;
    private preset: string;
    private particles: Array<{
        sprite: Phaser.GameObjects.Image;
        vx: number;
        vy: number;
        driftSpeed: number;
        driftRange: number;
        initialX: number;
        timeOffset: number;
        scaleVal: number;
        fadeInElapsed?: number;
        targetAlpha?: number;
    }> = [];
    
    private stars: Array<{
        sprite: Phaser.GameObjects.Image;
        twinkleSpeed: number;
        twinkleOffset: number;
    }> = [];

    private butterflies: Array<{
        sprite: Phaser.GameObjects.Image;
        vx: number;
        vy: number;
        scaleVal: number;
        flapSpeed: number;
        timeOffset: number;
        baseX: number;
        baseY: number;
    }> = [];

    constructor(scene: Phaser.Scene, preset: string) {
        this.scene = scene;
        this.preset = preset;
        this.init();
    }

    private init(): void {
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        
        // Use visible viewport width/height, fall back to constants if 0
        const viewWidth = view.width > 0 ? view.width : 954;
        const viewHeight = view.height > 0 ? view.height : 558;
        const viewX = view.x;
        const viewY = view.y;

        if (this.preset === 'grassyMountain') {
            const count = 4;
            const butterflyTypes = ['butterfly_blue', 'butterfly_yellow', 'butterfly_red'];
            
            for (let i = 0; i < count; i++) {
                const type = Phaser.Math.RND.pick(butterflyTypes);
                const x = Phaser.Math.RND.between(viewX + 20, viewX + viewWidth - 20);
                const y = Phaser.Math.RND.between(viewY + 20, viewY + viewHeight - 20);
                
                const sprite = this.scene.add.image(x, y, type);
                sprite.setDepth(0); // behind terrain (depth 1)
                sprite.setScrollFactor(1.0);
                
                const scaleVal = Phaser.Math.RND.realInRange(0.7, 1.2);
                sprite.setScale(scaleVal, scaleVal);
                
                this.butterflies.push({
                    sprite,
                    vx: Phaser.Math.RND.realInRange(-15, 15),
                    vy: Phaser.Math.RND.realInRange(-12, 12), // choose any direction, not just up
                    scaleVal,
                    flapSpeed: Phaser.Math.RND.realInRange(10, 16),
                    timeOffset: Phaser.Math.RND.realInRange(0, 100),
                    baseX: x,
                    baseY: y
                });
            }
        } else if (this.preset === 'snowyMountain') {
            const count = 120;
            const snowflakeTypes = ['snowflake_small', 'snowflake_medium', 'snowflake_large'];
            
            for (let i = 0; i < count; i++) {
                const type = Phaser.Math.RND.pick(snowflakeTypes);
                const x = Phaser.Math.RND.between(viewX - 20, viewX + viewWidth + 20);
                const y = Phaser.Math.RND.between(viewY - 20, viewY + viewHeight + 20);
                
                const sprite = this.scene.add.image(x, y, type);
                sprite.setDepth(0); // behind terrain (depth 1) and bgLayer (depth 2)
                sprite.setScrollFactor(1.0);
                sprite.setAlpha(Phaser.Math.RND.realInRange(0.4, 0.9));
                
                this.particles.push({
                    sprite,
                    vx: Phaser.Math.RND.realInRange(-8, 8),
                    vy: Phaser.Math.RND.realInRange(35, 65),
                    driftSpeed: Phaser.Math.RND.realInRange(1.0, 2.5),
                    driftRange: Phaser.Math.RND.realInRange(6, 12),
                    initialX: x,
                    timeOffset: Phaser.Math.RND.realInRange(0, 100),
                    scaleVal: 1.0
                });
            }
        } else if (this.preset === 'fallTrees') {
            const count = 16; // Reduced count by 20%
            const leafTypes = ['leaf_orange', 'leaf_red', 'leaf_yellow'];
            
            for (let i = 0; i < count; i++) {
                const type = Phaser.Math.RND.pick(leafTypes);
                const x = Phaser.Math.RND.between(viewX - 20, viewX + viewWidth + 20);
                
                let y: number;
                let fadeInElapsed: number | undefined;
                
                // 2/3rds of the leaves spawn starting from the middle of the screen height-wise and fade in
                if (i < (count * 2) / 3) {
                    y = Phaser.Math.RND.between(viewY + viewHeight * 0.55, viewY + viewHeight + 10); // Lowered fade-in line
                    fadeInElapsed = 0; // starts at 0, goes up to 2.0s
                } else {
                    y = Phaser.Math.RND.between(viewY - 20, viewY + viewHeight * 0.55);
                }
                
                const sprite = this.scene.add.image(x, y, type);
                sprite.setDepth(0); // behind terrain
                sprite.setScrollFactor(1.0);
                
                const scaleVal = Phaser.Math.RND.realInRange(0.7, 1.2);
                sprite.setScale(scaleVal);
                
                const targetAlpha = Phaser.Math.RND.realInRange(0.6, 0.95);
                sprite.setAlpha(fadeInElapsed === 0 ? 0 : targetAlpha);
                sprite.setAngle(Phaser.Math.RND.between(0, 360));
                
                this.particles.push({
                    sprite,
                    vx: Phaser.Math.RND.realInRange(-12, 12),
                    vy: Phaser.Math.RND.realInRange(22, 38), // slower descent
                    driftSpeed: Phaser.Math.RND.realInRange(0.8, 1.5),
                    driftRange: Phaser.Math.RND.realInRange(15, 25), // sway wider
                    initialX: x,
                    timeOffset: Phaser.Math.RND.realInRange(0, 100),
                    scaleVal,
                    fadeInElapsed,
                    targetAlpha
                });
            }
        } else if (this.preset === 'factory') {
            // Twinkling stars in the sky.
            const count = 150; // Double star density
            const levelWidth = this.scene.physics?.world?.bounds?.width || 2000;
            const levelHeight = this.scene.physics?.world?.bounds?.height || 600;
            const viewWidthForStars = levelWidth * 0.05 + viewWidth;
            const maxY = Math.min(450, levelHeight - 30); // Spread stars further down
            
            for (let i = 0; i < count; i++) {
                const x = Phaser.Math.RND.between(0, viewWidthForStars);
                const y = Phaser.Math.RND.between(8, maxY);
                
                const sprite = this.scene.add.image(x, y, 'star_twinkle');
                // Depth -9.5 is in front of factory_1 (-10) but behind factory_2 (-9)
                sprite.setDepth(-9.5);
                sprite.setScrollFactor(0.05, 0.02);
                
                this.stars.push({
                    sprite,
                    twinkleSpeed: Phaser.Math.RND.realInRange(4.0, 8.0),
                    twinkleOffset: Phaser.Math.RND.realInRange(0, Math.PI * 2)
                });
            }
        }
    }

    public update(time: number, delta: number): void {
        const dt = delta / 1000;
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        
        const viewWidth = view.width > 0 ? view.width : 954;
        const viewHeight = view.height > 0 ? view.height : 558;
        const viewX = view.x;
        const viewY = view.y;

        if (this.particles.length > 0) {
            for (const p of this.particles) {
                p.sprite.y += p.vy * dt;
                
                p.timeOffset += dt * p.driftSpeed;
                const offset = Math.sin(p.timeOffset) * p.driftRange;
                p.sprite.x = p.initialX + offset + p.vx * p.timeOffset;
                
                if (this.preset === 'fallTrees') {
                    p.sprite.angle += Math.sin(p.timeOffset) * 1.5;
                    
                    // Fade-in logic for leaves spawning mid-screen at startup
                    if (p.fadeInElapsed !== undefined && p.fadeInElapsed < 2.0 && p.targetAlpha !== undefined) {
                        p.fadeInElapsed += dt;
                        if (p.fadeInElapsed >= 2.0) {
                            p.sprite.setAlpha(p.targetAlpha);
                        } else {
                            p.sprite.setAlpha(p.targetAlpha * (p.fadeInElapsed / 2.0));
                        }
                    }
                }
                
                // Wrapping
                if (p.sprite.y > viewY + viewHeight + 15) {
                    p.sprite.x = Phaser.Math.RND.between(viewX - 20, viewX + viewWidth + 20);
                    p.initialX = p.sprite.x;
                    p.timeOffset = Phaser.Math.RND.realInRange(0, 100);

                    if (this.preset === 'fallTrees' && Phaser.Math.RND.frac() < 0.70) {
                        // 70% of the time, spawn near the center of the screen height-wise (slightly lowered) and fade in
                        p.sprite.y = viewY + viewHeight * 0.52 + Phaser.Math.RND.between(-40, 40);
                        p.fadeInElapsed = 0;
                        p.sprite.setAlpha(0);
                    } else {
                        // Otherwise spawn at the top
                        p.sprite.y = viewY - 15;
                        p.fadeInElapsed = undefined;
                        if (p.targetAlpha !== undefined) {
                            p.sprite.setAlpha(p.targetAlpha);
                        }
                    }
                }
                
                if (p.sprite.x < viewX - 30) {
                    p.sprite.x = viewX + viewWidth + 20;
                    p.initialX = p.sprite.x;
                } else if (p.sprite.x > viewX + viewWidth + 30) {
                    p.sprite.x = viewX - 20;
                    p.initialX = p.sprite.x;
                }
            }
        }

        if (this.stars.length > 0) {
            for (const s of this.stars) {
                const factor = Math.sin(time / 1000 * s.twinkleSpeed + s.twinkleOffset);
                const alpha = 0.65 + 0.35 * (factor + 1) / 2;
                s.sprite.setAlpha(alpha);
            }
        }

        if (this.butterflies.length > 0) {
            for (const b of this.butterflies) {
                b.timeOffset += dt;
                
                // Apply a small random force on each update for erratic, organic flying behavior
                b.vx += Phaser.Math.RND.realInRange(-25, 25) * dt;
                b.vy += Phaser.Math.RND.realInRange(-25, 25) * dt;
                // Clamp velocities to keep butterfly speed controlled
                b.vx = Phaser.Math.Clamp(b.vx, -15, 15);
                b.vy = Phaser.Math.Clamp(b.vy, -12, 12);

                // Erratic flight path: move base coordinate and add sine/cosine oscillation
                b.baseX += b.vx * dt;
                b.baseY += b.vy * dt;
                
                b.sprite.x = b.baseX + Math.sin(b.timeOffset * 3.0) * 12;
                b.sprite.y = b.baseY + Math.cos(b.timeOffset * 1.5) * 8;
                
                // Wing flapping (oscillate scaleX)
                b.sprite.scaleX = b.scaleVal * Math.abs(Math.sin(b.timeOffset * b.flapSpeed));
                
                // Wrap butterfly on all 4 viewport edges
                if (b.sprite.y > viewY + viewHeight + 20) {
                    b.baseY = viewY - 15;
                    b.baseX = Phaser.Math.RND.between(viewX, viewX + viewWidth);
                } else if (b.sprite.y < viewY - 20) {
                    b.baseY = viewY + viewHeight + 15;
                    b.baseX = Phaser.Math.RND.between(viewX, viewX + viewWidth);
                }
                
                if (b.sprite.x < viewX - 25) {
                    b.baseX = viewX + viewWidth + 15;
                    b.baseY = Phaser.Math.RND.between(viewY, viewY + viewHeight);
                } else if (b.sprite.x > viewX + viewWidth + 25) {
                    b.baseX = viewX - 15;
                    b.baseY = Phaser.Math.RND.between(viewY, viewY + viewHeight);
                }
            }
        }
    }

    public destroy(): void {
        for (const p of this.particles) {
            p.sprite.destroy();
        }
        this.particles = [];
        
        for (const s of this.stars) {
            s.sprite.destroy();
        }
        this.stars = [];

        for (const b of this.butterflies) {
            b.sprite.destroy();
        }
        this.butterflies = [];
    }
}
