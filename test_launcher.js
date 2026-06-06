import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Spring Launcher tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        // Forward console logs from page to node process
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

        // Switch to Entities layer (shortcut '3')
        console.log('Swapping to Entities layer...');
        await page.keyboard.press('Digit3');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Place human, dog, and launcher via evaluations
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default spawns to avoid overlaps
            es.levelData.entities = [
                { type: 'humanSpawn', x: 3, y: 10 },
                { type: 'dogSpawn', x: 20, y: 12 }
            ];

            // Place a launcher at x = 3, y = 12
            es.levelData.entities.push({ type: 'launcher', x: 3, y: 12 });

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed launcher on the grid');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify active scene is GameScene in Test Mode
        let gameState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const active = game.scene.getScenes(true)[0];
            return {
                currentScene: active.sys.settings.key,
                isTestMode: active.isTestMode
            };
        });

        if (gameState.currentScene !== 'GameScene' || !gameState.isTestMode) {
            console.error(`FAILURE: Failed to enter playtest. Scene: ${gameState.currentScene}, TestMode: ${gameState.isTestMode}`);
            process.exit(1);
        }
        console.log('✔ GameScene launched in test mode');

        // Wait for player to fall onto the launcher
        console.log('Waiting for player to fall onto launcher...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check immediately for launching physics and active frame
        let launchState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1Phys = gameScene.player1Entity.getComponent('PhysicsBody');
            
            const launchers = gameScene.entityManager.query('Launcher');
            const launcher = launchers[0].getComponent('Launcher');
            const lTransform = launchers[0].getComponent('Transform');
            const render = launchers[0].getComponent('Render');
            const sprite = render.gameObject;

            return {
                playerX: p1Phys.body.x,
                playerY: p1Phys.body.y,
                playerW: p1Phys.body.width,
                playerH: p1Phys.body.height,
                launcherX: lTransform.x,
                launcherY: lTransform.y,
                velocityY: p1Phys.body.velocity.y,
                launcherActivated: launcher.isActivated,
                spriteFrame: sprite.frame.name
            };
        });

        console.log('Launch state values during overlap:', JSON.stringify(launchState));
        
        // velocity should be around -400
        if (launchState.velocityY >= 0) {
            console.error('FAILURE: Player velocity is not upward after walking onto launcher!');
            process.exit(1);
        }
        if (!launchState.launcherActivated) {
            console.error('FAILURE: Launcher is not activated!');
            process.exit(1);
        }

        console.log('✔ Launcher successfully launched player upwards!');

        // Wait 600ms for launcher to deactivate
        console.log('Waiting for launcher to reset visual state (500ms cooldown)...');
        await new Promise(resolve => setTimeout(resolve, 600));

        let resetState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            
            const launchers = gameScene.entityManager.query('Launcher');
            const launcher = launchers[0].getComponent('Launcher');
            const render = launchers[0].getComponent('Render');
            const sprite = render.gameObject;

            return {
                launcherActivated: launcher.isActivated,
                spriteFrame: sprite.frame.name
            };
        });

        console.log('Launcher state after 600ms:', JSON.stringify(resetState));

        if (resetState.launcherActivated) {
            console.error('FAILURE: Launcher did not deactivate after 500ms!');
            process.exit(1);
        }

        console.log('✔ Launcher deactivated and frame reset successfully!');
        console.log('SUCCESS: Launcher system verification passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
