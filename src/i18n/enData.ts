/**
 * 英文版的資料名稱與說明（Alan 2026-10-22：介面＋遊戲內容翻成英文，故事文字維持中文）。
 * 以資料的 id 為鍵；沒列到的維持中文。applyDataLanguage（i18n/index.ts）在開機時套用。
 */
type NameDesc = Record<string, [string, string?]>;

export const EN_SKILLS: NameDesc = {
  shieldBash: ['Shield Bash', 'Melee: damage ×0.8, interrupts, stuns 1 s; shatters frozen targets'],
  guard: ['Guard', 'For 6 s, 50% of melee attacks on allies are redirected to the warrior'],
  charge: ['Charge', 'Dash to an enemy at triple speed (ignores zones of control) and strike on arrival'],
  aimedShot: ['Aimed Shot', 'Damage ×2.0, accuracy +30'],
  stunArrow: ['Stun Arrow', 'Damage ×0.5, interrupts'],
  tumble: ['Tumble', 'Dash to a point within 6 m (ignores zones of control)'],
  fireball: ['Fireball', 'Deals 18–26 in a 2.5 m radius; hurts allies too'],
  iceBind: ['Ice Bind', 'Roots for 4 s (cannot move, can still attack)'],
  arcaneMissile: ['Arcane Missile', 'Deals 8–12, interrupts'],
  focus: ['Focus', 'Enter focus: each second makes the next shot +25% stronger (up to 4 s); broken by moving or taking damage'],
  elementalEnchant: ['Elemental Enchant', 'Allies within 6 m (including self) deal +30% damage for 10 s, and their attacks gain fire and cold (best matchup applies)'],
  selfEnchant: ['Battle Enchant', 'Enchant only yourself: +60% damage for 10 s'],
  holyGround: ['Sanctuary: Judgment', 'A circle of holy light: for 5 s, allies inside take 30% less damage and enemies move 40% slower'],
  drainLife: ['Drain Life', 'Drain life from an enemy or ally to heal yourself; draining allies yields more, but never 1:1'],
  heal: ['Heal', 'Restores 35 HP'],
  bless: ['Bless', 'Allies within 6 m gain +15 accuracy and +10 defense for 10 s'],
  holySmite: ['Holy Smite', 'Melee: damage ×1.2, knocks back 2 m; stuns on wall impact, shatters frozen targets'],
  battleCry: ['Battle Cry', 'Allies within 6 m gain +15 accuracy for 8 s'],
  smokeBomb: ['Smoke Bomb', 'For 2.5 s, ignore zones of control and become unseen (except within 2 m; attacking reveals you)'],
  swamp: ['Swamp', 'A 2.5 m area slows enemies to ×0.5 movement for 8 s (not a root)'],
  sanctuary: ['Sanctuary', 'A circle of holy light: for 5 s, allies inside take 30% less damage'],
  healFlask: ['Healing Flask', 'Lobbed (no line of sight needed): heals allies within 2 m for 20 HP'],
  whirlwind: ['Whirlwind', 'Hits all enemies within 1.8 m for ×0.9 damage; shatters frozen targets'],
  backstab: ['Backstab', 'Melee: ×2.5 damage from behind (×1 from the front); stunned targets are always crit; shatters frozen targets'],
  curse: ['Curse of Weakness', 'For 8 s the target acts 40% slower and takes +15% damage'],
  firebomb: ['Firebomb', 'Lobbed (no line of sight needed): 10–14 damage in 2 m, ignites brush and sets enemies on fire'],
  fireFlask: ['Fire Flask', 'Thrown instantly (no line of sight needed): 10–14 damage in 2 m; the ground burns for 5 s and enemies standing in it keep burning'],
  flashFireball: ['Fireball', 'Hurls a fireball that explodes at the target: 18–26 damage in 2.5 m; hurts allies too'],
  sureShot: ['Aimed Shot', 'Damage ×2.0, accuracy +60 (almost never misses), interrupts the target'],
  enchant: ['Enchant', 'Allies within 6 m (including self) deal +30% damage for 10 s'],
  greatFireball: ['Great Fireball', '(After 5 charges) explodes as soon as it is ready: 30–40 damage in 3.5 m; hurts allies too'],
  curseBurst: ['Curse Burst', 'Detonates the curse on the target: 20–28 damage and removes the curse; only 6–9 if not cursed'],
  ram: ['Ram', 'Charge a hero (ignores zones of control), strike and knock back 2 m'],
  bomb: ['Bomb', 'Lobbed (no line of sight needed): 6–9 damage in 1.5 m'],
  sweep: ['Sweep', 'Frontal cone attack, 1.5 s wind-up, can be interrupted'],
  hurl: ['Hurl', 'Grabs a nearby hero and throws them at a distant hero; the landing spot is telegraphed, deals area damage on impact and stuns the thrown hero'],
  warcry: ['War Cry', 'Summons 3 reinforcements; all enemies deal +20% damage for 10 s; 2.0 s wind-up, lost if interrupted'],
  rush: ['Rush', 'After a ~1.5 s ground telegraph, charges 8 m in a line, damaging heroes in the way'],
  leap: ['Leap', 'After a ~0.8 s landing telegraph, leaps to the point and strikes around it'],
  hook: ['Hook', 'After a ~1 s telegraph line, pulls the target to itself (needs line of sight)'],
  sentinelSweep: ['Cleaving Swing', 'Frontal cone attack'],
  sentinelRush: ['Charge', 'Charges 9 m in a line, damaging heroes in the way; stunned if it hits a wall'],
  sentinelStomp: ['Hoof Stomp', 'Area attack around itself that knocks heroes back'],
  sentinelSweepRush: ['Sweeping Charge', 'Charges with its weapon held out to the right: hits both the charge path and a parallel strip; stunned if it hits a wall'],
  sentinelBreath: ['Breath', 'A long, narrow cone of fire and darkness (fire + dark)'],
  frenzy: ['Frenzy', 'Allies within 6 m deal +25% damage for 8 s; 1.2 s wind-up, can be interrupted'],
  clubSweep: ['Club Sweep', 'Frontal cone attack that knocks back; 1.2 s wind-up, can be interrupted'],
  orcWarcry: ['War Cry', 'Calls 4 goblins; all enemies deal +20% damage for 10 s; 2.0 s wind-up, lost if interrupted'],
  chiefLeap: ['Leaping Strike', 'Leaps onto the back line after a landing telegraph and strikes around it'],
  boulder: ['Boulder Toss', 'Lobbed (no line of sight needed): telegraphed landing, 14–20 damage in 2.2 m'],
  hatch: ['Hatch', 'Hatches 3 swarmlings'],
  mend: ['Mending Prayer', 'After ~2.5 s (can be interrupted), restores 30 HP to an ally'],
  summonThralls: ['Summon Thralls', 'After a ~1.5 s summoning circle, summons 3 thralls nearby; once every 15 s'],
  selfDestruct: ['Self-Destruct', 'Explodes after a ~2 s countdown (2.2 m radius), then dies'],
  hellfire: ['Hellfire', 'After 2.5 s, 12–18 damage in a 2.5 m radius'],
};

