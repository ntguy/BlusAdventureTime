import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Editor Rework tests...');
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

        // 1. Verify tab and tool defaults
        let initialStates = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeTab: es.activeTab,
                activeTool: es.activeTool,
                paletteSpritesCount: es.paletteSprites.length,
                paletteTextsCount: es.paletteTexts.length
            };
        });

        console.log('Initial editor states:', JSON.stringify(initialStates));

        if (initialStates.activeTab !== 'tiles' || initialStates.activeTool !== 'terrain') {
            console.error('FAILURE: Default tab or tool is incorrect.');
            process.exit(1);
        }

        if (initialStates.paletteSpritesCount !== 204) {
            console.error(`FAILURE: Combined tiles count is not 204. Found: ${initialStates.paletteSpritesCount}`);
            process.exit(1);
        }
        console.log('✔ Combined tiles count verified (24 background + 180 terrain = 204 tiles)');

        // 2. Test switching to Entities tab (digit '3')
        console.log('Pressing shortcut Digit3 to swap to Entities tab...');
        await page.keyboard.press('Digit3');
        await new Promise(resolve => setTimeout(resolve, 500));

        let entitiesState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeTab: es.activeTab,
                activeTool: es.activeTool,
                paletteTextsCount: es.paletteTexts.length
            };
        });

        console.log('Entities tab states:', JSON.stringify(entitiesState));

        if (entitiesState.activeTab !== 'entities') {
            console.error('FAILURE: Tab did not switch to entities.');
            process.exit(1);
        }
        if (entitiesState.paletteTextsCount === 0) {
            console.error('FAILURE: Entities list is empty.');
            process.exit(1);
        }
        console.log('✔ Entities tab verified successfully');

        // 3. Switch back to Tiles tab (digit '2' sets activeTool to 'bg')
        console.log('Pressing shortcut Digit2 to swap back to Tiles tab with BG tool...');
        await page.keyboard.press('Digit2');
        await new Promise(resolve => setTimeout(resolve, 500));

        let tilesBgState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeTab: es.activeTab,
                activeTool: es.activeTool
            };
        });

        console.log('Tiles tab BG tool states:', JSON.stringify(tilesBgState));

        if (tilesBgState.activeTab !== 'tiles' || tilesBgState.activeTool !== 'bg') {
            console.error('FAILURE: Fails to swap back to tiles tab or select BG tool.');
            process.exit(1);
        }
        console.log('✔ Swapped back and tool BG selected');

        // 4. Test Background placement and overlay verification
        console.log('Painting a background tile at x=5, y=5...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            
            const mockPointer = { x: 5 * 18 + 9, y: 5 * 18 + 9, leftButtonDown: () => true };
            
            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };

            es.paintGridAt(mockPointer);

            es.cameras.main.getWorldPoint = originalGetWorldPoint;
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        let placementState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const bgVal = es.levelData.layers.background[5 * es.levelData.meta.width + 5];
            const hasOverlayText = es.bgOverlays.has('5,5');
            return {
                bgPlacedValue: bgVal,
                hasOverlay: hasOverlayText
            };
        });

        console.log('Placement results:', JSON.stringify(placementState));

        if (placementState.bgPlacedValue < 0) {
            console.error('FAILURE: Background tile was not placed.');
            process.exit(1);
        }
        if (!placementState.hasOverlay) {
            console.error('FAILURE: Transparent BG text overlay was not drawn.');
            process.exit(1);
        }
        console.log('✔ Background tile and translucent "BG" overlay created successfully!');

        // 5. Test Erasing background tile and clearing overlay
        console.log('Selecting ERASE tool (press key E)...');
        await page.keyboard.press('KeyE');
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log('Erasing the tile at x=5, y=5...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const mockPointer = { x: 5 * 18 + 9, y: 5 * 18 + 9, leftButtonDown: () => true };
            
            const originalGetWorldPoint = es.cameras.main.getWorldPoint;
            es.cameras.main.getWorldPoint = function(x, y) {
                return new Phaser.Math.Vector2(x, y);
            };

            es.paintGridAt(mockPointer);

            es.cameras.main.getWorldPoint = originalGetWorldPoint;
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        let eraseState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const bgVal = es.levelData.layers.background[5 * es.levelData.meta.width + 5];
            const hasOverlayText = es.bgOverlays.has('5,5');
            return {
                bgPlacedValue: bgVal,
                hasOverlay: hasOverlayText
            };
        });

        console.log('Erase results:', JSON.stringify(eraseState));

        if (eraseState.bgPlacedValue >= 0) {
            console.error('FAILURE: Background tile was not erased.');
            process.exit(1);
        }
        if (eraseState.hasOverlay) {
            console.error('FAILURE: Transparent BG text overlay was not deleted.');
            process.exit(1);
        }

        console.log('✔ Background tile and translucent "BG" overlay erased successfully!');
        console.log('SUCCESS: All editor grid and tab rework tests passed completely!');

        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
