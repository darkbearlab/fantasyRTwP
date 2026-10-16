/**
 * 文字事件（SPEC_SLICE2 §6）。結構化描述，邏輯在 run/events.ts 統一解析，不寫成程式碼分支。
 */
export type HeroTarget = 'all' | 'random' | 'lowest';

export type EventEffect =
  | { kind: 'gold'; amount: number }
  | { kind: 'heal'; target: HeroTarget; pct: number }
  /** 扣血：事件不會讓英雄死亡，最少剩 1 */
  | { kind: 'damage'; target: HeroTarget; pct: number }
  | { kind: 'upgrade'; target: 'random'; rare?: boolean }
  /** 免費招募；classId 省略時隨機 */
  | { kind: 'recruit'; classId?: string }
  | { kind: 'battle'; encounter: string }
  /** 下一場戰鬥全隊加成 */
  | { kind: 'nextBattleBuff'; accuracy?: number; defense?: number };

export interface EventCondition {
  minGold?: number;
  hasClass?: string;
  hasEmptySlot?: boolean;
}

export interface EventOutcome {
  /** 機率（同一選項的所有結果加總為 1） */
  chance: number;
  text: string;
  effects: EventEffect[];
}

export interface EventOption {
  label: string;
  condition?: EventCondition;
  outcomes: EventOutcome[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  options: EventOption[];
}

export const EVENTS: Record<string, EventDef> = {
  woundedSoldier: {
    id: 'woundedSoldier',
    title: '路旁的傷兵',
    text: '泥濘的溝渠裡躺著一名穿著殘破鎖甲的士兵，腹部的傷口已經發黑。他抓住你的靴子，用幾乎聽不見的聲音求你帶他走。',
    options: [
      {
        label: '停下來替他包紮',
        condition: { hasEmptySlot: true },
        outcomes: [
          { chance: 0.6, text: '傷口比看起來淺。他撐著劍站起來，說他的部隊早就死光了——從今天起，他跟著你。', effects: [{ kind: 'recruit' }] },
          { chance: 0.4, text: '他突然吹響一聲口哨。樹林裡的人影圍了上來——這是個誘餌。', effects: [{ kind: 'battle', encounter: 'ambush' }] },
        ],
      },
      {
        label: '翻他的行囊',
        outcomes: [{ chance: 1, text: '他已經沒有力氣阻止你。錢袋裡有幾枚沾血的硬幣。', effects: [{ kind: 'gold', amount: 25 }] }],
      },
      { label: '繼續趕路', outcomes: [{ chance: 1, text: '你沒有回頭。他的聲音很快就被風吞沒了。', effects: [] }] },
    ],
  },
  abandonedAltar: {
    id: 'abandonedAltar',
    title: '廢棄的祭壇',
    text: '黑石祭壇上的血槽早已乾涸，但當你靠近時，石縫裡傳來低語，承諾以血換取力量。',
    options: [
      {
        label: '讓一名同伴獻上鮮血',
        outcomes: [{ chance: 1, text: '血滲入石頭，低語變成笑聲。獻血者感到某種東西在體內甦醒。', effects: [{ kind: 'damage', target: 'random', pct: 0.25 }, { kind: 'upgrade', target: 'random' }] }],
      },
      {
        label: '擺上 40 金幣作為供品',
        condition: { minGold: 40 },
        outcomes: [{ chance: 1, text: '金幣沉入石中。一股溫暖流過眾人的傷口。', effects: [{ kind: 'gold', amount: -40 }, { kind: 'heal', target: 'all', pct: 0.25 }] }],
      },
      { label: '離開這裡', outcomes: [{ chance: 1, text: '你們沒有回應那聲音。它在你們身後低聲咒罵。', effects: [] }] },
    ],
  },
  caravan: {
    id: 'caravan',
    title: '逃難的商隊',
    text: '一支被燒掉一半的商隊停在路邊。商人的眼神閃爍，但貨車上的藥水和磨刀石看起來是真貨。',
    options: [
      {
        label: '買藥水（40 金幣）',
        condition: { minGold: 40 },
        outcomes: [{ chance: 1, text: '藥水苦得像膽汁，但很有效。', effects: [{ kind: 'gold', amount: -40 }, { kind: 'heal', target: 'all', pct: 0.3 }] }],
      },
      {
        label: '買一塊符文磨刀石（60 金幣）',
        condition: { minGold: 60 },
        outcomes: [{ chance: 1, text: '刀刃上的符文在黑暗中微微發光。', effects: [{ kind: 'gold', amount: -60 }, { kind: 'upgrade', target: 'random' }] }],
      },
      { label: '揮手離開', outcomes: [{ chance: 1, text: '商人聳聳肩，繼續修他的車輪。', effects: [] }] },
    ],
  },
  skullPile: {
    id: 'skullPile',
    title: '岔路的骷髏堆',
    text: '岔路口堆著上百顆頭骨，排列得整整齊齊。最上面那顆的眼窩裡塞著一枚金幣。',
    options: [
      {
        label: '搜刮骷髏堆',
        outcomes: [
          { chance: 0.6, text: '頭骨下面藏著前人留下的財物。', effects: [{ kind: 'gold', amount: 45 }] },
          { chance: 0.4, text: '指尖碰到頭骨的瞬間，一股寒意竄上手臂。詛咒。', effects: [{ kind: 'damage', target: 'random', pct: 0.3 }] },
        ],
      },
      {
        label: '讓牧師為亡者祈禱',
        condition: { hasClass: 'cleric' },
        outcomes: [{ chance: 1, text: '禱詞結束，頭骨堆塌了下來，露出亡者留給有禮之人的謝禮。', effects: [{ kind: 'gold', amount: 25 }, { kind: 'heal', target: 'lowest', pct: 0.2 }] }],
      },
      { label: '繞路走', outcomes: [{ chance: 1, text: '有些東西還是別碰比較好。', effects: [] }] },
    ],
  },
  lostPilgrim: {
    id: 'lostPilgrim',
    title: '迷路的巡禮者',
    text: '一名瞎了一隻眼的巡禮者攔住你們，說他能看見你們接下來要面對的敵人——只要一點點施捨。',
    options: [
      {
        label: '給他 30 金幣',
        condition: { minGold: 30 },
        outcomes: [{ chance: 1, text: '他在每個人的額頭上畫了一道灰。「下一場戰鬥，你們會看得很清楚。」', effects: [{ kind: 'gold', amount: -30 }, { kind: 'nextBattleBuff', accuracy: 12 }] }],
      },
      {
        label: '搶走他的錢',
        outcomes: [{ chance: 1, text: '他沒有反抗，只是笑著詛咒你們的下一場戰鬥。', effects: [{ kind: 'gold', amount: 30 }, { kind: 'nextBattleBuff', defense: -8 }] }],
      },
      { label: '不理他', outcomes: [{ chance: 1, text: '他在你們身後喃喃自語，直到聲音消失。', effects: [] }] },
    ],
  },
  nightRaid: {
    id: 'nightRaid',
    title: '夜襲',
    text: '營火熄滅的瞬間，黑暗中響起了弓弦聲。',
    options: [
      { label: '拔劍迎戰', outcomes: [{ chance: 1, text: '敵人從四面八方湧來！', effects: [{ kind: 'battle', encounter: 'nightRaid' }] }] },
      {
        label: '丟下營地撤退',
        outcomes: [{ chance: 1, text: '你們在箭雨中狼狽逃竄，身上多了幾道傷口，也丟了一些盤纏。', effects: [{ kind: 'damage', target: 'all', pct: 0.15 }, { kind: 'gold', amount: -20 }] }],
      },
    ],
  },
};
