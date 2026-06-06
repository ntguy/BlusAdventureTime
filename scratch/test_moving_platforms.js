import puppeteer from 'puppeteer';

async function findActivePort() {
    const ports = [5173, 5174, 5175, 5176, 5177];
    for (const port of ports) {
        try {
            const response = await fetch(`http://localhost:${port}/`);
            if (response.ok) {
                console.log(`Found active server on port ${port}`);
                return port;
            }
        } catch (e) {
            // Ignore error and try next port
        }
    }
    throw new Error('No active dev server found on ports 5173-5177. Make sure Vite is running.');
}

async function run() {
    const port = await findActivePort();
    console.log('Launching browser for Moving Platform and Glow tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        // Forward console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        console.log(`Navigating to http://localhost:${port}/...`);
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Navigate to Level Editor (Menu option index 2)
        console.log('Opening EditorScene...');
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Place entities via page evaluation
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default spawns to avoid overlaps
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 20, y: 12 }
            ];

            // Place a button trigger at x = 3, y = 12
            es.levelData.entities.push({
                type: 'button',
                x: 3,
                y: 12,
                properties: {
                    channel: '1',
                    triggerType: 'pressure',
                    visualType: 'button',
                    glowColor: '0x00ff00'
                }
            });

            // Place a moving platform at x = 5, y = 12
            es.levelData.entities.push({
                type: 'movingPlatform',
                x: 5,
                y: 12,
                properties: {
                    endX: 18,
                    endY: 12,
                    velocity: 60,
                    channel: '1',
                    tileGid: 26,
                    extraTiles: '1,0 2,0',
                    glowColor: '0x00ff00'
                }
            });

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed button and moving platform in the editor');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Verify initial scene and moving platform parameters
        let initialStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            
            const platforms = gameScene.entityManager.query('MovingPlatform');
            const plat = platforms[0].getComponent('MovingPlatform');

            const triggers = gameScene.entityManager.query('Trigger');
            const trig = triggers[0].getComponent('Trigger');

            return {
                currentScene: gameScene.sys.settings.key,
                triggerMode: plat.triggerMode,
                channel: plat.channel,
                glowColor: plat.glowColor,
                triggerGlowColor: trig.glowColor,
                startX: plat.startX,
                endX: plat.endX,
                t: plat.t,
                tileCount: plat.tileSprites.length
            };
        });

        console.log('Initial GameScene status:', JSON.stringify(initialStatus));
        if (initialStatus.currentScene !== 'GameScene') {
            console.error('FAILURE: Failed to enter playtest.');
            process.exit(1);
        }
        if (initialStatus.triggerMode !== 'button') {
            console.error(`FAILURE: Platform triggerMode is incorrect: ${initialStatus.triggerMode}`);
            process.exit(1);
        }
        if (initialStatus.glowColor !== 0x00ff00 || initialStatus.triggerGlowColor !== 0x00ff00) {
            console.error('FAILURE: Glow color was not loaded or resolved correctly.');
            process.exit(1);
        }
        if (initialStatus.tileCount !== 3) {
            console.error(`FAILURE: Expected 3 tiles for platform (origin + 2 extra tiles), got ${initialStatus.tileCount}`);
            process.exit(1);
        }
        console.log('✔ Platform state and colors initialized correctly!');

        // 2. Step on the button (player is at x=2, button is at x=3)
        console.log('Moving player onto button (press Right)...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 350));
        await page.keyboard.up('KeyD');

        // Wait a little bit for the platform to start traveling
        await new Promise(resolve => setTimeout(resolve, 500));

        let movingStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const platforms = gameScene.entityManager.query('MovingPlatform');
            const plat = platforms[0].getComponent('MovingPlatform');
            return {
                channelState: plat.channelState,
                direction: plat.direction,
                t: plat.t,
                spriteX: plat.tileSprites[0].x
            };
        });

        console.log('Moving status:', JSON.stringify(movingStatus));
        if (!movingStatus.channelState || movingStatus.t === 0) {
            console.error('FAILURE: Platform did not start moving when button was pressed.');
            process.exit(1);
        }
        console.log('✔ Platform is moving (t = ' + movingStatus.t.toFixed(3) + ')');

        // 3. Step off the button (press Left to x=2)
        console.log('Stepping off the button (press Left)...');
        await page.keyboard.down('KeyA');
        await new Promise(resolve => setTimeout(resolve, 450));
        await page.keyboard.up('KeyA');

        // Wait to verify it has stopped/frozen
        const tBefore = movingStatus.t;
        await new Promise(resolve => setTimeout(resolve, 500));

        let stoppedStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const platforms = gameScene.entityManager.query('MovingPlatform');
            const plat = platforms[0].getComponent('MovingPlatform');
            return {
                channelState: plat.channelState,
                direction: plat.direction,
                t: plat.t
            };
        });

        console.log('Stopped status:', JSON.stringify(stoppedStatus));
        if (stoppedStatus.channelState || stoppedStatus.direction !== 0) {
            console.error('FAILURE: Platform did not freeze/stop when button was released.');
            process.exit(1);
        }
        console.log('✔ Platform froze in place when button was released (t = ' + stoppedStatus.t.toFixed(3) + ')');

        // 4. Step back on the button to check it resumes
        console.log('Stepping back on the button (press Right)...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 400));
        await page.keyboard.up('KeyD');

        // Wait to let it travel more
        await new Promise(resolve => setTimeout(resolve, 1000));

        let resumedStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const platforms = gameScene.entityManager.query('MovingPlatform');
            const plat = platforms[0].getComponent('MovingPlatform');
            return {
                t: plat.t
            };
        });

        console.log('Resumed status after 1s:', JSON.stringify(resumedStatus));
        if (resumedStatus.t <= stoppedStatus.t) {
            console.error('FAILURE: Platform did not resume moving when button was pressed again.');
            process.exit(1);
        }
        console.log('✔ Platform resumed moving successfully (t = ' + resumedStatus.t.toFixed(3) + ')');

        console.log('SUCCESS: Moving platforms integration test passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
