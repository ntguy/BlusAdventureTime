import Phaser from 'phaser';
import { TILE_SIZE, BG_TILE_SIZE, VISUAL_FAMILIES } from '../constants';
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
    SpikesComponent,
    KeyComponent,
    MovingPlatformComponent
} from '../ecs/components';

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

        scene.cameras.main.setBackgroundColor('#1a1a2e');

        // 2. Create background
        this.createBackground(scene, levelData.meta.width, levelData.meta.height);

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

        const bgTileset = map.addTilesetImage(
            'bg_tilemap_packed',
            'bg_tilemap_packed',
            BG_TILE_SIZE, BG_TILE_SIZE,
            0, 0,
            180 // GID starts at 180
        );

        if (!tileset || !bgTileset) {
            throw new Error('Failed to create tileset');
        }

        // 4. Create layers and fill (bind both tilesets to background layer)
        const bgLayer = map.createBlankLayer('background', [tileset, bgTileset], 0, 0);
        const terrainLayer = map.createBlankLayer('terrain', tileset, 0, 0);
        const fgLayer = map.createBlankLayer('foreground', tileset, 0, 0);

        if (!bgLayer || !terrainLayer || !fgLayer) {
            throw new Error('Failed to create tilemap layers');
        }

        this.fillLayer(bgLayer, levelData.layers.background, levelData.meta.width);
        this.fillLayer(terrainLayer, levelData.layers.terrain, levelData.meta.width);
        this.fillLayer(fgLayer, levelData.layers.foreground, levelData.meta.width);

        bgLayer.setDepth(1);
        terrainLayer.setDepth(2);
        fgLayer.setDepth(20);

        // Enable Arcade physics collision on terrain layer tiles
        terrainLayer.setCollisionByExclusion([-1]);

        // 5. Create Physics Groups for clean collision handling
        const cratesGroup = scene.physics.add.group();
        const gatesGroup = scene.physics.add.group();
        const launchersGroup = scene.physics.add.group();
        const movingPlatformsGroup = scene.physics.add.group();

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
                return gid >= 180 ? gid - 180 : gid;
            };

            // Helper to get overridden texture/frame or default values
            const getVisual = (defaultFrame: number, defaultActiveFrame?: number) => {
                if (hasBGOverride) {
                    const localIdle = overrideIdleFrame !== undefined ? getFrame(overrideIdleFrame) : getFrame(tileIndex);
                    const localActive = overrideActiveFrame !== undefined ? getFrame(overrideActiveFrame) : localIdle;
                    return {
                        texture: tileIndex >= 180 ? 'bg_tilemap_packed' : 'tilemap_packed',
                        frame: localIdle,
                        activeFrame: localActive
                    };
                }
                return {
                    texture: 'tilemap_packed',
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

            } else if (entData.type === 'crate') {
                const visual = getVisual(26);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(8);
                cratesGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setSize(16, 16);
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
                
                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.checkCollision.none = true;

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
                const visual = getVisual(135);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(8);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setSize(18, 18);

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
                    depth: 8,
                    idleFrame: visual.frame,
                    activeFrame: visual.activeFrame
                } as RenderComponent);
                entity.addComponent({ type: 'PhysicsBody', body, isGrounded: false } as PhysicsBodyComponent);
                entity.addComponent({
                    type: 'Cat',
                    state: 'sleeping',
                    startX: sprite.x,
                    direction: 0,
                    runSpeed: 90,
                    targetDistance: 90,
                    startleTimer: 0
                } as CatComponent);

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
                const visual = getVisual(110);
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
                entity.addComponent({ type: 'ExitDoor', playersPresent: new Set() } as ExitDoorComponent);

            } else if (entData.type === 'ladder') {
                const visual = getVisual(71);
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
                const triggerType = (props.triggerType as 'interact' | 'pressure') || 'pressure';
                const visualType = (props.visualType as 'button' | 'lever') || 'button';

                // Look up glowColor: check if channel has a glow color in our pre-scanned map, or use entity property
                let glowColor: number | undefined;
                if (props.glowColor !== undefined) {
                    const colorStr = String(props.glowColor);
                    glowColor = parseInt(colorStr.replace('0x', ''), 16) || undefined;
                } else {
                    glowColor = channelGlowColors.get(channel);
                }

                const defaultFrame = visualType === 'lever' ? 64 : 148;
                const defaultActiveFrame = visualType === 'lever' ? 66 : 149;
                const visual = getVisual(defaultFrame, defaultActiveFrame);
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

                const visual = getVisual(150);
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
                    targetType: 'gate'
                } as TriggerableComponent);
            } else if (entData.type === 'launcher') {
                const visual = getVisual(107, 108);
                const sprite = scene.physics.add.sprite(entX, entY, visual.texture, visual.frame);
                sprite.setDepth(5);
                launchersGroup.add(sprite);

                const body = sprite.body as Phaser.Physics.Arcade.Body;
                body.setAllowGravity(false);
                body.setImmovable(true);

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
                const endX = props.endX !== undefined ? Number(props.endX) : entData.x;
                const endY = props.endY !== undefined ? Number(props.endY) : entData.y;
                const velocity = props.velocity !== undefined ? Number(props.velocity) : 60;
                const channel = String(props.channel || '1');
                const tileGid = props.tileGid !== undefined ? Number(props.tileGid) : 0;
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
                const visual = getVisual(tileGid || 26);

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
                            const vType = oProps.visualType || 'button';
                            triggerMode = vType === 'lever' ? 'lever' : 'button';
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
                    prevY: entY
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
        scene.physics.add.collider(p1Render.gameObject, terrainLayer);
        scene.physics.add.collider(p2Render.gameObject, terrainLayer);
        scene.physics.add.collider(cratesGroup, terrainLayer);

        scene.physics.add.collider(p1Render.gameObject, cratesGroup);

        // Dog has less pushing force on crates — cap the velocity imparted to the crate
        scene.physics.add.collider(
            p2Render.gameObject,
            cratesGroup,
            undefined,
            (_dogObj: any, crateObj: any) => {
                const crateBody = (crateObj as Phaser.GameObjects.GameObject & { body: Phaser.Physics.Arcade.Body }).body;
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

        return {
            levelWidthPx,
            levelHeightPx,
            terrainLayer,
            player1Entity,
            player2Entity,
        };
    }

    private static createBackground(scene: Phaser.Scene, levelWidthTiles: number, levelHeightTiles: number): void {
        const SKY_TILES = [0, 1];
        const MID_TILES = [8, 9];
        const GROUND_TILES = [16, 17];

        const bgWidthTiles = Math.ceil((levelWidthTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;
        const bgHeightTiles = Math.ceil((levelHeightTiles * TILE_SIZE) / BG_TILE_SIZE) + 1;

        const midRow = bgHeightTiles - 2;
        const groundRow = bgHeightTiles - 1;

        const getTile = (arr: number[], index: number) => arr[((index % arr.length) + arr.length) % arr.length];

        for (let y = -20; y < bgHeightTiles + 20; y++) {
            for (let x = -25; x < bgWidthTiles + 25; x++) {
                let tileIndex: number;
                if (y === midRow) {
                    tileIndex = getTile(MID_TILES, x);
                } else if (y >= groundRow) {
                    tileIndex = getTile(GROUND_TILES, x);
                } else {
                    tileIndex = getTile(SKY_TILES, x);
                }

                const sprite = scene.add.sprite(
                    x * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    y * BG_TILE_SIZE + BG_TILE_SIZE / 2,
                    'bg_tilemap_packed',
                    tileIndex,
                );
                sprite.setDepth(0);
            }
        }
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
