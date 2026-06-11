import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const filePath = path.resolve('public/assets/backgrounds/grassyMountain/Plan 4.png');
    const dataUrl = `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
    
    const color = await page.evaluate(async (url) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, 1, 1).data;
                const r = data[0].toString(16).padStart(2, '0');
                const g = data[1].toString(16).padStart(2, '0');
                const b = data[2].toString(16).padStart(2, '0');
                resolve(`#${r}${g}${b}`);
            };
            img.src = url;
        });
    }, dataUrl);
    
    console.log('Sky top color:', color);
    await browser.close();
})();
