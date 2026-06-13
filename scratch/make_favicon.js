import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function run() {
    console.log('Extracting dog sprite for favicon...');
    const spritesheetPath = path.resolve('public/assets/sprites/bluSpritesheet.png');
    const outputPath = path.resolve('public/favicon.png');

    if (!fs.existsSync(spritesheetPath)) {
        console.error(`Error: Spritesheet not found at ${spritesheetPath}`);
        process.exit(1);
    }

    const imageBuffer = fs.readFileSync(spritesheetPath);
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        const dataUrl = await page.evaluate(async (imgSrc) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 16;
                    canvas.height = 16;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject('Could not get canvas context');
                        return;
                    }
                    // Crop the first 16x16 frame from top-left (0,0)
                    ctx.drawImage(img, 0, 0, 16, 16, 0, 0, 16, 16);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = (e) => reject(`Failed to load image: ${e}`);
                img.src = imgSrc;
            });
        }, base64Image);

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
        console.log(`Success: Saved favicon to ${outputPath}`);
    } catch (err) {
        console.error('Error extracting favicon:', err);
    } finally {
        await browser.close();
    }
}

run();
