import puppeteer from 'puppeteer';

(async () => {
    console.log("Launching browser...");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Print all page logs
    page.on('console', msg => {
        console.log('PAGE LOG:', msg.text());
    });

    console.log("Navigating to http://localhost:5173...");
    await page.goto('http://localhost:5173');

    // Wait for MainMenuScene to be active
    console.log("Waiting for MainMenuScene to be active...");
    await page.waitForFunction(() => {
        return window.__PHASER_GAME__ && 
               window.__PHASER_GAME__.scene && 
               window.__PHASER_GAME__.scene.getScenes(true).length > 0 &&
               window.__PHASER_GAME__.scene.getScenes(true)[0].scene.key === 'MainMenuScene';
    }, { timeout: 10000 });

    console.log("Starting EditorScene with Lvl2-Jun9...");
    await page.evaluate(() => {
        const game = window.__PHASER_GAME__;
        const scene = game.scene.getScenes(true)[0];
        // Start EditorScene directly with Lvl2-Jun9 data
        scene.scene.start('EditorScene', { levelData: game.cache.json.get('Lvl2-Jun9') });
    });

    // Wait for EditorScene to be active
    console.log("Waiting for EditorScene to be active...");
    await page.waitForFunction(() => {
        return window.__PHASER_GAME__ && 
               window.__PHASER_GAME__.scene && 
               window.__PHASER_GAME__.scene.isActive('EditorScene');
    }, { timeout: 10000 });

    console.log("Clicking PLAY in EditorScene...");
    await page.evaluate(() => {
        const game = window.__PHASER_GAME__;
        const editorScene = game.scene.getScene('EditorScene');
        // Simulate clicking the PLAY button
        editorScene.scene.start('GameScene', { levelData: editorScene.levelData, isTestMode: true });
    });

    // Wait for GameScene to be active
    console.log("Waiting for GameScene to be active...");
    await page.waitForFunction(() => {
        return window.__PHASER_GAME__ && 
               window.__PHASER_GAME__.scene && 
               window.__PHASER_GAME__.scene.isActive('GameScene');
    }, { timeout: 10000 });

    // Let the play scene run for 3 seconds and print logs
    console.log("Running GameScene for 3 seconds...");
    await new Promise(r => setTimeout(r, 3000));

    console.log("Closing browser.");
    await browser.close();
    process.exit(0);
})();