export const EN_HEROES: Record<string, string> = {
  warrior: 'Warrior', ranger: 'Ranger', mage: 'Mage', cleric: 'Cleric', berserker: 'Berserker', rogue: 'Rogue', hexer: 'Hexer', alchemist: 'Alchemist',
  guardian: 'Guardian', gladiator: 'Gladiator', cutthroat: 'Assassin', sniper: 'Sniper', arbalest: 'Arbalest', elementalist: 'Elementalist',
  deathMage: 'Death Mage', battlemage: 'Battlemage', paladin: 'Paladin', zealot: 'Zealot', heretic: 'Heretic',
};

export const EN_ENEMIES: Record<string, string> = {
  brute: 'Brute', skirmisher: 'Skirmisher', archer: 'Archer', caster: 'Caster', siege: 'Siege Brute', bomber: 'Bomber', lurker: 'Lurker',
  thrall: 'Thrall', skitter: 'Skitter', slinger: 'Slinger', nest: 'Nest', shieldbearer: 'Shieldbearer', charger: 'Charger', assassin: 'Assassin',
  hooker: 'Hooker', priest: 'Priest', summoner: 'Summoner', exploder: 'Exploder', raider: 'Swordsman', axeman: 'Axeman', minion: 'Thrall',
  goblin: 'Goblin', orcWarrior: 'Orc Warrior', orcShaman: 'Orc Shaman', goblinSlinger: 'Goblin Slinger', ogre: 'Ogre', warTotem: 'War Totem',
  orcChief: 'Orc Chieftain', champion: "Demon Lord's Champion", templeKnight: 'Temple Knight', hollowArmor: 'Hollow Armor', golem: 'Golem',
  crystalGuardian: 'Crystal Guardian', swarmling: 'Swarmling', bugNest: 'Hive', caveBeast: 'Cave Beast', demonElite: 'Demon Elite',
  demonGuard: "Demon Lord's Guard", warlord: 'Warlord',
};

