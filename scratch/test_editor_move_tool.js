import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Editor Move Tool tests...');
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 954, height: 558 });

        // Forward console logs
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        console.log('Navigating to game...');
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Open Level Editor
        console.log('Opening EditorScene...');
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('KeyS');
        await new Promise(resolve => setTimeout(resolve, 200));
        await page.keyboard.press('Enter');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 1. Verify layout buttons of the 4 tools
        let toolButtonLabels = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                terrText: es.toolButtons.terrain.text,
                bgText: es.toolButtons.bg.text,
                eraseText: es.toolButtons.erase.text,
                moveText: es.toolButtons.move.text
            };
        });

        console.log('Tool button labels:', JSON.stringify(toolButtonLabels));
        if (toolButtonLabels.terrText !== 'TERR' || toolButtonLabels.bgText !== 'BG' ||
            toolButtonLabels.eraseText !== 'ERASE' || toolButtonLabels.moveText !== 'MOVE') {
            console.error('FAILURE: Tool buttons are not labelled correctly.');
            process.exit(1);
        }
        console.log('✔ Verified tool buttons labels ("TERR", "BG", "ERASE", "MOVE")');

        // 2. Paint a terrain tile GID 0 at grid (10, 10)
        console.log('Painting tile GID 0 at grid (10, 10)...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            es.selectedTileIndex = 0;
            es.setTool('terrain');

            const mockPointer = { x: 10 * 18 + 9, y: 10 * 18 + 9, leftButtonDown: () => true };
            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };
            es.paintGridAt(mockPointer);
            es.cameras.main.getWorldPoint = originalGetWorldPoint;
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        let paintState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const w = es.levelData.meta.width;
            return es.levelData.layers.terrain[10 * w + 10];
        });
        console.log('Paint GID 0 state:', paintState);
        if (paintState !== 0) {
            console.error('FAILURE: Tile GID 0 was not placed at (10, 10).');
            process.exit(1);
        }

        // 3. Test dragging the tile from (10, 10) to (11, 11) using the move tool
        console.log('Dragging tile from (10, 10) to (11, 11)...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            es.setTool('move');

            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };

            // Start drag
            es.startDragging({ x: 10 * 18 + 9, y: 10 * 18 + 9, leftButtonDown: () => true });

            // Move drag
            es.updateDragging({ x: 11 * 18 + 9, y: 11 * 18 + 9 });

            // Stop drag
            es.stopDragging({ x: 11 * 18 + 9, y: 11 * 18 + 9 });

            es.cameras.main.getWorldPoint = originalGetWorldPoint;
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        let dragTileResult = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const w = es.levelData.meta.width;
            return {
                sourceVal: es.levelData.layers.terrain[10 * w + 10],
                destVal: es.levelData.layers.terrain[11 * w + 11]
            };
        });
        console.log('Drag tile results:', JSON.stringify(dragTileResult));
        if (dragTileResult.sourceVal !== -1 || dragTileResult.destVal !== 0) {
            console.error('FAILURE: Dragging tile did not move it from (10, 10) to (11, 11).');
            process.exit(1);
        }
        console.log('✔ Dragged and dropped terrain tile successfully');

        // 4. Test dragging an entity: default level has humanSpawn at (3, 12)
        // Let's drag it to (4, 11)
        console.log('Dragging humanSpawn from (3, 12) to (4, 11)...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };

            // Start drag
            es.startDragging({ x: 3 * 18 + 9, y: 12 * 18 + 9, leftButtonDown: () => true });

            // Move drag
            es.updateDragging({ x: 4 * 18 + 9, y: 11 * 18 + 9 });

            // Stop drag
            es.stopDragging({ x: 4 * 18 + 9, y: 11 * 18 + 9 });

            es.cameras.main.getWorldPoint = originalGetWorldPoint;
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        let dragEntityResult = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const human = es.levelData.entities.find(e => e.type === 'humanSpawn');
            return human ? { x: human.x, y: human.y } : null;
        });
        console.log('Drag entity results:', JSON.stringify(dragEntityResult));
        if (!dragEntityResult || dragEntityResult.x !== 4 || dragEntityResult.y !== 11) {
            console.error('FAILURE: Dragging humanSpawn did not move it to (4, 11).');
            process.exit(1);
        }
        console.log('✔ Dragged and dropped entity successfully');

        console.log('SUCCESS: All editor move tool tests passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
