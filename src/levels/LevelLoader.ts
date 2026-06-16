import Phaser from 'phaser';
import { TILE_SIZE, VISUAL_FAMILIES } from '../constants';
import { LevelData, EntityData } from './LevelSchema';
import { EntityManager, Entity } from '../ecs/Entity';
import { createPlayerEntity } from '../entities/PlayerFactory';
import {
    TransformComponent,
    RenderComponent,
    PhysicsBodyComponent,
    CarryableComponent,
    InteractableComponent,
    CheckpointComponent,
    ExitDoorComponent,
    TriggerComponent,
    TriggerableComponent,
    LauncherComponent,
    CatComponent,
    SignComponent,
    FlyingComponent,
    SpikesComponent,
    KeyComponent,
    MovingPlatformComponent,
    LevelDoorComponent,
    LGComponent
} from '../ecs/components';
import { getMappingByDoorId } from './levelSelectMapping';

export class LevelLoader {
    /**
     * Load a level JSON, set up terrain layers, background assets, spawners, 
     * and register human/dog players inside the ECS Entity Manager.
     */
    static loadLevel(
        scene: Phaser.Scene,
        levelKeyOrData: string | LevelData,
        entityManager: EntityManager,
    ): {
        levelWidthPx: number;
        levelHeightPx: number;
        terrainLayer: Phaser.Tilemaps.TilemapLayer;
        player1Entity: Entity;
        player2Entity: Entity;
        backgroundSprites?: Phaser.GameObjects.TileSprite[];
    } {
        // 1. Get level data from cache or use raw data
        const levelData = typeof levelKeyOrData === 'string' 
            ? (scene.cache.json.get(levelKeyOrData) as LevelData)
            : levelKeyOrData;

        if (!levelData) {
            throw new Error(`Failed to load level data: ${levelKeyOrData}`);
        }

        const levelWidthPx = levelData.meta.width * TILE_SIZE;
        const levelHeightPx = levelData.meta.height * TILE_SIZE;

        let backgroundSprites: Phaser.GameObjects.TileSprite[] | undefined;
        if (levelData.meta.background) {
            backgroundSprites = this.createParallaxBackground(
                scene,
                levelData.meta.background,
                levelWidthPx,
                levelHeightPx,
                undefined,
                undefined
            );
        } else {
            scene.cameras.main.setBackgroundColor('#1a1a2e');
        }

        // 3. Create tilemap
        const map = scene.make.tilemap({
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
            width: levelData.meta.width,
            height: levelData.meta.height,
        });

        const tileset = map.addTilesetImage(
            'tilemap_packed',
            'tilemap_packed',
            TILE_SIZE, TILE_SIZE,
            0, 0,
            0 // GID starts at 0
        );

        const fallTileset = map.addTilesetImage(
            'tilemap_packed_fall',
            'tilemap_packed_fall',
            TILE_SIZE, TILE_SIZE,
            0, 0,
            180 // GID starts at 180
        );

        const industrialTileset = map.addTilesetImage(
            'tilemap_packed_industrial',
            'tilemap_packed_industrial',
            TILE_SIZE, TILE_SIZE,
            0, 0,
            292 // GID starts at 292
        );

        if (!tileset || !fallTileset || !industrialTileset) {
            throw new Error('Failed to create tileset');
        }

        // 4. Create layers and fill
        const bgLayer = map.createBlankLayer('background', [tileset, fallTileset, industrialTileset], 0, 0);
        const terrainLayer = map.createBlankLayer('terrain', [tileset, fallTileset, industrialTileset], 0, 0);
        const fgLayer = map.createBlankLayer('foreground', [tileset, fallTileset, industrialTileset], 0, 0);

        if (!bgLayer || !terrainLayer || !fgLayer) {
            throw new Error('Failed to create tilemap layers');
        }

        this.fillLayer(bgLayer, levelData.layers.background, levelData.meta.width);
        this.fillLayer(terrainLayer, levelData.layers.terrain, levelData.meta.width);
        this.fillLayer(fgLayer, levelData.layers.foreground, levelData.meta.width);

        bgLayer.setDepth(2);
        terrainLayer.setDepth(1);
        fgLayer.setDepth(20);

        // Enable Arcade physics collision on terrain layer tiles
        terrainLayer.setCollisionByExclusion([-1]);

        // 5. Create Physics Groups for clean collision handling
        const cratesGroup = scene.physics.add.group();
        const gatesGroup = scene.physics.add.group();
        const launchersGroup = scene.physics.add.group();
        const movingPlatformsGroup = scene.physics.add.group();
        const catsGroup = scene.physics.add.group();
        const keysGroup = scene.physics.add.group();
        const lgGroup = scene.physics.add.group();

        // Pre-scan entities to map channels to their configured glow colors
        const channelGlowColors = new Map<string, number>();
        for (const entData of levelData.entities) {
            const props = entData.properties || {};
            const channel = String(props.channel || '');
            if (channel && props.glowColor !== undefined) {
                const colorStr = String(props.glowColor);
                const color = parseInt(colorStr.replace('0x', ''), 16);
                if (!isNaN(color)) {
                    channelGlowColors.set(channel, color);
                }
            }
        }

        // 6. Loop through entities and instantiate them
        let humanSpawn = { x: 3, y: 10 };
        let dogSpawn = { x: 20, y: 10 };

        for (const entData of levelData.entities) {
            const entX = entData.x * TILE_SIZE + TILE_SIZE / 2;
            const entY = entData.y * TILE_SIZE + TILE_SIZE / 2;

            // Check if there is a background tile placed at the exact same grid coordinate to override the visual frame/texture
            const bgIndex = entData.y * levelData.meta.width + entData.x;
            const tileIndex = levelData.layers.background[bgIndex];
            const hasBGOverride = tileIndex !== undefined && tileIndex >= 0;

            let overrideIdleFrame: number | undefined;
            let overrideActiveFrame: number | undefined;

            if (hasBGOverride) {
                // Remove from visual background layer map so it doesn't double-render or leave static duplicates if moved
                bgLayer.removeTileAt(entData.x, entData.y);
                
                // Lookup visual family mapping
                let family = VISUAL_FAMILIES[tileIndex];
                if (!family) {
                    // Search if tileIndex is active/inactive frame in any family
                    const found = Object.values(VISUAL_FAMILIES).find(
                        f => f.active === tileIndex || f.inactive === tileIndex
                    );
                    if (found) {
                        family = found;
                    }
                }

                if (family) {
                    overrideIdleFrame = family.inactive;
                    overrideActiveFrame = family.active;
                } else {
                    overrideIdleFrame = tileIndex;
                    overrideActiveFrame = tileIndex;
                }
            }

            const getFrame = (gid: number) => {
                if (gid >= 292) return gid - 292;
                if (gid >= 180) return gid - 180;
                return gid;
            };

            // Helper to get overridden texture/frame or default values
            const getVisual = (defaultFrame: number, defaultActiveFrame?: number) => {
                if (hasBGOverride) {
                    const localIdle = overrideIdleFrame !== undefined ? getFrame(overrideIdleFrame) : getFrame(tileIndex);
                    const localActive = overrideActiveFrame !== undefined ? getFrame(overrideActiveFrame) : localIdle;
                    let tex = tileIndex >= 292 ? 'tilemap_packed_industrial' : (tileIndex >= 180 ? 'tilemap_packed_fall' : 'tilemap_packed');
                    return {
                        texture: tex,
                        frame: localIdle,
                        activeFrame: localActive
                    };
                }
                let defaultTexture = defaultFrame >= 292 ? 'tilemap_packed_industrial' : (defaultFrame >= 180 ? 'tilemap_packed_fall' : 'tilemap_packed');
                return {
                    texture: defaultTexture,
                    frame: getFrame(defaultFrame),
                    activeFrame: defaultActiveFrame !== undefined ? getFrame(defaultActiveFrame) : getFrame(defaultFrame)
                };
            };

            if (entData.type === 'humanSpawn') {
                humanSpawn = { x: entData.x, y: entData.y };

                const props = entData.properties || {};
                const flickerRate = props.flickerRate !== undefined ? Number(props.flickerRate) : 500;
                const flickerTile = props.flickerTile !== undefined ? Number(props.flickerTile) : 112;

                const visual = getVisual(111);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Checkpoint',
                    humanActive: true,
                    dogActive: false,
                    flickerRate,
                    flickerTile,
                    flickerTimer: 0,
                    showingAlt: false
                } as CheckpointComponent);

            } else if (entData.type === 'dogSpawn') {
                dogSpawn = { x: entData.x, y: entData.y };

                const props = entData.properties || {};
                const flickerRate = props.flickerRate !== undefined ? Number(props.flickerRate) : 500;
                const flickerTile = props.flickerTile !== undefined ? Number(props.flickerTile) : 112;

                const visual = getVisual(111);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Checkpoint',
                    humanActive: false,
                    dogActive: true,
                    flickerRate,
                    flickerTile,
                    flickerTimer: 0,
                    showingAlt: false
                } as CheckpointComponent);

            } else if (entData.type === 'hd') {
                humanSpawn = { x: entData.x, y: entData.y };
                dogSpawn = { x: entData.x, y: entData.y };

                const props = entData.properties || {};
                const flickerRate = props.flickerRate !== undefined ? Number(props.flickerRate) : 500;
                const flickerTile = props.flickerTile !== undefined ? Number(props.flickerTile) : 112;

                const visual = getVisual(111);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Checkpoint',
                    humanActive: true,
                    dogActive: true,
                    flickerRate,
                    flickerTile,
                    flickerTimer: 0,
                    showingAlt: false,
                    isHD: true
                } as CheckpointComponent);

            } else if (entData.type === 'crate') {
                const visual = getVisual(26);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(8);
                cratesGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setSize(14, 16);
                body.setOffset(2, 2);
                body.setDragX(5000); // Way more friction!

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 8,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({ type: 'Carryable', carriedBy: null, weight: 'heavy' } as CarryableComponent);

            } else if (entData.type === 'key') {
                const visual = getVisual(27);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(8);
                keysGroup.add(sprite);
                
                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(true);
                body.checkCollision.none = false;
                body.setSize(12, 12);
                body.setOffset(3, 3);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 8,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({ type: 'Key', isPickedUp: false } as KeyComponent);

            } else if (entData.type === 'lg') {
                const visual = getVisual(28);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(8);
                lgGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.setImmovable(true);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 8,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({ type: 'LG' } as LGComponent);

            } else if (entData.type === 'checkpoint') {
                const props = entData.properties || {};
                const flickerRate = props.flickerRate !== undefined ? Number(props.flickerRate) : 500;
                const flickerTile = props.flickerTile !== undefined ? Number(props.flickerTile) : 112;

                const visual = getVisual(111);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Checkpoint',
                    humanActive: false,
                    dogActive: false,
                    flickerRate,
                    flickerTile,
                    flickerTimer: 0,
                    showingAlt: false
                } as CheckpointComponent);

            } else if (entData.type === 'cat') {
                const props = entData.properties || {};
                const initialFacing = props.facing === 'left' ? 'left' : 'right';

                const sprite = scene.physics.add.sprite(entX, entY, 'catIdle', 0);
                sprite.setDepth(8);
                catsGroup.add(sprite);
                sprite.play('cat_idle');
                sprite.setFlipX(initialFacing === 'left');

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setSize(16, 18);
                body.setOffset(8, 5);
                body.setImmovable(true);

                // Add collision bounds for cat
                scene.physics.add.collider(sprite, terrainLayer);
                scene.physics.add.collider(sprite, gatesGroup);
                scene.physics.add.collider(sprite, launchersGroup);
                scene.physics.add.collider(sprite, movingPlatformsGroup);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 8
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                const catComp = {
                    type: 'Cat',
                    state: 'sleeping',
                    startX: sprite.x,
                    direction: 0,
                    runSpeed: 90,
                    targetDistance: 90,
                    startleTimer: 0,
                    initialFacing: initialFacing
                } as CatComponent;
                entity.addComponent(catComp);
                (sprite as any).catComponent = catComp;

            } else if (entData.type === 'sign') {
                const props = entData.properties || {};
                const text = props.text !== undefined ? String(props.text) : "Hello!";

                const visual = getVisual(86);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Sign',
                    text
                } as SignComponent);

            } else if (entData.type === 'flying') {
                const props = entData.properties || {};
                const endX = entData.x + Number(props.endX || 0);
                const endY = entData.y + Number(props.endY || 0);
                const velocity = props.velocity !== undefined ? Number(props.velocity) : 60;
                
                const style = props.style !== undefined ? Number(props.style) : 1;
                const startFrame = style === 2 ? 15 : 24;
                const texture = 'tilemap_characters';

                const sprite = scene.physics.add.sprite(entX, entY, texture, startFrame);
                sprite.setDepth(8);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.setSize(12, 12);
                body.setOffset(6, 6);

                // Add collision with terrain
                scene.physics.add.collider(sprite, terrainLayer);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 8,
                    idleFrame: startFrame,
                    activeFrame: startFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'PhysicsBody',
                    body,
                    isGrounded: false
                } as PhysicsBodyComponent);
                entity.addComponent({
                    type: 'Flying',
                    startX: entX,
                    startY: entY,
                    endX: endX * TILE_SIZE + TILE_SIZE / 2,
                    endY: endY * TILE_SIZE + TILE_SIZE / 2,
                    velocity,
                    direction: 1,
                    startFrame,
                    animTimer: 0,
                    animFrame: 0,
                    collisionCooldown: 0
                } as FlyingComponent);

            } else if (entData.type === 'spikes') {
                const visual = getVisual(68);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Spikes'
                } as SpikesComponent);

            } else if (entData.type === 'exitDoor') {
                const visual = getVisual(150);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                if (entData.y - 1 >= 0) {
                    bgLayer.putTileAt(110, entData.x, entData.y - 1);
                }

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'ExitDoor', playersPresent: new Set() } as ExitDoorComponent);

            } else if (entData.type === 'levelDoor') {
                const props = entData.properties || {};
                const doorId = Number(props.doorId || 0);
                const mapping = getMappingByDoorId(doorId);

                const visual = getVisual(150);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                if (entData.y - 1 >= 0) {
                    bgLayer.putTileAt(110, entData.x, entData.y - 1);
                }

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'LevelDoor',
                    doorId,
                    levelKey: mapping?.levelKey || '',
                    label: props.label !== undefined ? String(props.label) : (mapping?.label || 'LEVEL ?'),
                    isPlayerNear: false
                } as LevelDoorComponent);

            } else if (entData.type === 'ladder') {
                const props = entData.properties || {};
                const tileGid = props.tileGid !== undefined ? Number(props.tileGid) : 71;
                const visual = getVisual(tileGid);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(4);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 4,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'Interactable', interactionType: 'ladder', range: 18 } as InteractableComponent);

            } else if (entData.type === 'button') {
                const props = entData.properties || {};
                const channel = String(props.channel || '1');
                const listenChannel = props.listenChannel ? String(props.listenChannel) : undefined;
                const triggerType = 'pressure';
                const visualType = 'button';

                // Look up glowColor
                let glowColor: number | undefined;
                if (props.glowColor !== undefined) {
                    const colorStr = String(props.glowColor);
                    glowColor = parseInt(colorStr.replace('0x', ''), 16) || undefined;
                } else {
                    glowColor = channelGlowColors.get(channel);
                }

                const visual = getVisual(148, 149);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Trigger',
                    channel,
                    listenChannel,
                    triggerType,
                    isActive: false,
                    visualType,
                    glowColor
                } as TriggerComponent);

            } else if (entData.type === 'lever') {
                const props = entData.properties || {};
                const channel = String(props.channel || '1');
                const listenChannel = props.listenChannel ? String(props.listenChannel) : undefined;
                const triggerType = 'interact';
                const visualType = 'lever';

                // Look up glowColor
                let glowColor: number | undefined;
                if (props.glowColor !== undefined) {
                    const colorStr = String(props.glowColor);
                    glowColor = parseInt(colorStr.replace('0x', ''), 16) || undefined;
                } else {
                    glowColor = channelGlowColors.get(channel);
                }

                const visual = getVisual(64, 66);
                const sprite = scene.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({
                    type: 'Trigger',
                    channel,
                    listenChannel,
                    triggerType,
                    isActive: false,
                    visualType,
                    glowColor
                } as TriggerComponent);

            } else if (entData.type === 'gate') {
                const props = entData.properties || {};
                const listenChannel = String(props.listenChannel || '1');
                const tileGid = props.tileGid !== undefined ? Number(props.tileGid) : 355;

                // Look up glowColor: check if channel has a glow color in our pre-scanned map, or use entity property
                let glowColor: number | undefined;
                if (props.glowColor !== undefined && String(props.glowColor).trim() !== '') {
                    const colorStr = String(props.glowColor);
                    glowColor = parseInt(colorStr.replace('0x', ''), 16) || undefined;
                } else if (channelGlowColors.has(listenChannel)) {
                    glowColor = channelGlowColors.get(listenChannel);
                }

                const visual = getVisual(tileGid);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(6);
                gatesGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.setImmovable(true);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 6,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({
                    type: 'Triggerable',
                    listenChannel,
                    state: false,
                    targetType: 'gate',
                    glowColor,
                    requireAll: props.requireAll === true || props.requireAll === 'true'
                } as TriggerableComponent);
            } else if (entData.type === 'launcher') {
                const visual = getVisual(107, 108);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);
                launchersGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.setImmovable(true);
                body.setSize(18, 14);
                body.setOffset(0, 4);

                const entity = entityManager.createEntity();
                entity.addComponent({ type: 'Transform', x: sprite.x, y: sprite.y, width: 18, height: 18 } as TransformComponent);
                entity.addComponent({
                    type: 'Render',
                    gameObject: sprite,
                    depth: 5,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({
                    type: 'Launcher',
                    launchForce: -400,
                    isActivated: false,
                    activationTimer: 0
                } as LauncherComponent);
            } else if (entData.type === 'movingPlatform') {
                const props = entData.properties || {};
                const endX = entData.x + Number(props.endX || 0);
                const endY = entData.y + Number(props.endY || 0);
                const velocity = props.velocity !== undefined ? Number(props.velocity) : 60;
                const channel = String(props.channel || '1');
                const tileGid = props.tileGid !== undefined ? Number(props.tileGid) : 9;
                const extraTilesStr = props.extraTiles !== undefined ? String(props.extraTiles) : '';

                // Look up glow color from props or pre-scanned map
                let glowColor = 0x44aaff;
                if (props.glowColor !== undefined) {
                    const colorStr = String(props.glowColor);
                    glowColor = parseInt(colorStr.replace('0x', ''), 16) || 0x44aaff;
                } else if (channelGlowColors.has(channel)) {
                    glowColor = channelGlowColors.get(channel)!;
                }

                // Parse extra tile offsets: "1,0 2,0" -> [{dx: 1, dy: 0}, {dx: 2, dy: 0}]
                const tileOffsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
                if (extraTilesStr.trim()) {
                    const pairs = extraTilesStr.trim().split(/\s+/);
                    for (const pair of pairs) {
                        const [dxStr, dyStr] = pair.split(',');
                        if (dxStr !== undefined && dyStr !== undefined) {
                            tileOffsets.push({
                                dx: parseInt(dxStr) || 0,
                                dy: parseInt(dyStr) || 0
                            });
                        }
                    }
                }

                // Determine visual frame and texture
                const visual = getVisual(tileGid);

                const tileSprites: Phaser.GameObjects.Sprite[] = [];
                const tileBodies: Phaser.Physics.Arcade.Body[] = [];

                for (const offset of tileOffsets) {
                    const tx = entX + offset.dx * TILE_SIZE;
                    const ty = entY + offset.dy * TILE_SIZE;

                    const sprite = scene.physics.add.sprite(tx, ty, visual.texture, visual.frame);
                    sprite.setDepth(6);
                    movingPlatformsGroup.add(sprite);

                    const body = sprite.body as Phaser.Physics.Arcade.Body;
                    body.setAllowGravity(false);
                    body.setImmovable(true);

                    tileSprites.push(sprite);
                    tileBodies.push(body);
                }

                // Determine triggerMode by scanning trigger entities
                let triggerMode: 'lever' | 'button' = 'lever';
                for (const otherEnt of levelData.entities) {
                    if (otherEnt.type === 'button') {
                        const oProps = otherEnt.properties || {};
                        if (String(oProps.channel || '1') === channel) {
                            triggerMode = 'button';
                            break;
                        }
                    } else if (otherEnt.type === 'lever') {
                        const oProps = otherEnt.properties || {};
                        if (String(oProps.channel || '1') === channel) {
                            triggerMode = 'lever';
                            break;
                        }
                    }
                }

                const entity = entityManager.createEntity();
                entity.addComponent({
                    type: 'Transform',
                    x: entX,
                    y: entY,
                    width: TILE_SIZE,
                    height: TILE_SIZE
                } as TransformComponent);

                entity.addComponent({
                    type: 'MovingPlatform',
                    channel,
                    startX: entX,
                    startY: entY,
                    endX: endX * TILE_SIZE + TILE_SIZE / 2,
                    endY: endY * TILE_SIZE + TILE_SIZE / 2,
                    velocity,
                    t: 0,
                    direction: 0,
                    channelState: false,
                    triggerMode,
                    tileSprites,
                    tileBodies,
                    tileOffsets,
                    glowColor,
                    prevX: entX,
                    prevY: entY,
                    requireAll: props.requireAll === true || props.requireAll === 'true'
                } as MovingPlatformComponent);
            }
        }

        // 7. Instantiate Players
        const player1Entity = createPlayerEntity(
            scene,
            humanSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            humanSpawn.y * TILE_SIZE,
            'human', 0,
            entityManager,
        );

        const player2Entity = createPlayerEntity(
            scene,
            dogSpawn.x * TILE_SIZE + TILE_SIZE / 2,
            dogSpawn.y * TILE_SIZE,
            'dog', 1,
            entityManager,
        );

        const p1Render = player1Entity.getComponent<RenderComponent>('Render')!;
        const p2Render = player2Entity.getComponent<RenderComponent>('Render')!;

        // 8. Bind Physics Colliders
        const slopeProcessCallback = (obj: any, tile: any) => {
            const idx = tile.index;
            if (idx === 248 || idx === 202 || idx === 244 || idx === 251 || idx === 203 || idx === 247) {
                return false;
            }
            return true;
        };

        scene.physics.add.collider(p1Render.gameObject, terrainLayer, undefined, slopeProcessCallback);
        scene.physics.add.collider(p2Render.gameObject, terrainLayer, undefined, slopeProcessCallback);
        scene.physics.add.collider(cratesGroup, terrainLayer, undefined, slopeProcessCallback);
        scene.physics.add.collider(catsGroup, terrainLayer, undefined, slopeProcessCallback);
        scene.physics.add.collider(
            catsGroup,
            cratesGroup,
            undefined,
            (catObj: any, crateObj: any) => {
                const catComp = catObj.catComponent as CatComponent;
                if (catComp && catComp.state === 'running') {
                    const catBody = catObj.body as Phaser.Physics.Arcade.Body;
                    const crateBody = crateObj.body as Phaser.Physics.Arcade.Body;
                    
                    // Only stop if running towards the crate
                    const crateIsRight = crateBody.x > catBody.x;
                    const runningTowards = (catComp.direction === 1 && crateIsRight) || 
                                           (catComp.direction === -1 && !crateIsRight);
                                           
                    if (runningTowards) {
                        catComp.state = 'sleeping';
                        catBody.setVelocityX(0);
                        return false; // prevent separation so the cat doesn't push the crate
                    } else {
                        return false; // running away: ignore collision so it can move freely
                    }
                }
                return true; // allow normal separation when cat is sleeping/idle
            },
            scene
        );

        scene.physics.add.collider(
            p1Render.gameObject,
            cratesGroup,
            undefined,
            (playerObj: any, crateObj: any) => {
                const playerBody = playerObj.body as Phaser.Physics.Arcade.Body;
                const crateBody = crateObj.body as Phaser.Physics.Arcade.Body;

                // If player is standing on top of the crate (with 2px vertical threshold),
                // disable side collisions so they don't push it while walking near the edge.
                if (playerBody.bottom <= crateBody.y + 2) {
                    crateBody.checkCollision.left = false;
                    crateBody.checkCollision.right = false;
                } else {
                    crateBody.checkCollision.left = true;
                    crateBody.checkCollision.right = true;
                }
                return true;
            }
        );

        // Dog has less pushing force on crates — cap the velocity imparted to the crate
        scene.physics.add.collider(
            p2Render.gameObject,
            cratesGroup,
            undefined,
            (dogObj: any, crateObj: any) => {
                const dogBody = dogObj.body as Phaser.Physics.Arcade.Body;
                const crateBody = (crateObj as Phaser.GameObjects.GameObject & { body: Phaser.Physics.Arcade.Body }).body;
                
                // Prevent dog pushing crate while standing on top
                if (dogBody.bottom <= crateBody.y + 2) {
                    crateBody.checkCollision.left = false;
                    crateBody.checkCollision.right = false;
                } else {
                    crateBody.checkCollision.left = true;
                    crateBody.checkCollision.right = true;
                }

                // Limit max crate speed when pushed by dog to 35% of normal
                const DOG_PUSH_LIMIT = 40;
                crateBody.setMaxVelocityX(DOG_PUSH_LIMIT);
                // Reset after a short delay so human can still push full force
                scene.time.delayedCall(200, () => {
                    if (crateBody && crateBody.enable) {
                        crateBody.setMaxVelocityX(500);
                    }
                });
                return true; // allow the collision
            },
            scene
        );
        scene.physics.add.collider(cratesGroup, cratesGroup);

        scene.physics.add.collider(p1Render.gameObject, gatesGroup);
        scene.physics.add.collider(p2Render.gameObject, gatesGroup);
        scene.physics.add.collider(cratesGroup, gatesGroup);

        scene.physics.add.collider(p1Render.gameObject, launchersGroup);
        scene.physics.add.collider(p2Render.gameObject, launchersGroup);
        scene.physics.add.collider(cratesGroup, launchersGroup);

        scene.physics.add.collider(p1Render.gameObject, movingPlatformsGroup);
        scene.physics.add.collider(p2Render.gameObject, movingPlatformsGroup);
        scene.physics.add.collider(cratesGroup, movingPlatformsGroup);

        const checkPlayerKeyUnlock = (playerObj: any, lgObj: any) => {
            const playerType = playerObj === p1Render.gameObject ? 'human' : 'dog';
            const keyEnt = entityManager.query('Key').find(ent => {
                const kc = ent.getComponent<KeyComponent>('Key')!;
                return kc.isPickedUp && kc.carrier === playerType;
            });

            if (keyEnt) {
                const kc = keyEnt.getComponent<KeyComponent>('Key')!;
                const lgEnt = entityManager.query('Render').find(ent => {
                    const render = ent.getComponent<RenderComponent>('Render')!;
                    return render.gameObject === lgObj;
                });

                if (lgEnt) {
                    scene.sound.play('sfx_door_open', { volume: 0.4 });
                    
                    if (kc.mouthSprite) {
                        kc.mouthSprite.destroy();
                        kc.mouthSprite = undefined;
                    }

                    const keyRender = keyEnt.getComponent<RenderComponent>('Render')!;
                    if (keyRender.gameObject) {
                        keyRender.gameObject.destroy();
                    }
                    entityManager.destroyEntity(keyEnt.id);

                    lgObj.destroy();
                    entityManager.destroyEntity(lgEnt.id);
                }
            }
        };

        scene.physics.add.collider(p1Render.gameObject, lgGroup, checkPlayerKeyUnlock);
        scene.physics.add.collider(p2Render.gameObject, lgGroup, checkPlayerKeyUnlock);
        scene.physics.add.collider(cratesGroup, lgGroup);

        scene.physics.add.collider(keysGroup, terrainLayer, undefined, slopeProcessCallback);
        scene.physics.add.collider(keysGroup, gatesGroup);
        scene.physics.add.collider(keysGroup, launchersGroup);
        scene.physics.add.collider(keysGroup, movingPlatformsGroup);
        scene.physics.add.collider(keysGroup, cratesGroup);

        scene.physics.add.collider(keysGroup, lgGroup, (keyObj: any, lgObj: any) => {
            const keyEnt = entityManager.query('Key', 'Render').find(ent => {
                const render = ent.getComponent<RenderComponent>('Render')!;
                return render.gameObject === keyObj;
            });
            const lgEnt = entityManager.query('Render').find(ent => {
                const render = ent.getComponent<RenderComponent>('Render')!;
                return render.gameObject === lgObj;
            });
            if (lgEnt && keyEnt) {
                scene.sound.play('sfx_door_open', { volume: 0.4 });
                
                lgObj.destroy();
                entityManager.destroyEntity(lgEnt.id);
                
                keyObj.destroy();
                entityManager.destroyEntity(keyEnt.id);
            }
        });

        // Link carried entities to moving platforms (extraEntities property or auto-link)
        const platforms = entityManager.query('MovingPlatform');
        const allEntitiesWithTransform = entityManager.query('Transform');
        
        for (const entData of levelData.entities) {
            if (entData.type === 'movingPlatform') {
                const props = entData.properties || {};
                const carryEntities = props.carryEntities !== 'false';
                const extraEntitiesStr = props.extraEntities !== undefined ? String(props.extraEntities) : '';
                
                const platX = entData.x * TILE_SIZE + TILE_SIZE / 2;
                const platY = entData.y * TILE_SIZE + TILE_SIZE / 2;
                
                const platEntity = platforms.find(p => {
                    const tc = p.getComponent<TransformComponent>('Transform');
                    return tc && Math.abs(tc.x - platX) < 1 && Math.abs(tc.y - platY) < 1;
                });
                
                if (platEntity) {
                    const mpComp = platEntity.getComponent<MovingPlatformComponent>('MovingPlatform');
                    if (mpComp) {
                        mpComp.carriedEntities = [];
                        
                        // 1. Manually specified extra entities via extraEntities string
                        if (extraEntitiesStr.trim()) {
                            const pairs = extraEntitiesStr.trim().split(/\s+/);
                            for (const pair of pairs) {
                                const [dxStr, dyStr] = pair.split(',');
                                if (dxStr !== undefined && dyStr !== undefined) {
                                    const dx = parseInt(dxStr) || 0;
                                    const dy = parseInt(dyStr) || 0;
                                    
                                    const targetGridX = entData.x + dx;
                                    const targetGridY = entData.y + dy;
                                    
                                    const targetWorldX = targetGridX * TILE_SIZE + TILE_SIZE / 2;
                                    const targetWorldY = targetGridY * TILE_SIZE + TILE_SIZE / 2;
                                    
                                    const carried = allEntitiesWithTransform.find(e => {
                                        if (e === platEntity) return false;
                                        const tc = e.getComponent<TransformComponent>('Transform');
                                        return tc && Math.abs(tc.x - targetWorldX) < 1 && Math.abs(tc.y - targetWorldY) < 1;
                                    });
                                    
                                    if (carried) {
                                        mpComp.carriedEntities.push(carried);
                                    }
                                }
                            }
                        }
                        
                        // 2. Auto-link static entities on top of platform tiles if carryEntities is enabled
                        if (carryEntities) {
                            const platformTiles = new Set<string>();
                            platformTiles.add(`${entData.x},${entData.y}`);
                            const extraTilesStr = props.extraTiles !== undefined ? String(props.extraTiles) : '';
                            if (extraTilesStr.trim()) {
                                const pairs = extraTilesStr.trim().split(/\s+/);
                                for (const pair of pairs) {
                                    const [dxStr, dyStr] = pair.split(',');
                                    if (dxStr !== undefined && dyStr !== undefined) {
                                        const dx = parseInt(dxStr) || 0;
                                        const dy = parseInt(dyStr) || 0;
                                        platformTiles.add(`${entData.x + dx},${entData.y + dy}`);
                                    }
                                }
                            }
                            
                            // Auto-link static entities whose grid coordinates are directly on top (y - 1) of any platform tile
                            for (const otherEnt of levelData.entities) {
                                if (otherEnt === entData) continue;
                                
                                const staticTypes = ['button', 'lever', 'launcher', 'sign', 'spikes', 'exitDoor', 'checkpoint', 'levelDoor'];
                                if (staticTypes.includes(otherEnt.type)) {
                                    const expectedTileBelow = `${otherEnt.x},${otherEnt.y + 1}`;
                                    if (platformTiles.has(expectedTileBelow)) {
                                        const targetWorldX = otherEnt.x * TILE_SIZE + TILE_SIZE / 2;
                                        const targetWorldY = otherEnt.y * TILE_SIZE + TILE_SIZE / 2;
                                        
                                        const carried = allEntitiesWithTransform.find(e => {
                                            const tc = e.getComponent<TransformComponent>('Transform');
                                            return tc && Math.abs(tc.x - targetWorldX) < 1 && Math.abs(tc.y - targetWorldY) < 1;
                                        });
                                        
                                        if (carried && !mpComp.carriedEntities.includes(carried)) {
                                            mpComp.carriedEntities.push(carried);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        return {
            levelWidthPx,
            levelHeightPx,
            terrainLayer,
            player1Entity,
            player2Entity,
            backgroundSprites
        };
    }

    public static createParallaxBackground(
        scene: Phaser.Scene,
        preset: string,
        levelWidthPx: number,
        levelHeightPx: number,
        group?: Phaser.GameObjects.Group,
        uiCamera?: Phaser.Cameras.Scene2D.Camera
    ): Phaser.GameObjects.TileSprite[] {
        const sprites: Phaser.GameObjects.TileSprite[] = [];
        if (preset === 'grassyMountain') {
            scene.cameras.main.setBackgroundColor('#c9d7e7');
            const layers = [
                { key: 'grassyMountain_4', scrollFactorX: 0.05, scrollFactorY: 0.02 },
                { key: 'grassyMountain_3', scrollFactorX: 0.2, scrollFactorY: 0.05 },
                { key: 'grassyMountain_2', scrollFactorX: 0.5, scrollFactorY: 0.07 },
                { key: 'grassyMountain_1', scrollFactorX: 0.8, scrollFactorY: 0.1 }
            ];

            const extraWidth = 2000; // Buffer to prevent seeing background edges
            const vh = 279; // standard viewport height at 2.0X zoom

            layers.forEach((layer, index) => {
                // Ensure texture uses NEAREST filtering for pixel-perfect sharpness
                const tex = scene.textures.get(layer.key);
                if (tex) {
                    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
                }

                const baseScale = 1;
                const renderedHeight = 324 * baseScale;
                const bgHeight = 512;
                // Calculate y coordinate to ensure background covers viewport at all camera positions
                const maxScrollY = Math.max(0, levelHeightPx - vh);
                const bgY = vh - renderedHeight / 2 + maxScrollY * layer.scrollFactorY;

                const tileSprite = scene.add.tileSprite(
                    levelWidthPx / 2,
                    bgY,
                    levelWidthPx + extraWidth,
                    bgHeight,
                    layer.key
                );

                tileSprite.tileScaleX = baseScale * (576 / 1024);
                tileSprite.tileScaleY = baseScale * (324 / 512);
                tileSprite.setScrollFactor(0, 0);
                tileSprite.setDepth(-10 + index); // behind map layers (-10 to -7)

                if (group) {
                    group.add(tileSprite);
                }
                if (uiCamera) {
                    uiCamera.ignore(tileSprite);
                }
                sprites.push(tileSprite);
            });
        } else if (preset === 'snowyMountain') {
            scene.cameras.main.setBackgroundColor('#e9f1f6');
            const layers = [
                { key: 'snowyMountain_5', scrollFactorX: 0.02, scrollFactorY: 0.01 },
                { key: 'snowyMountain_4', scrollFactorX: 0.1,  scrollFactorY: 0.03 },
                { key: 'snowyMountain_3', scrollFactorX: 0.3,  scrollFactorY: 0.05 },
                { key: 'snowyMountain_2', scrollFactorX: 0.6,  scrollFactorY: 0.07 },
                { key: 'snowyMountain_1', scrollFactorX: 0.8,  scrollFactorY: 0.1 }
            ];

            const extraWidth = 2000; // Buffer to prevent seeing background edges
            const vh = 279; // standard viewport height at 2.0X zoom

            layers.forEach((layer, index) => {
                // Ensure texture uses NEAREST filtering for pixel-perfect sharpness
                const tex = scene.textures.get(layer.key);
                if (tex) {
                    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
                }

                const baseScale = 1;
                const renderedHeight = 324 * baseScale;
                const bgHeight = 512;
                // Calculate y coordinate to ensure background covers viewport at all camera positions
                const maxScrollY = Math.max(0, levelHeightPx - vh);
                const bgY = vh - renderedHeight / 2 + maxScrollY * layer.scrollFactorY;

                const tileSprite = scene.add.tileSprite(
                    levelWidthPx / 2,
                    bgY,
                    levelWidthPx + extraWidth,
                    bgHeight,
                    layer.key
                );

                tileSprite.tileScaleX = baseScale * (576 / 1024);
                tileSprite.tileScaleY = baseScale * (324 / 512);
                tileSprite.setScrollFactor(0, 0);
                tileSprite.setDepth(-10 + index); // behind map layers (-10 to -6)

                if (group) {
                    group.add(tileSprite);
                }
                if (uiCamera) {
                    uiCamera.ignore(tileSprite);
                }
                sprites.push(tileSprite);
            });
        } else if (preset === 'fallTrees') {
            scene.cameras.main.setBackgroundColor('#a8d8da');
            const layers = [
                { key: 'fallTrees_6', scrollFactorX: 0.01, scrollFactorY: 0.005 },
                { key: 'fallTrees_5', scrollFactorX: 0.05, scrollFactorY: 0.01 },
                { key: 'fallTrees_4', scrollFactorX: 0.15, scrollFactorY: 0.03 },
                { key: 'fallTrees_3', scrollFactorX: 0.35, scrollFactorY: 0.05 },
                { key: 'fallTrees_2', scrollFactorX: 0.55, scrollFactorY: 0.07 },
                { key: 'fallTrees_1', scrollFactorX: 0.8,  scrollFactorY: 0.1 }
            ];

            const extraWidth = 2000; // Buffer to prevent seeing background edges
            const vh = 279; // standard viewport height at 2.0X zoom

            layers.forEach((layer, index) => {
                // Ensure texture uses NEAREST filtering for pixel-perfect sharpness
                const tex = scene.textures.get(layer.key);
                if (tex) {
                    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
                }

                const baseScale = 1;
                const renderedHeight = 324 * baseScale;
                let bgHeight = 512;
                let scaleY = baseScale * (324 / 512);
                // Calculate y coordinate to ensure background covers viewport at all camera positions
                const maxScrollY = Math.max(0, levelHeightPx - vh);
                let bgY = vh - renderedHeight / 2 + maxScrollY * layer.scrollFactorY;
                if (layer.key === 'fallTrees_5') {
                    bgY -= 64;
                }

                let spriteY = bgY;
                if (layer.key === 'fallTrees_1') {
                    bgHeight = 1024;
                    // Align the top of the fallTrees_1 layer with the top of other layers (centered at bgY with 512 height)
                    spriteY = bgY + 256 * scaleY;
                }

                const tileSprite = scene.add.tileSprite(
                    levelWidthPx / 2,
                    spriteY,
                    levelWidthPx + extraWidth,
                    bgHeight,
                    layer.key
                );

                (tileSprite as any).bgKey = layer.key;

                tileSprite.tileScaleX = baseScale * (576 / 1024);
                tileSprite.tileScaleY = scaleY;
                tileSprite.setScrollFactor(0, 0);
                tileSprite.setDepth(-10 + index); // behind map layers (-10 to -5)

                if (group) {
                    group.add(tileSprite);
                }
                if (uiCamera) {
                    uiCamera.ignore(tileSprite);
                }
                sprites.push(tileSprite);
            });
        }
        return sprites;
    }



    private static fillLayer(
        layer: Phaser.Tilemaps.TilemapLayer,
        data: number[],
        width: number,
    ): void {
        for (let i = 0; i < data.length; i++) {
            const tileIndex = data[i];
            if (tileIndex >= 0) {
                const x = i % width;
                const y = Math.floor(i / width);
                layer.putTileAt(tileIndex, x, y);
            }
        }
    }
}
