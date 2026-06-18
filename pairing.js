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
  exportDialog: document.getElementById('exportDialog'),
  exportOutput: document.getElementById('exportOutput'),
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

function renderStandings(players) {
  const scores = getScoreMap(players, state.rounds);
  const sorted = [...players].sort((a, b) => {
    const scoreDiff = (scores[b.id] || 0) - (scores[a.id] || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const ratingDiff = (b.ratingFinal || 0) - (a.ratingFinal || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return a.name.localeCompare(b.name);
  });
  if (!sorted.length) {
    return '';
  }
  return `
    <div class="standings">
      ${sorted.map((player, index) => `
        <div class="standings-row">
          <span>${index + 1}.</span>
          <span>${escapeHtml(player.name)}</span>
          <strong>${scores[player.id] || 0}</strong>
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
    ${state.rounds.map((round) => `
      <div class="round-block">
        <h3>Round ${round.round}</h3>
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

function exportState() {
  state.playersText = elements.playersInput.value;
  elements.exportOutput.value = JSON.stringify({
    players: parsePlayers(state.playersText),
    rounds: state.rounds,
    currentPairings: state.currentPairings,
  }, null, 2);
  elements.exportDialog.showModal();
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
elements.copyExportButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(elements.exportOutput.value);
  showToast('Export copied.');
});
elements.currentRound.addEventListener('change', syncCurrentResults);

loadState();
renderAll();
checkEngine();
