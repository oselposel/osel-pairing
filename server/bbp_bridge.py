import json
import os
import platform
import subprocess
import tempfile
from pathlib import Path


class BbpPairingError(Exception):
    pass


def default_bbp_candidates(root):
    exe_name = "bbpPairings.exe" if platform.system() == "Windows" else "bbpPairings"
    return [
        root / "tools" / "bbpPairings" / exe_name,
        root / "tools" / "bbpPairings-v6.0.0" / exe_name,
        Path(os.getenv("LOCALAPPDATA", "")) / "Temp" / "bbpPairings-v6.0.0-win" / "bbpPairings-v6.0.0" / "bbpPairings.exe",
    ]


def resolve_bbp_executable(root, configured=None):
    candidates = []
    if configured:
        candidates.append(Path(configured))
    env_value = os.getenv("BBP_PAIRINGS_EXE")
    if env_value:
        candidates.append(Path(env_value))
    candidates.extend(default_bbp_candidates(root))

    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate

    checked = "\n".join(str(candidate) for candidate in candidates if candidate)
    raise BbpPairingError(
        "bbpPairings executable was not found. Set BBP_PAIRINGS_EXE or pass --bbp. "
        "Checked:\n" + checked
    )


def score_from_result(result):
    if result == "1-0":
        return 1.0, 0.0
    if result == "0-1":
        return 0.0, 1.0
    if result == "0.5-0.5":
        return 0.5, 0.5
    if result == "bye":
        return 1.0, 0.0
    raise BbpPairingError(f"Unsupported result: {result}")


def result_chars(result):
    white_score, black_score = score_from_result(result)
    if white_score == 1.0 and black_score == 0.0:
        return "1", "0"
    if white_score == 0.0 and black_score == 1.0:
        return "0", "1"
    if white_score == 0.5 and black_score == 0.5:
        return "=", "="
    raise BbpPairingError(f"Unsupported game result: {result}")


def normalize_players(players):
    normalized = []
    seen = set()
    for index, player in enumerate(players):
        player_id = str(player.get("id") or player.get("name") or "").strip()
        name = str(player.get("name") or player_id).strip()
        if not player_id or not name:
            raise BbpPairingError("Every player must have a non-empty id and name.")
        if player_id in seen:
            raise BbpPairingError(f"Duplicate player id: {player_id}")
        seen.add(player_id)
        try:
            rating = int(player.get("ratingFinal", player.get("rating", 0)) or 0)
        except (TypeError, ValueError) as exc:
            raise BbpPairingError(f"Invalid rating for {name}.") from exc
        normalized.append({
            "id": player_id,
            "name": name,
            "ratingFinal": rating,
            "pairingNumber": index + 1,
        })
    if len(normalized) < 2:
        raise BbpPairingError("At least two players are required.")
    return normalized


def compute_scores_and_entries(players, rounds):
    index_by_id = {player["id"]: player["pairingNumber"] for player in players}
    scores = {player["id"]: 0.0 for player in players}
    entries = {player["id"]: [] for player in players}

    for round_data in rounds:
        for pairing in round_data.get("pairings", []):
            if pairing.get("byeId"):
                bye_id = pairing["byeId"]
                if bye_id not in scores:
                    raise BbpPairingError(f"Unknown bye player: {bye_id}")
                scores[bye_id] += 1.0
                entries[bye_id].append({"opponent": 0, "color": "-", "result": "U"})
                continue

            white_id = pairing.get("whiteId")
            black_id = pairing.get("blackId")
            if white_id not in scores or black_id not in scores:
                raise BbpPairingError(f"Unknown player in pairing: {white_id} - {black_id}")
            result = pairing.get("result")
            if not result:
                raise BbpPairingError("All previous pairings must have a result.")
            white_score, black_score = score_from_result(result)
            white_result, black_result = result_chars(result)
            scores[white_id] += white_score
            scores[black_id] += black_score
            entries[white_id].append({
                "opponent": index_by_id[black_id],
                "color": "w",
                "result": white_result,
            })
            entries[black_id].append({
                "opponent": index_by_id[white_id],
                "color": "b",
                "result": black_result,
            })

    return scores, entries


