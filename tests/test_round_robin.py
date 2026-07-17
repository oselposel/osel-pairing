import unittest

from server.round_robin import (
    RoundRobinPairingError,
    build_round_robin_schedule,
    generate_round_robin_pairings,
)


def make_players(count):
    return [
        {"id": f"P{index:02d}", "name": f"Player {index:02d}"}
        for index in range(1, count + 1)
    ]


class RoundRobinTests(unittest.TestCase):
    def test_complete_schedules_for_2_to_50_players(self):
        for player_count in range(2, 51):
            with self.subTest(player_count=player_count):
                players = make_players(player_count)
                player_ids = {player["id"] for player in players}
                schedule = build_round_robin_schedule(players)
                expected_rounds = player_count - 1 if player_count % 2 == 0 else player_count
                self.assertEqual(len(schedule), expected_rounds)

                seen_pairs = set()
                bye_counts = {player_id: 0 for player_id in player_ids}
                color_counts = {
                    player_id: {"white": 0, "black": 0}
                    for player_id in player_ids
                }

                for pairings in schedule:
                    used_players = set()
                    byes_in_round = 0
                    for pairing in pairings:
                        if pairing.get("byeId"):
                            bye_id = pairing["byeId"]
                            self.assertIn(bye_id, player_ids)
                            self.assertNotIn(bye_id, used_players)
                            self.assertEqual(pairing["result"], "bye")
                            used_players.add(bye_id)
                            bye_counts[bye_id] += 1
                            byes_in_round += 1
                            continue

                        white_id = pairing["whiteId"]
                        black_id = pairing["blackId"]
                        self.assertIn(white_id, player_ids)
                        self.assertIn(black_id, player_ids)
                        self.assertNotEqual(white_id, black_id)
                        self.assertNotIn(white_id, used_players)
                        self.assertNotIn(black_id, used_players)
                        self.assertIsNone(pairing["result"])

                        pair_key = frozenset((white_id, black_id))
                        self.assertNotIn(pair_key, seen_pairs)
                        seen_pairs.add(pair_key)
                        used_players.update((white_id, black_id))
                        color_counts[white_id]["white"] += 1
                        color_counts[black_id]["black"] += 1

                    self.assertEqual(used_players, player_ids)
                    self.assertEqual(byes_in_round, player_count % 2)

                self.assertEqual(len(seen_pairs), player_count * (player_count - 1) // 2)
                expected_byes = 1 if player_count % 2 else 0
                self.assertTrue(all(count == expected_byes for count in bye_counts.values()))
                self.assertTrue(all(
                    abs(counts["white"] - counts["black"]) <= 2
                    for counts in color_counts.values()
                ))

    def test_api_returns_requested_round_and_total(self):
        response = generate_round_robin_pairings({
            "players": make_players(5),
            "roundNumber": 3,
        })

        self.assertTrue(response["success"])
        self.assertEqual(response["system"], "round-robin")
        self.assertEqual(response["roundNumber"], 3)
        self.assertEqual(response["totalRounds"], 5)
        self.assertEqual(len(response["pairings"]), 3)

    def test_api_rejects_round_after_schedule_end(self):
        with self.assertRaisesRegex(RoundRobinPairingError, "pouze 3 kol"):
            generate_round_robin_pairings({
                "players": make_players(4),
                "roundNumber": 4,
            })

    def test_duplicate_player_ids_are_rejected(self):
        players = make_players(3)
        players[2]["id"] = players[0]["id"]
        with self.assertRaisesRegex(RoundRobinPairingError, "Duplicitní ID"):
            build_round_robin_schedule(players)


if __name__ == "__main__":
    unittest.main()
