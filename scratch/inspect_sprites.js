import puppeteer from 'puppeteer';

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    console.log('Navigating...');
    await page.goto('http://localhost:5177/', { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Transitioning to Lvl7...');
    await page.evaluate(() => {
        const game = window.__PHASER_GAME__;
        game.scene.scenes.forEach(s => {
            if (s.scene.isActive()) {
                s.scene.start('GameScene', { levelKey: 'Lvl7' });
            }
        });
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const data = await page.evaluate(() => {
        const game = window.__PHASER_GAME__;
        const gameScene = game.scene.keys.GameScene;
        
        const textureKeys = game.textures.getTextureKeys();
        const spritesInfo = gameScene.backgroundSprites ? gameScene.backgroundSprites.map((sprite, idx) => ({
            index: idx,
            key: sprite.texture.key,
            width: sprite.width,
            height: sprite.height,
            tileScaleY: sprite.tileScaleY
        })) : null;

        return {
            textureKeys,
            sprites: spritesInfo
        };
    });

    console.log('Inspection Data:', JSON.stringify(data, null, 2));
    await browser.close();
}

run().catch(console.error);
