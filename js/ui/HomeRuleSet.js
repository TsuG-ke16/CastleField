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
  let cards=cardTable, decks=null, factions=null;
  if (entry?.factionDecks) {
    const sets=Object.fromEntries(await Promise.all(Object.entries(entry.factionCardSets).map(async([key,path])=>[key,await load(path)])));
    cards=Object.assign({},...Object.values(sets));
    factions=await load(entry.factionsSet); decks=factionDecks(factions,sets);
  }
  return { id,entry,cards,rules,decks,factions,
    elements:entry?.elementsSet ? await load(entry.elementsSet) : null,
    reactions:entry?.reactionsSet ? await load(entry.reactionsSet) : null };
}

export function rulesetUrl(href, id) {
  if (!['kingdom','factions'].includes(id)) throw new Error('選べないルールセットです');
  const url=new URL(href); url.searchParams.set('home','1');
  if(id==='kingdom') url.searchParams.delete('mode'); else url.searchParams.set('mode',id);
  for(const key of ['local','cpu','seed','pass','room']) url.searchParams.delete(key);
  return url.href;
}
