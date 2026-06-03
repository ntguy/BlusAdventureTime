import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../constants';
import { LevelData, EntityData } from '../levels/LevelSchema';

export class EditorScene extends Phaser.Scene {
    private levelData!: LevelData;
    
    // Viewport camera and UI camera
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;

    // Editor States
    private activeLayer: 'terrain' | 'background' | 'entities' = 'terrain';
    private activeTool: 'draw' | 'erase' = 'draw';
    private selectedTileIndex: number = 0; 
    private selectedEntityType: string = 'crate';
    
    // Sidebar scrolling state
    private paletteScrollY: number = 0;

    // Tilemaps
    private map!: Phaser.Tilemaps.Tilemap;
    private terrainLayer!: Phaser.Tilemaps.TilemapLayer;
    private bgLayer!: Phaser.Tilemaps.TilemapLayer;
    
    // Graphics & Groups
    private gridGraphics!: Phaser.GameObjects.Graphics;
    private paletteHighlight!: Phaser.GameObjects.Graphics;
    private workspaceGroup!: Phaser.GameObjects.Group;
    private uiGroup!: Phaser.GameObjects.Group;

    // UI elements maps
    private layerButtons: Record<string, Phaser.GameObjects.Text> = {};
    private toolButtons: Record<string, Phaser.GameObjects.Text> = {};

    // Palette lists
    private paletteSprites: Phaser.GameObjects.Sprite[] = [];
    private paletteTexts: Phaser.GameObjects.Text[] = [];
    private entityVisuals: Map<string, Phaser.GameObjects.Text> = new Map();

    private entityPalette = [
        { label: 'H', type: 'humanSpawn', color: '#00ff88', name: 'HUMAN SPAWN' },
        { label: 'D', type: 'dogSpawn', color: '#00ffff', name: 'DOG SPAWN' },
        { label: 'DR', type: 'exitDoor', color: '#ff00ff', name: 'EXIT DOOR' },
        { label: 'CR', type: 'crate', color: '#b5651d', name: 'CRATE' },
        { label: 'KY', type: 'key', color: '#ffff00', name: 'KEY' },
        { label: 'CP', type: 'checkpoint', color: '#0055ff', name: 'CHECKPOINT' }
    ];

    constructor() {
        super({ key: 'EditorScene' });
    }

    create(data?: { levelData?: LevelData }): void {
        const width = GAME_WIDTH;
        const height = GAME_HEIGHT;

        this.input.mouse?.disableContextMenu();

        // 1. Initialize level data
        if (data && data.levelData) {
            this.levelData = data.levelData;
        } else {
            this.levelData = this.createDefaultLevel();
        }

        // 2. Setup Camera viewports
        this.cameras.main.setViewport(0, 0, 656, 540);
        this.cameras.main.setScroll(0, 0);
        this.cameras.main.setZoom(1.0);

        this.uiCamera = this.cameras.add(656, 0, 280, 540);
        this.uiCamera.setScroll(656, 0);
        this.uiCamera.setZoom(1.0);

        // 3. Create Groups
        this.workspaceGroup = this.add.group();
        this.uiGroup = this.add.group();

        // 4. Create Workspace Tilemaps
        this.createWorkspaceTilemap();

        // 5. Draw grid overlay
        this.gridGraphics = this.add.graphics();
        this.workspaceGroup.add(this.gridGraphics);
        this.drawGrid();

        // 6. Draw sidebar elements
        this.createSidebarUI();

        // 7. Render placed entity visuals
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        // 8. Setup Inputs & Controls
        this.setupPanningAndZooming();
        this.setupKeyboardShortcuts();
        this.setupPointerInput();

        // 9. Camera ignores to prevent overlapping rendering
        this.cameras.main.ignore(this.uiGroup);
        this.uiCamera.ignore(this.workspaceGroup);

        this.paletteScrollY = 0;
        this.updatePalettePositions();
    }

