import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Checkpoint and Death tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        // Forward console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        console.log('Navigating to level...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Navigate to Level Editor (Menu option index 2)
        console.log('Opening EditorScene...');
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Place human, dog, and checkpoint with custom properties via evaluations
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default spawns to avoid overlaps
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 20, y: 12 }
            ];

            // Place a checkpoint at x = 4, y = 12 with custom properties
            es.levelData.entities.push({
                type: 'checkpoint',
                x: 4,
                y: 12,
                properties: {
                    flickerRate: 100, // fast flicker
                    flickerTile: 112   // GID of flicker tile
                }
            });

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed checkpoint with custom flicker properties on the grid');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Verify initial scene and spawn positions
        let initialSpawns = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1 = gameScene.player1Entity.getComponent('Player');
            const checkpoints = gameScene.entityManager.query('Checkpoint');
            const customCp = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 81) < 5);
            const cp = customCp.getComponent('Checkpoint');

            return {
                currentScene: gameScene.sys.settings.key,
                initialSpawnX: p1.spawnX,
                initialSpawnY: p1.spawnY,
                humanActive: cp.humanActive,
                flickerRate: cp.flickerRate,
                flickerTile: cp.flickerTile
            };
        });

        console.log('Initial spawns & properties:', JSON.stringify(initialSpawns));
        if (initialSpawns.currentScene !== 'GameScene') {
            console.error('FAILURE: Failed to enter playtest.');
            process.exit(1);
        }
        if (initialSpawns.flickerRate !== 100 || initialSpawns.flickerTile !== 112) {
            console.error('FAILURE: Checkpoint did not load flicker properties correctly.');
            process.exit(1);
        }
        console.log('✔ Checkpoint properties loaded correctly');

        // 2. Move player onto the checkpoint at x=4
        console.log('Moving player onto checkpoint (press Right)...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 450));
        await page.keyboard.up('KeyD');

        // Check if checkpoint activated
        let touchState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1 = gameScene.player1Entity.getComponent('Player');
            const checkpoints = gameScene.entityManager.query('Checkpoint');
            const customCp = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 81) < 5);
            const cp = customCp.getComponent('Checkpoint');
            const cpTransform = customCp.getComponent('Transform');

            return {
                newSpawnX: p1.spawnX,
                newSpawnY: p1.spawnY,
                expectedSpawnX: cpTransform.x,
                expectedSpawnY: cpTransform.y - 4,
                humanActive: cp.humanActive,
                hasGraphics: !!cp.graphics
            };
        });

        console.log('Touch state results:', JSON.stringify(touchState));
        if (!touchState.humanActive) {
            console.error('FAILURE: Checkpoint did not activate for human player.');
            process.exit(1);
        }
        if (Math.abs(touchState.newSpawnX - touchState.expectedSpawnX) > 1 || Math.abs(touchState.newSpawnY - touchState.expectedSpawnY) > 1) {
            console.error(`FAILURE: Player spawn coordinates did not update to checkpoint. Spawn: (${touchState.newSpawnX}, ${touchState.newSpawnY}), Checkpoint: (${touchState.expectedSpawnX}, ${touchState.expectedSpawnY})`);
            process.exit(1);
        }
        if (!touchState.hasGraphics) {
            console.error('FAILURE: Checkpoint graphics object was not initialized.');
            process.exit(1);
        }
        console.log('✔ Checkpoint activated, spawn coords updated, and graphics initialized!');

        // 3. Test flicker back and forth
        console.log('Testing checkpoint flicker...');
        let frame1 = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const checkpoints = gameScene.entityManager.query('Checkpoint');
            const customCp = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 81) < 5);
            const render = customCp.getComponent('Render');
            return render.gameObject.frame.name;
        });

        await new Promise(resolve => setTimeout(resolve, 120)); // wait for one flicker toggle (rate is 100ms)

        let frame2 = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const checkpoints = gameScene.entityManager.query('Checkpoint');
            const customCp = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 81) < 5);
            const render = customCp.getComponent('Render');
            return render.gameObject.frame.name;
        });

        console.log(`Flicker frames: Frame1 = ${frame1}, Frame2 = ${frame2}`);
        if (frame1 === frame2) {
            console.error('FAILURE: Checkpoint is not flickering.');
            process.exit(1);
        }
        console.log('✔ Checkpoint is flickering correctly at the configured rate!');

        // 4. Test death out-of-bounds trigger and respawn
        console.log('Triggering player out-of-bounds death...');
        await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1Body = gameScene.player1Entity.getComponent('PhysicsBody').body;
            // Place player below level bounds (y > levelHeightPx)
            p1Body.y = p1Body.world.bounds.height + 50;
        });

        await new Promise(resolve => setTimeout(resolve, 100)); // wait for movement system check to trigger respawn

        let respawnState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1Phys = gameScene.player1Entity.getComponent('PhysicsBody');
            const p1 = gameScene.player1Entity.getComponent('Player');
            return {
                playerX: p1Phys.body.x,
                playerY: p1Phys.body.y,
                spawnX: p1.spawnX,
                spawnY: p1.spawnY
            };
        });

        console.log('Respawn state results:', JSON.stringify(respawnState));
        // Resetting sets the center to spawnX/spawnY. Wait, body.reset(x, y) sets the body top-left to x/y.
        // Wait, player1 config width is 12, height is 16. So body.x should be close to spawnX - width/2.
        const expectedBodyX = respawnState.spawnX - 6; // human body width is 12
        const expectedBodyY = respawnState.spawnY - 16; // human body height is 16
        
        // Let's check if the player's body coordinates are close to the expected body spawn position
        if (Math.abs(respawnState.playerX - expectedBodyX) > 20 || Math.abs(respawnState.playerY - expectedBodyY) > 20) {
            console.error(`FAILURE: Player did not respawn at the checkpoint spawn coordinates. Player body: (${respawnState.playerX}, ${respawnState.playerY}), Expected: (${expectedBodyX}, ${expectedBodyY})`);
            process.exit(1);
        }

        console.log('✔ Player died out-of-bounds and respawned at the checkpoint successfully!');
        console.log('SUCCESS: Checkpoint and Death system verification passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
