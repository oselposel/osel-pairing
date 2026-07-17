const REFEREE_PASSWORD = '11';
const RESULT_OPTIONS = ['1-0', '0.5-0.5', '0-1'];
const ROUND_ROBIN_SYSTEM = 'round-robin';

const elements = {
  engineStatus: document.getElementById('engineStatus'),
  menuButton: document.getElementById('menuButton'),
  menuPanel: document.getElementById('menuPanel'),
  loginBox: document.getElementById('loginBox'),
  refereeBox: document.getElementById('refereeBox'),
  passwordInput: document.getElementById('passwordInput'),
  loginButton: document.getElementById('loginButton'),
  logoutButton: document.getElementById('logoutButton'),
  refreshButton: document.getElementById('refreshButton'),
  tabsNav: document.getElementById('tabsNav'),
  tabButtons: document.querySelectorAll('[data-tab]'),
  overviewTab: document.getElementById('overviewTab'),
  roundsTab: document.getElementById('roundsTab'),
  startlistTab: document.getElementById('startlistTab'),
  adminPanel: document.getElementById('adminPanel'),
  standingsView: document.getElementById('standingsView'),
  startListView: document.getElementById('startListView'),
  playersInput: document.getElementById('playersInput'),
  pairingSystemSelect: document.getElementById('pairingSystemSelect'),
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
  ['Jiří', 15],
  ['Attila', 14],
  ['Jan Bulhař', 13],
  ['e2e4', 12],
  ['David Lukaštík', 11],
  ['Adéla', 10],
  ['Tomáš Lajsek', 9],
  ['Karel Machů', 8],
  ['Albert Beatus', 7],
  ['Jarek Sháněl', 6],
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
  pairingSystem: 'swiss',
};

let isReferee = sessionStorage.getItem('osel.referee') === '1';
let editingRoundIndex = null;

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
      return {
        id: playerIdFromName(name),
        name,
        ratingFinal: Number.parseInt(rawRating.trim(), 10) || 0,
      };
    });
}

