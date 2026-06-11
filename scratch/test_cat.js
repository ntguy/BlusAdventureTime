import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Cat entity tests...');
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

        // Place human, dog, and cat on the grid (Dog at x=8, Cat at x=11: distance is 3 tiles = 54px, exactly at new bark range)
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default entities
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 9, y: 12 },
                { type: 'cat', x: 11, y: 12 }
            ];

            // Clean terrain layer around our test area
            for (let x = 6; x <= 18; x++) {
                const idx = 12 * es.levelData.meta.width + x;
                es.levelData.layers.terrain[idx] = -1; // clear terrain tiles
                // Place solid ground below us at y = 13
                const groundIdx = 13 * es.levelData.meta.width + x;
                es.levelData.layers.terrain[groundIdx] = 0; // solid tile
            }

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed cat and players in the level editor at 3 tiles distance (54px)');

        // Playtest the level
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify loaded scene is GameScene
        let initialScene = await page.evaluate(() => {
            const game = window.__PHASER_GAME__;
            const gameScene = game.scene.getScene('GameScene');
            return gameScene.sys.settings.key;
        });
        if (initialScene !== 'GameScene') {
            console.error('FAILURE: Failed to enter playtest.');
            process.exit(1);
        }

        // Test Case 1: Dog barks facing left (away from cat)
        console.log('Test Case 1: Dog barks facing left (away from cat)...');
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const dogEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'dog');
            const dogSprite = dogEnt.getComponent('PhysicsBody').body.gameObject;
            dogSprite.setFlipX(false); // face left
        });

        // Trigger BARK (Spacebar)
        await page.keyboard.press('Space');
        await new Promise(resolve => setTimeout(resolve, 200));

        let catState1 = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            const catBody = catEnt.getComponent('PhysicsBody').body;
            return {
                state: cat.state,
                vx: catBody.velocity.x,
                x: catBody.x
            };
        });

        console.log('Cat state after left bark:', JSON.stringify(catState1));
        if (catState1.state !== 'sleeping' || catState1.vx !== 0) {
            console.error('FAILURE: Cat reacted to a bark that was not facing it.');
            process.exit(1);
        }
        console.log('✔ Cat ignored bark facing away');

        // Test Case 2: Dog barks facing right (towards cat)
        console.log('Test Case 2: Dog barks facing right (towards cat)...');
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const dogEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'dog');
            const dogSprite = dogEnt.getComponent('PhysicsBody').body.gameObject;
            dogSprite.setFlipX(true); // face right
        });

        // Trigger BARK (Spacebar)
        await page.keyboard.press('Space');
        await new Promise(resolve => setTimeout(resolve, 100)); // wait 100ms: should be in startled state

        let catState2Startled = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            const catBody = catEnt.getComponent('PhysicsBody').body;
            return {
                state: cat.state,
                vx: catBody.velocity.x,
                hasExclamation: !!cat.exclamation,
                exclamationText: cat.exclamation ? cat.exclamation.text : null,
                exclamationAlpha: cat.exclamation ? cat.exclamation.alpha : 0
            };
        });

        console.log('Cat state during startle phase:', JSON.stringify(catState2Startled));
        if (catState2Startled.state !== 'startled' || catState2Startled.vx !== 0) {
            console.error('FAILURE: Cat should be startled with 0 velocity during the first 250ms.');
            process.exit(1);
        }
        if (!catState2Startled.hasExclamation || catState2Startled.exclamationText !== '!') {
            console.error('FAILURE: Cat did not spawn an exclamation mark "!" during startle phase.');
            process.exit(1);
        }
        console.log('✔ Cat entered startled state and spawned a "!" exclamation mark successfully');

        // Wait another 200ms (total 300ms from bark): should now be running
        await new Promise(resolve => setTimeout(resolve, 200));

        let catState2Run = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            const catBody = catEnt.getComponent('PhysicsBody').body;
            return {
                state: cat.state,
                vx: catBody.velocity.x,
                hasExclamation: !!cat.exclamation
            };
        });

        console.log('Cat state during running phase:', JSON.stringify(catState2Run));
        if (catState2Run.state !== 'running' || Math.abs(catState2Run.vx - 90) > 1) {
            console.error(`FAILURE: Cat should be running right at speed 90. Got state=${catState2Run.state}, vx=${catState2Run.vx}`);
            process.exit(1);
        }
        if (catState2Run.hasExclamation) {
            console.error('FAILURE: Exclamation mark should be cleaned up after running starts.');
            process.exit(1);
        }
        console.log('✔ Cat is now running at the reduced speed (90px/s) and exclamation mark is cleaned up');

        // Wait for cat to run its full 90px (at speed 90, takes 1000ms, plus we used 200ms already, so let's wait 1200ms)
        await new Promise(resolve => setTimeout(resolve, 1200));

        let catState2Sleep = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            const catBody = catEnt.getComponent('PhysicsBody').body;
            return {
                state: cat.state,
                vx: catBody.velocity.x,
                x: catBody.x
            };
        });

        console.log('Cat state after completing run:', JSON.stringify(catState2Sleep));
        if (catState2Sleep.state !== 'sleeping' || catState2Sleep.vx !== 0) {
            console.error('FAILURE: Cat did not stop and go back to sleep after traveling 90px.');
            process.exit(1);
        }
        const distanceTraveled = Math.abs(catState2Sleep.x - catState1.x);
        console.log(`Distance traveled: ${distanceTraveled}px (expected ~90px)`);
        if (Math.abs(distanceTraveled - 90) > 5) {
            console.error('FAILURE: Cat traveled incorrect distance.');
            process.exit(1);
        }
        console.log('✔ Cat ran 5 spaces and returned to sleep');

        // Exit playtest back to editor
        console.log('Exiting playtest...');
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test Case 3: Cat is against a wall to the right. Bark facing right should make it run left.
        console.log('Test Case 3: Cat is against a wall. Bark facing right should make it run left...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Clear default entities
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 9, y: 12 },
                { type: 'cat', x: 11, y: 12 }
            ];

            // Clean terrain layer and place a wall to the right of the cat (x = 12)
            for (let x = 6; x <= 18; x++) {
                const idx = 12 * es.levelData.meta.width + x;
                es.levelData.layers.terrain[idx] = (x === 12) ? 0 : -1; // wall at x=12
            }

            es.createWorkspaceTilemap(); // redraw grid
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Configured wall at x=12 in editor');

        // Playtest again
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Face dog right (towards cat)
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const dogEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'dog');
            const dogSprite = dogEnt.getComponent('PhysicsBody').body.gameObject;
            dogSprite.setFlipX(true); // face right
        });

        // Trigger BARK
        await page.keyboard.press('Space');
        await new Promise(resolve => setTimeout(resolve, 100)); // wait for update

        let catState3Startled = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            return {
                state: cat.state,
                direction: cat.direction
            };
        });

        console.log('Cat state when barked against a wall (startled):', JSON.stringify(catState3Startled));
        if (catState3Startled.state !== 'startled' || catState3Startled.direction !== -1) {
            console.error('FAILURE: Cat against a wall on the right should have direction -1 (left).');
            process.exit(1);
        }

        // Wait for run phase
        await new Promise(resolve => setTimeout(resolve, 200));

        let catState3Run = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const catEnt = gameScene.entityManager.query('Cat')[0];
            const cat = catEnt.getComponent('Cat');
            const catBody = catEnt.getComponent('PhysicsBody').body;
            return {
                state: cat.state,
                vx: catBody.velocity.x,
                direction: cat.direction
            };
        });

        console.log('Cat state when running away from wall:', JSON.stringify(catState3Run));
        if (catState3Run.state !== 'running' || catState3Run.vx >= 0 || catState3Run.direction !== -1) {
            console.error('FAILURE: Cat should be running left.');
            process.exit(1);
        }
        console.log('✔ Cat against a wall ran away from the wall correctly!');

        // Exit playtest back to editor
        console.log('Exiting playtest...');
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test Case 4: Button (pressure plate) activation. Only active while player/cat overlaps. Does not trigger on crate.
        console.log('Test Case 4: Button activation tests (player/cat vs crate)...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            // Placed at y=12:
            // Human spawn: x=2, y=12
            // Button (channel 1, default pressure+button type): x=6, y=12
            // Gate (listening to channel 1): x=14, y=12
            // Crate: x=10, y=12
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 20, y: 12 },
                { type: 'button', x: 6, y: 12, properties: { channel: '1', triggerType: 'pressure', visualType: 'button' } },
                { type: 'gate', x: 14, y: 12, properties: { listenChannel: '1' } },
                { type: 'crate', x: 10, y: 12 }
            ];

            // Clear terrain so we can walk freely
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
        console.log('✔ Placed button, gate, and crate in editor');

        // Playtest again
        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Initial State: Button should be inactive (frame 148), gate should be active/solid (enable: true, visible: true)
        let buttonInitial = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const buttonEnt = gameScene.entityManager.query('Trigger')[0];
            const trigger = buttonEnt.getComponent('Trigger');
            const render = buttonEnt.getComponent('Render');
            const gateEnt = gameScene.entityManager.query('Triggerable')[0];
            const gateBody = gateEnt.getComponent('PhysicsBody').body;
            const gateRender = gateEnt.getComponent('Render');
            return {
                isActive: trigger.isActive,
                frame: render.gameObject.frame.name,
                gateEnabled: gateBody.enable,
                gateVisible: gateRender.gameObject.visible
            };
        });
        console.log('Initial Button State:', JSON.stringify(buttonInitial));
        if (buttonInitial.isActive || buttonInitial.frame !== 148 || !buttonInitial.gateEnabled || !buttonInitial.gateVisible) {
            console.error('FAILURE: Button should be inactive and gate should be active/visible initially.');
            process.exit(1);
        }
        console.log('✔ Button is inactive and gate is active initially.');

        // 2. Move human onto the button (button is at x=6, human starts at x=2. distance = 4 tiles * 18px = 72px)
        console.log('Moving human player onto button (press Right)...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 900)); // walk onto the button
        await page.keyboard.up('KeyD');

        let buttonPressed = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const buttonEnt = gameScene.entityManager.query('Trigger')[0];
            const trigger = buttonEnt.getComponent('Trigger');
            const render = buttonEnt.getComponent('Render');
            const gateEnt = gameScene.entityManager.query('Triggerable')[0];
            const gateBody = gateEnt.getComponent('PhysicsBody').body;
            const gateRender = gateEnt.getComponent('Render');
            return {
                isActive: trigger.isActive,
                frame: render.gameObject.frame.name,
                gateEnabled: gateBody.enable,
                gateVisible: gateRender.gameObject.visible
            };
        });
        console.log('Button State while pressed:', JSON.stringify(buttonPressed));
        if (!buttonPressed.isActive || buttonPressed.frame !== 149 || buttonPressed.gateEnabled || buttonPressed.gateVisible) {
            console.error('FAILURE: Button should be active (frame 149) and gate open (disabled/invisible) when stood on.');
            process.exit(1);
        }
        console.log('✔ Button active (frame changed to 149) and gate opened when stood on.');

        // 3. Move human OFF the button to the right
        console.log('Moving human player off button...');
        await page.keyboard.down('KeyD');
        await new Promise(resolve => setTimeout(resolve, 750)); 
        await page.keyboard.up('KeyD');

        let buttonReleased = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const buttonEnt = gameScene.entityManager.query('Trigger')[0];
            const trigger = buttonEnt.getComponent('Trigger');
            const render = buttonEnt.getComponent('Render');
            const gateEnt = gameScene.entityManager.query('Triggerable')[0];
            const gateBody = gateEnt.getComponent('PhysicsBody').body;
            const gateRender = gateEnt.getComponent('Render');
            return {
                isActive: trigger.isActive,
                frame: render.gameObject.frame.name,
                gateEnabled: gateBody.enable,
                gateVisible: gateRender.gameObject.visible
            };
        });
        console.log('Button State after stepping off:', JSON.stringify(buttonReleased));
        if (buttonReleased.isActive || buttonReleased.frame !== 148 || !buttonReleased.gateEnabled || !buttonReleased.gateVisible) {
            console.error('FAILURE: Button should become inactive and gate close again when player steps off.');
            process.exit(1);
        }
        console.log('✔ Button deactivated (frame changed back to 148) and gate closed when stepped off.');

        // 4. Test Crate: Move crate onto button.
        // Let's teleport the crate onto the button and check if it activates the button.
        console.log('Teleporting crate onto button to verify it does not trigger it...');
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const crateEnt = gameScene.entityManager.query('Carryable', 'PhysicsBody')[0];
            const crateBody = crateEnt.getComponent('PhysicsBody').body;
            const buttonEnt = gameScene.entityManager.query('Trigger')[0];
            const buttonTransform = buttonEnt.getComponent('Transform');
            
            // Move crate exactly onto the button
            crateBody.x = buttonTransform.x - crateBody.width / 2;
            crateBody.y = buttonTransform.y - crateBody.height / 2;
        });
        await new Promise(resolve => setTimeout(resolve, 200)); // wait for physics/system update

        let buttonWithCrate = await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const buttonEnt = gameScene.entityManager.query('Trigger')[0];
            const trigger = buttonEnt.getComponent('Trigger');
            const render = buttonEnt.getComponent('Render');
            return {
                isActive: trigger.isActive,
                frame: render.gameObject.frame.name
            };
        });
        console.log('Button State with Crate on it:', JSON.stringify(buttonWithCrate));
        if (buttonWithCrate.isActive || buttonWithCrate.frame !== 148) {
            console.error('FAILURE: Button should NOT be activated by a crate (only player or cat).');
            process.exit(1);
        }
        console.log('✔ Verified button is NOT activated by a crate.');

        // Test Case 5: Human touching cat causes death
        console.log('Test Case 5: Human touching cat causes death...');
        console.log('Exiting playtest from Case 4...');
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 1000));

        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            es.levelData.entities = [
                { type: 'humanSpawn', x: 2, y: 12 },
                { type: 'dogSpawn', x: 20, y: 12 },
                { type: 'cat', x: 11, y: 12 }
            ];
            es.createWorkspaceTilemap();
            es.entityVisuals.clear();
            es.levelData.entities.forEach(ent => es.drawEntityVisual(ent));
        });
        console.log('✔ Placed cat in editor for Case 5');

        console.log('Entering Playtest mode...');
        await page.keyboard.press('KeyP');
        await new Promise(resolve => setTimeout(resolve, 2000));

        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'human');
            const humanBody = humanEnt.getComponent('PhysicsBody').body;
            const catEnt = gameScene.entityManager.query('Cat')[0];
            if (!catEnt) {
                console.error('Cat entity not found!');
                return;
            }
            const catBody = catEnt.getComponent('PhysicsBody').body;

            // Reset human and cat to clear test coordinates
            humanBody.reset(54, 190);
            catBody.reset(90, 190);
            console.log('RESET: humanBody.x/y:', humanBody.x, humanBody.y, 'catBody.x/y:', catBody.x, catBody.y);
        });
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for them to settle on the ground

        // Log positions after settling
        await page.evaluate(() => {
            const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
            const humanBody = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'human').getComponent('PhysicsBody').body;
            const catBody = gameScene.entityManager.query('Cat')[0].getComponent('PhysicsBody').body;
            console.log('SETTLED: humanBody.x/y:', humanBody.x, humanBody.y, 'catBody.x/y:', catBody.x, catBody.y);
        });

        // Move human right towards the cat
        console.log('Walking human to the right...');
        await page.keyboard.down('KeyD');
        
        let died = false;
        for (let i = 0; i < 20; i++) { // check every 50ms for 1000ms
            await new Promise(resolve => setTimeout(resolve, 50));
            const isDying = await page.evaluate(() => {
                const gameScene = window.__PHASER_GAME__.scene.getScene('GameScene');
                const humanEnt = gameScene.entityManager.query('Player', 'PhysicsBody').find(ent => ent.getComponent('Player').playerType === 'human');
                return humanEnt.getComponent('Player').isDying || false;
            });
            if (isDying) {
                died = true;
                break;
            }
        }
        await page.keyboard.up('KeyD');
        await new Promise(resolve => setTimeout(resolve, 200)); // wait for settling

        if (!died) {
            console.error('FAILURE: Human did not die after touching the cat.');
            process.exit(1);
        }
        console.log('✔ Verified human touches cat causes death successfully.');

        console.log('SUCCESS: All Cat and Button entity integration tests passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
