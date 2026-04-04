// ============================================================
// Switch-Light Recipe — external package
// ============================================================

// Minimal types for RecipeContext (injected at runtime by Sowel core)
interface RecipeContext {
  eventBus: {
    onType(type: string, handler: (event: Record<string, unknown>) => void): () => void;
  };
  equipmentManager: {
    getByIdWithDetails(id: string): {
      name: string;
      zoneId?: string;
      dataBindings: Array<{ alias: string }>;
      orderBindings: Array<{ alias: string; enumValues?: string[] }>;
    } | null;
    getDataBindingsWithValues(id: string): Array<{ alias: string; category?: string; value: unknown }>;
    executeOrder(equipmentId: string, alias: string, value: unknown): Promise<void>;
  };
  zoneManager: {
    getById(id: string): { id: string; name: string } | null;
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
  slots?: Record<string, { name: string; description: string }>;
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
  createInstance(
    params: Record<string, unknown>,
    ctx: RecipeContext,
  ): { stop(): void; onAction?(action: string, payload?: Record<string, unknown>): void };
}

// ============================================================
// Helpers
// ============================================================

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string");
  }
  if (typeof value === "string" && value.length > 0) {
    return value.split(",").filter(Boolean);
  }
  return [];
}

// ============================================================
// Recipe Definition
// ============================================================

