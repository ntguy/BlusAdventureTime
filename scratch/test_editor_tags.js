import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser for Editor Tags and Filtering tests...');
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

        // Clear local storage tile tags to start fresh
        console.log('Clearing tile tags in localStorage...');
        await page.evaluate(() => {
            localStorage.removeItem('blu_tile_tags');
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            es.loadTileTags();
            es.buildPaletteUI();
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // 1. Verify that 'background' preset tag is present and has the expected GIDs
        let initialTagsState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                tags: Object.keys(es.tileTags),
                backgroundCount: es.tileTags.background.length,
                paletteSpritesCount: es.paletteSprites.length
            };
        });

        console.log('Initial tags state:', JSON.stringify(initialTagsState));
        if (!initialTagsState.tags.includes('background') || initialTagsState.backgroundCount !== 24) {
            console.error('FAILURE: "background" preset tag is missing or does not have 24 GIDs.');
            process.exit(1);
        }
        if (initialTagsState.paletteSpritesCount !== 204) {
            console.error('FAILURE: Palette should initially display all 204 tiles under "all" filter.');
            process.exit(1);
        }
        console.log('✔ Preset tags verified successfully');

        // 2. Click the 'background' tag filter button and verify filtering
        console.log('Filtering palette by "background" tag...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const btn = es.tagTextObjects.find(t => t.text.includes('BACKGROUND'));
            btn.emit('pointerdown');
        });
        await new Promise(resolve => setTimeout(resolve, 3000));

        let filteredState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeFilter: es.activeTagFilter,
                paletteSpritesCount: es.paletteSprites.length
            };
        });

        console.log('Filtered palette state:', JSON.stringify(filteredState));
        if (filteredState.activeFilter !== 'background' || filteredState.paletteSpritesCount !== 24) {
            console.error('FAILURE: Palette did not filter correctly to show 24 background GIDs.');
            process.exit(1);
        }
        console.log('✔ Tag filtering filters grid to only background tiles');

        // 3. Clear filter (click 'all') and check that it resets back to 204
        console.log('Clearing filter to "all"...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const btn = es.tagTextObjects.find(t => t.text.includes('ALL'));
            btn.emit('pointerdown');
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        let resetState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeFilter: es.activeTagFilter,
                paletteSpritesCount: es.paletteSprites.length
            };
        });

        console.log('Reset palette state:', JSON.stringify(resetState));
        if (resetState.activeFilter !== 'all' || resetState.paletteSpritesCount !== 204) {
            console.error('FAILURE: Palette did not reset back to show all 204 GIDs.');
            process.exit(1);
        }
        console.log('✔ Clearing filter successfully restores all tiles');

        // 4. Open DOM Tag Manager
        console.log('Opening Tag Manager...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const btn = es.tagTextObjects.find(t => t.text === '[ 🏷️ TAGS ]');
            btn.emit('pointerdown');
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if modal exists
        let modalExists = await page.evaluate(() => {
            const headers = Array.from(document.querySelectorAll('h3'));
            return headers.some(h => h.innerText.includes('TILE TAG MANAGER'));
        });
        if (!modalExists) {
            console.error('FAILURE: Tag manager modal overlay was not displayed.');
            process.exit(1);
        }
        console.log('✔ DOM Tag Manager modal opens successfully');

        // 5. Add custom tag 'custom_tag'
        console.log('Adding "custom_tag"...');
        await page.evaluate(() => {
            const input = document.querySelector('input[placeholder="New tag name..."]');
            if (input) {
                input.value = 'custom_tag';
            }
            const btns = Array.from(document.querySelectorAll('button'));
            const addBtn = btns.find(b => b.innerText === '+ ADD');
            if (addBtn) {
                addBtn.click();
            } else {
                throw new Error('Could not find + ADD button.');
            }
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click GID 25 (terrain tile) in the checklist
        console.log('Associating GID 25 with "custom_tag"...');
        await page.evaluate(() => {
            // Find GID 25 cell in the modal grid scroll container
            const cells = Array.from(document.querySelectorAll('div'));
            const cell25 = cells.find(c => c.innerText === 'GID 25');
            if (cell25) {
                cell25.click();
            } else {
                throw new Error('Could not find GID 25 cell in modal.');
            }
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Save and Close
        console.log('Clicking CLOSE & APPLY...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const closeApplyBtn = btns.find(b => b.innerText === 'CLOSE & APPLY');
            if (closeApplyBtn) {
                closeApplyBtn.click();
            } else {
                throw new Error('Could not find CLOSE & APPLY button.');
            }
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // 6. Verify that 'custom_tag' tag is present and has GID 25 associated
        let tagAfterManager = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                tags: Object.keys(es.tileTags),
                customTagGids: es.tileTags.custom_tag ? [...es.tileTags.custom_tag] : null
            };
        });

        console.log('Tag state after manager close:', JSON.stringify(tagAfterManager));
        if (!tagAfterManager.tags.includes('custom_tag') || !tagAfterManager.customTagGids || !tagAfterManager.customTagGids.includes(25)) {
            console.error('FAILURE: "custom_tag" tag association or GID 25 addition failed.');
            process.exit(1);
        }
        console.log('✔ Custom tag and GID association saved successfully!');

        // 7. Click on the custom tag and verify that the main palette is filtered to show ONLY GID 25
        console.log('Clicking "custom_tag" filter in Phaser...');
        await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            const btn = es.tagTextObjects.find(t => t.text.includes('CUSTOM_TAG'));
            btn.emit('pointerdown');
        });
        await new Promise(resolve => setTimeout(resolve, 200));

        let finalFilteredState = await page.evaluate(() => {
            const es = window.__PHASER_GAME__.scene.getScene('EditorScene');
            return {
                activeFilter: es.activeTagFilter,
                paletteSpritesCount: es.paletteSprites.length,
                renderedGid: es.paletteSprites[0] ? es.paletteSprites[0].getData('gid') : null
            };
        });

        console.log('Final filtered state:', JSON.stringify(finalFilteredState));
        if (finalFilteredState.activeFilter !== 'custom_tag' || finalFilteredState.paletteSpritesCount !== 1 || finalFilteredState.renderedGid !== 25) {
            console.error('FAILURE: Custom tag filter did not isolate GID 25 correctly.');
            process.exit(1);
        }
        console.log('✔ Custom tag filters palette to only show tile GID 25 correctly');

        console.log('SUCCESS: All editor tags and filtering tests passed completely!');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Error during test execution:', err);
        await browser.close();
        process.exit(1);
    }
}

run();