export const EN_PASSIVES: NameDesc = {
  cleave: ['Cleave', 'Basic attacks hit every enemy in a frontal cone; every 3rd hit is heavy (×1.4 damage, knockback)'],
  tauntAura: ['Taunt Aura', 'Enemies within 5 m prefer to attack the warrior; defense +10'],
  eagleEye: ['Eagle Eye', 'Sees enemies hiding in brush within 10 m and shares them with the party'],
  blessAura: ['Blessing Aura', 'Allies within 5 m (including self) gain +10 accuracy and +5 defense'],
  fieldCare: ['Field Care', 'If the cleric survives a won battle, the party recovers half the HP lost in that battle'],
  emberBolt: ['Ember Bolt', 'Basic attacks are small fireballs that burst on impact (no friendly fire); slower attacks, harder hits'],
  chillAura: ['Chill', 'Enemies within 3 m move and act 25% slower'],
  bloodRage: ['Cleave: Blood Rage', 'Basic attacks hit a frontal cone; attacks faster at low HP (up to +50%)'],
  pierce: ['Piercing Arrow', 'Basic attacks pierce 2 enemies, ×0.7 damage per enemy pierced'],
  assassin: ['Assassinate', 'Basic attacks ×1.5 from behind; a kill readies the next attack instantly'],
  shock: ['Shock', 'Basic attacks splash a small area (no friendly fire)'],
  hexBolt: ['Hex Bolt', 'Basic attacks apply a minor curse (+10% damage taken, slower actions); spreads to a nearby enemy on death'],
  smite: ['Smite', 'Basic attacks interrupt and knock back, and heal the most injured nearby ally'],
  tauntWide: ['Provoke', 'Enemies within 7 m prefer to attack this hero'],
  guardAura: ['Iron Guard', 'Allies within 4 m gain +8 defense'],
  bloodthirst: ['Bloodthirst', '12% of damage dealt to enemies heals you'],
  chillWide: ['Frost Field', 'Enemies within 4.5 m move and act 25% slower'],
  chillDeep: ['Bitter Cold', 'Enemies within 3 m move and act 40% slower'],
  frailAura: ['Wither', 'Enemies within 3 m take +10% damage'],
  blessStrong: ['Fervor', 'Allies within 5 m gain +15 accuracy and +8 defense'],
  blessWide: ['Sermon', 'Allies within 7 m gain +10 accuracy and +5 defense'],
  darkPact: ['Dark Pact', 'Allies within 4 m deal +5% damage and lifesteal 8% when hitting enemies; you lose HP equal to 5% of that damage'],
  hunger: ['Hunger', '10% of damage dealt to enemies heals you'],
  bulwark: ['Bulwark', '30% of the damage taken by allies within 4 m goes to the guardian instead'],
  duelist: ['Duelist', 'After interrupting an enemy, your next attack is a guaranteed crit; Shield Bash holds 2 charges'],
  deathAura: ['Aura of Death', 'Enemies within 3 m take +15% damage'],
  sunderStrike: ['Sunder', 'Basic hits reduce the target’s physical and special armor by 2 (up to 3 stacks, 4 s)'],
  zealAura: ['Zealot Aura', 'Allies within 5 m (including self) gain +12 accuracy, +6 defense and +15% damage'],
  bloodAura: ['Blood Aura', 'Allies within 5 m deal +15% damage and lifesteal 20% when hitting enemies; the heretic loses HP equal to 8% of that damage'],
  warTotemAura: ['War Totem', 'Allies within 7 m deal +15% damage (stacks per totem)'],
  grenade: ['Grenade', 'Lobbed basic attacks that burst on impact (no friendly fire, ignores cover)'],
};