function formatPlayers(players) {
  return players.map((player) => `${player.name};${player.ratingFinal}`).join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

function playerNameById(players, id) {
  return players.find((player) => player.id === id)?.name || id;
}

function scoreFromResult(result) {
  if (result === '1-0') return [1, 0];
  if (result === '0-1') return [0, 1];
  if (result === '0.5-0.5') return [0.5, 0.5];
  return [0, 0];
}

function normalizePairingSystem(value) {
  return value === ROUND_ROBIN_SYSTEM ? ROUND_ROBIN_SYSTEM : 'swiss';
}

function getScoreMap(players, rounds) {
  const scores = Object.fromEntries(players.map((player) => [player.id, 0]));
  rounds.forEach((round) => {
    round.pairings.forEach((pairing) => {
      if (pairing.byeId) {
        if (state.pairingSystem !== ROUND_ROBIN_SYSTEM) {
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

function getStandings(players) {
  const scores = getScoreMap(players, state.rounds);
  return [...players]
    .sort((a, b) => {
      const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
      if (scoreDiff !== 0) return scoreDiff;
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
    }));
}

function renderStandings(players) {
  const standings = getStandings(players);
  if (!standings.length) {
    elements.standingsView.className = 'empty-state';
    elements.standingsView.textContent = 'Zatím nejsou zadaní hráči.';
    return;
  }
  elements.standingsView.className = '';
  elements.standingsView.innerHTML = `
    <table class="standings-table">
      <thead>
        <tr><th>#</th><th>Hráč</th><th>Rating</th><th>Body</th></tr>
      </thead>
      <tbody>
        ${standings.map((player) => `
          <tr>
            <td>${player.rank}</td>
            <td>${escapeHtml(player.name)}</td>
            <td>${player.ratingFinal}</td>
            <td><strong>${player.score}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderStartList(players) {
  if (!players.length) {
    elements.startListView.className = 'empty-state';
    elements.startListView.textContent = 'Startovní listina je prázdná.';
    return;
  }
  elements.startListView.className = '';
  elements.startListView.innerHTML = `
    <table class="start-table">
      <thead>
        <tr><th>#</th><th>Hráč</th><th>Rating</th></tr>
      </thead>
      <tbody>
        ${players.map((player, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(player.name)}</td>
            <td>${player.ratingFinal}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderCurrentRound(players) {
  if (!state.currentPairings.length) {
    elements.currentRound.className = 'empty-state';
    elements.currentRound.textContent = 'Další kolo zatím není nasazeno.';
    return;
  }
  elements.currentRound.className = '';
  elements.currentRound.innerHTML = `
    <table class="pairing-table">
      <thead>
        <tr>
          <th>Šach.</th>
          <th>Bílý</th>
          <th>Černý</th>
          ${isReferee ? '<th class="result-cell">Výsledek</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${state.currentPairings.map((pairing, index) => {
          if (pairing.byeId) {
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(pairing.byeName || playerNameById(players, pairing.byeId))}</td>
                <td>volno</td>
                ${isReferee ? '<td>bye</td>' : ''}
              </tr>
            `;
          }
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(pairing.whiteName || playerNameById(players, pairing.whiteId))}</td>
              <td>${escapeHtml(pairing.blackName || playerNameById(players, pairing.blackId))}</td>
              ${isReferee ? `
                <td>
                  <select data-result-index="${index}" aria-label="Výsledek na šachovnici ${index + 1}">
                    <option value="">Vybrat</option>
                    ${RESULT_OPTIONS.map((option) => `
                      <option value="${option}" ${pairing.result === option ? 'selected' : ''}>${option}</option>
                    `).join('')}
                  </select>
                </td>
              ` : ''}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderHistory(players) {
  if (!state.rounds.length) {
    elements.roundsHistory.className = 'empty-state';
    elements.roundsHistory.textContent = 'Zatím není uložené žádné kolo.';
    return;
  }
  elements.roundsHistory.className = '';
  elements.roundsHistory.innerHTML = state.rounds.map((round, roundIndex) => {
    const isEditing = isReferee && editingRoundIndex === roundIndex;
    return `
    <div class="round-block">
      <div class="round-heading">
        <h3>Kolo ${round.round}</h3>
        ${isReferee ? `
          <div class="button-row">
            ${isEditing ? `
              <button type="button" class="small-button primary" data-save-round-edit="${roundIndex}">Uložit opravu</button>
              <button type="button" class="small-button" data-cancel-round-edit>Zrušit</button>
            ` : `
              <button type="button" class="small-button" data-edit-round="${roundIndex}">Upravit výsledky</button>
            `}
            <button type="button" class="small-button" data-truncate-round="${roundIndex}">Vrátit po kole</button>
          </div>
        ` : ''}
      </div>
      <table class="round-table">
        <thead>
          <tr><th>Šach.</th><th>Bílý</th><th>Černý</th><th>Výsledek</th></tr>
        </thead>
        <tbody>
          ${round.pairings.map((pairing, index) => {
            if (pairing.byeId) {
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(playerNameById(players, pairing.byeId))}</td>
                  <td>volno</td>
                  <td>bye</td>
                </tr>
              `;
            }
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(playerNameById(players, pairing.whiteId))}</td>
                <td>${escapeHtml(playerNameById(players, pairing.blackId))}</td>
                <td>
                  ${isEditing ? `
                    <select data-edit-round="${roundIndex}" data-edit-pairing="${index}" aria-label="Výsledek kola ${round.round}, šachovnice ${index + 1}">
                      ${RESULT_OPTIONS.map((option) => `
                        <option value="${option}" ${pairing.result === option ? 'selected' : ''}>${option}</option>
                      `).join('')}
                    </select>
                  ` : escapeHtml(pairing.result)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  }).join('');
}

function renderAdminState() {
  elements.adminPanel.hidden = !isReferee;
  elements.loginBox.hidden = isReferee;
  elements.refereeBox.hidden = !isReferee;
  if (isReferee) {
    elements.playersInput.value = state.playersText;
    elements.pairingSystemSelect.value = normalizePairingSystem(state.pairingSystem);
    elements.pairingSystemSelect.disabled = Boolean(state.rounds.length || state.currentPairings.length);
  }
}

function renderAll() {
  const players = parsePlayers(state.playersText);
  renderAdminState();
  renderCurrentRound(players);
  renderStandings(players);
  renderHistory(players);
  renderStartList(players);
}

async function checkEngine() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Párovací program není připraven.');
    }
    elements.engineStatus.textContent = 'Párovací program je připraven';
    elements.engineStatus.className = 'engine-status ok';
  } catch (error) {
    elements.engineStatus.textContent = error.message;
    elements.engineStatus.className = 'engine-status fail';
  }
}

async function loadSharedState(showMessage = false) {
  const response = await fetch('/api/state', { cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Nepodařilo se načíst turnaj.');
  }
  state = {
    playersText: payload.state.playersText || '',
    rounds: Array.isArray(payload.state.rounds) ? payload.state.rounds : [],
    currentPairings: Array.isArray(payload.state.currentPairings) ? payload.state.currentPairings : [],
    pairingSystem: normalizePairingSystem(payload.state.pairingSystem),
  };
  renderAll();
  if (showMessage) {
    showToast('Turnaj obnoven ze serveru.');
  }
}

async function persistState(message = 'Uloženo.') {
  if (!isReferee) {
    throw new Error('Pro ukládání se přihlaste jako rozhodčí.');
  }
  const response = await fetch('/api/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Referee-Password': REFEREE_PASSWORD,
    },
    body: JSON.stringify(state),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Nepodařilo se uložit turnaj.');
  }
  state = payload.state;
  renderAll();
  if (message) {
    showToast(message);
  }
}

async function savePlayers() {
  state.playersText = elements.playersInput.value;
  state.currentPairings = [];
  await persistState('Hráči uloženi.');
}

async function generatePairings() {
  const players = parsePlayers(elements.playersInput.value);
  if (players.length < 2) {
    showToast('Zadejte alespoň dva hráče.', 'warn');
    return;
  }
  state.playersText = elements.playersInput.value;
  elements.generateButton.disabled = true;
  try {
    const isRoundRobin = state.pairingSystem === ROUND_ROBIN_SYSTEM;
    const response = await fetch(isRoundRobin ? '/api/round-robin' : '/api/pairings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isRoundRobin
        ? {
          players,
          roundNumber: state.rounds.length + 1,
        }
        : {
          players,
          rounds: state.rounds,
          expectedRounds: Math.max(state.rounds.length + 1, Math.ceil(players.length / 2)),
        }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || 'Párování selhalo.');
    }
    state.currentPairings = payload.pairings;
    await persistState(`Kolo ${state.rounds.length + 1} vygenerováno.`);
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

async function saveRoundResults() {
  if (!state.currentPairings.length) {
    showToast('Nejdřív vygenerujte kolo.', 'warn');
    return;
  }
  syncCurrentResults();
  const incomplete = state.currentPairings.some((pairing) => !pairing.byeId && !pairing.result);
  if (incomplete) {
    showToast('Doplňte všechny výsledky.', 'warn');
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
  await persistState('Výsledky kola uloženy.');
}

function tournamentExport() {
  return {
    format: 'osel-pairing-tournament',
    version: 2,
    exportedAt: new Date().toISOString(),
    playersText: state.playersText,
    players: parsePlayers(state.playersText),
    rounds: state.rounds,
    currentPairings: state.currentPairings,
    pairingSystem: normalizePairingSystem(state.pairingSystem),
  };
}

function exportState() {
  elements.exportOutput.value = JSON.stringify(tournamentExport(), null, 2);
  elements.exportDialog.showModal();
}

function downloadTournamentJson() {
  downloadText(
    `turnaj-${safeTimestamp()}.json`,
    JSON.stringify(tournamentExport(), null, 2),
    'application/json;charset=utf-8',
  );
}

function exportPlayersCsv() {
  const rows = [
    ['jmeno', 'rating'],
    ...parsePlayers(state.playersText).map((player) => [player.name, player.ratingFinal]),
  ];
  downloadText(`startovni-listina-${safeTimestamp()}.csv`, rows.map((row) => row.map(csvEscape).join(';')).join('\n'), 'text/csv;charset=utf-8');
}

function exportStandingsCsv() {
  const rows = [
    ['poradi', 'jmeno', 'rating', 'body'],
    ...getStandings(parsePlayers(state.playersText)).map((player) => [player.rank, player.name, player.ratingFinal, player.score]),
  ];
  downloadText(`poradi-${safeTimestamp()}.csv`, rows.map((row) => row.map(csvEscape).join(';')).join('\n'), 'text/csv;charset=utf-8');
}

function exportRoundsCsv() {
  const players = parsePlayers(state.playersText);
  const rows = [['kolo', 'sachovnice', 'bily', 'cerny', 'vysledek']];
  state.rounds.forEach((round) => {
    round.pairings.forEach((pairing, index) => {
      if (pairing.byeId) {
        rows.push([round.round, index + 1, playerNameById(players, pairing.byeId), 'volno', 'bye']);
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
  downloadText(`vysledky-kol-${safeTimestamp()}.csv`, rows.map((row) => row.map(csvEscape).join(';')).join('\n'), 'text/csv;charset=utf-8');
}

async function importTournament(payload) {
  const playersText = payload.playersText || (
    Array.isArray(payload.players) ? formatPlayers(payload.players) : ''
  );
  if (!playersText.trim()) {
    throw new Error('Import neobsahuje startovní listinu.');
  }
  state = {
    playersText,
    rounds: Array.isArray(payload.rounds) ? payload.rounds : [],
    currentPairings: Array.isArray(payload.currentPairings) ? payload.currentPairings : [],
    pairingSystem: normalizePairingSystem(payload.pairingSystem),
  };
  await persistState('Turnaj importován.');
}

async function importTournamentFile(file) {
  await importTournament(JSON.parse(await file.text()));
}

async function importPlayersFile(file) {
  if ((state.rounds.length || state.currentPairings.length)
    && !window.confirm('Import startovní listiny smaže uložená kola a aktuální nasazení. Pokračovat?')) {
    return;
  }
  const players = parsePlayersCsv(await file.text());
  if (players.length < 2) {
    throw new Error('Startovní listina musí obsahovat alespoň dva hráče.');
  }
  state = {
    playersText: formatPlayers(players),
    rounds: [],
    currentPairings: [],
    pairingSystem: normalizePairingSystem(state.pairingSystem),
  };
  await persistState('Startovní listina importována.');
}

function buildPrintDocument() {
  const players = parsePlayers(state.playersText);
  const standings = getStandings(players);
  return `
    <!doctype html>
    <html lang="cs">
    <head>
      <meta charset="utf-8">
      <title>Export turnaje</title>
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
      <h1>Export turnaje</h1>
      <p>${new Date().toLocaleString('cs-CZ')}</p>
      <h2>Startovní listina</h2>
      <table>
        <thead><tr><th>#</th><th>Hráč</th><th>Rating</th></tr></thead>
        <tbody>
          ${players.map((player, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(player.name)}</td><td>${player.ratingFinal}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2>Pořadí</h2>
      <table>
        <thead><tr><th>#</th><th>Hráč</th><th>Rating</th><th>Body</th></tr></thead>
        <tbody>
          ${standings.map((player) => `<tr><td>${player.rank}</td><td>${escapeHtml(player.name)}</td><td>${player.ratingFinal}</td><td>${player.score}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2 class="page-break">Výsledky kol</h2>
      ${state.rounds.map((round) => `
        <h2>Kolo ${round.round}</h2>
        <table>
          <thead><tr><th>Šach.</th><th>Bílý</th><th>Černý</th><th>Výsledek</th></tr></thead>
          <tbody>
            ${round.pairings.map((pairing, index) => {
              if (pairing.byeId) {
                return `<tr><td>${index + 1}</td><td>${escapeHtml(playerNameById(players, pairing.byeId))}</td><td>volno</td><td>bye</td></tr>`;
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
    showToast('Pro tisk PDF povolte vyskakovací okna.', 'warn');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildPrintDocument());
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

async function truncateThroughRound(roundIndex) {
  editingRoundIndex = null;
  state.rounds = state.rounds.slice(0, roundIndex + 1);
  state.currentPairings = [];
  await persistState(`Turnaj vrácen po kole ${roundIndex + 1}.`);
}

async function reopenRound(roundIndex) {
  const players = parsePlayers(state.playersText);
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
  await persistState(`Kolo ${roundIndex + 1} otevřeno k opravě.`);
}

async function saveRoundEdit(roundIndex) {
  const round = state.rounds[roundIndex];
  if (!round) return;

  const hasFutureData = roundIndex < state.rounds.length - 1 || state.currentPairings.length > 0;
  if (hasFutureData && !window.confirm(`Uložit opravu kola ${roundIndex + 1}? Pozdější kola a aktuální nasazení se odstraní.`)) {
    return;
  }

  const editedPairings = round.pairings.map((pairing, pairingIndex) => {
    if (pairing.byeId) {
      return { byeId: pairing.byeId, result: 'bye' };
    }
    const select = elements.roundsHistory.querySelector(
      `select[data-edit-round="${roundIndex}"][data-edit-pairing="${pairingIndex}"]`,
    );
    return {
      whiteId: pairing.whiteId,
      blackId: pairing.blackId,
      result: select?.value || pairing.result,
    };
  });

  state.rounds = state.rounds.slice(0, roundIndex + 1);
  state.rounds[roundIndex] = {
    ...round,
    pairings: editedPairings,
  };
  state.currentPairings = [];
  editingRoundIndex = null;
  await persistState(`Výsledky kola ${roundIndex + 1} opraveny.`);
}

function cancelRoundEdit() {
  editingRoundIndex = null;
  renderAll();
}

function setActiveTab(tabName) {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  elements.overviewTab.classList.toggle('active', tabName === 'overview');
  elements.roundsTab.classList.toggle('active', tabName === 'rounds');
  elements.startlistTab.classList.toggle('active', tabName === 'startlist');
}

function toggleMenu(force) {
  const shouldShow = typeof force === 'boolean' ? force : elements.menuPanel.hidden;
  elements.menuPanel.hidden = !shouldShow;
  elements.menuButton.setAttribute('aria-expanded', String(shouldShow));
}

function loginReferee() {
  if (elements.passwordInput.value !== REFEREE_PASSWORD) {
    showToast('Nesprávné heslo.', 'error');
    return;
  }
  isReferee = true;
  sessionStorage.setItem('osel.referee', '1');
  elements.passwordInput.value = '';
  toggleMenu(false);
  renderAll();
  showToast('Rozhodčí přihlášen.');
}

function logoutReferee() {
  isReferee = false;
  sessionStorage.removeItem('osel.referee');
  renderAll();
  showToast('Rozhodčí odhlášen.');
}

elements.menuButton.addEventListener('click', () => toggleMenu());
elements.loginButton.addEventListener('click', loginReferee);
elements.passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') loginReferee();
});
elements.logoutButton.addEventListener('click', logoutReferee);
elements.refreshButton.addEventListener('click', async () => {
  try {
    await loadSharedState(true);
  } catch (error) {
    showToast(error.message, 'error');
  }
});
elements.tabsNav.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  setActiveTab(button.dataset.tab);
});
document.addEventListener('click', (event) => {
  if (!elements.menuPanel.hidden && !event.target.closest('.menu-wrap')) {
    toggleMenu(false);
  }
});

elements.loadSampleButton.addEventListener('click', () => {
  elements.playersInput.value = formatPlayers(samplePlayers.map(([name, ratingFinal]) => ({ name, ratingFinal })));
  state.rounds = [];
  state.currentPairings = [];
});
elements.pairingSystemSelect.addEventListener('change', () => {
  state.playersText = elements.playersInput.value;
  state.pairingSystem = normalizePairingSystem(elements.pairingSystemSelect.value);
  persistState('Varianta nasazení uložena.').catch((error) => showToast(error.message, 'error'));
});
elements.sortPlayersButton.addEventListener('click', () => {
  const players = parsePlayers(elements.playersInput.value)
    .sort((a, b) => {
      const ratingDiff = (b.ratingFinal || 0) - (a.ratingFinal || 0);
      if (ratingDiff !== 0) return ratingDiff;
      return a.name.localeCompare(b.name, 'cs');
    });
  elements.playersInput.value = formatPlayers(players);
});
elements.clearButton.addEventListener('click', async () => {
  if (!window.confirm('Opravdu vymazat celý turnaj pro všechny uživatele?')) return;
  state = { playersText: '', rounds: [], currentPairings: [], pairingSystem: 'swiss' };
  await persistState('Turnaj vymazán.');
});
elements.savePlayersButton.addEventListener('click', () => {
  savePlayers().catch((error) => showToast(error.message, 'error'));
});
elements.generateButton.addEventListener('click', generatePairings);
elements.saveRoundButton.addEventListener('click', () => {
  saveRoundResults().catch((error) => showToast(error.message, 'error'));
});
elements.currentRound.addEventListener('change', syncCurrentResults);
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
  showToast('Export zkopírován.');
});
elements.roundsHistory.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-round]');
  if (editButton && editButton.tagName === 'BUTTON') {
    editingRoundIndex = Number.parseInt(editButton.dataset.editRound, 10);
    renderAll();
    return;
  }
  const saveEditButton = event.target.closest('[data-save-round-edit]');
  if (saveEditButton) {
    const roundIndex = Number.parseInt(saveEditButton.dataset.saveRoundEdit, 10);
    saveRoundEdit(roundIndex).catch((error) => showToast(error.message, 'error'));
    return;
  }
  const cancelEditButton = event.target.closest('[data-cancel-round-edit]');
  if (cancelEditButton) {
    cancelRoundEdit();
    return;
  }
  const truncateButton = event.target.closest('[data-truncate-round]');
  if (truncateButton) {
    const roundIndex = Number.parseInt(truncateButton.dataset.truncateRound, 10);
    if (window.confirm(`Vrátit turnaj po kole ${roundIndex + 1}? Pozdější kola se odstraní.`)) {
      truncateThroughRound(roundIndex).catch((error) => showToast(error.message, 'error'));
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

checkEngine();
loadSharedState().catch((error) => showToast(error.message, 'error'));
window.setInterval(() => {
  if (!isReferee) {
    loadSharedState().catch(() => {});
  }
}, 15000);