    update(time: number, delta: number): void {
        // Keyboard arrow panning controls
        const panSpeed = 6;
        const cursors = this.input.keyboard!.createCursorKeys();
        
        if (cursors.left.isDown) this.cameras.main.scrollX -= panSpeed;
        if (cursors.right.isDown) this.cameras.main.scrollX += panSpeed;
        if (cursors.up.isDown) this.cameras.main.scrollY -= panSpeed;
        if (cursors.down.isDown) this.cameras.main.scrollY += panSpeed;

        // Clamp camera scroll bounds
        const maxScrollX = this.levelData.meta.width * TILE_SIZE - 656;
        const maxScrollY = this.levelData.meta.height * TILE_SIZE - 540;
        this.cameras.main.scrollX = Phaser.Math.Clamp(this.cameras.main.scrollX, -100, maxScrollX + 100);
        this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY, -100, maxScrollY + 100);
    }

    private createDefaultLevel(): LevelData {
        const width = 50;
        const height = 15;
        const size = width * height;
        const terrain = Array(size).fill(-1);

        for (let x = 0; x < width; x++) {
            terrain[14 * width + x] = 0; // solid bottom row
        }

        return {
            meta: {
                name: 'user_level',
                width,
                height,
                tileWidth: TILE_SIZE,
                tileHeight: TILE_SIZE,
                version: 1
            },
            layers: {
                background: Array(size).fill(-1),
                terrain,
                foreground: Array(size).fill(-1)
            },
            entities: [
                { type: 'humanSpawn', x: 3, y: 12 },
                { type: 'dogSpawn', x: 5, y: 12 },
                { type: 'exitDoor', x: 45, y: 12 }
            ]
        };
    }

    private createWorkspaceTilemap(): void {
        if (this.map) this.map.destroy();

        this.map = this.make.tilemap({
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
            width: this.levelData.meta.width,
            height: this.levelData.meta.height
        });

        const tileset = this.map.addTilesetImage('tilemap_packed', 'tilemap_packed', TILE_SIZE, TILE_SIZE, 0, 0)!;
        const bgTileset = this.map.addTilesetImage('bg_tilemap_packed', 'bg_tilemap_packed', TILE_SIZE, TILE_SIZE, 0, 0)!;

        this.bgLayer = this.map.createBlankLayer('background', bgTileset, 0, 0)!;
        this.terrainLayer = this.map.createBlankLayer('terrain', tileset, 0, 0)!;

        this.bgLayer.setDepth(1);
        this.terrainLayer.setDepth(2);

        this.workspaceGroup.add(this.bgLayer);
        this.workspaceGroup.add(this.terrainLayer);

        const width = this.levelData.meta.width;
        for (let i = 0; i < this.levelData.layers.terrain.length; i++) {
            const tx = i % width;
            const ty = Math.floor(i / width);
            
            const terrVal = this.levelData.layers.terrain[i];
            if (terrVal >= 0) this.terrainLayer.putTileAt(terrVal, tx, ty);

            const bgVal = this.levelData.layers.background[i];
            if (bgVal >= 0) this.bgLayer.putTileAt(bgVal, tx, ty);
        }
    }

    private drawGrid(): void {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0x444455, 0.4);
        this.gridGraphics.setDepth(10);

        const w = this.levelData.meta.width * TILE_SIZE;
        const h = this.levelData.meta.height * TILE_SIZE;

        for (let x = 0; x <= w; x += TILE_SIZE) {
            this.gridGraphics.strokeLineShape(new Phaser.Geom.Line(x, 0, x, h));
        }
        for (let y = 0; y <= h; y += TILE_SIZE) {
            this.gridGraphics.strokeLineShape(new Phaser.Geom.Line(0, y, w, y));
        }

        this.gridGraphics.lineStyle(2, 0xff00ff, 0.7);
        this.gridGraphics.strokeRect(0, 0, w, h);
    }

    private drawEntityVisual(ent: EntityData): void {
        const key = `${ent.x},${ent.y}`;
        const labels: Record<string, { t: string, c: string }> = {
            humanSpawn: { t: 'H', c: '#00ff88' },
            dogSpawn: { t: 'D', c: '#00ffff' },
            exitDoor: { t: 'DR', c: '#ff00ff' },
            crate: { t: 'CR', c: '#b5651d' },
            key: { t: 'KY', c: '#ffff00' },
            checkpoint: { t: 'CP', c: '#0055ff' }
        };

        const config = labels[ent.type] || { t: '?', c: '#ffffff' };
        const txt = this.add.text(ent.x * TILE_SIZE + TILE_SIZE / 2, ent.y * TILE_SIZE + TILE_SIZE / 2, config.t, {
            fontFamily: '"Press Start 2P"',
            fontSize: '9px',
            color: config.c
        }).setOrigin(0.5).setDepth(25);

        this.workspaceGroup.add(txt);
        this.uiCamera.ignore(txt); // prevent rendering on UI Camera
        this.entityVisuals.set(key, txt);
    }

    private removeEntityAt(tileX: number, tileY: number): void {
        const key = `${tileX},${tileY}`;
        const textObj = this.entityVisuals.get(key);
        if (textObj) {
            textObj.destroy();
            this.entityVisuals.delete(key);
        }
        this.levelData.entities = this.levelData.entities.filter(e => !(e.x === tileX && e.y === tileY));
    }

    private createSidebarUI(): void {
        const startX = 656; // Sidebar starts here
        const center = startX + 140;

        // Solid background
        const sidebarBg = this.add.graphics();
        sidebarBg.fillStyle(0x0a0a1a, 0.95);
        sidebarBg.fillRect(startX, 0, 280, GAME_HEIGHT);
        sidebarBg.lineStyle(2, 0x333344, 1);
        sidebarBg.strokeLineShape(new Phaser.Geom.Line(startX, 0, startX, GAME_HEIGHT));
        this.uiGroup.add(sidebarBg);

        // Header Title
        const titleText = this.add.text(center, 22, "📝 EDITOR", {
            fontFamily: '"Press Start 2P"',
            fontSize: '16px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.uiGroup.add(titleText);

        // Action buttons
        const actionRowY = 55;
        const actPlay = this.createSidebarButton("🎮PLAY", startX + 35, actionRowY, () => this.playtestLevel());
        const actSave = this.createSidebarButton("💾SAVE", startX + 90, actionRowY, () => this.saveLevel());
        const actLoad = this.createSidebarButton("📂LOAD", startX + 145, actionRowY, () => this.loadLevel());
        const actNew  = this.createSidebarButton("📄NEW", startX + 195, actionRowY, () => this.clearToNewLevel());
        const actExit = this.createSidebarButton("🚪EXIT", startX + 245, actionRowY, () => this.exitEditor());

        this.uiGroup.add(actPlay);
        this.uiGroup.add(actSave);
        this.uiGroup.add(actLoad);
        this.uiGroup.add(actNew);
        this.uiGroup.add(actExit);

        // Tools Title Row
        const toolY = 95;
        this.add.text(startX + 18, toolY, "TOOL:", { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#888888' });
        this.toolButtons['draw'] = this.createSidebarButton("✏️ DRAW", startX + 105, toolY, () => this.setTool('draw'));
        this.toolButtons['erase'] = this.createSidebarButton("❌ ERASE", startX + 185, toolY, () => this.setTool('erase'));
        this.uiGroup.add(this.toolButtons['draw']);
        this.uiGroup.add(this.toolButtons['erase']);

        // Layers Title Row
        const layerY = 135;
        this.add.text(startX + 18, layerY, "LAYER:", { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#888888' });
        this.layerButtons['terrain'] = this.createSidebarButton("🧱TERRAIN", startX + 90, layerY, () => this.setLayer('terrain'));
        this.layerButtons['background'] = this.createSidebarButton("☁️BG", startX + 165, layerY, () => this.setLayer('background'));
        this.layerButtons['entities'] = this.createSidebarButton("👾ENTITY", startX + 230, layerY, () => this.setLayer('entities'));
        
        this.uiGroup.add(this.layerButtons['terrain']);
        this.uiGroup.add(this.layerButtons['background']);
        this.uiGroup.add(this.layerButtons['entities']);

        // Separator line
        const sep = this.add.graphics();
        sep.lineStyle(1, 0x222233, 0.8);
        sep.strokeLineShape(new Phaser.Geom.Line(startX + 15, 165, startX + 265, 165));
        this.uiGroup.add(sep);

        // Selection highlight graphics box
        this.paletteHighlight = this.add.graphics();
        this.paletteHighlight.setDepth(50);
        this.uiGroup.add(this.paletteHighlight);

        // Build Palette UI
        this.buildPaletteUI();
    }

    private buildPaletteUI(): void {
        this.paletteSprites.forEach(s => s.destroy());
        this.paletteSprites = [];
        this.paletteTexts.forEach(t => t.destroy());
        this.paletteTexts = [];

        const startX = 656;
        const gridStartX = startX + 32;
        const gridStartY = 200;
        const spacingX = 46;
        const spacingY = 46;

        if (this.activeLayer === 'terrain') {
            // ALL 180 terrain tiles
            const totalTerrainTiles = 180;
            for (let i = 0; i < totalTerrainTiles; i++) {
                const col = i % 5;
                const row = Math.floor(i / 5);
                const x = gridStartX + col * spacingX;
                const y = gridStartY + row * spacingY;

                const sprite = this.add.sprite(x, y, 'tilemap_packed', i);
                sprite.setScale(2.0); 
                sprite.setInteractive({ useHandCursor: true });
                
                const currentIdx = i;
                sprite.on('pointerdown', () => {
                    this.selectedTileIndex = currentIdx;
                    this.updateSelectionHighlights();
                });

                this.uiGroup.add(sprite);
                this.cameras.main.ignore(sprite);
                this.paletteSprites.push(sprite);
            }
        } 
        else if (this.activeLayer === 'background') {
            // ALL 24 background tiles
            const totalBgTiles = 24;
            for (let i = 0; i < totalBgTiles; i++) {
                const col = i % 5;
                const row = Math.floor(i / 5);
                const x = gridStartX + col * spacingX;
                const y = gridStartY + row * spacingY;

                const sprite = this.add.sprite(x, y, 'bg_tilemap_packed', i);
                sprite.setScale(1.5);
                sprite.setInteractive({ useHandCursor: true });
                
                const currentIdx = i;
                sprite.on('pointerdown', () => {
                    this.selectedTileIndex = currentIdx;
                    this.updateSelectionHighlights();
                });

                this.uiGroup.add(sprite);
                this.cameras.main.ignore(sprite);
                this.paletteSprites.push(sprite);
            }
        }
        else if (this.activeLayer === 'entities') {
            // Entities selection with text box indicators (Letters)
            this.entityPalette.forEach((ent, idx) => {
                const col = idx % 5;
                const row = Math.floor(idx / 5);
                const x = gridStartX + col * spacingX;
                const y = gridStartY + row * spacingY;

                const txtObj = this.add.text(x, y, ent.label, {
                    fontFamily: '"Press Start 2P"',
                    fontSize: '16px',
                    color: ent.color
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });

                txtObj.on('pointerdown', () => {
                    this.selectedEntityType = ent.type;
                    this.updateSelectionHighlights();
                });

                this.uiGroup.add(txtObj);
                this.cameras.main.ignore(txtObj);
                this.paletteTexts.push(txtObj);
            });
        }

        // Apply scroll position
        this.updatePalettePositions();
    }

    private updatePalettePositions(): void {
        const gridStartY = 200;
        const spacingY = 46;

        this.paletteSprites.forEach((spr, idx) => {
            const row = Math.floor(idx / 5);
            spr.y = gridStartY + row * spacingY + this.paletteScrollY;
            
            // Mask items scrolling outside y boundaries: 175 to 525
            const isVisible = spr.y >= 175 && spr.y <= 525;
            spr.setVisible(isVisible);
            if (isVisible) spr.setInteractive();
            else spr.disableInteractive();
        });

        this.paletteTexts.forEach((txt, idx) => {
            const row = Math.floor(idx / 5);
            txt.y = gridStartY + row * spacingY + this.paletteScrollY;
            
            const isVisible = txt.y >= 175 && txt.y <= 525;
            txt.setVisible(isVisible);
            if (isVisible) txt.setInteractive();
            else txt.disableInteractive();
        });

        this.updateSelectionHighlights();
    }

    private updateSelectionHighlights(): void {
        Object.keys(this.layerButtons).forEach(key => {
            const btn = this.layerButtons[key];
            btn.setColor(this.activeLayer === key ? '#00ffff' : '#888888');
        });

        Object.keys(this.toolButtons).forEach(key => {
            const btn = this.toolButtons[key];
            btn.setColor(this.activeTool === key ? '#ffff00' : '#888888');
        });

        this.paletteHighlight.clear();
        
        if (this.activeTool === 'erase') {
            return;
        }

        this.paletteHighlight.lineStyle(2, 0xffff00, 1);

        if (this.activeLayer === 'terrain') {
            const activeIdx = this.selectedTileIndex;
            if (activeIdx >= 0 && this.paletteSprites[activeIdx]) {
                const spr = this.paletteSprites[activeIdx];
                if (spr.visible) {
                    this.paletteHighlight.strokeRect(spr.x - 18, spr.y - 18, 36, 36);
                }
            }
        } 
        else if (this.activeLayer === 'background') {
            const activeIdx = this.selectedTileIndex;
            if (activeIdx >= 0 && this.paletteSprites[activeIdx]) {
                const spr = this.paletteSprites[activeIdx];
                if (spr.visible) {
                    this.paletteHighlight.strokeRect(spr.x - 18, spr.y - 18, 36, 36);
                }
            }
        }
        else if (this.activeLayer === 'entities') {
            const activeIdx = this.entityPalette.findIndex(e => e.type === this.selectedEntityType);
            if (activeIdx >= 0 && this.paletteTexts[activeIdx]) {
                const txt = this.paletteTexts[activeIdx];
                if (txt.visible) {
                    this.paletteHighlight.strokeRect(txt.x - 18, txt.y - 18, 36, 36);
                }
            }
        }
    }

    private setupPanningAndZooming(): void {
        // 1. Mouse wheel zooming & sidebar scrolling
        this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any, deltaX: number, deltaY: number, deltaZ: number) => {
            if (pointer.x >= 656) {
                // Scroll visual palette
                this.paletteScrollY -= deltaY * 0.4;
                const maxScroll = this.activeLayer === 'terrain' ? -1450 : 0;
                this.paletteScrollY = Phaser.Math.Clamp(this.paletteScrollY, maxScroll, 0);
                this.updatePalettePositions();
            } else {
                // Zoom workspace view
                const zoomSpeed = 0.0012;
                let newZoom = this.cameras.main.zoom - deltaY * zoomSpeed;
                newZoom = Phaser.Math.Clamp(newZoom, 0.4, 3.0);
                this.cameras.main.setZoom(newZoom);
            }
        });

        // 2. Right-click or middle-click dragging to pan
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
                const zoom = this.cameras.main.zoom;
                this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / zoom;
                this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / zoom;
            }
        });
    }

    private setupKeyboardShortcuts(): void {
        const kb = this.input.keyboard!;
        
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.P).on('down', () => this.playtestLevel());
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => this.setTool('draw'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.E).on('down', () => this.setTool('erase'));

        kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => this.setLayer('terrain'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => this.setLayer('background'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => this.setLayer('entities'));
    }

    private setupPointerInput(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                this.paintGridAt(pointer);
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                this.paintGridAt(pointer);
            }
        });
    }

    private paintGridAt(pointer: Phaser.Input.Pointer): void {
        if (pointer.x >= 656) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tileX = Math.floor(worldPoint.x / TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / TILE_SIZE);

        const w = this.levelData.meta.width;
        const h = this.levelData.meta.height;

        if (tileX < 0 || tileX >= w || tileY < 0 || tileY >= h) return;

        const idx = tileY * w + tileX;

        if (this.activeTool === 'draw') {
            if (this.activeLayer === 'terrain') {
                this.terrainLayer.putTileAt(this.selectedTileIndex, tileX, tileY);
                this.levelData.layers.terrain[idx] = this.selectedTileIndex;
            } else if (this.activeLayer === 'background') {
                this.bgLayer.putTileAt(this.selectedTileIndex, tileX, tileY);
                this.levelData.layers.background[idx] = this.selectedTileIndex;
            } else if (this.activeLayer === 'entities') {
                this.removeEntityAt(tileX, tileY);
                const ent: EntityData = { type: this.selectedEntityType, x: tileX, y: tileY };
                this.levelData.entities.push(ent);
                this.drawEntityVisual(ent);
            }
        } else if (this.activeTool === 'erase') {
            if (this.activeLayer === 'terrain') {
                this.terrainLayer.removeTileAt(tileX, tileY);
                this.levelData.layers.terrain[idx] = -1;
            } else if (this.activeLayer === 'background') {
                this.bgLayer.removeTileAt(tileX, tileY);
                this.levelData.layers.background[idx] = -1;
            } else if (this.activeLayer === 'entities') {
                this.removeEntityAt(tileX, tileY);
            }
        }
    }

    private setLayer(layer: 'terrain' | 'background' | 'entities'): void {
        if (this.activeLayer === layer) return;
        this.activeLayer = layer;
        this.activeTool = 'draw';
        this.paletteScrollY = 0; // Reset scroll position when layer changes
        this.buildPaletteUI();
        this.updatePalettePositions();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.5 } as any);
    }

    private setTool(tool: 'draw' | 'erase'): void {
        if (this.activeTool === tool) return;
        this.activeTool = tool;
        this.updateSelectionHighlights();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.3 } as any);
    }

    private playtestLevel(): void {
        const hasHuman = this.levelData.entities.some(e => e.type === 'humanSpawn');
        const hasDog = this.levelData.entities.some(e => e.type === 'dogSpawn');

        if (!hasHuman || !hasDog) {
            alert("Error: Level must contain both a HUMAN SPAWN (H) and DOG SPAWN (D) point before playing!");
            return;
        }

        this.sound.play('sfx_checkpoint', { volume: 0.4 });
        this.cameras.main.fadeOut(300, 10, 10, 26);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', { levelData: this.levelData, isTestMode: true });
        });
    }

    private async saveLevel(): Promise<void> {
        const name = prompt("Save level as:", this.levelData.meta.name);
        if (!name) return;

        const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        this.levelData.meta.name = cleanName;

        try {
            const res = await fetch(`/api/levels/${cleanName}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.levelData)
            });
            
            if (res.ok) {
                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                alert(`SUCCESS: Saved level "${cleanName}" successfully!`);
            } else {
                const err = await res.json();
                alert(`ERROR: Failed to save: ${err.error}`);
            }
        } catch (err: any) {
            alert(`ERROR: Connection error: ${err.message}`);
        }
    }

    private async loadLevel(): Promise<void> {
        try {
            const listRes = await fetch('/api/levels');
            if (!listRes.ok) throw new Error("Failed to get level list");
            
            const list: string[] = await listRes.json();
            if (list.length === 0) {
                alert("No custom levels found to load.");
                return;
            }

            const selection = prompt(`Available levels:\n${list.join('\n')}\n\nEnter level name to load:`);
            if (!selection) return;

            const cleanSelection = selection.trim();
            if (!list.includes(cleanSelection)) {
                alert(`Level "${cleanSelection}" not found.`);
                return;
            }

            const dataRes = await fetch(`/assets/levels/${cleanSelection}.json`);
            if (!dataRes.ok) throw new Error(`Failed to load levels/${cleanSelection}.json`);

            const levelData = await dataRes.json() as LevelData;
            this.sound.play('sfx_checkpoint', { volume: 0.3 });
            this.scene.start('EditorScene', { levelData });

        } catch (err: any) {
            alert(`ERROR: Failed to load: ${err.message}`);
        }
    }

    private clearToNewLevel(): void {
        if (!confirm("Clear active workspace? Unsaved changes will be lost!")) return;
        this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
        this.scene.start('EditorScene');
    }

    private exitEditor(): void {
        this.sound.play('sfx_jump', { volume: 0.2, pitch: 0.8 } as any);
        this.cameras.main.fadeOut(300, 10, 10, 26);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MainMenuScene');
        });
    }

    private createSidebarButton(label: string, x: number, y: number, callback: () => void): Phaser.GameObjects.Text {
        const btn = this.add.text(x, y, label, {
            fontFamily: '"Press Start 2P"',
            fontSize: '9px',
            color: '#aaaaaa'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setColor('#ffffff'));
        btn.on('pointerout', () => {
            const isLayer = Object.values(this.layerButtons).includes(btn);
            const isTool = Object.values(this.toolButtons).includes(btn);
            if (!isLayer && !isTool) {
                btn.setColor('#aaaaaa');
            } else {
                this.updateSelectionHighlights();
            }
        });
        btn.on('pointerdown', callback);

        return btn;
    }
}
