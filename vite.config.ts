import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'ES2020',
  },
  plugins: [
    {
      name: 'level-saver-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/levels' && req.method === 'GET') {
            const dir = path.resolve(process.cwd(), 'public/assets/levels');
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.readdir(dir, (err, files) => {
              if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              const levels = files
                .filter(f => f.endsWith('.json'))
                .map(f => f.replace('.json', ''));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(levels));
            });
          } else if (req.url?.startsWith('/api/levels/') && req.method === 'POST') {
            const name = req.url.replace('/api/levels/', '');
            const dir = path.resolve(process.cwd(), 'public/assets/levels');
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const filePath = path.join(dir, `${name}.json`);
                fs.writeFile(filePath, JSON.stringify(data, null, 2), err => {
                  if (err) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                  }
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                });
              } catch (err: any) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON body: ' + err.message }));
              }
            });
          } else if (req.url?.startsWith('/api/levels/') && req.method === 'DELETE') {
            const name = req.url.replace('/api/levels/', '');
            const filePath = path.resolve(process.cwd(), `public/assets/levels/${name}.json`);
            fs.unlink(filePath, err => {
              if (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
                return;
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            });
          } else {
            next();
          }
        });
      }
    }
  ]
});