export const EN_UPGRADES: NameDesc = {
  vigor: ['Vigor', 'Max HP +15%, and heal the same amount'],
  precise: ['Precise', 'Accuracy +8'],
  ironWall: ['Iron Wall', 'Armor +2'],
  swift: ['Swift', 'Attack speed +10%'],
  practiced: ['Practiced', 'One skill’s cooldown −20%'],
  sharp: ['Sharp', 'Damage dealt +12%'],
  evasive: ['Evasive', 'Defense +8'],
  fleet: ['Fleet', 'Movement speed +12%'],
  fieldMedic: ['Field Medic', 'The whole party recovers 20% HP'],
  unity: ['Unity', 'Party accuracy +4, defense +4'],
  steadfast: ['Steadfast', 'Not stunned when interrupted'],
  doubleCast: ['Double Cast', 'One skill can hold 2 charges'],
  titan: ['Titan', 'Max HP +30%, and heal the same amount'],
  mindWard: ['Mind Ward', 'Special defense +10 (spells land less often)'],
  spellGuard: ['Spell Guard', 'Special armor +2 (less spell damage)'],
  gdTaunt: ['Provoke', 'Taunt aura grows to 7 m'],
  gdAura: ['Iron Guard', 'Allies within 4 m gain +8 defense'],
  gdShell: ['Heavy Shield', 'Armor +3, max HP +10%'],
  glBash: ['Bash Mastery', 'Shield Bash cooldown −25%'],
  glFocus: ['Pit Fighting', 'Accuracy +10'],
  glEdge: ['Arena Edge', 'Damage +10%, attack speed +8%'],
  bkFury: ['Fury', 'Damage +12%'],
  bkFrenzy: ['Frenzy', 'Attack speed +12%'],
  bkThirst: ['Bloodthirst', '12% of damage dealt to enemies heals you'],
  ctClose1: ['Close In I', 'Accuracy +12, but range −2.5 m'],
  ctClose2: ['Close In II', 'Accuracy +12, but range −2.5 m'],
  ctClose3: ['Close In III', 'Accuracy +12, but range −2.5 m'],
  snPower: ['Heavy Bow', 'Damage +12%'],
  snReach: ['Far Sight', 'Range +2 m'],
  snSteady: ['Steady Hand', 'Accuracy +10'],
  abRapid1: ['Rapid Fire I', 'Attack speed +18%, but damage −6%'],
  abRapid2: ['Rapid Fire II', 'Attack speed +18%, but damage −6%'],
  abReload: ['Quick Reload', 'Attack speed +15%'],
  elEnchant: ['Enchant Mastery', 'Enchant cooldown −20%'],
  elFlame: ['Blaze', 'Damage +12%'],
  elFrost: ['Rime', 'Accuracy +8'],
  dmWide: ['Frost Field', 'Chill aura grows to 4.5 m'],
  dmDeep: ['Bitter Cold', 'Enemies within 3 m are slowed by 40%'],
  dmFrail: ['Wither', 'Enemies within 3 m take +10% damage'],
  bmVigor: ['Tempered Body', 'Max HP +20%'],
  bmPlate: ['Plated', 'Armor +3'],
  bmGrit: ['Close Quarters', 'Defense +8'],
  plVigor: ['Holy Body', 'Max HP +15%'],
  plHammer: ['Heavy Hammer', 'Damage +15%'],
  plWard: ['Sanctuary Mastery', 'Sanctuary cooldown −20%'],
  zeFervor: ['Fervor', 'Blessing aura: accuracy +15, defense +8'],
  zeReach: ['Sermon', 'Blessing aura grows to 7 m'],
  zeZeal: ['Devotion', 'Accuracy +8, damage +8%'],
  htDark: ['Dark Pact', 'Allies within 4 m deal +5% damage and lifesteal 8% when hitting enemies; you lose a little HP'],
  htBlood: ['Blood Pact', 'Max HP +15%'],
  htHunger: ['Hunger', '10% of damage dealt to enemies heals you'],
};

