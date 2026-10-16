/**
 * 職業體系（SPEC_SLICE3 §1）：四條職業系，各有 Archetype 與變體（平行關係、不能轉職）。
 * 每名英雄 3 個技能欄：第 1 欄是專用技能（固定），第 2、3 欄從該系的共用池裝備。
 */
export type ClassLine = 'warrior' | 'ranger' | 'mage' | 'cleric';

export interface LineDef {
  id: ClassLine;
  name: string;
  /** 共用技能池（Archetype 的專用技能也在池中） */
  pool: string[];
}

export interface ClassDef {
  /** 與 HEROES 的 id 相同 */
  id: string;
  line: ClassLine;
  /** 定位（組隊畫面顯示） */
  role: string;
  /** 專用技能（第 1 欄） */
  signature: string;
  /** 預設裝備的第 2、3 欄 */
  defaultPool: [string, string];
  variant?: boolean;
}

export const LINES: Record<ClassLine, LineDef> = {
  warrior: { id: 'warrior', name: '戰士系', pool: ['shieldBash', 'charge', 'guard'] },
  ranger: { id: 'ranger', name: '遊俠系', pool: ['aimedShot', 'stunArrow', 'tumble'] },
  mage: { id: 'mage', name: '法師系', pool: ['fireball', 'iceBind', 'arcaneMissile'] },
  cleric: { id: 'cleric', name: '牧師系', pool: ['heal', 'bless', 'holySmite'] },
};

export const CLASSES: Record<string, ClassDef> = {
  warrior: { id: 'warrior', line: 'warrior', role: '卡位前排', signature: 'guard', defaultPool: ['shieldBash', 'charge'] },
  ranger: { id: 'ranger', line: 'ranger', role: '機動遠程', signature: 'tumble', defaultPool: ['aimedShot', 'stunArrow'] },
  mage: { id: 'mage', line: 'mage', role: '範圍爆發', signature: 'fireball', defaultPool: ['iceBind', 'arcaneMissile'] },
  cleric: { id: 'cleric', line: 'cleric', role: '治療輔助', signature: 'heal', defaultPool: ['bless', 'holySmite'] },
};

/** 組隊與招募可選的職業（顯示順序） */
export const CLASS_ORDER = Object.keys(CLASSES);

/** 預設技能欄：[專用, 共用, 共用] */
export function defaultLoadout(classId: string): string[] {
  const c = CLASSES[classId];
  return [c.signature, ...c.defaultPool];
}