export function createRecipe(): RecipeDefinition {
  return {
    id: "switch-light",
    name: "Switch Light",
    description:
      "Lights follow manual commands — any button press toggles lights on/off. For rooms without motion sensors, controlled via wall switches, remotes, or smart buttons.",

    slots: [
      {
        id: "zone",
        name: "Zone",
        description: "Zone containing the lights",
        type: "zone",
        required: true,
      },
      {
        id: "lights",
        name: "Lights",
        description: "Lights to control (must belong to the selected zone)",
        type: "equipment",
        required: true,
        list: true,
        constraints: { equipmentType: ["light_onoff", "light_dimmable", "light_color"] },
      },
      {
        id: "buttons",
        name: "Buttons",
        description: "Button/switch equipments that trigger toggle",
        type: "equipment",
        required: true,
        list: true,
        constraints: { equipmentType: "button" },
      },
      {
        id: "maxOnDuration",
        name: "Max On Duration",
        description: "Force lights off after this duration (optional failsafe)",
        type: "duration",
        required: false,
      },
    ],

    i18n: {
      fr: {
        name: "Lumiere sur interrupteur",
        description:
          "Les lumieres suivent les commandes manuelles — un appui sur un bouton bascule les lumieres on/off. Pour les pieces sans capteur de mouvement, controlees par interrupteurs ou telecommandes.",
        slots: {
          zone: { name: "Zone", description: "Zone contenant les lumieres" },
          lights: {
            name: "Lumieres",
            description: "Lumieres a controler (doivent appartenir a la zone)",
          },
          buttons: {
            name: "Interrupteurs",
            description: "Interrupteurs physiques pour allumer/eteindre",
          },
          maxOnDuration: {
            name: "Extinction auto (securite)",
            description: "Coupe les lumieres apres cette duree — anti-oubli",
          },
        },
      },
    },

    validate(params: Record<string, unknown>, ctx: RecipeContext): void {
      const { zone, lights, buttons, maxOnDuration } = params;

      if (!zone || typeof zone !== "string") {
        throw new Error("Zone parameter is required");
      }
      const zoneObj = ctx.zoneManager.getById(zone);
      if (!zoneObj) {
        throw new Error(`Zone not found: ${zone}`);
      }

      const lightIds = normalizeStringArray(lights);
      if (lightIds.length === 0) {
        throw new Error("At least one light is required");
      }
      for (const lightId of lightIds) {
        const equipment = ctx.equipmentManager.getByIdWithDetails(lightId);
        if (!equipment) {
          throw new Error(`Light equipment not found: ${lightId}`);
        }
        if (equipment.zoneId !== zone) {
          throw new Error(`Light "${equipment.name}" does not belong to the selected zone`);
        }
        const hasStateOrder = equipment.orderBindings.some((ob) => ob.alias === "state");
        if (!hasStateOrder) {
          throw new Error(`Light "${equipment.name}" has no "state" order binding`);
        }
      }

      const buttonIds = normalizeStringArray(buttons);
      if (buttonIds.length === 0) {
        throw new Error("At least one button is required");
      }
      for (const buttonId of buttonIds) {
        const equipment = ctx.equipmentManager.getByIdWithDetails(buttonId);
        if (!equipment) {
          throw new Error(`Button equipment not found: ${buttonId}`);
        }
        const hasActionData = equipment.dataBindings.some((db) => db.alias === "action");
        if (!hasActionData) {
          throw new Error(`Button "${equipment.name}" has no "action" data binding`);
        }
      }

      if (maxOnDuration !== undefined && maxOnDuration !== null && maxOnDuration !== "") {
        ctx.helpers.parseDuration(maxOnDuration);
      }
    },

    createInstance(params: Record<string, unknown>, ctx: RecipeContext) {
      const lightIds = normalizeStringArray(params.lights);
      const buttonIds = normalizeStringArray(params.buttons);
      const maxOnDurationMs =
        params.maxOnDuration !== undefined &&
        params.maxOnDuration !== null &&
        params.maxOnDuration !== ""
          ? ctx.helpers.parseDuration(params.maxOnDuration)
          : null;

      const unsubs: (() => void)[] = [];
      let failsafeTimer: ReturnType<typeof setTimeout> | null = null;

      // -- Failsafe timer --
      function startFailsafeTimer(): void {
        if (maxOnDurationMs === null || failsafeTimer) return;
        failsafeTimer = setTimeout(() => {
          failsafeTimer = null;
          ctx.state.delete("failsafeExpiresAt");
          const errors = ctx.helpers.turnOffLights(lightIds, ctx);
          if (errors.length > 0) {
            ctx.log(`Error turning off some lights: ${errors.join("; ")}`, "error");
          }
          ctx.log(
            `Failsafe: lights forced off after ${ctx.helpers.formatDuration(maxOnDurationMs)} max on duration`,
            "warn",
          );
        }, maxOnDurationMs);
        ctx.state.set("failsafeExpiresAt", new Date(Date.now() + maxOnDurationMs).toISOString());
      }

      function cancelFailsafeTimer(): void {
        if (failsafeTimer) {
          clearTimeout(failsafeTimer);
          failsafeTimer = null;
        }
      }

      function clearFailsafeTimerState(): void {
        ctx.state.delete("failsafeExpiresAt");
      }

      // -- Event handlers --
      function onButtonAction(): void {
        if (ctx.helpers.isAnyLightOn(lightIds, ctx)) {
          const errors = ctx.helpers.turnOffLights(lightIds, ctx);
          if (errors.length > 0) {
            ctx.log(`Error turning off some lights: ${errors.join("; ")}`, "error");
          }
          ctx.log("Button pressed — lights toggled off");
          cancelFailsafeTimer();
          clearFailsafeTimerState();
        } else {
          const errors = ctx.helpers.turnOnLights(lightIds, ctx);
          if (errors.length > 0) {
            ctx.log(`Error turning on some lights: ${errors.join("; ")}`, "error");
          }
          ctx.log("Button pressed — lights toggled on");
          startFailsafeTimer();
        }
      }

      function onLightChanged(value: unknown): void {
        const lightOn = value === true || value === "ON";
        if (!lightOn) {
          if (!ctx.helpers.isAnyLightOn(lightIds, ctx)) {
            cancelFailsafeTimer();
            clearFailsafeTimerState();
          }
        } else if (lightOn && maxOnDurationMs !== null) {
          startFailsafeTimer();
        }
      }

      // -- Subscribe --
      const unsubButton = ctx.eventBus.onType("equipment.data.changed", (event) => {
        if (!buttonIds.includes(event.equipmentId as string)) return;
        if (event.alias !== "action") return;
        onButtonAction();
      });
      unsubs.push(unsubButton);

      const unsubLight = ctx.eventBus.onType("equipment.data.changed", (event) => {
        if (!lightIds.includes(event.equipmentId as string)) return;
        if (event.alias !== "state") return;
        onLightChanged(event.value);
      });
      unsubs.push(unsubLight);

      return {
        stop() {
          cancelFailsafeTimer();
          for (const unsub of unsubs) {
            unsub();
          }
          ctx.state.delete("failsafeExpiresAt");
        },
      };
    },
  };
}