def trf_player_line(player, score, rank, entries):
    pairing_number = player["pairingNumber"]
    name = player["name"][:34]
    rating = max(0, min(9999, int(player["ratingFinal"])))
    head = f"001 {pairing_number:4d}      {name:<34s}{rating:4d}"
    head += " " * (80 - len(head))
    games = f"{score:4.1f}{rank:5d}"
    for entry in entries:
        if entry["opponent"] == 0:
            games += f"  0000 - {entry['result']}"
        else:
            games += f"  {entry['opponent']:4d} {entry['color']} {entry['result']}"
    return head + games


def build_trf(players, rounds, expected_rounds):
    scores, entries = compute_scores_and_entries(players, rounds)
    ranked = sorted(
        players,
        key=lambda player: (-scores[player["id"]], player["pairingNumber"]),
    )
    ranks = {player["id"]: index + 1 for index, player in enumerate(ranked)}
    lines = [
        "012 Local Swiss Tournament",
        "XXC white1",
    ]
    for player in players:
        lines.append(trf_player_line(
            player,
            scores[player["id"]],
            ranks[player["id"]],
            entries[player["id"]],
        ))
    lines.append(f"XXR {expected_rounds}")
    return "\n".join(lines) + "\n"


def parse_pairing_output(output_text, players):
    players_by_number = {player["pairingNumber"]: player for player in players}
    lines = [line.strip() for line in output_text.splitlines() if line.strip()]
    if not lines:
        raise BbpPairingError("bbpPairings returned an empty output.")
    try:
        pair_count = int(lines[0])
    except ValueError as exc:
        raise BbpPairingError("bbpPairings output does not start with pair count.") from exc

    pairings = []
    for line in lines[1:pair_count + 1]:
        parts = line.split()
        if len(parts) < 2:
            raise BbpPairingError(f"Invalid bbpPairings output line: {line}")
        white_number = int(parts[0])
        black_number = int(parts[1])
        white = players_by_number.get(white_number)
        black = players_by_number.get(black_number)
        if not white or not black:
            raise BbpPairingError(f"Unknown pairing number in output: {line}")
        if white_number == black_number:
            pairings.append({
                "byeId": white["id"],
                "byeName": white["name"],
                "result": "bye",
            })
        else:
            pairings.append({
                "whiteId": white["id"],
                "whiteName": white["name"],
                "blackId": black["id"],
                "blackName": black["name"],
                "result": None,
            })
    return pairings


def generate_pairings(payload, root, bbp_executable=None):
    players = normalize_players(payload.get("players", []))
    rounds = payload.get("rounds", [])
    expected_rounds = int(payload.get("expectedRounds") or max(len(rounds) + 1, 1))
    executable = resolve_bbp_executable(root, bbp_executable)
    trf_text = build_trf(players, rounds, expected_rounds)

    with tempfile.TemporaryDirectory(prefix="sachyuh-bbp-") as tmp:
        tmp_path = Path(tmp)
        input_path = tmp_path / "input.trf"
        output_path = tmp_path / "output.txt"
        input_path.write_text(trf_text, encoding="ascii")
        proc = subprocess.run(
            [str(executable), "--dutch", str(input_path), "-p", str(output_path)],
            text=True,
            capture_output=True,
            timeout=15,
        )
        if proc.returncode != 0:
            message = proc.stderr.strip() or proc.stdout.strip() or "bbpPairings failed."
            raise BbpPairingError(message)
        output_text = output_path.read_text(encoding="ascii")

    return {
        "success": True,
        "pairings": parse_pairing_output(output_text, players),
        "engine": str(executable),
        "trf": trf_text if payload.get("includeTrf") else None,
    }


def generate_pairings_json(payload, root, bbp_executable=None):
    return json.dumps(
        generate_pairings(payload, root, bbp_executable),
        ensure_ascii=False,
    ).encode("utf-8")
