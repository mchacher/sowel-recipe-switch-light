interface RecipeContext {
    eventBus: {
        onType(type: string, handler: (event: Record<string, unknown>) => void): () => void;
    };
    equipmentManager: {
        getByIdWithDetails(id: string): {
            name: string;
            zoneId?: string;
            dataBindings: Array<{
                alias: string;
            }>;
            orderBindings: Array<{
                alias: string;
                enumValues?: string[];
            }>;
        } | null;
        getDataBindingsWithValues(id: string): Array<{
            alias: string;
            category?: string;
            value: unknown;
        }>;
        executeOrder(equipmentId: string, alias: string, value: unknown): Promise<void>;
    };
    zoneManager: {
        getById(id: string): {
            id: string;
            name: string;
        } | null;
    };
    zoneAggregator: {
        getAggregatedData(zoneId: string): Record<string, unknown>;
    };
    logger: {
        info(obj: Record<string, unknown>, msg?: string): void;
        warn(obj: Record<string, unknown>, msg?: string): void;
        error(obj: Record<string, unknown>, msg?: string): void;
        debug(obj: Record<string, unknown>, msg?: string): void;
    };
    state: {
        get(key: string): unknown;
        set(key: string, value: unknown): void;
        delete(key: string): void;
        clear(): void;
    };
    log: (message: string, level?: "info" | "warn" | "error") => void;
    helpers: {
        isAnyLightOn(lightIds: string[], ctx: RecipeContext): boolean;
        turnOnLights(lightIds: string[], ctx: RecipeContext): string[];
        turnOffLights(lightIds: string[], ctx: RecipeContext): string[];
        parseDuration(value: unknown): number;
        formatDuration(ms: number): string;
    };
}
interface RecipeSlotDef {
    id: string;
    name: string;
    description: string;
    type: "zone" | "equipment" | "number" | "duration" | "time" | "boolean" | "text" | "data-key";
    required: boolean;
    list?: boolean;
    defaultValue?: unknown;
    constraints?: {
        equipmentType?: string | string[];
        min?: number;
        max?: number;
    };
    group?: string;
}
interface RecipeLangPack {
    name: string;
    description: string;
    slots?: Record<string, {
        name: string;
        description: string;
    }>;
    groups?: Record<string, string>;
}
interface RecipeDefinition {
    id: string;
    name: string;
    description: string;
    slots: RecipeSlotDef[];
    actions?: unknown[];
    i18n?: Record<string, RecipeLangPack>;
    validate(params: Record<string, unknown>, ctx: RecipeContext): void;
    createInstance(params: Record<string, unknown>, ctx: RecipeContext): {
        stop(): void;
        onAction?(action: string, payload?: Record<string, unknown>): void;
    };
}
export declare function createRecipe(): RecipeDefinition;
export {};
