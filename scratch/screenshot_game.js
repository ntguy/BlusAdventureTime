import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set viewport to the standard game dimensions or larger to capture everything
    await page.setViewport({ width: 800, height: 600 });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    console.log('Navigating to http://localhost:5177/ ...');
    await page.goto('http://localhost:5177/', { waitUntil: 'networkidle0' });

    console.log('Waiting for game to load...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Transitioning directly to GameScene with Lvl7...');
    await page.evaluate(() => {
        const game = window.__PHASER_GAME__;
        if (!game) {
            console.error('Phaser game instance not found!');
            return;
        }
        // Force transition to GameScene
        game.scene.scenes.forEach(s => {
            if (s.scene.isActive()) {
                s.scene.start('GameScene', { levelKey: 'Lvl7' });
            }
        });
    });

    console.log('Waiting for Level 7 to render...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    const screenshotPath = path.resolve(__dirname, 'game_screenshot.png');
    console.log(`Taking screenshot: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath });

    await browser.close();
    console.log('Screenshot taken successfully.');
}

run().catch(console.error);
