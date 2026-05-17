export class SwitchRegistry {
  #blocks = new Map();

  register(block) {
    if (!block?.id || typeof block.getOptions !== "function" || typeof block.apply !== "function") {
      throw new Error("Switch block must define id, getOptions(), and apply()");
    }
    if (this.#blocks.has(block.id)) {
      throw new Error(`Duplicate switch block: ${block.id}`);
    }
    this.#blocks.set(block.id, block);
    return this;
  }

  get(id) {
    return this.#blocks.get(id);
  }

  list() {
    return [...this.#blocks.values()];
  }
}

export function buildSwitchSuggestions(registry, context, config) {
  const i18n = context.i18n;
  return registry.list().map((block) => {
    const currentValue = block.getCurrentValueLabel?.(context, config) ?? "";
    const currentSuffix = currentValue
      ? ` · ${i18n.t("switch.currentValue", { value: currentValue })}`
      : "";

    return {
      value: block.id,
      label: block.label,
      description: `${block.description}${currentSuffix}`,
    };
  });
}
