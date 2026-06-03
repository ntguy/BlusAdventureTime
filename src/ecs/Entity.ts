export interface Component {
    readonly type: string;
}

export class Entity {
    public readonly id: string;
    private components: Map<string, Component> = new Map();

    constructor(id: string) {
        this.id = id;
    }

    addComponent(component: Component): void {
        this.components.set(component.type, component);
    }

    getComponent<T extends Component>(type: string): T | undefined {
        return this.components.get(type) as T;
    }

    hasComponent(type: string): boolean {
        return this.components.has(type);
    }

    removeComponent(type: string): void {
        this.components.delete(type);
    }
}

export class EntityManager {
    private entities: Map<string, Entity> = new Map();
    private nextId: number = 0;

    createEntity(): Entity {
        const id = `entity_${this.nextId++}`;
        const entity = new Entity(id);
        this.entities.set(id, entity);
        return entity;
    }

    destroyEntity(id: string): void {
        this.entities.delete(id);
    }

    getEntity(id: string): Entity | undefined {
        return this.entities.get(id);
    }

    getAllEntities(): Entity[] {
        return Array.from(this.entities.values());
    }

    /**
     * Query entities that possess all specified component types.
     */
    query(...componentTypes: string[]): Entity[] {
        return this.getAllEntities().filter(entity =>
            componentTypes.every(type => entity.hasComponent(type))
        );
    }
}
