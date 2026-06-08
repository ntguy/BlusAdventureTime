import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, TILE_SIZE, BG_TILE_SIZE } from '../constants';
import { LevelData, EntityData } from '../levels/LevelSchema';

export class EditorScene extends Phaser.Scene {
    private levelData!: LevelData;
    
    // Viewport camera and UI camera
    private uiCamera!: Phaser.Cameras.Scene2D.Camera;

    // Editor States
    private activeTab: 'tiles' | 'entities' = 'tiles';
    private activeTool: 'terrain' | 'bg' | 'erase' | 'move' = 'terrain';
    private selectedTileIndex: number = 0; 

    // Dragging state for move tool
    private isDragging: boolean = false;
    private dragEntity: EntityData | null = null;
    private dragTileValue: number = -1;
    private dragTileLayer: 'terrain' | 'background' | null = null;
    private dragStartX: number = -1;
    private dragStartY: number = -1;
    private dragPreviewSprite: Phaser.GameObjects.Sprite | null = null;
    private dragPreviewText: Phaser.GameObjects.Text | null = null;
    private selectedEntityType: string = 'crate';
    private tileTags: Record<string, number[]> = {};
    private activeTagFilter: string = 'all';
    private tagTextObjects: Phaser.GameObjects.Text[] = [];
    
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
    private bgOverlays: Map<string, Phaser.GameObjects.Text> = new Map();

    private selectedEntity: EntityData | null = null;
    private selectedEntityText!: Phaser.GameObjects.Text;
    private selectedTilecodeText!: Phaser.GameObjects.Text;
    private editPropsButton!: Phaser.GameObjects.Text;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: any;
    private selectedWorkspaceItems: {
        type: 'entity' | 'terrain' | 'background';
        x: number;
        y: number;
        value: any;
    }[] = [];
    private selectionHighlightGraphics!: Phaser.GameObjects.Graphics;
    private dragPreviews: {
        gameObject: Phaser.GameObjects.Sprite | Phaser.GameObjects.Text;
        offsetGridX: number;
        offsetGridY: number;
    }[] = [];
    private gridButtons: Phaser.GameObjects.Text[] = [];

    private entityPalette = [
        { label: 'H', type: 'humanSpawn', color: '#00ff88', name: 'HUMAN SPAWN' },
        { label: 'D', type: 'dogSpawn', color: '#00ffff', name: 'DOG SPAWN' },
        { label: 'DR', type: 'exitDoor', color: '#ff00ff', name: 'EXIT DOOR' },
        { label: 'CR', type: 'crate', color: '#b5651d', name: 'CRATE' },
        { label: 'KY', type: 'key', color: '#ffff00', name: 'KEY' },
        { label: 'CP', type: 'checkpoint', color: '#0055ff', name: 'CHECKPOINT' },
        { label: 'LD', type: 'ladder', color: '#a8a8a8', name: 'LADDER' },
        { label: 'BT', type: 'button', color: '#ff5555', name: 'BUTTON' },
        { label: 'LV', type: 'lever', color: '#ff33aa', name: 'LEVER' },
        { label: 'FL', type: 'flying', color: '#a233ff', name: 'FLYING ENTITY' },
        { label: 'GT', type: 'gate', color: '#ffaa00', name: 'GATE' },
        { label: 'LN', type: 'launcher', color: '#ff00aa', name: 'LAUNCHER' },
        { label: 'CT', type: 'cat', color: '#ff55ff', name: 'CAT' },
        { label: 'SN', type: 'sign', color: '#e2a76f', name: 'SIGN' },
        { label: 'SP', type: 'spikes', color: '#ff3333', name: 'SPIKES' },
        { label: 'MP', type: 'movingPlatform', color: '#44aaff', name: 'MOVING PLATFORM' }
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
        this.cameras.main.setViewport(0, 0, 674, 558);
        this.cameras.main.setScroll(0, 0);
        this.cameras.main.setZoom(1.0);

        this.cameras.main.setBackgroundColor('#1a1a2e');

        this.uiCamera = this.cameras.add(674, 0, 280, 558);
        this.uiCamera.setScroll(674, 0);
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

        this.selectionHighlightGraphics = this.add.graphics();
        this.workspaceGroup.add(this.selectionHighlightGraphics);

        // Load tile tags
        this.loadTileTags();

        // 6. Draw sidebar elements
        this.createSidebarUI();

        // 7. Render placed entity visuals
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        // 8. Setup Inputs & Controls
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasdKeys = this.input.keyboard!.addKeys('W,A,S,D');
        this.setupPanningAndZooming();
        this.setupKeyboardShortcuts();
        this.setupPointerInput();

        // 9. Draw Grid Resizing Buttons
        this.drawGridResizingButtons();

        // 10. Camera ignores to prevent overlapping rendering
        this.cameras.main.ignore(this.uiGroup);
        this.uiCamera.ignore(this.workspaceGroup);

        this.paletteScrollY = 0;
        this.updatePalettePositions();
    }

    update(time: number, delta: number): void {
        // Keyboard arrow and WASD panning controls
        const panSpeed = 6;
        const cursors = this.cursors;
        const keys = this.wasdKeys;
        
        const wDown = cursors.up.isDown || (keys.W && keys.W.isDown) || (keys.w && keys.w.isDown);
        const sDown = cursors.down.isDown || (keys.S && keys.S.isDown) || (keys.s && keys.s.isDown);
        const aDown = cursors.left.isDown || (keys.A && keys.A.isDown) || (keys.a && keys.a.isDown);
        const dDown = cursors.right.isDown || (keys.D && keys.D.isDown) || (keys.d && keys.d.isDown);

        if (aDown) this.cameras.main.scrollX -= panSpeed;
        if (dDown) this.cameras.main.scrollX += panSpeed;
        if (wDown) this.cameras.main.scrollY -= panSpeed;
        if (sDown) this.cameras.main.scrollY += panSpeed;

        // Clamp camera scroll bounds
        const maxScrollX = this.levelData.meta.width * TILE_SIZE - 674;
        const maxScrollY = this.levelData.meta.height * TILE_SIZE - 558;
        
        const minScrollX = Math.min(-100, maxScrollX - 100);
        const maxScrollXBound = Math.max(100, maxScrollX + 100);
        const minScrollY = Math.min(-100, maxScrollY - 100);
        const maxScrollYBound = Math.max(100, maxScrollY + 100);

        this.cameras.main.scrollX = Phaser.Math.Clamp(this.cameras.main.scrollX, minScrollX, maxScrollXBound);
        this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY, minScrollY, maxScrollYBound);
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

    private addBgOverlay(tx: number, ty: number): void {
        const key = `${tx},${ty}`;
        if (this.bgOverlays.has(key)) return;

        const txt = this.add.text(tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, "BG", {
            fontFamily: '"Press Start 2P"',
            fontSize: '5px',
            color: '#ffffff'
        }).setOrigin(0.5).setDepth(15).setAlpha(0.5);

        this.workspaceGroup.add(txt);
        this.uiCamera.ignore(txt);
        this.bgOverlays.set(key, txt);
    }

    private removeBgOverlay(tx: number, ty: number): void {
        const key = `${tx},${ty}`;
        const txt = this.bgOverlays.get(key);
        if (txt) {
            txt.destroy();
            this.bgOverlays.delete(key);
        }
    }

    private clearBgOverlays(): void {
        this.bgOverlays.forEach(txt => txt.destroy());
        this.bgOverlays.clear();
    }

