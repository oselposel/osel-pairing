import json
import os
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def find_node_executable():
    configured = shutil.which("node")
    bundled = (
        Path.home()
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "node"
        / "bin"
        / ("node.exe" if shutil.which("where") else "node")
    )
    for candidate in [Path(configured) if configured else None, bundled]:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate
    return None


def build_standings(players, rounds, pairing_system="swiss"):
    node = find_node_executable()
    if not node:
        raise unittest.SkipTest("Node.js executable not found")

    script = """
const { pathToFileURL } = await import('node:url');
const { buildStandings } = await import(pathToFileURL(process.env.STANDINGS_MODULE).href);

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
}
const payload = JSON.parse(input);
const standings = buildStandings(payload.players, payload.rounds, payload.pairingSystem);
process.stdout.write(JSON.stringify(standings));
"""
    completed = subprocess.run(
        [str(node), "--input-type=module", "--eval", script],
        cwd=ROOT,
        input=json.dumps({
            "players": players,
            "rounds": rounds,
            "pairingSystem": pairing_system,
        }),
        text=True,
        capture_output=True,
        env={**os.environ, "STANDINGS_MODULE": str(ROOT / "standings.mjs")},
        check=False,
    )
    if completed.returncode != 0:
        raise AssertionError(completed.stderr)
    return json.loads(completed.stdout)


class StandingsTieBreakTests(unittest.TestCase):
    def test_buchholz_decides_before_rating_when_scores_are_equal(self):
        players = [
            {"id": "low", "name": "Low rated", "ratingFinal": 1000},
            {"id": "high", "name": "High rated", "ratingFinal": 2500},
            {"id": "c", "name": "Opponent C", "ratingFinal": 2400},
            {"id": "d", "name": "Opponent D", "ratingFinal": 2300},
            {"id": "e", "name": "Opponent E", "ratingFinal": 1200},
            {"id": "f", "name": "Opponent F", "ratingFinal": 1100},
        ]
        rounds = [
            {"pairings": [
                {"whiteId": "low", "blackId": "c", "result": "1-0"},
                {"whiteId": "high", "blackId": "e", "result": "1-0"},
                {"whiteId": "d", "blackId": "f", "result": "1-0"},
            ]},
            {"pairings": [
                {"whiteId": "c", "blackId": "high", "result": "1-0"},
                {"whiteId": "d", "blackId": "low", "result": "1-0"},
                {"whiteId": "e", "blackId": "f", "result": "1-0"},
            ]},
        ]

        standings = build_standings(players, rounds)
        low = next(player for player in standings if player["id"] == "low")
        high = next(player for player in standings if player["id"] == "high")

        self.assertEqual(low["score"], high["score"])
        self.assertGreater(low["buchholz"], high["buchholz"])
        self.assertLess(low["ratingFinal"], high["ratingFinal"])
        self.assertLess(low["rank"], high["rank"])

    def test_swiss_bye_scores_but_round_robin_bye_does_not(self):
        players = [{"id": "a", "name": "A", "ratingFinal": 1000}]
        rounds = [{"pairings": [{"byeId": "a", "result": "bye"}]}]

        swiss = build_standings(players, rounds, "swiss")
        round_robin = build_standings(players, rounds, "round-robin")

        self.assertEqual(swiss[0]["score"], 1)
        self.assertEqual(round_robin[0]["score"], 0)
        self.assertEqual(swiss[0]["buchholz"], 0)


if __name__ == "__main__":
    unittest.main()