export const EN_ITEMS: NameDesc = {
  ironShield: ['Iron Shield', 'Every 3rd basic hit stuns the target for 0.5 s'],
  swiftBoots: ['Swift Boots', 'Movement speed +15%'],
  hawkEye: ['Hawk Eye', 'Basic attack range +1 m; +25% damage to targets below 30% HP'],
  frostRing: ['Frost Ring', 'Basic attacks have a 20% chance to root the target for 1 s'],
  swampMoss: ['Swamp Moss', 'Every 2nd basic hit leaves a small swamp under the target (enemy movement ×0.6, 4 s)'],
  holySigil: ['Holy Sigil', 'Accuracy +8'],
  warHammer: ['War Hammer', 'Damage dealt +10%'],
  leatherArmor: ['Leather Armor', 'Armor +2, defense +5'],
  swiftGloves: ['Swift Gloves', 'Basic attack speed +15%'],
  flameBlade: ['Flame Blade', 'Basic attacks have a 30% chance to ignite the target; damage dealt +5%'],
  towerShield: ['Tower Shield', 'Armor +3; every 3rd basic hit stuns the target for 0.8 s'],
  stormBoots: ['Storm Boots', 'Movement speed +20%, basic attack speed +10%'],
  glacierHeart: ['Glacier Heart', 'Basic attacks have a 30% chance to root the target for 1.5 s; defense +5'],
};

export const EN_CONSUMABLES: NameDesc = {
  potion: ['Healing Potion', 'One hero recovers 40% HP'],
  elixir: ['Party Elixir', 'The whole party recovers 20% HP'],
  phoenix: ['Phoenix Feather', 'Revives a fallen hero with 30% HP (usable in battle)'],
  smoke: ['Smoke Bomb', 'The whole party is hidden for 3 s (to disengage; battle only)'],
};

export const EN_CLASS_ROLES: Record<string, string> = {
  warrior: 'Front-line blocker',
  ranger: 'Mobile ranged',
  mage: 'Area burst',
  cleric: 'Healer / support',
  berserker: 'Charging damage: no zone of control, more damage at low HP',
  rogue: 'Flanking assassin (melee): no zone of control, ×1.5 basic attacks from behind',
  hexer: 'Control and debuffs',
  alchemist: 'Thrown items: lobbed basic attacks (no line of sight needed, ignores cover)',
  guardian: 'Protector: shares damage with allies in the aura',
  gladiator: 'Duelist: guaranteed crit after a Shield Bash interrupt',
  cutthroat: 'Melee assassin: backstabs add accuracy for high-tier crits',
  sniper: 'Focus, then one decisive shot',
  arbalest: 'Rapid-fire volleys',
  elementalist: 'Fire + cold; Enchant gives allies both',
  deathMage: 'Chill aura weakens enemies; Curse Burst',
  battlemage: 'Melee: enchants only itself; basic attacks sunder armor',
  paladin: 'Sanctuary also slows enemies',
  zealot: 'Aura grants damage, accuracy and defense',
  heretic: 'Sustains through battle: lifesteal and blood aura',
};

