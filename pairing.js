const STORAGE_KEY = 'sachyuh.pairing.state.v1';
const RESULT_OPTIONS = ['1-0', '0.5-0.5', '0-1'];

const elements = {
  engineStatus: document.getElementById('engineStatus'),
  playersInput: document.getElementById('playersInput'),
  loadSampleButton: document.getElementById('loadSampleButton'),
  sortPlayersButton: document.getElementById('sortPlayersButton'),
  clearButton: document.getElementById('clearButton'),
  savePlayersButton: document.getElementById('savePlayersButton'),
  generateButton: document.getElementById('generateButton'),
  saveRoundButton: document.getElementById('saveRoundButton'),
  currentRound: document.getElementById('currentRound'),
  roundsHistory: document.getElementById('roundsHistory'),
  exportButton: document.getElementById('exportButton'),
  importButton: document.getElementById('importButton'),
  printButton: document.getElementById('printButton'),
  exportPlayersButton: document.getElementById('exportPlayersButton'),
  importPlayersButton: document.getElementById('importPlayersButton'),
  exportStandingsButton: document.getElementById('exportStandingsButton'),
  exportRoundsButton: document.getElementById('exportRoundsButton'),
  importFileInput: document.getElementById('importFileInput'),
  importPlayersInput: document.getElementById('importPlayersInput'),
  exportDialog: document.getElementById('exportDialog'),
  exportOutput: document.getElementById('exportOutput'),
  downloadExportButton: document.getElementById('downloadExportButton'),
  copyExportButton: document.getElementById('copyExportButton'),
  toast: document.getElementById('toast'),
};

const samplePlayers = [
  ['Nikola', 16],
  ['Jiri', 15],
  ['Attila', 14],
  ['Jan Bulhar', 13],
  ['e2e4', 12],
  ['David Lukastik', 11],
  ['Adela', 10],
  ['Tomas Lajsek', 9],
  ['Karel Machu', 8],
  ['Albert Beatus', 7],
  ['Jarek Shanel', 6],
  ['Roman Omelka', 5],
  ['Vasyl', 4],
  ['VW3TY', 3],
  ['Hani', 2],
  ['Albert', 1],
];

let state = {
  playersText: '',
  rounds: [],
  currentPairings: [],
};

function showToast(message, type = '') {
  elements.toast.textContent = message;
  elements.toast.className = `toast show ${type}`.trim();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.className = 'toast';
  }, 3200);
}

function playerIdFromName(name) {
  return name.trim();
}

function parsePlayers(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, rawRating = '0'] = line.split(';');
      const name = rawName.trim();
      const ratingFinal = Number.parseInt(rawRating.trim(), 10) || 0;
      return {
        id: playerIdFromName(name),
        name,
        ratingFinal,
      };
    });
}

function formatPlayers(players) {
  return players.map((player) => `${player.name};${player.ratingFinal}`).join('\n');
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function parseDelimitedLine(line) {
  const result = [];
  let value = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (char === ';' || char === ',' || char === '\t')) {
      result.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  result.push(value.trim());
  return result;
}

function parsePlayersCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDelimitedLine)
    .filter((parts) => parts.length)
    .filter((parts, index) => {
      if (index !== 0) return true;
      const first = String(parts[0] || '').toLowerCase();
      return first !== 'name' && first !== 'jmeno' && first !== 'jméno';
    })
    .map(([name, ratingFinal = '0']) => ({
      id: playerIdFromName(name),
      name,
      ratingFinal: Number.parseInt(ratingFinal, 10) || 0,
    }));
}

function safeTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function saveState() {
  state.playersText = elements.playersInput.value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state = { ...state, ...JSON.parse(raw) };
    } catch {
      state = { playersText: '', rounds: [], currentPairings: [] };
    }
  }
  elements.playersInput.value = state.playersText;
}

function scoreFromResult(result) {
  if (result === '1-0') {
    return [1, 0];
  }
  if (result === '0-1') {
    return [0, 1];
  }
  if (result === '0.5-0.5') {
    return [0.5, 0.5];
  }
  return [0, 0];
}

