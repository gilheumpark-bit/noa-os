/**
 * Accessory 시스템 — MCP / 스킬 마운트.
 * .noa의 accessories.suggested에 따라 외부 도구를 연결.
 */

export interface Accessory {
  id: string;
  name: string;
  type: "mcp" | "skill" | "api";
  description: string;
  mounted: boolean;
}

export class AccessoryManager {
  private accessories = new Map<string, Accessory>();

  /**
   * 사용 가능한 액세서리 등록.
   */
  registerAvailable(accessory: Accessory): void {
    this.accessories.set(accessory.id, { ...accessory, mounted: false });
  }

  /**
   * suggested 목록에 따라 마운트.
   */
  mountSuggested(suggested: string[]): Accessory[] {
    const mounted: Accessory[] = [];
    for (const id of suggested) {
      const acc = this.accessories.get(id);
      if (acc) {
        acc.mounted = true;
        mounted.push(acc);
      }
    }
    return mounted;
  }

  /**
   * 전부 언마운트.
   */
  unmountAll(): void {
    for (const acc of this.accessories.values()) {
      acc.mounted = false;
    }
  }

  /**
   * 마운트된 액세서리 목록.
   */
  getMounted(): Accessory[] {
    return [...this.accessories.values()].filter((a) => a.mounted);
  }

  /**
   * 전체 목록.
   */
  listAll(): Accessory[] {
    return [...this.accessories.values()];
  }
}
