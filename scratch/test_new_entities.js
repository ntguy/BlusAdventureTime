import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for New Entities (Spawn-Checkpoints, Sign, Spikes, Crate friction) tests...');
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

        // Place test entities:
        // - humanSpawn: x=2, y=12
        // - dogSpawn: x=12, y=12
        // - crate: x=1, y=12
        // - sign: x=6, y=12 (properties: { text: "Sign Message!" })
        // - spikes: x=10, y=12
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default entities
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 12, y: 12 },
                { type: 'crate', x: 1, y: 12 },
                { type: 'sign', x: 6, y: 12, properties: { text: "Sign Message!" } },
                { type: 'spikes', x: 10, y: 12 }
            ];

            // Clear terrain and place solid ground at y=13
            for (let x = 1; x <= 22; x++) {
                const idx = 12 * es.levelData.meta.width + x;
                es.levelData.layers.terrain[idx] = -1; 
                const groundIdx = 13 * es.levelData.meta.width + x;
                es.levelData.layers.terrain[groundIdx] = 0; 
            }

            es.createWorkspaceTilemap();
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Configured test environment in editor');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify loaded scene is GameScene
        let currentScene = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            return game.scene.getScenes(true)[0].sys.settings.key;
        });
        if (currentScene !== 'GameScene') {
            console.error('FAILURE: Failed to enter playtest.');
            process.exit(1);
        }

        // Test Case 1: humanSpawn and dogSpawn initial state as checkpoints
        console.log('Test Case 1: Verifying humanSpawn and dogSpawn act as active checkpoints...');
        let checkspawns = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const checkpoints = gameScene.entityManager.query('Checkpoint');
            
            // Should find 2 checkpoint entities (representing humanSpawn and dogSpawn)
            // humanSpawn is at x=2 (transform x=45), dogSpawn is at x=12 (transform x=225)
            const cp1 = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 45) < 5);
            const cp2 = checkpoints.find(c => Math.abs(c.getComponent('Transform').x - 225) < 5);

            return {
                count: checkpoints.length,
                humanSpawnActive: cp1 ? cp1.getComponent('Checkpoint').humanActive : null,
                humanSpawnDogActive: cp1 ? cp1.getComponent('Checkpoint').dogActive : null,
                dogSpawnActive: cp2 ? cp2.getComponent('Checkpoint').dogActive : null,
                dogSpawnHumanActive: cp2 ? cp2.getComponent('Checkpoint').humanActive : null,
            };
        });

        console.log('Initial spawns checkpoint states:', JSON.stringify(checkspawns));
        if (checkspawns.count !== 2) {
            console.error(`FAILURE: Expected 2 checkpoints (spawns), got ${checkspawns.count}`);
            process.exit(1);
        }
        if (!checkspawns.humanSpawnActive || checkspawns.humanSpawnDogActive) {
            console.error('FAILURE: humanSpawn checkpoint should be active for human only.');
            process.exit(1);
        }
        if (!checkspawns.dogSpawnActive || checkspawns.dogSpawnHumanActive) {
            console.error('FAILURE: dogSpawn checkpoint should be active for dog only.');
            process.exit(1);
        }
        console.log('✔ humanSpawn and dogSpawn successfully loaded and initialized as active checkpoints');

        // Test Case 2: Crate drag
        console.log('Test Case 2: Verifying crate drag friction is 5000...');
        let crateDrag = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const crateEnt = gameScene.entityManager.query('Carryable', 'PhysicsBody')[0];
            const body = crateEnt.getComponent('PhysicsBody').body;
            return body.drag.x;
        });
        console.log('Crate drag friction:', crateDrag);
        if (crateDrag !== 5000) {
            console.error(`FAILURE: Expected crate drag to be 5000, got ${crateDrag}`);
            process.exit(1);
        }
        console.log('✔ Crate drag is verified to be 5000');

        // Test Case 3: Sign overlap text activation
        console.log('Test Case 3: Verifying Sign entity text popup on overlap...');
        let initialSignState = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const signEnt = gameScene.entityManager.query('Sign')[0];
            const sign = signEnt.getComponent('Sign');
            return {
                text: sign.text,
                hasTextObject: !!sign.textObject
            };
        });
        console.log('Initial Sign State:', JSON.stringify(initialSignState));
        if (initialSignState.hasTextObject) {
            console.error('FAILURE: Sign text object should not exist initially.');
            process.exit(1);
        }

        let initialPos = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(p => p.getComponent('Player').playerType === 'human');
            const body = humanEnt.getComponent('PhysicsBody').body;
            return { x: body.x, y: body.y };
        });
        console.log('Initial human position:', JSON.stringify(initialPos));

        // Walk human onto the sign (sign at x=6 (108px), human starts at x=2 (36px). walk right: 4 tiles * 18px = 72px)
        console.log('Walking human onto the sign...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 700));
        await page.keyboard.up('KeyD');

        let postWalkPos = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(p => p.getComponent('Player').playerType === 'human');
            const body = humanEnt.getComponent('PhysicsBody').body;
            return { x: body.x, y: body.y };
        });
        console.log('Post walk human position:', JSON.stringify(postWalkPos));

        let signOverlapState = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const signEnt = gameScene.entityManager.query('Sign')[0];
            const sign = signEnt.getComponent('Sign');
            return {
                hasTextObject: !!sign.textObject,
                textShown: sign.textObject ? sign.textObject.text : null,
                visible: sign.textObject ? sign.textObject.visible : false
            };
        });
        console.log('Sign overlap state:', JSON.stringify(signOverlapState));
        if (!signOverlapState.hasTextObject || signOverlapState.textShown !== "Sign Message!" || !signOverlapState.visible) {
            console.error('FAILURE: Sign text object should be visible with message "Sign Message!" when human stands on it.');
            process.exit(1);
        }
        console.log('✔ Sign correctly draws text bubble when human player is standing over it');

        // Walk human off the sign to the right (sign at x=6, move right to x=9)
        console.log('Walking human off the sign...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 700));
        await page.keyboard.up('KeyD');

        let signReleasedState = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const signEnt = gameScene.entityManager.query('Sign')[0];
            const sign = signEnt.getComponent('Sign');
            return {
                hasTextObject: !!sign.textObject
            };
        });
        console.log('Sign state after stepping off:', JSON.stringify(signReleasedState));
        if (signReleasedState.hasTextObject) {
            console.error('FAILURE: Sign text object should be destroyed when player steps off.');
            process.exit(1);
        }
        console.log('✔ Sign text object successfully cleaned up when player walks off');

        // Test Case 4: Spikes death and respawn
        console.log('Test Case 4: Verifying spikes collision death and respawn...');
        // Let's teleport the player to the spikes (x=10, 180px) and check if they die and respawn at humanSpawn (x=2, 36px)
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(p => p.getComponent('Player').playerType === 'human');
            const body = humanEnt.getComponent('PhysicsBody').body;
            
            // Move player exactly onto the spikes at x=10
            body.x = 10 * 18;
            body.y = 12 * 18;
        });

        await new Promise(resolve => setTimeout(resolve, 200)); // wait for physics and update tick

        let playerAfterSpikes = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(p => p.getComponent('Player').playerType === 'human');
            const body = humanEnt.getComponent('PhysicsBody').body;
            return {
                x: body.x,
                y: body.y
            };
        });

        console.log('Player position after touching spikes:', JSON.stringify(playerAfterSpikes));
        // Player should be back at spawnX/spawnY (which is near humanSpawn checkpoint: transform.x = 45, y = 221)
        if (Math.abs(playerAfterSpikes.x - (45 - 7)) > 10) { // body.x is left edge (transform.x - width/2: 45 - 7 = 38)
            console.error(`FAILURE: Player did not respawn at humanSpawn checkpoint (expected x ~38, got x=${playerAfterSpikes.x})`);
            process.exit(1);
        }
        console.log('✔ Player touched spikes, died, and respawned at the last checkpoint successfully!');

        console.log('SUCCESS: All new entity (Spawn-Checkpoints, Sign, Spikes, Crate drag) integration tests passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
