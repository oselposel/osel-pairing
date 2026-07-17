class RoundRobinPairingError(ValueError):
    pass


def _normalize_players(raw_players):
    if not isinstance(raw_players, list) or len(raw_players) < 2:
        raise RoundRobinPairingError("Zadejte alespoň dva hráče.")

    players = []
    player_ids = set()
    for raw_player in raw_players:
        if not isinstance(raw_player, dict):
            raise RoundRobinPairingError("Neplatný hráč ve startovní listině.")

        player_id = str(raw_player.get("id") or "").strip()
        player_name = str(raw_player.get("name") or player_id).strip()
        if not player_id or not player_name:
            raise RoundRobinPairingError("Každý hráč musí mít ID a jméno.")
        if player_id in player_ids:
            raise RoundRobinPairingError(f"Duplicitní ID hráče: {player_id}")

        player_ids.add(player_id)
        players.append({"id": player_id, "name": player_name})

    return players


def build_round_robin_schedule(raw_players):
    players = _normalize_players(raw_players)
    rotation = [*players]
    if len(rotation) % 2:
        rotation.append(None)

    schedule = []
    for round_index in range(len(rotation) - 1):
        games = []
        bye = None

        for board_index in range(len(rotation) // 2):
            first = rotation[board_index]
            second = rotation[-1 - board_index]
            if first is None or second is None:
                idle_player = second if first is None else first
                bye = {
                    "byeId": idle_player["id"],
                    "byeName": idle_player["name"],
                    "result": "bye",
                }
                continue

            if board_index == 0 and round_index % 2:
                white, black = second, first
            else:
                white, black = first, second

            games.append({
                "whiteId": white["id"],
                "whiteName": white["name"],
                "blackId": black["id"],
                "blackName": black["name"],
                "result": None,
            })

        if bye:
            games.append(bye)
        schedule.append(games)
        rotation = [rotation[0], rotation[-1], *rotation[1:-1]]

    return schedule


def generate_round_robin_pairings(payload):
    if not isinstance(payload, dict):
        raise RoundRobinPairingError("Neplatná data turnaje.")

    schedule = build_round_robin_schedule(payload.get("players"))
    round_number = payload.get("roundNumber")
    if round_number is None:
        rounds = payload.get("rounds")
        round_number = len(rounds) + 1 if isinstance(rounds, list) else 1
    if isinstance(round_number, bool) or not isinstance(round_number, int):
        raise RoundRobinPairingError("Číslo kola musí být celé číslo.")
    if round_number < 1 or round_number > len(schedule):
        raise RoundRobinPairingError(
            f"Turnaj každý s každým má pouze {len(schedule)} kol."
        )

    return {
        "success": True,
        "system": "round-robin",
        "roundNumber": round_number,
        "totalRounds": len(schedule),
        "pairings": schedule[round_number - 1],
    }
