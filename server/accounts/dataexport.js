// 自分の個人データの書き出し（データの持ち出し・確認のため）。他の人のIDは含めない（名前だけ）。MMR などの内部値は含めない。
export function exportUserData({ db, accounts, progress, economy, ranking, social, missions, modes }, userId) {
  const user = accounts.publicUser(userId);
  const profile = progress.profile(userId, userId);
  return {
    exportedAt: new Date().toISOString(),
    format: 'castlefield-export-1',
    account: { kind: user.kind, displayName: user.displayName, createdAt: new Date(user.createdAt).toISOString(), providers: user.providers },
    profile: { icon: profile.icon, title: profile.title, privacy: profile.privacy, level: profile.level },
    progress: { xp: progress.getXp(userId), stats: progress.stats(userId), statsByMode: progress.statsByMode(userId) },
    matches: progress.history(userId, 50).map((m) => ({ endedAt: new Date(m.endedAt).toISOString(), mode: m.modeId, result: m.result, turns: m.turns, reason: m.reason, xpGained: m.xpGained, opponents: m.opponents.map((o) => o.name) })),
    decks: Object.fromEntries(modes.map((id) => [id, accounts.getDecks(userId, id)])),
    rank: Object.fromEntries(modes.map((id) => [id, { seasons: ranking.history(userId, id) }])),
    wallet: economy ? { ...economy.balance(userId), ledger: economy.ledger(userId, 100) } : null,
    inventory: economy ? { owned: economy.ownedIds(userId), equipped: economy.equippedOf(userId), gachaHistory: economy.history(userId, 100) } : null,
    missions: missions ? missions.view(userId) : null,
    friends: social.isMember(userId) ? social.state(userId).friends.map((f) => ({ name: f.name })) : [],
    blocked: social.isMember(userId) ? social.state(userId).blocked.map((b) => ({ name: b.name })) : [],
    note: 'ほかの人のID・ランクの内部値（MMR）・ログイン用の鍵は含みません',
  };
}
