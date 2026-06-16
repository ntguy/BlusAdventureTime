import puppeteer from 'puppeteer';

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('TILESPRITE_CREATE:')) {
            console.log(text);
        }
    });

    await page.goto('http://localhost:5177/');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Patch Phaser before transitioning
    await page.evaluate(() => {
        const originalTileSprite = Phaser.GameObjects.GameObjectFactory.prototype.tileSprite;
        Phaser.GameObjects.GameObjectFactory.prototype.tileSprite = function(x, y, width, height, key, frame) {
            console.log(`TILESPRITE_CREATE: key=${key}, x=${x}, y=${y}, w=${width}, h=${height}`);
            return originalTileSprite.call(this, x, y, width, height, key, frame);
        };
    });

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
    await browser.close();
}

run().catch(console.error);