/** 分支名稱（昇變） */
export const EN_BRANCHES: Record<string, string> = {
  guardian: 'Guardian', gladiator: 'Gladiator', berserker: 'Berserker', cutthroat: 'Assassin', sniper: 'Sniper', arbalest: 'Arbalest',
  elementalist: 'Elementalist', deathMage: 'Death Mage', battlemage: 'Battlemage', paladin: 'Paladin', zealot: 'Zealot', heretic: 'Heretic',
};

/** 章節名稱（過場文字維持中文） */
export const EN_CHAPTERS: Record<string, string> = {
  capital: 'Escape from the Capital', wilds: 'The Wilds', dungeon: 'Dungeon of Trials', tunnels: 'Hidden Passage', castle: "Demon Lord's Castle",
};

/** 路線圖節點類型 */
export const EN_NODES: Record<string, string> = { battle: 'Battle', elite: 'Elite', event: 'Event', rest: 'Rest', boss: 'Boss', shop: 'Shop' };

/** 屬性 */
export const EN_ATTRIBUTES: Record<string, string> = {
  cut: 'Slash', cleave: 'Cleave', blunt: 'Blunt', pierce: 'Pierce', fire: 'Fire', cold: 'Cold', holy: 'Holy', dark: 'Dark',
};

/** 陣營 */
export const EN_FACTIONS: Record<string, string> = { empire: 'Rebel Legion', orcs: 'Orc Horde' };

/** 遭遇（戰鬥）名稱，依 id */
export const EN_ENCOUNTERS: Record<string, string> = {
  passScouts: 'Pass Scouts',
  forestAmbush: 'Forest Ambush',
  ruinsScavengers: 'Ruin Scavengers',
  marshRaiders: 'Marsh Raiders',
  hillOutpost: 'Hill Outpost',
  bridgeFlank: 'Bridge Pincer',
  forestBand: 'Woodland Warband',
  marshVillage: 'Marsh Village',
  forestStalkers: 'Forest Stalkers',
  marshAmbush: 'Marsh Ambush',
  passHold: 'Battle of the Pass',
  ruinsGarrison: 'Ruin Garrison',
  bridgeSiege: 'Broken Bridge',
  hillGarrison: 'Highland Garrison',
  hillSiege: 'Storm the Hill',
  passSiege: 'Siege Party',
  passCaptain: 'Pass Commander',
  forestCaptain: 'Headhunter Captain',
  ruinsCaptain: 'Ruin Priest',
  bridgeCaptain: 'Bridgehead Marksman',
  marshCaptain: 'Marsh Witch',
  hillCaptain: 'Outpost Captain',
  siegeCaptain: 'Breach Captain',
  warlord: 'The Warlord',
  hordePass: 'Horde Trial: The Pass',
  hordeMoria: 'Horde Trial: Abyssal Mine',
  ambush: 'Ambush',
  nightRaid: 'Night Raid',
};

/** 戰場地圖名稱，依地圖 id */
export const EN_MAPS: Record<string, string> = {
  arena01: 'Mountain Pass',
  boss01: 'Throne Hall',
  bridge01: 'Stone Bridge',
  forest01: 'Forest Clearing',
  hill01: 'Hill Outpost',
  horde01: 'Abyssal Mine',
  marsh01: 'Marsh Village',
  ruins01: 'Ruins',
};

/** 職業系名稱 */
export const EN_LINES: Record<string, string> = { warrior: 'Warrior line', ranger: 'Ranger line', mage: 'Mage line', cleric: 'Cleric line' };
