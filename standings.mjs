export const ROUND_ROBIN_SYSTEM = 'round-robin';

export function scoreFromResult(result) {
  if (result === '1-0') return [1, 0];
  if (result === '0-1') return [0, 1];
  if (result === '0.5-0.5') return [0.5, 0.5];
  return [0, 0];
}

function getScoreMap(players, rounds, pairingSystem) {
  const scores = Object.fromEntries(players.map((player) => [player.id, 0]));
  rounds.forEach((round) => {
    round.pairings.forEach((pairing) => {
      if (pairing.byeId) {
        if (pairingSystem !== ROUND_ROBIN_SYSTEM) {
          scores[pairing.byeId] = (scores[pairing.byeId] || 0) + 1;
        }
        return;
      }
      const [whiteScore, blackScore] = scoreFromResult(pairing.result);
      scores[pairing.whiteId] = (scores[pairing.whiteId] || 0) + whiteScore;
      scores[pairing.blackId] = (scores[pairing.blackId] || 0) + blackScore;
    });
  });
  return scores;
}

function getPlayerResults(players, rounds, scores) {
  const results = Object.fromEntries(players.map((player) => [player.id, {
    wins: 0,
    games: [],
    opponents: [],
    direct: {},
  }]));

  rounds.forEach((round) => {
    round.pairings.forEach((pairing) => {
      if (pairing.byeId) {
        return;
      }

      const [whiteScore, blackScore] = scoreFromResult(pairing.result);
      const white = results[pairing.whiteId];
      const black = results[pairing.blackId];
      if (!white || !black) {
        return;
      }

      white.opponents.push(pairing.blackId);
      black.opponents.push(pairing.whiteId);
      white.games.push({ opponentId: pairing.blackId, score: whiteScore });
      black.games.push({ opponentId: pairing.whiteId, score: blackScore });
      white.direct[pairing.blackId] = (white.direct[pairing.blackId] || 0) + whiteScore;
      black.direct[pairing.whiteId] = (black.direct[pairing.whiteId] || 0) + blackScore;

      if (whiteScore === 1) {
        white.wins += 1;
      }
      if (blackScore === 1) {
        black.wins += 1;
      }
    });
  });

  Object.values(results).forEach((result) => {
    const opponentScores = result.opponents.map((opponentId) => scores[opponentId] || 0);
    const lowestOpponentScore = opponentScores.length ? Math.min(...opponentScores) : 0;
    result.buchholz = opponentScores.reduce((sum, score) => sum + score, 0);
    result.buchholzCut1 = Math.max(0, result.buchholz - lowestOpponentScore);
    result.sonnebornBerger = result.games.reduce((sum, game) => {
      const opponentScore = scores[game.opponentId] || 0;
      if (game.score === 1) {
        return sum + opponentScore;
      }
      if (game.score === 0.5) {
        return sum + (opponentScore / 2);
      }
      return sum;
    }, 0);
  });

  return results;
}

function compareTieBreak(a, b, field) {
  const diff = (b[field] || 0) - (a[field] || 0);
  if (Math.abs(diff) > 0.0001) return diff;
  return 0;
}

export function formatTieBreak(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildStandings(players, rounds, pairingSystem = 'swiss') {
  const scores = getScoreMap(players, rounds, pairingSystem);
  const results = getPlayerResults(players, rounds, scores);
  return [...players]
    .sort((a, b) => {
      const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const aStats = results[a.id] || {};
      const bStats = results[b.id] || {};
      const buchholzDiff = compareTieBreak(aStats, bStats, 'buchholz');
      if (buchholzDiff !== 0) return buchholzDiff;
      const buchholzCut1Diff = compareTieBreak(aStats, bStats, 'buchholzCut1');
      if (buchholzCut1Diff !== 0) return buchholzCut1Diff;
      const sonnebornBergerDiff = compareTieBreak(aStats, bStats, 'sonnebornBerger');
      if (sonnebornBergerDiff !== 0) return sonnebornBergerDiff;
      const directDiff = (bStats.direct?.[a.id] || 0) - (aStats.direct?.[b.id] || 0);
      if (Math.abs(directDiff) > 0.0001) return directDiff;
      const winsDiff = compareTieBreak(aStats, bStats, 'wins');
      if (winsDiff !== 0) return winsDiff;
      const ratingDiff = (b.ratingFinal || 0) - (a.ratingFinal || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return a.name.localeCompare(b.name, 'cs');
    })
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      ratingFinal: player.ratingFinal || 0,
      score: scores[player.id] || 0,
      buchholz: results[player.id]?.buchholz || 0,
      buchholzCut1: results[player.id]?.buchholzCut1 || 0,
      sonnebornBerger: results[player.id]?.sonnebornBerger || 0,
      wins: results[player.id]?.wins || 0,
    }));
}