function getScoreMap(players, rounds) {
  const scores = Object.fromEntries(players.map((player) => [player.id, 0]));
  rounds.forEach((round) => {
    round.pairings.forEach((pairing) => {
      if (pairing.byeId) {
        scores[pairing.byeId] = (scores[pairing.byeId] || 0) + 1;
        return;
      }
      const [whiteScore, blackScore] = scoreFromResult(pairing.result);
      scores[pairing.whiteId] = (scores[pairing.whiteId] || 0) + whiteScore;
      scores[pairing.blackId] = (scores[pairing.blackId] || 0) + blackScore;
    });
  });
  return scores;
}

function getStandings(players) {
  const scores = getScoreMap(players, state.rounds);
  return [...players]
    .sort((a, b) => {
      const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const ratingDiff = (b.ratingFinal || 0) - (a.ratingFinal || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return a.name.localeCompare(b.name);
    })
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      ratingFinal: player.ratingFinal || 0,
      score: scores[player.id] || 0,
    }));
}

function renderStandings(players) {
  const standings = getStandings(players);
  if (!standings.length) {
    return '';
  }
  return `
    <div class="standings">
      ${standings.map((player) => `
        <div class="standings-row">
          <span>${player.rank}.</span>
          <span>${escapeHtml(player.name)}</span>
          <strong>${player.score}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function playerNameById(players, id) {
  return players.find((player) => player.id === id)?.name || id;
}

function renderCurrentRound() {
  const players = parsePlayers(elements.playersInput.value);
  if (!state.currentPairings.length) {
    elements.currentRound.className = 'empty-state';
    elements.currentRound.textContent = 'No pairings generated yet.';
    return;
  }
  elements.currentRound.className = '';
  elements.currentRound.innerHTML = `
    <table class="pairing-table">
      <thead>
        <tr>
          <th>#</th>
          <th>White</th>
          <th>Black</th>
          <th class="result-cell">Result</th>
        </tr>
      </thead>
      <tbody>
        ${state.currentPairings.map((pairing, index) => {
          if (pairing.byeId) {
            return `
              <tr data-index="${index}">
                <td>${index + 1}</td>
                <td>${escapeHtml(pairing.byeName || playerNameById(players, pairing.byeId))}</td>
                <td>BYE</td>
                <td>bye</td>
              </tr>
            `;
          }
          return `
            <tr data-index="${index}">
              <td>${index + 1}</td>
              <td>${escapeHtml(pairing.whiteName || playerNameById(players, pairing.whiteId))}</td>
              <td>${escapeHtml(pairing.blackName || playerNameById(players, pairing.blackId))}</td>
              <td>
                <select data-result-index="${index}" aria-label="Result for board ${index + 1}">
                  <option value="">Select</option>
                  ${RESULT_OPTIONS.map((option) => `
                    <option value="${option}" ${pairing.result === option ? 'selected' : ''}>${option}</option>
                  `).join('')}
                </select>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderHistory() {
  const players = parsePlayers(elements.playersInput.value);
  if (!state.rounds.length) {
    elements.roundsHistory.className = 'empty-state';
    elements.roundsHistory.textContent = 'No saved rounds yet.';
    return;
  }
  elements.roundsHistory.className = '';
  elements.roundsHistory.innerHTML = `
    ${renderStandings(players)}
    ${state.rounds.map((round, roundIndex) => `
      <div class="round-block">
        <div class="round-heading">
          <h3>Round ${round.round}</h3>
          <div class="button-row">
            <button type="button" class="small-button" data-reopen-round="${roundIndex}">Reopen</button>
            <button type="button" class="small-button" data-truncate-round="${roundIndex}">Keep through</button>
          </div>
        </div>
        <table class="round-table">
          <thead>
            <tr>
              <th>#</th>
              <th>White</th>
              <th>Black</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            ${round.pairings.map((pairing, index) => {
              if (pairing.byeId) {
                return `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(playerNameById(players, pairing.byeId))}</td>
                    <td>BYE</td>
                    <td>bye</td>
                  </tr>
                `;
              }
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(playerNameById(players, pairing.whiteId))}</td>
                  <td>${escapeHtml(playerNameById(players, pairing.blackId))}</td>
                  <td>${escapeHtml(pairing.result)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  `;
}

function renderAll() {
  renderCurrentRound();
  renderHistory();
}

async function checkEngine() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Engine not ready.');
    }
    elements.engineStatus.textContent = `Engine ready: ${payload.engine}`;
    elements.engineStatus.className = 'engine-status ok';
  } catch (error) {
    elements.engineStatus.textContent = error.message;
    elements.engineStatus.className = 'engine-status fail';
  }
}

async function generatePairings() {
  const players = parsePlayers(elements.playersInput.value);
  if (players.length < 2) {
    showToast('Add at least two players.', 'warn');
    return;
  }
  saveState();
  elements.generateButton.disabled = true;
  try {
    const response = await fetch('/api/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players,
        rounds: state.rounds,
        expectedRounds: Math.max(state.rounds.length + 1, Math.ceil(players.length / 2)),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Pairing failed.');
    }
    state.currentPairings = payload.pairings;
    saveState();
    renderAll();
    showToast(`Round ${state.rounds.length + 1} generated.`);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.generateButton.disabled = false;
  }
}

function syncCurrentResults() {
  document.querySelectorAll('[data-result-index]').forEach((select) => {
    const index = Number.parseInt(select.dataset.resultIndex, 10);
    state.currentPairings[index].result = select.value;
  });
}

function saveRoundResults() {
  if (!state.currentPairings.length) {
    showToast('Generate pairings first.', 'warn');
    return;
  }
  syncCurrentResults();
  const incomplete = state.currentPairings.some((pairing) => (
    !pairing.byeId && !pairing.result
  ));
  if (incomplete) {
    showToast('Fill every result before saving the round.', 'warn');
    return;
  }
  state.rounds.push({
    round: state.rounds.length + 1,
    pairings: state.currentPairings.map((pairing) => {
      if (pairing.byeId) {
        return { byeId: pairing.byeId, result: 'bye' };
      }
      return {
        whiteId: pairing.whiteId,
        blackId: pairing.blackId,
        result: pairing.result,
      };
    }),
  });
  state.currentPairings = [];
  saveState();
  renderAll();
  showToast('Round saved.');
}

function tournamentExport() {
  state.playersText = elements.playersInput.value;
  return {
    format: 'osel-pairing-tournament',
    version: 1,
    exportedAt: new Date().toISOString(),
    playersText: state.playersText,
    players: parsePlayers(state.playersText),
    rounds: state.rounds,
    currentPairings: state.currentPairings,
  };
}

function exportState() {
  elements.exportOutput.value = JSON.stringify(tournamentExport(), null, 2);
  elements.exportDialog.showModal();
}

function downloadTournamentJson() {
  downloadText(
    `osel-pairing-tournament-${safeTimestamp()}.json`,
    JSON.stringify(tournamentExport(), null, 2),
    'application/json;charset=utf-8',
  );
}

function exportPlayersCsv() {
  const players = parsePlayers(elements.playersInput.value);
  const rows = [
    ['name', 'ratingFinal'],
    ...players.map((player) => [player.name, player.ratingFinal]),
  ];
  downloadText(
    `start-list-${safeTimestamp()}.csv`,
    rows.map((row) => row.map(csvEscape).join(';')).join('\n'),
    'text/csv;charset=utf-8',
  );
}

function exportStandingsCsv() {
  const players = parsePlayers(elements.playersInput.value);
  const rows = [
    ['rank', 'name', 'ratingFinal', 'score'],
    ...getStandings(players).map((player) => [
      player.rank,
      player.name,
      player.ratingFinal,
      player.score,
    ]),
  ];
  downloadText(
    `standings-${safeTimestamp()}.csv`,
    rows.map((row) => row.map(csvEscape).join(';')).join('\n'),
    'text/csv;charset=utf-8',
  );
}

function exportRoundsCsv() {
  const players = parsePlayers(elements.playersInput.value);
  const rows = [['round', 'board', 'white', 'black', 'result']];
  state.rounds.forEach((round) => {
    round.pairings.forEach((pairing, index) => {
      if (pairing.byeId) {
        rows.push([
          round.round,
          index + 1,
          playerNameById(players, pairing.byeId),
          'BYE',
          'bye',
        ]);
        return;
      }
      rows.push([
        round.round,
        index + 1,
        playerNameById(players, pairing.whiteId),
        playerNameById(players, pairing.blackId),
        pairing.result,
      ]);
    });
  });
  downloadText(
    `round-results-${safeTimestamp()}.csv`,
    rows.map((row) => row.map(csvEscape).join(';')).join('\n'),
    'text/csv;charset=utf-8',
  );
}

function importTournament(payload) {
  const playersText = payload.playersText || (
    Array.isArray(payload.players) ? formatPlayers(payload.players) : ''
  );
  if (!playersText.trim()) {
    throw new Error('Import does not contain a start list.');
  }
  const importedRounds = Array.isArray(payload.rounds) ? payload.rounds : [];
  const importedCurrent = Array.isArray(payload.currentPairings) ? payload.currentPairings : [];
  state = {
    playersText,
    rounds: importedRounds,
    currentPairings: importedCurrent,
  };
  elements.playersInput.value = playersText;
  saveState();
  renderAll();
}

async function importTournamentFile(file) {
  const text = await file.text();
  importTournament(JSON.parse(text));
  showToast('Tournament imported.');
}

async function importPlayersFile(file) {
  if ((state.rounds.length || state.currentPairings.length)
    && !window.confirm('Importing a start list clears saved rounds and current pairings. Continue?')) {
    return;
  }
  const players = parsePlayersCsv(await file.text());
  if (players.length < 2) {
    throw new Error('Start list import needs at least two players.');
  }
  state = {
    playersText: formatPlayers(players),
    rounds: [],
    currentPairings: [],
  };
  elements.playersInput.value = state.playersText;
  saveState();
  renderAll();
  showToast('Start list imported.');
}

function buildPrintDocument() {
  const players = parsePlayers(elements.playersInput.value);
  const standings = getStandings(players);
  return `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Swiss pairing export</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
        h1 { margin: 0 0 4px; font-size: 24px; }
        h2 { margin: 22px 0 8px; font-size: 17px; }
        p { margin: 0 0 14px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
        th, td { padding: 5px 7px; border: 1px solid #ccc; text-align: left; }
        th { background: #eee; }
        .page-break { break-before: page; }
      </style>
    </head>
    <body>
      <h1>Swiss pairing export</h1>
      <p>${new Date().toLocaleString()}</p>
      <h2>Start list</h2>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Rating</th></tr></thead>
        <tbody>
          ${players.map((player, index) => `
            <tr><td>${index + 1}</td><td>${escapeHtml(player.name)}</td><td>${player.ratingFinal}</td></tr>
          `).join('')}
        </tbody>
      </table>
      <h2>Standings</h2>
      <table>
        <thead><tr><th>Rank</th><th>Name</th><th>Rating</th><th>Score</th></tr></thead>
        <tbody>
          ${standings.map((player) => `
            <tr><td>${player.rank}</td><td>${escapeHtml(player.name)}</td><td>${player.ratingFinal}</td><td>${player.score}</td></tr>
          `).join('')}
        </tbody>
      </table>
      <h2 class="page-break">Rounds</h2>
      ${state.rounds.map((round) => `
        <h2>Round ${round.round}</h2>
        <table>
          <thead><tr><th>#</th><th>White</th><th>Black</th><th>Result</th></tr></thead>
          <tbody>
            ${round.pairings.map((pairing, index) => {
              if (pairing.byeId) {
                return `<tr><td>${index + 1}</td><td>${escapeHtml(playerNameById(players, pairing.byeId))}</td><td>BYE</td><td>bye</td></tr>`;
              }
              return `<tr><td>${index + 1}</td><td>${escapeHtml(playerNameById(players, pairing.whiteId))}</td><td>${escapeHtml(playerNameById(players, pairing.blackId))}</td><td>${escapeHtml(pairing.result)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      `).join('')}
    </body>
    </html>
  `;
}

function printTournamentPdf() {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Popup was blocked. Allow popups to print PDF.', 'warn');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildPrintDocument());
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function truncateThroughRound(roundIndex) {
  state.rounds = state.rounds.slice(0, roundIndex + 1);
  state.currentPairings = [];
  saveState();
  renderAll();
  showToast(`Kept rounds through round ${roundIndex + 1}.`);
}

function reopenRound(roundIndex) {
  const players = parsePlayers(elements.playersInput.value);
  const round = state.rounds[roundIndex];
  state.rounds = state.rounds.slice(0, roundIndex);
  state.currentPairings = round.pairings.map((pairing) => {
    if (pairing.byeId) {
      return {
        byeId: pairing.byeId,
        byeName: playerNameById(players, pairing.byeId),
        result: 'bye',
      };
    }
    return {
      whiteId: pairing.whiteId,
      whiteName: playerNameById(players, pairing.whiteId),
      blackId: pairing.blackId,
      blackName: playerNameById(players, pairing.blackId),
      result: pairing.result,
    };
  });
  saveState();
  renderAll();
  showToast(`Round ${roundIndex + 1} reopened.`);
}

elements.loadSampleButton.addEventListener('click', () => {
  elements.playersInput.value = formatPlayers(samplePlayers.map(([name, ratingFinal]) => ({
    name,
    ratingFinal,
  })));
  state.rounds = [];
  state.currentPairings = [];
  saveState();
  renderAll();
});

elements.sortPlayersButton.addEventListener('click', () => {
  const players = parsePlayers(elements.playersInput.value)
    .sort((a, b) => {
      const ratingDiff = (b.ratingFinal || 0) - (a.ratingFinal || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return a.name.localeCompare(b.name);
    });
  elements.playersInput.value = formatPlayers(players);
  saveState();
  renderAll();
});

elements.clearButton.addEventListener('click', () => {
  state = { playersText: '', rounds: [], currentPairings: [] };
  elements.playersInput.value = '';
  saveState();
  renderAll();
});

elements.savePlayersButton.addEventListener('click', () => {
  saveState();
  renderAll();
  showToast('Players saved.');
});

elements.generateButton.addEventListener('click', generatePairings);
elements.saveRoundButton.addEventListener('click', saveRoundResults);
elements.exportButton.addEventListener('click', exportState);
elements.importButton.addEventListener('click', () => elements.importFileInput.click());
elements.printButton.addEventListener('click', printTournamentPdf);
elements.exportPlayersButton.addEventListener('click', exportPlayersCsv);
elements.importPlayersButton.addEventListener('click', () => elements.importPlayersInput.click());
elements.exportStandingsButton.addEventListener('click', exportStandingsCsv);
elements.exportRoundsButton.addEventListener('click', exportRoundsCsv);
elements.downloadExportButton.addEventListener('click', downloadTournamentJson);
elements.copyExportButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.exportOutput.value);
  showToast('Export copied.');
});
elements.currentRound.addEventListener('change', syncCurrentResults);
elements.roundsHistory.addEventListener('click', (event) => {
  const reopenButton = event.target.closest('[data-reopen-round]');
  if (reopenButton) {
    const roundIndex = Number.parseInt(reopenButton.dataset.reopenRound, 10);
    if (window.confirm(`Reopen round ${roundIndex + 1}? Later rounds will be removed.`)) {
      reopenRound(roundIndex);
    }
    return;
  }
  const truncateButton = event.target.closest('[data-truncate-round]');
  if (truncateButton) {
    const roundIndex = Number.parseInt(truncateButton.dataset.truncateRound, 10);
    if (window.confirm(`Keep only rounds through round ${roundIndex + 1}? Later rounds will be removed.`)) {
      truncateThroughRound(roundIndex);
    }
  }
});
elements.importFileInput.addEventListener('change', async () => {
  const [file] = elements.importFileInput.files;
  elements.importFileInput.value = '';
  if (!file) return;
  try {
    await importTournamentFile(file);
  } catch (error) {
    showToast(error.message, 'error');
  }
});
elements.importPlayersInput.addEventListener('change', async () => {
  const [file] = elements.importPlayersInput.files;
  elements.importPlayersInput.value = '';
  if (!file) return;
  try {
    await importPlayersFile(file);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

loadState();
renderAll();
checkEngine();
