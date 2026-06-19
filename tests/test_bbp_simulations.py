import os
import platform
import unittest
from pathlib import Path

from server.bbp_bridge import generate_pairings


ROOT = Path(__file__).resolve().parents[1]


def find_bbp_executable():
    configured = os.getenv("BBP_PAIRINGS_EXE")
    exe_name = "bbpPairings.exe" if platform.system() == "Windows" else "bbpPairings"
    candidates = [
        Path(configured) if configured else None,
        ROOT / "tools" / "bbpPairings" / exe_name,
        ROOT.parent / "sachy-uh" / "tools" / "bbpPairings" / exe_name,
    ]
    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate
    return None


def make_players(count):
    return [
        {
            "id": f"P{index:02d}",
            "name": f"Player {index:02d}",
            "ratingFinal": 3000 - index,
        }
        for index in range(1, count + 1)
    ]


def cyclic_result(pairing, round_number, board_number):
    if pairing.get("byeId"):
        return "bye"
    selector = (round_number + board_number) % 3
    if selector == 0:
        return "1-0"
    if selector == 1:
        return "0-1"
    return "0.5-0.5"


def stronger_seed_wins(pairing, _round_number, _board_number):
    if pairing.get("byeId"):
        return "bye"
    white_number = int(pairing["whiteId"][1:])
    black_number = int(pairing["blackId"][1:])
    return "1-0" if white_number < black_number else "0-1"


def draw_heavy_result(pairing, round_number, board_number):
    if pairing.get("byeId"):
        return "bye"
    if (round_number + board_number) % 4 == 0:
        return "1-0"
    if (round_number + board_number) % 5 == 0:
        return "0-1"
    return "0.5-0.5"


RESULT_SCENARIOS = {
    "cyclic": cyclic_result,
    "stronger_seed_wins": stronger_seed_wins,
    "draw_heavy": draw_heavy_result,
}


class BbpSimulationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bbp_executable = find_bbp_executable()
        if not cls.bbp_executable:
            raise unittest.SkipTest("bbpPairings executable not found")

    def test_reference_engine_simulates_20_to_30_players_for_11_rounds(self):
        for player_count in range(20, 31):
            for scenario_name, result_strategy in RESULT_SCENARIOS.items():
                with self.subTest(player_count=player_count, scenario=scenario_name):
                    self.assert_valid_simulation(player_count, round_count=11, result_strategy=result_strategy)

    def assert_valid_simulation(self, player_count, round_count, result_strategy):
        players = make_players(player_count)
        player_ids = {player["id"] for player in players}
        rounds = []
        seen_pairs = set()
        bye_players = set()

        for round_number in range(1, round_count + 1):
            response = generate_pairings(
                {
                    "players": players,
                    "rounds": rounds,
                    "expectedRounds": round_count,
                },
                ROOT,
                self.bbp_executable,
            )
            pairings = response["pairings"]
            used_players = set()
            current_round = {"pairings": []}

            for board_number, pairing in enumerate(pairings, start=1):
                if pairing.get("byeId"):
                    bye_id = pairing["byeId"]
                    self.assertIn(bye_id, player_ids)
                    self.assertNotIn(bye_id, used_players)
                    self.assertNotIn(bye_id, bye_players)
                    used_players.add(bye_id)
                    bye_players.add(bye_id)
                    current_round["pairings"].append({
                        "byeId": bye_id,
                        "result": "bye",
                    })
                    continue

                white_id = pairing["whiteId"]
                black_id = pairing["blackId"]
                self.assertIn(white_id, player_ids)
                self.assertIn(black_id, player_ids)
                self.assertNotEqual(white_id, black_id)
                self.assertNotIn(white_id, used_players)
                self.assertNotIn(black_id, used_players)

                pair_key = frozenset((white_id, black_id))
                self.assertNotIn(pair_key, seen_pairs)
                seen_pairs.add(pair_key)
                used_players.update((white_id, black_id))

                current_round["pairings"].append({
                    "whiteId": white_id,
                    "blackId": black_id,
                    "result": result_strategy(pairing, round_number, board_number),
                })

            self.assertEqual(used_players, player_ids)
            if player_count % 2 == 0:
                self.assertFalse(any(pairing.get("byeId") for pairing in pairings))
                self.assertEqual(len(pairings), player_count // 2)
            else:
                self.assertEqual(sum(1 for pairing in pairings if pairing.get("byeId")), 1)
                self.assertEqual(len(pairings), (player_count + 1) // 2)

            rounds.append(current_round)

        self.assertEqual(len(rounds), round_count)


if __name__ == "__main__":
    unittest.main()
