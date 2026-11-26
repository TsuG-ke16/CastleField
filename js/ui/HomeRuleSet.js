import { factionDecks } from '../game/Setup.js';

// メニューの表示名からルールを推測せず、既存のモード定義を使う。
// 読み込み関数を注入でき、HTTPとオフラインキャッシュの同じ経路で動く。
export async function loadHomeRuleSet(id, load) {
  const catalog = await load('data/modes.json');
  const entry = id === catalog.default ? null : catalog.modes?.[id];
  if (id !== catalog.default && !entry?.cardSet && !entry?.factionDecks) throw new Error(`モード「${id}」は利用できません`);
  const [rules, cardTable] = await Promise.all([
    load(entry?.rulesSet ?? 'data/rules.json'),
    entry?.factionDecks ? Promise.resolve({}) : load(entry?.cardSet ?? 'data/cards.json'),
  ]);
  let cards=cardTable, decks=null, factions=null, cardSets=null;
  if (entry?.factionDecks) {
    const sets=Object.fromEntries(await Promise.all(Object.entries(entry.factionCardSets).map(async([key,path])=>[key,await load(path)])));
    cards=Object.assign({},...Object.values(sets));
    factions=await load(entry.factionsSet); decks=factionDecks(factions,sets); cardSets=sets;
  }
  return { id,entry,cards,rules,decks,factions,cardSets,
    elements:entry?.elementsSet ? await load(entry.elementsSet) : null,
    reactions:entry?.reactionsSet ? await load(entry.reactionsSet) : null,
    // クラシックのスキルツリー（skillTreeSet があるモードだけ。js/ui/SkillTreeView.js と new Game({ skillTree }) が使う）
    skillTree:entry?.skillTreeSet ? await load(entry.skillTreeSet) : null };
}

export function rulesetUrl(href, id) {
  if (!['kingdom','factions','classic'].includes(id)) throw new Error('選べないルールセットです');
  const url=new URL(href); url.searchParams.set('home','1');
  if(id==='kingdom') url.searchParams.delete('mode'); else url.searchParams.set('mode',id);
  // ?beta=factions（前の4陣営の入口）は ?mode=factions と同じなので、残すと通常モードに戻れない
  for(const key of ['local','cpu','seed','pass','room','beta']) url.searchParams.delete(key);
  return url.href;
}
