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
    console.log('Launching browser for RequireAll and Overlay tests...');
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
                { type: 'dogSpawn', x: 6, y: 12 }
            ];

            // Place button 1 at x = 3, y = 13
            es.levelData.entities.push({
                type: 'button',
                x: 3,
                y: 13,
                properties: {
                    channel: '1',
                    triggerType: 'pressure',
                    visualType: 'button'
                }
            });

            // Place button 2 at x = 5, y = 13
            es.levelData.entities.push({
                type: 'button',
                x: 5,
                y: 13,
                properties: {
                    channel: '1',
                    triggerType: 'pressure',
                    visualType: 'button'
                }
            });

            // Place gate at x = 7, y = 13
            es.levelData.entities.push({
                type: 'gate',
                x: 7,
                y: 13,
                properties: {
                    listenChannel: '1',
                    requireAll: 'true'
                }
            });

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed two buttons and a requireAll gate');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Verify gate is closed initially, and overlay shows remaining = 2
        let initialStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const gates = gameScene.entityManager.query('Triggerable');
            const gateEnt = gates.find(g => g.getComponent('Triggerable').targetType === 'gate');
            const gate = gateEnt.getComponent('Triggerable');
            
            return {
                state: gate.state, // false means closed (solid)
                overlayFrame: gate.overlaySprite ? gate.overlaySprite.frame.name : null,
                overlayVisible: gate.overlaySprite ? gate.overlaySprite.visible : false
            };
        });

        console.log('Initial status:', JSON.stringify(initialStatus));
        if (initialStatus.state !== false) {
            console.error('FAILURE: Gate should be closed initially.');
            process.exit(1);
        }
        // frame 162 corresponds to tile 162, which is '2' (since 160 is '0', 161 is '1', 162 is '2')
        if (initialStatus.overlayFrame !== 162) {
            console.error('FAILURE: Overlay number should be 2 (frame 162). Got:', initialStatus.overlayFrame);
            process.exit(1);
        }
        if (!initialStatus.overlayVisible) {
            console.error('FAILURE: Overlay should be visible.');
            process.exit(1);
        }
        console.log('✔ Gate is closed and overlay shows "2" successfully.');

        // Move human right onto the first button (x = 3)
        // Human spawns at (2, 12). Let's move right.
        console.log('Moving human onto first button...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 120));
        await page.keyboard.up('KeyD');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 2. Verify gate is still closed, and overlay shows remaining = 1
        let midStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const gates = gameScene.entityManager.query('Triggerable');
            const gateEnt = gates.find(g => g.getComponent('Triggerable').targetType === 'gate');
            const gate = gateEnt.getComponent('Triggerable');

            // Find triggers
            const triggers = gameScene.entityManager.query('Trigger');
            const triggerInfo = triggers.map(t => {
                const tr = t.getComponent('Trigger');
                const trans = t.getComponent('Transform');
                return {
                    channel: tr.channel,
                    isActive: tr.isActive,
                    x: trans.x,
                    y: trans.y
                };
            });

            // Find players
            const players = gameScene.entityManager.query('Player');
            const playerInfo = players.map(p => {
                const pl = p.getComponent('Player');
                const pb = p.getComponent('PhysicsBody').body;
                return {
                    playerIndex: pl.playerIndex,
                    x: pb.x,
                    y: pb.y,
                    w: pb.width,
                    h: pb.height
                };
            });
            
            return {
                state: gate.state,
                overlayFrame: gate.overlaySprite ? gate.overlaySprite.frame.name : null,
                overlayVisible: gate.overlaySprite ? gate.overlaySprite.visible : false,
                triggerInfo,
                playerInfo
            };
        });

        console.log('Mid status:', JSON.stringify(midStatus));
        if (midStatus.state !== false) {
            console.error('FAILURE: Gate should still be closed when only one button is pressed.');
            process.exit(1);
        }
        if (midStatus.overlayFrame !== 161) {
            console.error('FAILURE: Overlay number should be 1 (frame 161). Got:', midStatus.overlayFrame);
            process.exit(1);
        }
        if (!midStatus.overlayVisible) {
            console.error('FAILURE: Overlay should still be visible.');
            process.exit(1);
        }
        console.log('✔ Gate remains closed and overlay dynamically updated to "1" successfully.');

        // Let's also move the dog onto the second button (x = 5)
        // Dog spawns at x = 6, let's walk it left using ArrowLeft
        console.log('Moving dog onto second button...');
        await page.keyboard.down('ArrowLeft');
        await new Promise(resolve => setTimeout(resolve, 150));
        await page.keyboard.up('ArrowLeft');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Verify gate is now open, and overlay is hidden
        let finalStatus = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            const gates = gameScene.entityManager.query('Triggerable');
            const gateEnt = gates.find(g => g.getComponent('Triggerable').targetType === 'gate');
            const gate = gateEnt.getComponent('Triggerable');

            // Find triggers
            const triggers = gameScene.entityManager.query('Trigger');
            const triggerInfo = triggers.map(t => {
                const tr = t.getComponent('Trigger');
                const trans = t.getComponent('Transform');
                return {
                    channel: tr.channel,
                    isActive: tr.isActive,
                    x: trans.x,
                    y: trans.y
                };
            });

            // Find players
            const players = gameScene.entityManager.query('Player');
            const playerInfo = players.map(p => {
                const pl = p.getComponent('Player');
                const pb = p.getComponent('PhysicsBody').body;
                return {
                    playerIndex: pl.playerIndex,
                    x: pb.x,
                    y: pb.y,
                    w: pb.width,
                    h: pb.height
                };
            });
            
            return {
                state: gate.state, // true means open
                overlayVisible: gate.overlaySprite ? gate.overlaySprite.visible : false,
                triggerInfo,
                playerInfo
            };
        });

        console.log('Final status:', JSON.stringify(finalStatus));
        if (finalStatus.state !== true) {
            console.error('FAILURE: Gate should be open when all buttons are pressed.');
            process.exit(1);
        }
        if (finalStatus.overlayVisible) {
            console.error('FAILURE: Overlay should be hidden when gate is open.');
            process.exit(1);
        }
        console.log('✔ Gate opened and overlay disappeared successfully.');

        console.log('SUCCESS: requireAll and overlay tests passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
