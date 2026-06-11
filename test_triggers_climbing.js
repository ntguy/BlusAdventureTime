import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Trigger/Ladder tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 936, height: 540 });

        // Forward console logs from page to node process
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        // Intercept prompts/dialogs for wiring entities
        let dialogCount = 0;
        page.on('dialog', async dialog => {
            const msg = dialog.message();
            console.log(`[PROMPT DIALOG]: "${msg}"`);
            dialogCount++;

            if (msg.includes('Trigger Channel') || msg.includes('Listen Channel')) {
                await dialog.accept('5'); // Wire both button and gate to channel "5"
            } else if (msg.includes('Trigger Type')) {
                await dialog.accept('interact'); // Interact mode for lever
            } else if (msg.includes('Visual Type')) {
                await dialog.accept('lever');
            } else {
                await dialog.accept('');
            }
        });

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

        // Place ladder, button, gate via evaluations
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default spawns if any to avoid overlaps, placing fresh ones
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 20, y: 12 }
            ];

            // Place a ladder from y = 8 to 12 at x = 3
            for (let y = 8; y <= 12; y++) {
                es.levelData.entities.push({ type: 'ladder', x: 3, y });
            }

            // Place a lever at x = 4, y = 12
            const btn = { type: 'lever', x: 4, y: 12, properties: { channel: '5' } };
            es.levelData.entities.push(btn);

            // Place a gate at x = 5, y = 12
            const gt = { type: 'gate', x: 5, y: 12, properties: { listenChannel: '5' } };
            es.levelData.entities.push(gt);

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed ladder, button, and gate on the grid');

        // Select the button on the grid and inspect coordinate details
        const clickResult = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            // Mock camera getWorldPoint to bypass camera scroll offsets
            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };

            const mockPointer = { x: 4 * 18 + 9, y: 12 * 18 + 9, leftButtonDown: () => true };
            const worldPoint = es.cameras.main.getWorldPoint(mockPointer.x, mockPointer.y);
            const tileX = Math.floor(worldPoint.x / 18);
            const tileY = Math.floor(worldPoint.y / 18);
            
            const existing = es.levelData.entities.find(e => e.x === tileX && e.y === tileY);
            
            es.paintGridAt(mockPointer);

            // Restore original method
            es.cameras.main.getWorldPoint = originalGetWorldPoint;
            
            return {
                tileX,
                tileY,
                existingFound: !!existing,
                selectedEntity: es.selectedEntity ? es.selectedEntity.type : null
            };
        });
        console.log('Click result log:', JSON.stringify(clickResult));

        // Trigger prompt editing manually
        console.log('Opening properties dialog prompts...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            es.editSelectedEntityProps();
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        if (dialogCount < 3) {
            console.error(`FAILURE: Prompt sequences were not invoked. Dialog count: ${dialogCount}`);
            process.exit(1);
        }
        console.log('✔ Wiring prompt dialogue sequence completed successfully!');

        // 3. Playtest the level
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

        // 4. Test climbing the ladder (human at x=3, overlapping ladder)
        console.log('Moving player to the ladder (press Right)...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 200)); // increased to 200ms to stay on ladder with slower speed
        await page.keyboard.up('KeyD');

        console.log('Climbing up the ladder (press Up/Jump action)...');
        await page.keyboard.down('KeyW');
        await new Promise(resolve => setTimeout(resolve, 400));
        
        let climbState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const p1 = gameScene.player1Entity.getComponent('Player');
            const p1Phys = gameScene.player1Entity.getComponent('PhysicsBody');
            return {
                isClimbing: p1.isClimbing,
                allowGravity: p1Phys.body.allowGravity,
                velocityY: p1Phys.body.velocity.y
            };
        });

        await page.keyboard.up('KeyW');

        console.log('Player climb state values:', JSON.stringify(climbState));
        if (!climbState.isClimbing || climbState.allowGravity) {
            console.error('FAILURE: Player is not in climbing state or gravity is not suspended on the ladder!');
            process.exit(1);
        }
        console.log('✔ Player climbing physics work perfectly (gravity suspended, climb velocity applied)!');

        // 5. Test Button interaction and Gate toggling
        console.log('Letting player drop down to the ground...');
        await page.keyboard.down('KeyS');
        await new Promise(resolve => setTimeout(resolve, 600));
        await page.keyboard.up('KeyS');

        console.log('Stepping to the lever at x=4...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 150)); // walk from x=3 to x=4
        await page.keyboard.up('KeyD');

        let playerPos = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const body = gameScene.player1Entity.getComponent('PhysicsBody').body;
            return { x: body.x, y: body.y };
        });
        console.log('Player coordinates before pressing E:', playerPos);

        let initialGateState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            
            // Find gate entity
            const gates = gameScene.entityManager.query('Triggerable');
            const gate = gates[0].getComponent('Triggerable');
            const body = gates[0].getComponent('PhysicsBody');
            return {
                gateState: gate.state,
                bodyEnabled: body.body.enable
            };
        });
        console.log('Initial gate status (untriggered):', JSON.stringify(initialGateState));

        if (initialGateState.gateState || !initialGateState.bodyEnabled) {
            console.error('FAILURE: Gate is open or has disabled physics initially!');
            process.exit(1);
        }

        console.log('Interacting with the lever (press E)...');
        await page.keyboard.press('KeyE');
        await new Promise(resolve => setTimeout(resolve, 500));

        let activeGateState = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            
            const gates = gameScene.entityManager.query('Triggerable');
            const gate = gates[0].getComponent('Triggerable');
            const body = gates[0].getComponent('PhysicsBody');
            return {
                gateState: gate.state,
                bodyEnabled: body.body.enable
            };
        });
        console.log('Lever toggled - Gate status:', JSON.stringify(activeGateState));

        if (!activeGateState.gateState || activeGateState.bodyEnabled) {
            console.error('FAILURE: Gate did not open or its physical collision was not disabled after switch activation!');
            process.exit(1);
        }
        console.log('✔ Lever interaction and Gate state toggles work successfully!');

        console.log('SUCCESS: All ladder climbing and triggers wiring tests passed!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