    private createWorkspaceTilemap(): void {
        if (this.map) this.map.destroy();

        this.clearBgOverlays();

        this.map = this.make.tilemap({
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
            width: this.levelData.meta.width,
            height: this.levelData.meta.height
        });

        const tileset = this.map.addTilesetImage('tilemap_packed', 'tilemap_packed', TILE_SIZE, TILE_SIZE, 0, 0, 0)!;
        const bgTileset = this.map.addTilesetImage('bg_tilemap_packed', 'bg_tilemap_packed', BG_TILE_SIZE, BG_TILE_SIZE, 0, 0, 180)!;

        this.bgLayer = this.map.createBlankLayer('background', [tileset, bgTileset], 0, 0)!;
        this.terrainLayer = this.map.createBlankLayer('terrain', tileset, 0, 0)!;

        this.bgLayer.setDepth(1);
        this.terrainLayer.setDepth(2);

        this.workspaceGroup.add(this.bgLayer);
        this.workspaceGroup.add(this.terrainLayer);

        if (this.uiCamera) {
            this.uiCamera.ignore(this.bgLayer);
            this.uiCamera.ignore(this.terrainLayer);
        }

        this.cameras.main.setBackgroundColor('#1a1a2e');

        const width = this.levelData.meta.width;
        for (let i = 0; i < this.levelData.layers.terrain.length; i++) {
            const tx = i % width;
            const ty = Math.floor(i / width);
            
            const terrVal = this.levelData.layers.terrain[i];
            if (terrVal >= 0) this.terrainLayer.putTileAt(terrVal, tx, ty);

            const bgVal = this.levelData.layers.background[i];
            if (bgVal >= 0) {
                this.bgLayer.putTileAt(bgVal, tx, ty);
                this.addBgOverlay(tx, ty);
            }
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
            checkpoint: { t: 'CP', c: '#0055ff' },
            ladder: { t: 'LD', c: '#a8a8a8' },
            button: { t: 'BT', c: '#ff5555' },
            lever: { t: 'LV', c: '#ff33aa' },
            gate: { t: 'GT', c: '#ffaa00' },
            launcher: { t: 'LN', c: '#ff00aa' },
            cat: { t: 'CT', c: '#ff55ff' },
            sign: { t: 'SN', c: '#e2a76f' },
            spikes: { t: 'SP', c: '#ff3333' },
            movingPlatform: { t: 'MP', c: '#44aaff' },
            flying: { t: 'FL', c: '#a233ff' }
        };

        const config = labels[ent.type] || { t: '?', c: '#ffffff' };
        
        // Append channel suffix for buttons and gates to visualize connections
        let labelText = config.t;
        const props = ent.properties || {};
        if (ent.type === 'button') {
            const ch = props.channel || '1';
            labelText = `B${ch}`;
        } else if (ent.type === 'lever') {
            const ch = props.channel || '1';
            labelText = `L${ch}`;
        } else if (ent.type === 'flying') {
            const startFrame = props.startFrame !== undefined ? props.startFrame : 120;
            labelText = `F${startFrame}`;
        } else if (ent.type === 'gate') {
            const lCh = props.listenChannel || '1';
            labelText = `G${lCh}`;
        }

        const txt = this.add.text(ent.x * TILE_SIZE + TILE_SIZE / 2, ent.y * TILE_SIZE + TILE_SIZE / 2, labelText, {
            fontFamily: '"Press Start 2P"',
            fontSize: labelText.length > 2 ? '6px' : '8px',
            color: config.c
        }).setOrigin(0.5).setDepth(25);

        this.workspaceGroup.add(txt);
        this.uiCamera.ignore(txt); // prevent rendering on UI Camera
        this.entityVisuals.set(key, txt);

        // Draw movement path arrow for moving platforms and flying entities
        if (ent.type === 'movingPlatform' || ent.type === 'flying') {
            const props = ent.properties || {};
            const endTileX = props.endX !== undefined ? Number(props.endX) : ent.x;
            const endTileY = props.endY !== undefined ? Number(props.endY) : ent.y;
            if (endTileX !== ent.x || endTileY !== ent.y) {
                const startPx = { x: ent.x * 18 + 9, y: ent.y * 18 + 9 };
                const endPx = { x: endTileX * 18 + 9, y: endTileY * 18 + 9 };
                const arrow = this.add.graphics();
                const pathColor = ent.type === 'flying' ? 0xa233ff : 0x44aaff;
                arrow.lineStyle(1, pathColor, 0.6);
                // Draw dashed line
                const dx = endPx.x - startPx.x;
                const dy = endPx.y - startPx.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const dashLen = 4;
                const gapLen = 3;
                let drawn = 0;
                while (drawn < dist) {
                    const s = drawn / dist;
                    const e = Math.min((drawn + dashLen) / dist, 1);
                    arrow.moveTo(startPx.x + dx * s, startPx.y + dy * s);
                    arrow.lineTo(startPx.x + dx * e, startPx.y + dy * e);
                    drawn += dashLen + gapLen;
                }
                arrow.strokePath();
                // Draw arrowhead at end
                const angle = Math.atan2(dy, dx);
                const headLen = 5;
                arrow.fillStyle(0x44aaff, 0.8);
                arrow.fillTriangle(
                    endPx.x, endPx.y,
                    endPx.x - headLen * Math.cos(angle - 0.4), endPx.y - headLen * Math.sin(angle - 0.4),
                    endPx.x - headLen * Math.cos(angle + 0.4), endPx.y - headLen * Math.sin(angle + 0.4)
                );
                arrow.setDepth(24);
                this.workspaceGroup.add(arrow);
                this.uiCamera.ignore(arrow);
            }

            // Also show channel label
            const ch = props.channel || '1';
            txt.setText(`M${ch}`);
        }
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
        const startX = 674; // Sidebar starts here
        const center = startX + 140;

        // Solid background
        const sidebarBg = this.add.graphics();
        sidebarBg.fillStyle(0x0a0a1a, 0.95);
        sidebarBg.fillRect(startX, 0, 280, GAME_HEIGHT);
        sidebarBg.lineStyle(2, 0x333344, 1);
        sidebarBg.strokeLineShape(new Phaser.Geom.Line(startX, 0, startX, GAME_HEIGHT));
        this.uiGroup.add(sidebarBg);

        // Header Title
        const titleText = this.add.text(center, 18, "📝 EDITOR", {
            fontFamily: '"Press Start 2P"',
            fontSize: '16px',
            color: '#ffff00'
        }).setOrigin(0.5);
        this.uiGroup.add(titleText);

        // Action buttons
        const actionRowY = 46;
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
        const toolY = 72;
        this.add.text(startX + 18, toolY, "TOOL:", { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#888888' });
        this.toolButtons['terrain'] = this.createSidebarButton("TERR", startX + 80, toolY, () => this.setTool('terrain'));
        this.toolButtons['bg'] = this.createSidebarButton("BG", startX + 125, toolY, () => this.setTool('bg'));
        this.toolButtons['erase'] = this.createSidebarButton("ERASE", startX + 180, toolY, () => this.setTool('erase'));
        this.toolButtons['move'] = this.createSidebarButton("MOVE", startX + 235, toolY, () => this.setTool('move'));
        this.uiGroup.add(this.toolButtons['terrain']);
        this.uiGroup.add(this.toolButtons['bg']);
        this.uiGroup.add(this.toolButtons['erase']);
        this.uiGroup.add(this.toolButtons['move']);

        // Layers Title Row
        const layerY = 96;
        this.add.text(startX + 18, layerY, "LAYER:", { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#888888' });
        this.layerButtons['tiles'] = this.createSidebarButton("TILES", startX + 105, layerY, () => this.setTab('tiles'));
        this.layerButtons['entities'] = this.createSidebarButton("ENTITY", startX + 200, layerY, () => this.setTab('entities'));
        
        this.uiGroup.add(this.layerButtons['tiles']);
        this.uiGroup.add(this.layerButtons['entities']);

        // Separator line
        const sep = this.add.graphics();
        sep.lineStyle(1, 0x222233, 0.8);
        sep.strokeLineShape(new Phaser.Geom.Line(startX + 15, 116, startX + 265, 116));
        this.uiGroup.add(sep);

        // Selected GID/Tilecode text display at y=132
        this.selectedTilecodeText = this.add.text(center, 132, "", {
            fontFamily: '"Press Start 2P"',
            fontSize: '7px',
            color: '#00ffff',
            align: 'center'
        }).setOrigin(0.5);
        this.uiGroup.add(this.selectedTilecodeText);
        this.cameras.main.ignore(this.selectedTilecodeText);

        // Properties Panel Text/Button at the bottom
        this.selectedEntityText = this.add.text(center, 475, "", {
            fontFamily: '"Press Start 2P"',
            fontSize: '7px',
            color: '#aaaaaa',
            align: 'center'
        }).setOrigin(0.5);
        this.uiGroup.add(this.selectedEntityText);
        this.cameras.main.ignore(this.selectedEntityText);

        this.editPropsButton = this.createSidebarButton("⚙️ EDIT PROPERTIES", center, 515, () => this.editSelectedEntityProps());
        this.editPropsButton.setColor('#00ffff');
        this.editPropsButton.setVisible(false);
        this.uiGroup.add(this.editPropsButton);
        this.cameras.main.ignore(this.editPropsButton);

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
        this.tagTextObjects.forEach(t => t.destroy());
        this.tagTextObjects = [];

        const startX = 674;
        const gridStartX = startX + 26;
        const tagGridStartY = 152;
        const tagSpacingY = 22;
        const spacingX = 34;
        const spacingY = 34;

        if (this.activeTab === 'tiles') {
            // 1. Build and render tag buttons at the top of the scrollable region
            const tags = ['all', ...Object.keys(this.tileTags), 'Manage Tags'];
            const tagRows = Math.ceil(tags.length / 2);

            tags.forEach((tag, idx) => {
                const col = idx % 2;
                const row = Math.floor(idx / 2);
                const x = startX + 70 + col * 135;
                const y = tagGridStartY + row * tagSpacingY;

                let label = `[ ${tag.toUpperCase()} ]`;
                if (tag === 'Manage Tags') {
                    label = `[ 🏷️ TAGS ]`;
                } else if (tag === this.activeTagFilter) {
                    label = `[ *${tag.toUpperCase()}* ]`;
                }

                const txtObj = this.add.text(x, y, label, {
                    fontFamily: '"Press Start 2P"',
                    fontSize: '8px',
                    color: tag === 'Manage Tags' ? '#ffaa00' : (tag === this.activeTagFilter ? '#ffff00' : '#888888')
                }).setOrigin(0.5).setInteractive({ useHandCursor: true });

                txtObj.on('pointerdown', () => {
                    if (tag === 'Manage Tags') {
                        this.showTagManager();
                    } else {
                        if (this.activeTagFilter === tag) {
                            this.activeTagFilter = 'all';
                        } else {
                            this.activeTagFilter = tag;
                        }
                        this.paletteScrollY = 0;
                        this.buildPaletteUI();
                    }
                });

                this.uiGroup.add(txtObj);
                this.cameras.main.ignore(txtObj);
                this.tagTextObjects.push(txtObj);
            });

            // 2. Render filtered tiles below tags
            const tileGridStartY = tagGridStartY + tagRows * tagSpacingY + 10;
            const filteredTiles = this.getFilteredTiles();

            filteredTiles.forEach((tile, idx) => {
                const col = idx % 7;
                const row = Math.floor(idx / 7);
                const x = gridStartX + col * spacingX;
                const y = tileGridStartY + row * spacingY;

                const sprite = this.add.sprite(x, y, tile.texture, tile.frame);
                sprite.setScale(tile.scale);
                sprite.setInteractive({ useHandCursor: true });
                sprite.setData('gid', tile.gid);

                sprite.on('pointerdown', () => {
                    this.selectedTileIndex = tile.gid;
                    // Auto switch tool based on background vs terrain GID
                    const correctTool = tile.gid >= 180 ? 'bg' : 'terrain';
                    if (this.activeTool !== correctTool) {
                        this.setTool(correctTool);
                    }
                    this.updateSelectionHighlights();
                });

                this.uiGroup.add(sprite);
                this.cameras.main.ignore(sprite);
                this.paletteSprites.push(sprite);
            });
        } 
        else if (this.activeTab === 'entities') {
            this.entityPalette.forEach((ent, idx) => {
                const col = idx % 7;
                const row = Math.floor(idx / 7);
                const x = gridStartX + col * spacingX;
                const y = tagGridStartY + row * spacingY;

                const txtObj = this.add.text(x, y, ent.label, {
                    fontFamily: '"Press Start 2P"',
                    fontSize: '11px',
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
        const startX = 674;
        const tagGridStartY = 152;
        const tagSpacingY = 22;
        const spacingY = 34;

        if (this.activeTab === 'tiles') {
            // Update tag buttons positions
            const tags = ['all', ...Object.keys(this.tileTags), 'Manage Tags'];
            const tagRows = Math.ceil(tags.length / 2);
            
            this.tagTextObjects.forEach((txt, idx) => {
                const row = Math.floor(idx / 2);
                txt.y = tagGridStartY + row * tagSpacingY + this.paletteScrollY;
                const isVisible = txt.y >= 142 && txt.y <= 455;
                txt.setVisible(isVisible);
                if (isVisible) txt.setInteractive();
                else txt.disableInteractive();
            });

            // Update tile sprites positions
            const tileGridStartY = tagGridStartY + tagRows * tagSpacingY + 10;
            this.paletteSprites.forEach((spr, idx) => {
                const row = Math.floor(idx / 7);
                spr.y = tileGridStartY + row * spacingY + this.paletteScrollY;
                const isVisible = spr.y >= 142 && spr.y <= 455;
                spr.setVisible(isVisible);
                if (isVisible) spr.setInteractive();
                else spr.disableInteractive();
            });
        } 
        else if (this.activeTab === 'entities') {
            this.paletteTexts.forEach((txt, idx) => {
                const row = Math.floor(idx / 7);
                txt.y = tagGridStartY + row * spacingY + this.paletteScrollY;
                const isVisible = txt.y >= 142 && txt.y <= 455;
                txt.setVisible(isVisible);
                if (isVisible) txt.setInteractive();
                else txt.disableInteractive();
            });
        }

        this.updateSelectionHighlights();
    }

    private updateSelectionHighlights(): void {
        Object.keys(this.layerButtons).forEach(key => {
            const btn = this.layerButtons[key];
            btn.setColor(this.activeTab === key ? '#00ffff' : '#888888');
        });

        Object.keys(this.toolButtons).forEach(key => {
            const btn = this.toolButtons[key];
            btn.setColor(this.activeTool === key ? '#ffff00' : '#888888');
        });

        if (this.activeTab === 'tiles') {
            this.selectedTilecodeText.setText(`SELECTED TILE CODE: ${this.selectedTileIndex}`);
        } else if (this.activeTab === 'entities') {
            this.selectedTilecodeText.setText(`SELECTED ENTITY:\n${this.selectedEntityType.toUpperCase()}`);
        }

        this.paletteHighlight.clear();
        
        if (this.activeTool === 'erase') {
            return;
        }

        this.paletteHighlight.lineStyle(2, 0xffff00, 1);

        if (this.activeTab === 'tiles') {
            const activeGid = this.selectedTileIndex;
            const spr = this.paletteSprites.find(s => s.getData('gid') === activeGid);
            if (spr && spr.visible) {
                this.paletteHighlight.strokeRect(spr.x - 15, spr.y - 15, 30, 30);
            }
        }
        else if (this.activeTab === 'entities') {
            const activeIdx = this.entityPalette.findIndex(e => e.type === this.selectedEntityType);
            if (activeIdx >= 0 && this.paletteTexts[activeIdx]) {
                const txt = this.paletteTexts[activeIdx];
                if (txt.visible) {
                    this.paletteHighlight.strokeRect(txt.x - 15, txt.y - 15, 30, 30);
                }
            }
        }
    }

    private setupPanningAndZooming(): void {
        // 1. Mouse wheel zooming & sidebar scrolling
        this.input.on('wheel', (pointer: Phaser.Input.Pointer, gameObjects: any, deltaX: number, deltaY: number, deltaZ: number) => {
            if (pointer.x >= 674) {
                // Scroll visual palette
                this.paletteScrollY -= deltaY * 0.4;
                let maxScroll = 0;
                if (this.activeTab === 'tiles') {
                    const tags = ['all', ...Object.keys(this.tileTags), 'Manage Tags'];
                    const tagRows = Math.ceil(tags.length / 2);
                    const filteredTiles = this.getFilteredTiles();
                    const tileRows = Math.ceil(filteredTiles.length / 7);
                    const totalHeight = tagRows * 22 + 10 + tileRows * 34;
                    maxScroll = Math.min(0, 313 - totalHeight - 20);
                } else {
                    const entityRows = Math.ceil(this.entityPalette.length / 7);
                    const totalHeight = entityRows * 34;
                    maxScroll = Math.min(0, 313 - totalHeight - 20);
                }
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
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.B).on('down', () => this.setTool('terrain'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.V).on('down', () => this.setTool('bg'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.E).on('down', () => this.setTool('erase'));
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.M).on('down', () => this.setTool('move'));

        kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE).on('down', () => {
            this.setTab('tiles');
            this.setTool('terrain');
        });
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO).on('down', () => {
            this.setTab('tiles');
            this.setTool('bg');
        });
        kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE).on('down', () => {
            this.setTab('entities');
        });
    }

    private setupPointerInput(): void {
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                if (this.activeTool === 'move') {
                    this.startDragging(pointer);
                } else {
                    this.paintGridAt(pointer);
                }
            }
        });

        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                if (this.activeTool === 'move') {
                    this.updateDragging(pointer);
                } else {
                    this.paintGridAt(pointer);
                }
            }
        });

        this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            if (this.activeTool === 'move') {
                this.stopDragging(pointer);
            }
        });
    }

    private paintGridAt(pointer: Phaser.Input.Pointer): void {
        if (pointer.x >= 674) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tileX = Math.floor(worldPoint.x / TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / TILE_SIZE);

        const w = this.levelData.meta.width;
        const h = this.levelData.meta.height;

        if (tileX < 0 || tileX >= w || tileY < 0 || tileY >= h) return;

        const idx = tileY * w + tileX;

        if (this.activeTab === 'tiles') {
            if (this.activeTool === 'terrain') {
                this.terrainLayer.putTileAt(this.selectedTileIndex, tileX, tileY);
                this.levelData.layers.terrain[idx] = this.selectedTileIndex;
            } else if (this.activeTool === 'bg') {
                this.bgLayer.putTileAt(this.selectedTileIndex, tileX, tileY);
                this.levelData.layers.background[idx] = this.selectedTileIndex;
                this.addBgOverlay(tileX, tileY);
            } else if (this.activeTool === 'erase') {
                this.terrainLayer.removeTileAt(tileX, tileY);
                this.levelData.layers.terrain[idx] = -1;
                this.bgLayer.removeTileAt(tileX, tileY);
                this.levelData.layers.background[idx] = -1;
                this.removeBgOverlay(tileX, tileY);
            }
        } else if (this.activeTab === 'entities') {
            if (this.activeTool === 'terrain' || this.activeTool === 'bg') {
                const existing = this.levelData.entities.find(e => e.x === tileX && e.y === tileY);
                if (existing) {
                    this.selectedEntity = existing;
                    this.updateSelectedEntityUI();
                    this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.5 } as any);
                    return;
                }

                this.removeEntityAt(tileX, tileY);
                const ent: EntityData = { type: this.selectedEntityType, x: tileX, y: tileY, properties: {} };
                this.levelData.entities.push(ent);
                this.drawEntityVisual(ent);
                this.selectedEntity = ent;
                this.updateSelectedEntityUI();
            } else if (this.activeTool === 'erase') {
                const existing = this.levelData.entities.find(e => e.x === tileX && e.y === tileY);
                if (existing && this.selectedEntity === existing) {
                    this.selectedEntity = null;
                    this.updateSelectedEntityUI();
                }
                this.removeEntityAt(tileX, tileY);
            }
        }
    }

    private setTab(tab: 'tiles' | 'entities'): void {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.activeTool = 'terrain'; // default to painting tool
        this.paletteScrollY = 0; // Reset scroll position when tab changes
        this.buildPaletteUI();
        this.updatePalettePositions();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.5 } as any);
    }

    private setTool(tool: 'terrain' | 'bg' | 'erase' | 'move'): void {
        if (this.activeTool === tool) return;
        this.activeTool = tool;
        if (tool !== 'move') {
            this.selectedWorkspaceItems = [];
            this.drawSelectionHighlights();
        }
        this.updateSelectionHighlights();
        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.3 } as any);
    }

    private drawSelectionHighlights(): void {
        if (!this.selectionHighlightGraphics) return;
        this.selectionHighlightGraphics.clear();
        if (this.selectedWorkspaceItems.length === 0) return;

        this.selectionHighlightGraphics.lineStyle(2, 0xff00ff, 0.9);
        this.selectionHighlightGraphics.fillStyle(0xff00ff, 0.15);
        this.selectionHighlightGraphics.setDepth(99);

        for (const item of this.selectedWorkspaceItems) {
            const px = item.x * TILE_SIZE;
            const py = item.y * TILE_SIZE;
            this.selectionHighlightGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            this.selectionHighlightGraphics.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }
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
            this.showLevelSelectorModal(list);
        } catch (err: any) {
            alert(`ERROR: Failed to load: ${err.message}`);
        }
    }

    private showLevelSelectorModal(initialList: string[]): void {
        if (this.input.keyboard) {
            this.input.keyboard.enabled = false;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '99999';
        overlay.style.fontFamily = "'Outfit', 'Inter', sans-serif";

        const container = document.createElement('div');
        container.style.backgroundColor = '#0e0e12';
        container.style.border = '2px solid #00ffff';
        container.style.borderRadius = '12px';
        container.style.padding = '24px';
        container.style.width = '600px';
        container.style.maxHeight = '80vh';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.3)';
        container.style.color = '#ffffff';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.borderBottom = '1px solid #222233';
        header.style.paddingBottom = '12px';
        header.style.marginBottom = '16px';

        const titleEl = document.createElement('h3');
        titleEl.innerText = '📂 SELECT LEVEL';
        titleEl.style.margin = '0';
        titleEl.style.color = '#00ffff';
        titleEl.style.fontSize = '22px';
        titleEl.style.fontWeight = 'bold';
        header.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#00ffff';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.transition = 'color 0.2s';
        closeBtn.onmouseover = () => { closeBtn.style.color = '#ffffff'; };
        closeBtn.onmouseout = () => { closeBtn.style.color = '#00ffff'; };
        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }
        };
        header.appendChild(closeBtn);
        container.appendChild(header);

        const listContainer = document.createElement('div');
        listContainer.style.flex = '1';
        listContainer.style.overflowY = 'auto';
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '12px';
        listContainer.style.paddingRight = '8px';

        // Scrollbar customization
        listContainer.style.scrollbarWidth = 'thin';
        listContainer.style.scrollbarColor = '#00ffff #1a1a24';

        const renderList = (levels: string[]) => {
            listContainer.innerHTML = '';
            if (levels.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.innerText = 'No custom levels found.';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.color = '#888899';
                emptyMsg.style.padding = '40px 0';
                listContainer.appendChild(emptyMsg);
                return;
            }

            levels.forEach(levelName => {
                const card = document.createElement('div');
                card.style.backgroundColor = '#161622';
                card.style.border = '1px solid #2e2e3e';
                card.style.borderRadius = '8px';
                card.style.padding = '12px 16px';
                card.style.display = 'flex';
                card.style.justifyContent = 'space-between';
                card.style.alignItems = 'center';
                card.style.transition = 'all 0.2s';
                card.onmouseover = () => {
                    card.style.borderColor = '#00ffff';
                    card.style.backgroundColor = '#1c1c2e';
                };
                card.onmouseout = () => {
                    card.style.borderColor = '#2e2e3e';
                    card.style.backgroundColor = '#161622';
                };

                const nameLabel = document.createElement('span');
                nameLabel.innerText = levelName;
                nameLabel.style.fontSize = '16px';
                nameLabel.style.fontWeight = '500';
                nameLabel.style.color = '#ffffff';
                nameLabel.style.cursor = 'pointer';
                nameLabel.onclick = () => loadAction(levelName);
                card.appendChild(nameLabel);

                const btnGroup = document.createElement('div');
                btnGroup.style.display = 'flex';
                btnGroup.style.gap = '8px';

                const loadBtn = document.createElement('button');
                loadBtn.innerText = 'LOAD';
                loadBtn.style.backgroundColor = '#00ffff';
                loadBtn.style.color = '#000000';
                loadBtn.style.border = 'none';
                loadBtn.style.borderRadius = '4px';
                loadBtn.style.padding = '6px 12px';
                loadBtn.style.fontWeight = 'bold';
                loadBtn.style.cursor = 'pointer';
                loadBtn.style.transition = 'opacity 0.2s';
                loadBtn.onmouseover = () => { loadBtn.style.opacity = '0.8'; };
                loadBtn.onmouseout = () => { loadBtn.style.opacity = '1'; };
                loadBtn.onclick = () => loadAction(levelName);
                btnGroup.appendChild(loadBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.innerText = '🗑️';
                deleteBtn.style.backgroundColor = '#ff3355';
                deleteBtn.style.color = '#ffffff';
                deleteBtn.style.border = 'none';
                deleteBtn.style.borderRadius = '4px';
                deleteBtn.style.padding = '6px 10px';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.transition = 'opacity 0.2s';
                deleteBtn.onmouseover = () => { deleteBtn.style.opacity = '0.8'; };
                deleteBtn.onmouseout = () => { deleteBtn.style.opacity = '1'; };
                deleteBtn.onclick = () => deleteAction(levelName);
                btnGroup.appendChild(deleteBtn);

                card.appendChild(btnGroup);
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    if (e.target === card || e.target === nameLabel) {
                        loadAction(levelName);
                    }
                };
                listContainer.appendChild(card);
            });
        };

        const loadAction = async (name: string) => {
            try {
                const dataRes = await fetch(`/assets/levels/${name}.json`);
                if (!dataRes.ok) throw new Error(`Failed to load levels/${name}.json`);

                const levelData = await dataRes.json() as LevelData;
                document.body.removeChild(overlay);
                if (this.input.keyboard) {
                    this.input.keyboard.enabled = true;
                }
                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.scene.start('EditorScene', { levelData });
            } catch (err: any) {
                alert(`ERROR: Failed to load: ${err.message}`);
            }
        };

        const deleteAction = async (name: string) => {
            const confirmed = confirm(`Are you absolutely sure you want to delete the level "${name}"?\nThis action cannot be undone.`);
            if (!confirmed) return;

            // Extra security confirmation to avoid any misclicks: user must type "delete" to confirm
            const doubleConfirmed = prompt(`To confirm deletion, please type "DELETE" below (case-sensitive):`);
            if (doubleConfirmed !== 'DELETE') {
                alert('Deletion cancelled (validation text did not match).');
                return;
            }

            try {
                const res = await fetch(`/api/levels/${name}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Delete request failed');

                this.sound.play('sfx_death', { volume: 0.3 } as any);
                alert(`SUCCESS: Level "${name}" has been deleted.`);
                
                // Fetch updated list and re-render
                const listRes = await fetch('/api/levels');
                if (listRes.ok) {
                    const list: string[] = await listRes.json();
                    renderList(list);
                }
            } catch (err: any) {
                alert(`ERROR: Failed to delete: ${err.message}`);
            }
        };

        renderList(initialList);
        container.appendChild(listContainer);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
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

    private updateSelectedEntityUI(): void {
        if (!this.selectedEntity) {
            this.selectedEntityText.setText("");
            this.selectedEntityText.setColor('#aaaaaa');
            this.editPropsButton.setVisible(false);
            return;
        }

        const ent = this.selectedEntity;
        const name = ent.type.toUpperCase();
        const props = ent.properties || {};

        if (ent.type === 'button') {
            const ch = props.channel || '1';
            const lCh = props.listenChannel ? `\nListen: ${props.listenChannel}` : '';
            const glow = props.glowColor ? `\nGlow: ${props.glowColor}` : '';
            this.selectedEntityText.setText(`Selected: ${name}\nChannel: ${ch}${lCh}${glow}`);
            this.selectedEntityText.setColor('#ff5555');
            this.editPropsButton.setVisible(true);
        } else if (ent.type === 'lever') {
            const ch = props.channel || '1';
            const lCh = props.listenChannel ? `\nListen: ${props.listenChannel}` : '';
            const glow = props.glowColor ? `\nGlow: ${props.glowColor}` : '';
            this.selectedEntityText.setText(`Selected: ${name}\nChannel: ${ch}${lCh}${glow}`);
            this.selectedEntityText.setColor('#ff33aa');
            this.editPropsButton.setVisible(true);
        } else if (ent.type === 'flying') {
            const startFrame = props.startFrame !== undefined ? props.startFrame : 120;
            const endX = props.endX !== undefined ? props.endX : ent.x;
            const endY = props.endY !== undefined ? props.endY : ent.y;
            const vel = props.velocity || 60;
            this.selectedEntityText.setText(`Selected: ${name}\nFrame: ${startFrame}\nEnd: ${endX},${endY}\nVel: ${vel}`);
            this.selectedEntityText.setColor('#a233ff');
            this.editPropsButton.setVisible(true);
        } else if (ent.type === 'gate') {
            const lCh = props.listenChannel || '1';
            const tileGid = props.tileGid !== undefined ? props.tileGid : 150;
            const glow = props.glowColor ? `\nGlow: ${props.glowColor}` : '';
            this.selectedEntityText.setText(`Selected: ${name}\nListen Ch: ${lCh}\nTile GID: ${tileGid}${glow}`);
            this.selectedEntityText.setColor('#ffaa00');
            this.editPropsButton.setVisible(true);
        } else if (ent.type === 'sign') {
            const txt = props.text !== undefined ? props.text : "Hello!";
            this.selectedEntityText.setText(`Selected: ${name}\nText: "${txt}"`);
            this.selectedEntityText.setColor('#e2a76f');
            this.editPropsButton.setVisible(true);
        } else if (ent.type === 'movingPlatform') {
            const ch = props.channel || '1';
            const endX = props.endX !== undefined ? props.endX : ent.x;
            const endY = props.endY !== undefined ? props.endY : ent.y;
            const vel = props.velocity || 60;
            const glow = props.glowColor || '0x44aaff';
            this.selectedEntityText.setText(`Selected: ${name}\nCh: ${ch} | End: ${endX},${endY}\nVel: ${vel} | Glow: ${glow}`);
            this.selectedEntityText.setColor('#44aaff');
            this.editPropsButton.setVisible(true);
        } else {
            this.selectedEntityText.setText(`Selected: ${name}\n(No editable properties)`);
            this.selectedEntityText.setColor('#ffffff');
            this.editPropsButton.setVisible(false);
        }
    }

    private editSelectedEntityProps(): void {
        if (!this.selectedEntity) return;

        const ent = this.selectedEntity;
        const props = ent.properties || {};

        const useNativePrompts = !!navigator.webdriver;

        if (useNativePrompts) {
            // FALLBACK FOR AUTOMATED TEST INTERFACE (Headless Puppeteer)
            if (ent.type === 'button') {
                const ch = prompt("Enter Output Trigger Channel (e.g. 1, gate_a):", String(props.channel || "1"));
                if (ch === null) return;

                const lCh = prompt("Enter optional Listen Channel (e.g. gravity_flip, or leave empty):", String(props.listenChannel || ""));
                if (lCh === null) return;

                const glowColor = prompt("Enter Glow Color (hex, e.g. 0xff5500, or leave empty):", String(props.glowColor || ""));
                if (glowColor === null) return;

                ent.properties = {
                    channel: ch.trim() || "1",
                    listenChannel: lCh.trim() ? lCh.trim() : undefined,
                    glowColor: glowColor.trim() ? glowColor.trim() : undefined
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            } else if (ent.type === 'lever') {
                const ch = prompt("Enter Output Trigger Channel (e.g. 1, gate_a):", String(props.channel || "1"));
                if (ch === null) return;

                const lCh = prompt("Enter optional Listen Channel (e.g. gravity_flip, or leave empty):", String(props.listenChannel || ""));
                if (lCh === null) return;

                const glowColor = prompt("Enter Glow Color (hex, e.g. 0xff5500, or leave empty):", String(props.glowColor || ""));
                if (glowColor === null) return;

                ent.properties = {
                    channel: ch.trim() || "1",
                    listenChannel: lCh.trim() ? lCh.trim() : undefined,
                    glowColor: glowColor.trim() ? glowColor.trim() : undefined
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            } else if (ent.type === 'flying') {
                const startFrame = prompt("Enter Start Frame Index (for 3-frame anim):", String(props.startFrame !== undefined ? props.startFrame : 120));
                if (startFrame === null) return;
                const endX = prompt("Enter End Tile X:", String(props.endX !== undefined ? props.endX : ent.x));
                if (endX === null) return;
                const endY = prompt("Enter End Tile Y:", String(props.endY !== undefined ? props.endY : ent.y));
                if (endY === null) return;
                const velocity = prompt("Enter Velocity (px/s):", String(props.velocity || 60));
                if (velocity === null) return;

                ent.properties = {
                    startFrame: parseInt(startFrame.trim()) || 120,
                    endX: parseInt(endX.trim()) || ent.x,
                    endY: parseInt(endY.trim()) || ent.y,
                    velocity: parseInt(velocity.trim()) || 60
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            } else if (ent.type === 'gate') {
                const lCh = prompt("Enter Listen Channel (e.g. 1, gate_a):", String(props.listenChannel || "1"));
                if (lCh === null) return;
                const tileGid = prompt("Enter Tile GID (visual frame index):", String(props.tileGid !== undefined ? props.tileGid : 150));
                if (tileGid === null) return;
                const glowColor = prompt("Enter Glow Color (hex, e.g. 0xff5500, or leave empty):", String(props.glowColor || ""));
                if (glowColor === null) return;

                ent.properties = {
                    listenChannel: lCh.trim() || "1",
                    tileGid: parseInt(tileGid.trim()) || 150,
                    glowColor: glowColor.trim() ? glowColor.trim() : undefined
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            } else if (ent.type === 'sign') {
                const txt = prompt("Enter Sign Text:", String(props.text !== undefined ? props.text : "Hello!"));
                if (txt === null) return;

                ent.properties = {
                    text: txt.trim()
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            } else if (ent.type === 'movingPlatform') {
                const endX = prompt("Enter End Tile X:", String(props.endX !== undefined ? props.endX : ent.x));
                if (endX === null) return;
                const endY = prompt("Enter End Tile Y:", String(props.endY !== undefined ? props.endY : ent.y));
                if (endY === null) return;
                const velocity = prompt("Enter Velocity (px/s):", String(props.velocity || 60));
                if (velocity === null) return;
                const channel = prompt("Enter Channel:", String(props.channel || "1"));
                if (channel === null) return;
                const tileGid = prompt("Enter Tile GID (visual tile index):", String(props.tileGid !== undefined ? props.tileGid : 0));
                if (tileGid === null) return;
                const extraTiles = prompt("Enter Extra Tile Offsets (e.g. '1,0 2,0' for 3-wide, or leave empty):", String(props.extraTiles || ""));
                if (extraTiles === null) return;
                const glowColor = prompt("Enter Glow Color (hex, e.g. 0x44aaff):", String(props.glowColor || "0x44aaff"));
                if (glowColor === null) return;

                ent.properties = {
                    endX: parseInt(endX.trim()) || ent.x,
                    endY: parseInt(endY.trim()) || ent.y,
                    velocity: parseInt(velocity.trim()) || 60,
                    channel: channel.trim() || "1",
                    tileGid: parseInt(tileGid.trim()) || 0,
                    extraTiles: extraTiles.trim() || undefined,
                    glowColor: glowColor.trim() || "0x44aaff"
                };

                this.sound.play('sfx_checkpoint', { volume: 0.3 });
                this.updateSelectedEntityUI();
                this.createWorkspaceTilemap();
            }
        } else {
            // UNIFIED FORM SYSTEM FOR REAL PLAYERS
            if (ent.type === 'button') {
                this.showPropertyForm("Button Properties", [
                    { key: 'channel', label: 'Output Trigger Channel', type: 'text', value: String(props.channel || "1") },
                    { key: 'listenChannel', label: 'Listen Channel (Optional)', type: 'text', value: String(props.listenChannel || "") },
                    { key: 'glowColor', label: 'Glow Color (hex, e.g. 0xff5500, or leave empty)', type: 'text', value: String(props.glowColor || "") }
                ], (values) => {
                    ent.properties = {
                        channel: values.channel.trim() || "1",
                        listenChannel: values.listenChannel.trim() ? values.listenChannel.trim() : undefined,
                        glowColor: values.glowColor.trim() ? values.glowColor.trim() : undefined
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            } else if (ent.type === 'lever') {
                this.showPropertyForm("Lever Properties", [
                    { key: 'channel', label: 'Output Trigger Channel', type: 'text', value: String(props.channel || "1") },
                    { key: 'listenChannel', label: 'Listen Channel (Optional)', type: 'text', value: String(props.listenChannel || "") },
                    { key: 'glowColor', label: 'Glow Color (hex, e.g. 0xff5500, or leave empty)', type: 'text', value: String(props.glowColor || "") }
                ], (values) => {
                    ent.properties = {
                        channel: values.channel.trim() || "1",
                        listenChannel: values.listenChannel.trim() ? values.listenChannel.trim() : undefined,
                        glowColor: values.glowColor.trim() ? values.glowColor.trim() : undefined
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            } else if (ent.type === 'flying') {
                this.showPropertyForm("Flying Entity Properties", [
                    { key: 'startFrame', label: 'Start Frame Index (3-frame anim)', type: 'text', value: String(props.startFrame !== undefined ? props.startFrame : "120") },
                    { key: 'endX', label: 'End Tile X', type: 'text', value: String(props.endX !== undefined ? props.endX : ent.x) },
                    { key: 'endY', label: 'End Tile Y', type: 'text', value: String(props.endY !== undefined ? props.endY : ent.y) },
                    { key: 'velocity', label: 'Velocity (px/s)', type: 'text', value: String(props.velocity || "60") }
                ], (values) => {
                    ent.properties = {
                        startFrame: parseInt(values.startFrame.trim()) || 120,
                        endX: parseInt(values.endX.trim()) || ent.x,
                        endY: parseInt(values.endY.trim()) || ent.y,
                        velocity: parseInt(values.velocity.trim()) || 60
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            } else if (ent.type === 'gate') {
                this.showPropertyForm("Gate Properties", [
                    { key: 'listenChannel', label: 'Listen Channel', type: 'text', value: String(props.listenChannel || "1") },
                    { key: 'tileGid', label: 'Tile GID (visual frame index)', type: 'text', value: String(props.tileGid !== undefined ? props.tileGid : "150") },
                    { key: 'glowColor', label: 'Glow Color (hex, e.g. 0xff5500, or leave empty)', type: 'text', value: String(props.glowColor || "") }
                ], (values) => {
                    ent.properties = {
                        listenChannel: values.listenChannel.trim() || "1",
                        tileGid: parseInt(values.tileGid.trim()) || 150,
                        glowColor: values.glowColor.trim() ? values.glowColor.trim() : undefined
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            } else if (ent.type === 'sign') {
                this.showPropertyForm("Sign Properties", [
                    { key: 'text', label: 'Sign Text', type: 'text', value: String(props.text !== undefined ? props.text : "Hello!") }
                ], (values) => {
                    ent.properties = {
                        text: values.text.trim()
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            } else if (ent.type === 'movingPlatform') {
                this.showPropertyForm("Moving Platform Properties", [
                    { key: 'endX', label: 'End Tile X', type: 'text', value: String(props.endX !== undefined ? props.endX : ent.x) },
                    { key: 'endY', label: 'End Tile Y', type: 'text', value: String(props.endY !== undefined ? props.endY : ent.y) },
                    { key: 'velocity', label: 'Velocity (px/s)', type: 'text', value: String(props.velocity || "60") },
                    { key: 'channel', label: 'Trigger Channel', type: 'text', value: String(props.channel || "1") },
                    { key: 'tileGid', label: 'Tile GID (visual frame index)', type: 'text', value: String(props.tileGid !== undefined ? props.tileGid : "0") },
                    { key: 'extraTiles', label: 'Extra Offsets (e.g. 1,0 2,0)', type: 'text', value: String(props.extraTiles || "") },
                    { key: 'glowColor', label: 'Glow Color (hex, e.g. 0x44aaff)', type: 'text', value: String(props.glowColor || "0x44aaff") }
                ], (values) => {
                    ent.properties = {
                        endX: parseInt(values.endX.trim()) || ent.x,
                        endY: parseInt(values.endY.trim()) || ent.y,
                        velocity: parseInt(values.velocity.trim()) || 60,
                        channel: values.channel.trim() || "1",
                        tileGid: parseInt(values.tileGid.trim()) || 0,
                        extraTiles: values.extraTiles.trim() || undefined,
                        glowColor: values.glowColor.trim() || "0x44aaff"
                    };
                    this.sound.play('sfx_checkpoint', { volume: 0.3 });
                    this.updateSelectedEntityUI();
                    this.createWorkspaceTilemap();
                });
            }
        }
    }

    private showPropertyForm(
        title: string,
        fields: { key: string; label: string; type: 'text' | 'select'; options?: string[]; value: string }[],
        callback: (values: Record<string, string>) => void
    ): void {
        if (this.input.keyboard) {
            this.input.keyboard.enabled = false;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '99999';
        overlay.style.fontFamily = "'Outfit', 'Inter', sans-serif";

        const container = document.createElement('div');
        container.style.backgroundColor = '#1e1e24';
        container.style.border = '2px solid #44aaff';
        container.style.borderRadius = '12px';
        container.style.padding = '24px';
        container.style.width = '360px';
        container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
        container.style.color = '#ffffff';

        const titleEl = document.createElement('h3');
        titleEl.innerText = title;
        titleEl.style.margin = '0 0 16px 0';
        titleEl.style.color = '#44aaff';
        titleEl.style.fontSize = '20px';
        titleEl.style.textAlign = 'center';
        titleEl.style.fontWeight = 'bold';
        container.appendChild(titleEl);

        const form = document.createElement('form');
        const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};

        fields.forEach(field => {
            const fieldWrapper = document.createElement('div');
            fieldWrapper.style.marginBottom = '12px';
            fieldWrapper.style.display = 'flex';
            fieldWrapper.style.flexDirection = 'column';

            const labelEl = document.createElement('label');
            labelEl.innerText = field.label;
            labelEl.style.marginBottom = '4px';
            labelEl.style.fontSize = '12px';
            labelEl.style.color = '#aaaaaa';
            fieldWrapper.appendChild(labelEl);

            if (field.type === 'select') {
                const selectEl = document.createElement('select');
                selectEl.style.padding = '8px';
                selectEl.style.borderRadius = '6px';
                selectEl.style.border = '1px solid #444444';
                selectEl.style.backgroundColor = '#2d2d35';
                selectEl.style.color = '#ffffff';
                selectEl.style.outline = 'none';
                selectEl.style.fontSize = '14px';

                (field.options || []).forEach(opt => {
                    const optEl = document.createElement('option');
                    optEl.value = opt;
                    optEl.text = opt;
                    if (opt === field.value) {
                        optEl.selected = true;
                    }
                    selectEl.appendChild(optEl);
                });
                ['keydown', 'keyup', 'keypress'].forEach(evt => {
                    selectEl.addEventListener(evt, e => e.stopPropagation());
                });
                fieldWrapper.appendChild(selectEl);
                inputs[field.key] = selectEl;
            } else {
                const inputEl = document.createElement('input');
                inputEl.type = 'text';
                inputEl.value = field.value;
                inputEl.style.padding = '8px';
                inputEl.style.borderRadius = '6px';
                inputEl.style.border = '1px solid #444444';
                inputEl.style.backgroundColor = '#2d2d35';
                inputEl.style.color = '#ffffff';
                inputEl.style.outline = 'none';
                inputEl.style.fontSize = '14px';
                ['keydown', 'keyup', 'keypress'].forEach(evt => {
                    inputEl.addEventListener(evt, e => e.stopPropagation());
                });
                fieldWrapper.appendChild(inputEl);
                inputs[field.key] = inputEl;
            }

            form.appendChild(fieldWrapper);
        });

        const btnWrapper = document.createElement('div');
        btnWrapper.style.display = 'flex';
        btnWrapper.style.justifyContent = 'space-between';
        btnWrapper.style.marginTop = '20px';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.innerText = 'Cancel';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.borderRadius = '6px';
        cancelBtn.style.border = '1px solid #555555';
        cancelBtn.style.backgroundColor = 'transparent';
        cancelBtn.style.color = '#cccccc';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.fontSize = '14px';
        cancelBtn.style.transition = 'all 0.2s';
        cancelBtn.onclick = () => {
            document.body.removeChild(overlay);
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }
        };
        btnWrapper.appendChild(cancelBtn);

        const saveBtn = document.createElement('button');
        saveBtn.type = 'submit';
        saveBtn.innerText = 'Save';
        saveBtn.style.padding = '8px 16px';
        saveBtn.style.borderRadius = '6px';
        saveBtn.style.border = 'none';
        saveBtn.style.backgroundColor = '#44aaff';
        saveBtn.style.color = '#ffffff';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.fontSize = '14px';
        saveBtn.style.fontWeight = 'bold';
        saveBtn.style.transition = 'all 0.2s';

        form.onsubmit = (e) => {
            e.preventDefault();
            const res: Record<string, string> = {};
            Object.keys(inputs).forEach(k => {
                res[k] = inputs[k].value;
            });
            document.body.removeChild(overlay);
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }
            callback(res);
        };

        btnWrapper.appendChild(saveBtn);
        form.appendChild(btnWrapper);
        container.appendChild(form);
        overlay.appendChild(container);
        document.body.appendChild(overlay);

        const firstInput = container.querySelector('input, select') as HTMLElement;
        if (firstInput) firstInput.focus();
    }



    private drawGridResizingButtons(): void {
        this.gridButtons.forEach(btn => btn.destroy());
        this.gridButtons = [];

        const w = this.levelData.meta.width;
        const h = this.levelData.meta.height;
        const wPx = w * TILE_SIZE;
        const hPx = h * TILE_SIZE;

        const style = {
            fontFamily: '"Press Start 2P"',
            fontSize: '12px',
            color: '#00ffff',
            backgroundColor: '#000000dd',
            padding: { x: 4, y: 4 }
        };

        const createBtn = (txt: string, x: number, y: number, callback: () => void) => {
            const btn = this.add.text(x, y, txt, style).setOrigin(0.5).setInteractive({ useHandCursor: true });
            btn.on('pointerdown', (ptr: any) => {
                ptr.event.stopPropagation();
                callback();
            });
            btn.on('pointerover', () => btn.setColor('#ffff00'));
            btn.on('pointerout', () => btn.setColor('#00ffff'));
            this.workspaceGroup.add(btn);
            this.gridButtons.push(btn);
        };

        // LEFT edge (shifts columns at the left)
        createBtn("+L", -24, (hPx / 2) - 15, () => this.resizeLeft(1));
        createBtn("-L", -24, (hPx / 2) + 15, () => this.resizeLeft(-1));

        // RIGHT edge (adds/removes columns at the right)
        createBtn("+R", wPx + 24, (hPx / 2) - 15, () => this.resizeWidth(1));
        createBtn("-R", wPx + 24, (hPx / 2) + 15, () => this.resizeWidth(-1));

        // TOP edge (shifts rows at the top)
        createBtn("+T", (wPx / 2) - 15, -24, () => this.resizeTop(1));
        createBtn("-T", (wPx / 2) + 15, -24, () => this.resizeTop(-1));

        // BOTTOM edge (adds/removes rows at the bottom)
        createBtn("+B", (wPx / 2) - 15, hPx + 24, () => this.resizeHeight(1));
        createBtn("-B", (wPx / 2) + 15, hPx + 24, () => this.resizeHeight(-1));
    }

    private resizeLeft(delta: number): void {
        const oldW = this.levelData.meta.width;
        const newW = oldW + delta;
        if (newW < 10 || newW > 100) return;

        const h = this.levelData.meta.height;
        const resizeLayer = (arr: number[]) => {
            const newArr = Array(newW * h).fill(-1);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < newW; x++) {
                    const newIdx = y * newW + x;
                    if (delta > 0) {
                        if (x >= delta) {
                            newArr[newIdx] = arr[y * oldW + (x - delta)];
                        }
                    } else {
                        const srcX = x - delta;
                        if (srcX < oldW) {
                            newArr[newIdx] = arr[y * oldW + srcX];
                        }
                    }
                }
            }
            return newArr;
        };

        this.levelData.layers.terrain = resizeLayer(this.levelData.layers.terrain);
        this.levelData.layers.background = resizeLayer(this.levelData.layers.background);
        this.levelData.layers.foreground = resizeLayer(this.levelData.layers.foreground);
        this.levelData.meta.width = newW;

        // Shift entities
        this.levelData.entities.forEach(ent => {
            ent.x += delta;
        });
        this.levelData.entities = this.levelData.entities.filter(ent => ent.x >= 0 && ent.x < newW);

        if (this.selectedEntity && (this.selectedEntity.x < 0 || this.selectedEntity.x >= newW)) {
            this.selectedEntity = null;
            this.updateSelectedEntityUI();
        }

        this.createWorkspaceTilemap();
        this.drawGrid();
        this.drawGridResizingButtons();
        
        this.entityVisuals.forEach(v => v.destroy());
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        this.sound.play('sfx_checkpoint', { volume: 0.3 });
    }

    private resizeTop(delta: number): void {
        const w = this.levelData.meta.width;
        const oldH = this.levelData.meta.height;
        const newH = oldH + delta;
        if (newH < 8 || newH > 50) return;

        const resizeLayer = (arr: number[]) => {
            const newArr = Array(w * newH).fill(-1);
            for (let y = 0; y < newH; y++) {
                for (let x = 0; x < w; x++) {
                    const newIdx = y * w + x;
                    if (delta > 0) {
                        if (y >= delta) {
                            newArr[newIdx] = arr[(y - delta) * w + x];
                        }
                    } else {
                        const srcY = y - delta;
                        if (srcY < oldH) {
                            newArr[newIdx] = arr[srcY * w + x];
                        }
                    }
                }
            }
            return newArr;
        };

        this.levelData.layers.terrain = resizeLayer(this.levelData.layers.terrain);
        this.levelData.layers.background = resizeLayer(this.levelData.layers.background);
        this.levelData.layers.foreground = resizeLayer(this.levelData.layers.foreground);
        this.levelData.meta.height = newH;

        // Shift entities
        this.levelData.entities.forEach(ent => {
            ent.y += delta;
        });
        this.levelData.entities = this.levelData.entities.filter(ent => ent.y >= 0 && ent.y < newH);

        if (this.selectedEntity && (this.selectedEntity.y < 0 || this.selectedEntity.y >= newH)) {
            this.selectedEntity = null;
            this.updateSelectedEntityUI();
        }

        this.createWorkspaceTilemap();
        this.drawGrid();
        this.drawGridResizingButtons();
        
        this.entityVisuals.forEach(v => v.destroy());
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        this.sound.play('sfx_checkpoint', { volume: 0.3 });
    }

    private resizeWidth(delta: number): void {
        const oldW = this.levelData.meta.width;
        const newW = oldW + delta;
        if (newW < 10 || newW > 100) return;

        const h = this.levelData.meta.height;
        const resizeLayer = (arr: number[]) => {
            const newArr = Array(newW * h).fill(-1);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < newW; x++) {
                    const newIdx = y * newW + x;
                    if (x < oldW) {
                        newArr[newIdx] = arr[y * oldW + x];
                    }
                }
            }
            return newArr;
        };

        this.levelData.layers.terrain = resizeLayer(this.levelData.layers.terrain);
        this.levelData.layers.background = resizeLayer(this.levelData.layers.background);
        this.levelData.layers.foreground = resizeLayer(this.levelData.layers.foreground);
        this.levelData.meta.width = newW;

        // Clean up entities outside bounds
        this.levelData.entities = this.levelData.entities.filter(e => e.x < newW);
        if (this.selectedEntity && this.selectedEntity.x >= newW) {
            this.selectedEntity = null;
            this.updateSelectedEntityUI();
        }

        this.createWorkspaceTilemap();
        this.drawGrid();
        this.drawGridResizingButtons();
        
        // Redraw entity visuals
        this.entityVisuals.forEach(v => v.destroy());
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        this.sound.play('sfx_checkpoint', { volume: 0.2 });
    }

    private resizeHeight(delta: number): void {
        const w = this.levelData.meta.width;
        const oldH = this.levelData.meta.height;
        const newH = oldH + delta;
        if (newH < 8 || newH > 50) return;

        const resizeLayer = (arr: number[]) => {
            const newArr = Array(w * newH).fill(-1);
            for (let y = 0; y < newH; y++) {
                for (let x = 0; x < w; x++) {
                    const newIdx = y * w + x;
                    if (y < oldH) {
                        newArr[newIdx] = arr[y * w + x];
                    }
                }
            }
            return newArr;
        };

        this.levelData.layers.terrain = resizeLayer(this.levelData.layers.terrain);
        this.levelData.layers.background = resizeLayer(this.levelData.layers.background);
        this.levelData.layers.foreground = resizeLayer(this.levelData.layers.foreground);
        this.levelData.meta.height = newH;

        // Clean up entities outside bounds
        this.levelData.entities = this.levelData.entities.filter(e => e.y < newH);
        if (this.selectedEntity && this.selectedEntity.y >= newH) {
            this.selectedEntity = null;
            this.updateSelectedEntityUI();
        }

        this.createWorkspaceTilemap();
        this.drawGrid();
        this.drawGridResizingButtons();
        
        // Redraw entity visuals
        this.entityVisuals.forEach(v => v.destroy());
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));

        this.sound.play('sfx_checkpoint', { volume: 0.2 });
    }

    private getTileConfig(gid: number): { texture: string, frame: number, scale: number } {
        if (gid >= 180) {
            return {
                texture: 'bg_tilemap_packed',
                frame: gid - 180,
                scale: 1.1
            };
        } else {
            return {
                texture: 'tilemap_packed',
                frame: gid,
                scale: 1.5
            };
        }
    }

    private startDragging(pointer: Phaser.Input.Pointer): void {
        if (pointer.x >= 674) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tileX = Math.floor(worldPoint.x / TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / TILE_SIZE);

        const w = this.levelData.meta.width;
        const h = this.levelData.meta.height;
        if (tileX < 0 || tileX >= w || tileY < 0 || tileY >= h) return;

        const isShiftHeld = pointer.event.shiftKey;

        // If Shift is held: toggle selection of the clicked tile/entity
        if (isShiftHeld) {
            const idx = tileY * w + tileX;
            const existingIdx = this.selectedWorkspaceItems.findIndex(item => item.x === tileX && item.y === tileY);
            if (existingIdx >= 0) {
                // Remove from selection
                this.selectedWorkspaceItems.splice(existingIdx, 1);
            } else {
                // Find what is here (Entity -> Terrain -> BG)
                const entity = this.levelData.entities.find(e => e.x === tileX && e.y === tileY);
                if (entity) {
                    this.selectedWorkspaceItems.push({ type: 'entity', x: tileX, y: tileY, value: entity });
                } else {
                    const terrVal = this.levelData.layers.terrain[idx];
                    if (terrVal >= 0) {
                        this.selectedWorkspaceItems.push({ type: 'terrain', x: tileX, y: tileY, value: terrVal });
                    } else {
                        const bgVal = this.levelData.layers.background[idx];
                        if (bgVal >= 0) {
                            this.selectedWorkspaceItems.push({ type: 'background', x: tileX, y: tileY, value: bgVal });
                        }
                    }
                }
            }
            this.drawSelectionHighlights();
            this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.4 } as any);
            return;
        }

        // If Shift is NOT held:
        // Check if the clicked tile is part of our selection
        const inSelection = this.selectedWorkspaceItems.some(item => item.x === tileX && item.y === tileY);

        if (inSelection) {
            // Drag the entire selection!
            this.dragStartX = tileX;
            this.dragStartY = tileY;
            this.isDragging = true;
            this.dragPreviews = [];

            // For each item in the selection:
            for (const item of this.selectedWorkspaceItems) {
                const dx = item.x - tileX;
                const dy = item.y - tileY;
                const itemWorldX = item.x * TILE_SIZE + TILE_SIZE / 2;
                const itemWorldY = item.y * TILE_SIZE + TILE_SIZE / 2;

                if (item.type === 'entity') {
                    const labels: Record<string, string> = {
                        humanSpawn: 'H', dogSpawn: 'D', exitDoor: 'DR', crate: 'CR', key: 'KY',
                        checkpoint: 'CP', ladder: 'LD', button: 'BT', gate: 'GT', launcher: 'LN',
                        cat: 'CT', sign: 'SN', spikes: 'SP', movingPlatform: 'MP', flying: 'FL'
                    };
                    const label = labels[item.value.type] || '?';
                    const txt = this.add.text(itemWorldX, itemWorldY, label, {
                        fontFamily: '"Press Start 2P"',
                        fontSize: '8px',
                        color: '#ffffff'
                    }).setOrigin(0.5).setDepth(100);
                    this.workspaceGroup.add(txt);
                    this.uiCamera.ignore(txt);
                    this.dragPreviews.push({ gameObject: txt, offsetGridX: dx, offsetGridY: dy });

                    // Hide original visual
                    const originalVisual = this.entityVisuals.get(`${item.x},${item.y}`);
                    if (originalVisual) originalVisual.setVisible(false);
                } else {
                    const config = this.getTileConfig(item.value);
                    const sprite = this.add.sprite(itemWorldX, itemWorldY, config.texture, config.frame);
                    sprite.setScale(config.scale).setDepth(100).setAlpha(0.7);
                    this.workspaceGroup.add(sprite);
                    this.uiCamera.ignore(sprite);
                    this.dragPreviews.push({ gameObject: sprite, offsetGridX: dx, offsetGridY: dy });

                    // Hide original tile from rendering during drag
                    if (item.type === 'terrain') {
                        this.terrainLayer.removeTileAt(item.x, item.y);
                        this.levelData.layers.terrain[item.y * w + item.x] = -1;
                    } else {
                        this.bgLayer.removeTileAt(item.x, item.y);
                        this.levelData.layers.background[item.y * w + item.x] = -1;
                        this.removeBgOverlay(item.x, item.y);
                    }
                }
            }
            this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.5 } as any);
        } else {
            // Clicked outside existing selection: Clear selection and do single drag
            this.selectedWorkspaceItems = [];
            this.drawSelectionHighlights();

            this.dragStartX = tileX;
            this.dragStartY = tileY;
            const idx = tileY * w + tileX;

            const entity = this.levelData.entities.find(e => e.x === tileX && e.y === tileY);
            if (entity) {
                this.dragEntity = entity;
                this.isDragging = true;

                const labels: Record<string, string> = {
                    humanSpawn: 'H', dogSpawn: 'D', exitDoor: 'DR', crate: 'CR', key: 'KY',
                    checkpoint: 'CP', ladder: 'LD', button: 'BT', gate: 'GT', launcher: 'LN',
                    cat: 'CT', sign: 'SN', spikes: 'SP', movingPlatform: 'MP', flying: 'FL'
                };
                const label = labels[entity.type] || '?';
                this.dragPreviewText = this.add.text(worldPoint.x, worldPoint.y, label, {
                    fontFamily: '"Press Start 2P"',
                    fontSize: '8px',
                    color: '#ffffff'
                }).setOrigin(0.5).setDepth(100);
                this.workspaceGroup.add(this.dragPreviewText);
                this.uiCamera.ignore(this.dragPreviewText);

                const key = `${tileX},${tileY}`;
                const originalVisual = this.entityVisuals.get(key);
                if (originalVisual) originalVisual.setVisible(false);
                this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.5 } as any);
            } else {
                const terrVal = this.levelData.layers.terrain[idx];
                if (terrVal >= 0) {
                    this.dragTileValue = terrVal;
                    this.dragTileLayer = 'terrain';
                    this.isDragging = true;

                    const config = this.getTileConfig(terrVal);
                    this.dragPreviewSprite = this.add.sprite(worldPoint.x, worldPoint.y, config.texture, config.frame);
                    this.dragPreviewSprite.setScale(config.scale).setDepth(100).setAlpha(0.7);
                    this.workspaceGroup.add(this.dragPreviewSprite);
                    this.uiCamera.ignore(this.dragPreviewSprite);

                    this.terrainLayer.removeTileAt(tileX, tileY);
                    this.levelData.layers.terrain[idx] = -1;
                    this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.2 } as any);
                } else {
                    const bgVal = this.levelData.layers.background[idx];
                    if (bgVal >= 0) {
                        this.dragTileValue = bgVal;
                        this.dragTileLayer = 'background';
                        this.isDragging = true;

                        const config = this.getTileConfig(bgVal);
                        this.dragPreviewSprite = this.add.sprite(worldPoint.x, worldPoint.y, config.texture, config.frame);
                        this.dragPreviewSprite.setScale(config.scale).setDepth(100).setAlpha(0.7);
                        this.workspaceGroup.add(this.dragPreviewSprite);
                        this.uiCamera.ignore(this.dragPreviewSprite);

                        this.bgLayer.removeTileAt(tileX, tileY);
                        this.levelData.layers.background[idx] = -1;
                        this.removeBgOverlay(tileX, tileY);
                        this.sound.play('sfx_jump', { volume: 0.1, pitch: 1.2 } as any);
                    }
                }
            }
        }
    }

    private updateDragging(pointer: Phaser.Input.Pointer): void {
        if (!this.isDragging) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        if (this.dragPreviewSprite) {
            this.dragPreviewSprite.setPosition(worldPoint.x, worldPoint.y);
        }
        if (this.dragPreviewText) {
            this.dragPreviewText.setPosition(worldPoint.x, worldPoint.y);
        }

        // For multi-drag previews
        for (const preview of this.dragPreviews) {
            const px = worldPoint.x + preview.offsetGridX * TILE_SIZE;
            const py = worldPoint.y + preview.offsetGridY * TILE_SIZE;
            preview.gameObject.setPosition(px, py);
        }
    }

    private stopDragging(pointer: Phaser.Input.Pointer): void {
        if (!this.isDragging) return;

        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const tileX = Math.floor(worldPoint.x / TILE_SIZE);
        const tileY = Math.floor(worldPoint.y / TILE_SIZE);

        const w = this.levelData.meta.width;
        const h = this.levelData.meta.height;

        let dropped = false;

        // If we were dragging a multi-selection
        if (this.selectedWorkspaceItems.length > 0) {
            const deltaX = tileX - this.dragStartX;
            const deltaY = tileY - this.dragStartY;

            // Check if ALL selected items will land within bounds
            let allInBounds = true;
            for (const item of this.selectedWorkspaceItems) {
                const newX = item.x + deltaX;
                const newY = item.y + deltaY;
                if (newX < 0 || newX >= w || newY < 0 || newY >= h) {
                    allInBounds = false;
                    break;
                }
            }

            if (allInBounds && (deltaX !== 0 || deltaY !== 0)) {
                // To prevent overwriting when moving elements, we extract their values first,
                // then write them to their new locations.
                
                const oldSelection = [...this.selectedWorkspaceItems];
                const entityMoves: { entity: any; newX: number; newY: number }[] = [];
                const tileMoves: { type: 'terrain' | 'background'; value: number; newX: number; newY: number }[] = [];

                for (const item of oldSelection) {
                    const newX = item.x + deltaX;
                    const newY = item.y + deltaY;
                    if (item.type === 'entity') {
                        entityMoves.push({ entity: item.value, newX, newY });
                    } else {
                        tileMoves.push({ type: item.type, value: item.value, newX, newY });
                    }
                }

                // Clear old entity positions from visual tracking
                for (const item of oldSelection) {
                    if (item.type === 'entity') {
                        this.removeEntityAt(item.x, item.y);
                    }
                }

                // Place everything at the new locations
                for (const m of entityMoves) {
                    this.removeEntityAt(m.newX, m.newY);
                    m.entity.x = m.newX;
                    m.entity.y = m.newY;
                    this.levelData.entities.push(m.entity);
                }

                for (const m of tileMoves) {
                    const idx = m.newY * w + m.newX;
                    if (m.type === 'terrain') {
                        this.levelData.layers.terrain[idx] = m.value;
                    } else {
                        this.levelData.layers.background[idx] = m.value;
                    }
                }

                // Update the selection list to the new positions
                this.selectedWorkspaceItems = oldSelection.map(item => ({
                    ...item,
                    x: item.x + deltaX,
                    y: item.y + deltaY
                }));

                dropped = true;
            } else {
                // Put tiles back to their original positions
                for (const item of this.selectedWorkspaceItems) {
                    const idx = item.y * w + item.x;
                    if (item.type === 'terrain') {
                        this.levelData.layers.terrain[idx] = item.value;
                    } else if (item.type === 'background') {
                        this.levelData.layers.background[idx] = item.value;
                    }
                }
            }

            // Cleanup preview objects
            for (const preview of this.dragPreviews) {
                preview.gameObject.destroy();
            }
            this.dragPreviews = [];
        } else {
            // Single dragging
            if (tileX >= 0 && tileX < w && tileY >= 0 && tileY < h) {
                const destIdx = tileY * w + tileX;

                if (this.dragEntity) {
                    this.removeEntityAt(tileX, tileY);
                    this.dragEntity.x = tileX;
                    this.dragEntity.y = tileY;
                    dropped = true;
                    this.selectedEntity = this.dragEntity;
                } else if (this.dragTileLayer === 'terrain') {
                    this.levelData.layers.terrain[destIdx] = this.dragTileValue;
                    dropped = true;
                } else if (this.dragTileLayer === 'background') {
                    this.levelData.layers.background[destIdx] = this.dragTileValue;
                    dropped = true;
                }
            }

            if (!dropped) {
                if (this.dragEntity) {
                    const key = `${this.dragStartX},${this.dragStartY}`;
                    const originalVisual = this.entityVisuals.get(key);
                    if (originalVisual) {
                        originalVisual.setVisible(true);
                    }
                } else if (this.dragTileLayer === 'terrain') {
                    const srcIdx = this.dragStartY * w + this.dragStartX;
                    this.levelData.layers.terrain[srcIdx] = this.dragTileValue;
                } else if (this.dragTileLayer === 'background') {
                    const srcIdx = this.dragStartY * w + this.dragStartX;
                    this.levelData.layers.background[srcIdx] = this.dragTileValue;
                }
            }

            if (this.dragPreviewSprite) {
                this.dragPreviewSprite.destroy();
                this.dragPreviewSprite = null;
            }
            if (this.dragPreviewText) {
                this.dragPreviewText.destroy();
                this.dragPreviewText = null;
            }

            this.dragEntity = null;
            this.dragTileValue = -1;
            this.dragTileLayer = null;
        }

        this.isDragging = false;
        this.drawSelectionHighlights();

        this.createWorkspaceTilemap();
        this.entityVisuals.forEach(v => v.destroy());
        this.entityVisuals.clear();
        this.levelData.entities.forEach(ent => this.drawEntityVisual(ent));
        this.updateSelectedEntityUI();

        this.sound.play('sfx_checkpoint', { volume: 0.2 });
    }

    private loadTileTags(): void {
        const defaultTags: Record<string, number[]> = {
            background: Array.from({ length: 24 }, (_, i) => 180 + i)
        };

        try {
            const data = localStorage.getItem('blu_tile_tags');
            if (data) {
                this.tileTags = JSON.parse(data);
            } else {
                this.tileTags = defaultTags;
                this.saveTileTags();
            }
        } catch (e) {
            console.error('Failed to load tile tags:', e);
            this.tileTags = defaultTags;
        }
    }

    private saveTileTags(): void {
        try {
            localStorage.setItem('blu_tile_tags', JSON.stringify(this.tileTags));
        } catch (e) {
            console.error('Failed to save tile tags:', e);
        }
    }

    private getFilteredTiles(): { gid: number; texture: string; frame: number; scale: number }[] {
        const allTiles: number[] = [];
        for (let i = 180; i <= 203; i++) {
            allTiles.push(i);
        }
        for (let i = 0; i <= 179; i++) {
            allTiles.push(i);
        }

        const filter = this.activeTagFilter;
        let filtered: number[] = allTiles;
        if (filter !== 'all' && this.tileTags[filter]) {
            const allowedGids = new Set(this.tileTags[filter]);
            filtered = allTiles.filter(gid => allowedGids.has(gid));
        }

        return filtered.map(gid => {
            const config = this.getTileConfig(gid);
            return {
                gid,
                texture: config.texture,
                frame: config.frame,
                scale: config.scale
            };
        });
    }

    private showTagManager(): void {
        if (this.input.keyboard) {
            this.input.keyboard.enabled = false;
        }

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '99999';
        overlay.style.fontFamily = "'Outfit', 'Inter', sans-serif";

        const container = document.createElement('div');
        container.style.backgroundColor = '#121216';
        container.style.border = '2px solid #ffaa00';
        container.style.borderRadius = '12px';
        container.style.padding = '20px';
        container.style.width = '800px';
        container.style.height = '500px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
        container.style.color = '#ffffff';

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.borderBottom = '1px solid #22222b';
        header.style.paddingBottom = '10px';

        const titleEl = document.createElement('h3');
        titleEl.innerText = '🏷️ TILE TAG MANAGER';
        titleEl.style.margin = '0';
        titleEl.style.color = '#ffaa00';
        titleEl.style.fontSize = '20px';
        titleEl.style.fontWeight = 'bold';
        header.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.innerText = '✕';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#ffaa00';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }
            this.saveTileTags();
            this.buildPaletteUI();
        };
        header.appendChild(closeBtn);
        container.appendChild(header);

        const body = document.createElement('div');
        body.style.display = 'flex';
        body.style.flex = '1';
        body.style.minHeight = '0';
        body.style.marginTop = '15px';
        body.style.gap = '20px';

        const leftPanel = document.createElement('div');
        leftPanel.style.width = '250px';
        leftPanel.style.display = 'flex';
        leftPanel.style.flexDirection = 'column';
        leftPanel.style.gap = '10px';
        leftPanel.style.borderRight = '1px solid #22222b';
        leftPanel.style.paddingRight = '15px';

        const addForm = document.createElement('div');
        addForm.style.display = 'flex';
        addForm.style.gap = '5px';

        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.placeholder = 'New tag name...';
        tagInput.style.flex = '1';
        tagInput.style.padding = '6px';
        tagInput.style.borderRadius = '4px';
        tagInput.style.border = '1px solid #444';
        tagInput.style.backgroundColor = '#1e1e24';
        tagInput.style.color = '#ffffff';
        tagInput.style.fontSize = '12px';
        tagInput.style.outline = 'none';
        ['keydown', 'keyup', 'keypress'].forEach(evt => {
            tagInput.addEventListener(evt, e => e.stopPropagation());
        });

        const addBtn = document.createElement('button');
        addBtn.innerText = '+ ADD';
        addBtn.style.padding = '6px 12px';
        addBtn.style.backgroundColor = '#ffaa00';
        addBtn.style.color = '#000000';
        addBtn.style.border = 'none';
        addBtn.style.borderRadius = '4px';
        addBtn.style.fontWeight = 'bold';
        addBtn.style.cursor = 'pointer';
        addBtn.style.fontSize = '12px';

        addForm.appendChild(tagInput);
        addForm.appendChild(addBtn);
        leftPanel.appendChild(addForm);

        const tagsScroll = document.createElement('div');
        tagsScroll.style.flex = '1';
        tagsScroll.style.overflowY = 'auto';
        tagsScroll.style.display = 'flex';
        tagsScroll.style.flexDirection = 'column';
        tagsScroll.style.gap = '5px';
        leftPanel.appendChild(tagsScroll);

        body.appendChild(leftPanel);

        const rightPanel = document.createElement('div');
        rightPanel.style.flex = '1';
        rightPanel.style.display = 'flex';
        rightPanel.style.flexDirection = 'column';
        rightPanel.style.minHeight = '0';

        const gridTitle = document.createElement('div');
        gridTitle.style.fontSize = '14px';
        gridTitle.style.color = '#888888';
        gridTitle.style.marginBottom = '10px';
        rightPanel.appendChild(gridTitle);

        const gridScroll = document.createElement('div');
        gridScroll.style.flex = '1';
        gridScroll.style.overflowY = 'auto';
        gridScroll.style.display = 'grid';
        gridScroll.style.gridTemplateColumns = 'repeat(6, 1fr)';
        gridScroll.style.gap = '10px';
        gridScroll.style.paddingRight = '5px';
        rightPanel.appendChild(gridScroll);

        body.appendChild(rightPanel);
        container.appendChild(body);

        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';
        footer.style.borderTop = '1px solid #22222b';
        footer.style.paddingTop = '10px';
        footer.style.marginTop = '15px';

        const saveCloseBtn = document.createElement('button');
        saveCloseBtn.innerText = 'CLOSE & APPLY';
        saveCloseBtn.style.padding = '10px 20px';
        saveCloseBtn.style.backgroundColor = '#ffaa00';
        saveCloseBtn.style.color = '#000000';
        saveCloseBtn.style.border = 'none';
        saveCloseBtn.style.borderRadius = '6px';
        saveCloseBtn.style.fontWeight = 'bold';
        saveCloseBtn.style.cursor = 'pointer';
        saveCloseBtn.style.fontSize = '14px';
        saveCloseBtn.onclick = () => {
            document.body.removeChild(overlay);
            if (this.input.keyboard) {
                this.input.keyboard.enabled = true;
            }
            this.saveTileTags();
            this.buildPaletteUI();
        };
        footer.appendChild(saveCloseBtn);
        container.appendChild(footer);

        overlay.appendChild(container);
        document.body.appendChild(overlay);

        let activeTag = Object.keys(this.tileTags)[0] || '';

        const refreshTagList = () => {
            tagsScroll.innerHTML = '';
            Object.keys(this.tileTags).forEach(tag => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.justifyContent = 'space-between';
                row.style.alignItems = 'center';
                row.style.padding = '8px';
                row.style.borderRadius = '6px';
                row.style.backgroundColor = tag === activeTag ? '#2a2a35' : '#1e1e24';
                row.style.border = tag === activeTag ? '1px solid #ffaa00' : '1px solid transparent';
                row.style.cursor = 'pointer';

                const nameSpan = document.createElement('span');
                nameSpan.innerText = tag;
                nameSpan.style.fontSize = '13px';
                nameSpan.style.fontWeight = tag === activeTag ? 'bold' : 'normal';
                nameSpan.style.color = tag === activeTag ? '#ffaa00' : '#ffffff';
                row.appendChild(nameSpan);

                const deleteBtn = document.createElement('button');
                deleteBtn.innerText = '🗑️';
                deleteBtn.style.background = 'transparent';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = '#ff4444';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.padding = '2px 5px';
                deleteBtn.style.fontSize = '12px';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete the tag "${tag}"?`)) {
                        delete this.tileTags[tag];
                        if (activeTag === tag) {
                            activeTag = Object.keys(this.tileTags)[0] || '';
                            if (this.activeTagFilter === tag) {
                                this.activeTagFilter = 'all';
                            }
                        }
                        refreshTagList();
                        refreshGrid();
                    }
                };
                row.appendChild(deleteBtn);

                row.onclick = () => {
                    activeTag = tag;
                    refreshTagList();
                    refreshGrid();
                };

                tagsScroll.appendChild(row);
            });
        };

        const refreshGrid = () => {
            gridScroll.innerHTML = '';
            if (!activeTag) {
                gridTitle.innerText = 'No tags created. Add a tag first!';
                return;
            }
            gridTitle.innerText = `Select tiles associated with tag: ${activeTag.toUpperCase()}`;

            const taggedGids = this.tileTags[activeTag] || [];
            const allTiles: number[] = [];
            for (let i = 180; i <= 203; i++) allTiles.push(i);
            for (let i = 0; i <= 179; i++) allTiles.push(i);

            allTiles.forEach(gid => {
                const isTagged = taggedGids.includes(gid);
                
                const cell = document.createElement('div');
                cell.style.display = 'flex';
                cell.style.flexDirection = 'column';
                cell.style.alignItems = 'center';
                cell.style.justifyContent = 'center';
                cell.style.padding = '8px';
                cell.style.borderRadius = '6px';
                cell.style.backgroundColor = isTagged ? '#252530' : '#1e1e24';
                cell.style.border = isTagged ? '1px solid #ffaa00' : '1px solid transparent';
                cell.style.cursor = 'pointer';
                cell.style.userSelect = 'none';

                const col = gid >= 180 ? (gid - 180) % 8 : gid % 20;
                const rowNum = gid >= 180 ? Math.floor((gid - 180) / 8) : Math.floor(gid / 20);
                const bgSize = gid >= 180 ? '288px 108px' : '720px 324px';
                const bgPos = `${-(col * 36)}px ${-(rowNum * 36)}px`;
                const bgImg = gid >= 180 ? 'assets/backgrounds/tilemap-backgrounds_packed.png' : 'assets/tilesets/tilemap_packed.png';

                const thumb = document.createElement('div');
                thumb.style.width = '36px';
                thumb.style.height = '36px';
                thumb.style.backgroundImage = `url('${bgImg}')`;
                thumb.style.backgroundSize = bgSize;
                thumb.style.backgroundPosition = bgPos;
                thumb.style.imageRendering = 'pixelated';
                thumb.style.backgroundRepeat = 'no-repeat';
                cell.appendChild(thumb);

                const label = document.createElement('div');
                label.innerText = `GID ${gid}`;
                label.style.fontSize = '9px';
                label.style.color = isTagged ? '#ffaa00' : '#888888';
                label.style.marginTop = '4px';
                cell.appendChild(label);

                cell.onclick = () => {
                    const idx = taggedGids.indexOf(gid);
                    if (idx > -1) {
                        taggedGids.splice(idx, 1);
                    } else {
                        taggedGids.push(gid);
                    }
                    this.tileTags[activeTag] = taggedGids;
                    refreshGrid();
                };

                gridScroll.appendChild(cell);
            });
        };

        addBtn.onclick = () => {
            const name = tagInput.value.trim().toLowerCase();
            if (!name) return;
            if (name === 'all' || name === 'manage tags') {
                alert('Invalid tag name.');
                return;
            }
            if (this.tileTags[name]) {
                alert('Tag already exists.');
                return;
            }
            this.tileTags[name] = [];
            activeTag = name;
            tagInput.value = '';
            refreshTagList();
            refreshGrid();
        };

        tagInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBtn.click();
            }
        };

        refreshTagList();
        refreshGrid();
    }
}
