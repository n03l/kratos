#!/usr/bin/env python3
"""Convert a FitNotes backup into a Kratos import file (More > Import from file in the app).

Routines: each day of a FitNotes routine becomes a Kratos routine named "Plan > Day" ("ULUL 2026 > Upper #1"),
keeping the supersets defined on that day. FitNotes routines usually have no set targets ("copy from last
workout"), so sets and reps come from each exercise's most recent workouts. Workouts: every logged day, with its
supersets and comments, named after the routine day it clearly matches. Body: body weight and the measurements
Kratos tracks.

    python3 tools/fitnotes_to_kratos.py BACKUP.fitnotes --routine "ULUL 2026" -o ulul-2026.kratos.json
    python3 tools/fitnotes_to_kratos.py BACKUP.fitnotes --all-routines --workouts --body -o all.kratos.json

Exercises are mapped onto Kratos's built-in library (src/lib/repo/library.json, which lists the FitNotes names of
each library exercise), so the import reuses them instead of adding near-duplicates; on import, exercises are also
matched by name to the ones already in the app. Others are renamed movement first by rule; check those names in
the report. The file holds the library exercises found in the backup (with your FitNotes notes and rest times)
plus anything the routines and workouts use; --all-exercises adds every other FitNotes exercise.

The backup is opened read-only. Nothing is written except the output file. The report goes to stderr.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
import sys
from datetime import datetime
from pathlib import Path

KRATOS_VERSION = 1
LIBRARY = Path(__file__).resolve().parent.parent / "src" / "lib" / "repo" / "library.json"

# FitNotes exercise types: 0 weight and reps, 7 reps only, 3/5/9 timed (with or without weight).
# 1 (distance and time: cardio) has no Kratos equivalent.
REP_TYPES = {0, 7}
TIMED_TYPES = {3, 5, 9}
SUPPORTED_TYPES = REP_TYPES | TIMED_TYPES

CATEGORY_MUSCLES = {
    "Front Delts": ["shoulders"], "Side Delts": ["shoulders"], "Rear Delts": ["shoulders"],
    "Triceps": ["triceps"], "Biceps": ["biceps"], "Chest": ["chest"], "Back": ["back"], "Traps": ["back"],
    "Quads": ["quads"], "Hamstrings": ["hamstrings"], "Glutes": ["glutes"], "Calves": ["calves"], "Abs": ["core"],
}

# --- Fallback naming for exercises outside the library: "Movement (variant, variant)". ---

# Longest first, so "leg curl" wins over "curl".
MOVEMENTS = sorted([
    "bench press", "chest press", "overhead press", "shoulder press", "landmine press", "pallof press", "press",
    "lateral raise", "front raise", "calf raise", "knee raise", "leg raise", "rear delt fly", "rear delt raise",
    "reverse fly", "fly", "crossover", "leg curl", "wrist curl", "curl", "leg extension", "triceps extension",
    "extension", "leg press", "pulldown", "pushdown", "pull-up", "chin-up", "push-up", "sit-up", "face pull",
    "upright row", "row", "pullover", "squat", "split squat", "lunge", "deadlift", "hip thrust", "crunch", "dip",
    "shrug", "skullcrusher", "kickback", "twist", "side bend", "rollout", "push out", "jab", "nordic curl",
    "back extension", "dragon flag",
], key=len, reverse=True)
EQUIPMENT_WORDS = ["barbell", "dumbbell", "ez-bar", "cable", "rope", "machine", "smith", "t-bar", "trx", "v-bar"]
PROPER = {"romanian": "Romanian", "bulgarian": "Bulgarian", "nordic": "Nordic", "arnold": "Arnold",
          "pallof": "Pallof", "smith": "Smith", "trx": "TRX", "ez-bar": "EZ-bar", "t-bar": "T-bar", "v-bar": "V-bar"}

EQUIPMENT_KEYWORDS = [  # checked in order
    ("dumbbell", ["dumbbell", "goblet", "arnold", "hammer curl", "bulgarian"]),
    ("barbell", ["barbell", "ez-bar", "ez bar", "t-bar", "landmine", "deadlift", "overhead press", "hip thrust"]),
    ("machine", ["machine", "chest press", "leg press", "hack squat", "pendulum", "leg curl", "smith", "coaster"]),
    ("cable", ["cable", "rope", "pull down", "pulldown", "push down", "pushdown", "face pull", "v-bar", "pallof"]),
    ("bodyweight", ["pull up", "chin up", "dip", "push up", "crunch", "sit up", "knee", "leg raise", "v-sits",
                    "body saw", "dragon flag", "candlestick", "ring", "trx", "nordic", "back extension"]),
]


# C0 and C1 control characters: a backup could carry terminal escape sequences in its names.
CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def printable(s: str) -> str:
    """Text from the backup made safe to print to a terminal (tabs and newlines are kept)."""
    return CONTROL.sub("?", s)


def clean_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", CONTROL.sub("", s)).strip()


def normalise(raw: str) -> str:
    """Lowercase, singular, consistent spellings: 'Neutral Grip Pull up' -> 'neutral grip pull-up'."""
    s = clean_whitespace(raw).lower()
    s = re.sub(r"\s*#\d+$", "", s)
    for a, b in [(r"\bpull ?ups?\b", "pull-up"), (r"\bchin ?ups?\b", "chin-up"), (r"\bpush ?ups?\b", "push-up"),
                 (r"\bsit ?ups?\b", "sit-up"), (r"\bpull down\b", "pulldown"), (r"\bpush down\b", "pushdown"),
                 (r"\brises?\b", "raise"), (r"\bflyes\b", "fly"), (r"\btricep\b", "triceps"),
                 (r"\bez[- ]bar\b", "ez-bar"), (r"\bsingle arm\b", "single-arm"), (r"\bclose grip\b", "close-grip"),
                 (r"\b(curl|row|shrug|lunge|dip|raise)s\b", r"\1"), (r"\bv-sits\b", "v-sit")]:
        s = re.sub(a, b, s)
    return s


def movement_first(raw: str) -> str:
    s = normalise(raw)
    words = [w for w in re.split(r"[\s()]+", s) if w]
    equipment = [w for w in words if w in EQUIPMENT_WORDS]
    # Look for the movement without the equipment, so "front dumbbell raise" finds "front raise".
    core = " ".join(w for w in words if w not in EQUIPMENT_WORDS)
    movement = next((m for m in MOVEMENTS if re.search(rf"\b{re.escape(m)}\b", core)), None)
    if movement is None:
        name = s
        variants: list[str] = []
    else:
        rest = re.sub(rf"\b{re.escape(movement)}\b", " ", core, count=1)
        other = [w for w in rest.split() if w != "flat"]
        name = movement
        variants = [" ".join(equipment)] if equipment else []
        if other:
            variants.append(" ".join(other))
    def case(w: str) -> str:
        return PROPER.get(w, w)
    head = " ".join(case(w) for w in name.split())
    head = head[:1].upper() + head[1:]
    tail = ", ".join(" ".join(case(w) for w in v.split()) for v in variants if v)
    return f"{head} ({tail})" if tail else head


def equipment_for(raw: str) -> str:
    low = clean_whitespace(raw).lower()
    for equipment, words in EQUIPMENT_KEYWORDS:
        if any(w in low for w in words):
            return equipment
    return "other"


def derive_targets(db: sqlite3.Connection, exercise_id: int, timed: bool, sessions: int = 3) -> dict | None:
    """Sets and rep range (or hold range in seconds) from the most recent workouts with this exercise."""
    col = "duration_seconds" if timed else "reps"
    dates = [r[0] for r in db.execute(
        f"SELECT DISTINCT date FROM training_log WHERE exercise_id = ? AND {col} > 0 ORDER BY date DESC LIMIT ?",
        (exercise_id, sessions))]
    if not dates:
        return None
    per_session = [[r[0] for r in db.execute(
        f"SELECT {col} FROM training_log WHERE exercise_id = ? AND date = ? AND {col} > 0 ORDER BY _id",
        (exercise_id, d))] for d in dates]
    sets = max(1, min(10, round(statistics.median(len(r) for r in per_session))))
    lo, hi = min(per_session[0]), max(per_session[0])
    if timed:
        hi = max(hi, lo + 5)
        return {"sets": sets, "secMin": max(1, min(lo, 3600)), "secMax": min(hi, 3600), "from": dates[0]}
    if hi - lo < 2:
        hi = lo + 2
    return {"sets": sets, "repsMin": max(1, min(lo, 99)), "repsMax": min(hi, 100), "from": dates[0]}


def map_exercises(db: sqlite3.Connection, include: set[int], all_exercises: bool,
                  report: list[str]) -> tuple[dict[str, dict], dict[int, str]]:
    """Kratos exercises for the backup: library matches always, others if `include`d or `all_exercises`."""
    library = json.loads(LIBRARY.read_text(encoding="utf-8"))
    lib_by_fitnotes = {clean_whitespace(n): e for e in library for n in e["fitnotes"]}
    # Most used first, so when two FitNotes names land on one Kratos exercise the one with history provides
    # notes and rest.
    categories = dict(db.execute("SELECT _id, name FROM Category"))
    rows = db.execute(
        "SELECT e._id, e.name, e.category_id, e.exercise_type_id, e.notes, e.default_rest_time "
        "FROM exercise e ORDER BY (SELECT count(*) FROM training_log t WHERE t.exercise_id = e._id) DESC, e.name"
    ).fetchall()
    exercises: dict[str, dict] = {}  # kratos id -> exercise
    by_name: dict[str, str] = {}  # lowercase kratos name -> id
    by_fitnotes_id: dict[int, str] = {}
    mapping: list[tuple[str, str, str]] = []
    left_out: list[str] = []
    for fid, raw, cat_id, type_id, notes, rest in rows:
        raw = clean_whitespace(raw)
        if type_id not in SUPPORTED_TYPES:
            left_out.append(f"{raw} (distance)")
            continue
        lib = lib_by_fitnotes.get(raw)
        if lib:
            ex = {k: lib[k] for k in ("id", "name", "equipment", "muscles")}
            if lib.get("measure") == "time":
                ex["measure"] = "time"
            ex["gymSpecific"] = ex["equipment"] in ("machine", "cable")
            if "restSec" in lib:
                ex["restSec"] = lib["restSec"]
            source = "library"
        elif all_exercises or fid in include:
            name = movement_first(raw)
            equipment = "bodyweight" if type_id == 7 else equipment_for(raw)
            ex = {"id": f"fn-{fid}", "name": name[:80], "equipment": equipment,
                  "muscles": list(CATEGORY_MUSCLES.get(categories.get(cat_id, ""), [])),
                  "gymSpecific": equipment in ("machine", "cable")}
            if type_id in TIMED_TYPES:
                ex["measure"] = "time"
            source = "by rule, check"
        else:
            left_out.append(raw)
            continue
        existing = by_name.get(ex["name"].lower())
        if existing:
            ex = exercises[existing]
            source = f"merged into {ex['name']}"
        else:
            exercises[ex["id"]] = ex
            by_name[ex["name"].lower()] = ex["id"]
        if notes and notes.strip() and "notes" not in ex:
            ex["notes"] = clean_whitespace(notes)[:2000]
        if rest and rest > 0 and "restSec" not in ex:
            ex["restSec"] = int(min(rest, 3600))
        by_fitnotes_id[fid] = ex["id"]
        mapping.append((raw, ex["name"], source))

    report.append("Exercises (FitNotes -> Kratos):")
    for raw, name, source in sorted(mapping, key=lambda m: m[1].lower()):
        report.append(f"  {name:42} <- {raw}   [{source}]")
    missing = [e["name"] for e in library if e["id"] not in exercises]
    if missing:
        report.append(f"Library exercises not in this backup: {', '.join(missing)}")
    if left_out:
        hint = "" if all_exercises else " (use --all-exercises to include the unused ones)"
        report.append(f"Left out {len(left_out)}{hint}: {', '.join(sorted(left_out))}")
    return exercises, by_fitnotes_id


def convert_routine(db: sqlite3.Connection, routine_id: int, label: str, exercises: dict[str, dict],
                    by_fitnotes_id: dict[int, str], default_rest: int, report: list[str]) -> list[dict]:
    """One Kratos routine per FitNotes day, named "Plan > Day", keeping that day's supersets."""
    routines = []
    report.append(f"\nRoutine {label!r}:")
    sections = db.execute(
        "SELECT _id, name FROM RoutineSection WHERE routine_id = ? ORDER BY sort_order, _id", (routine_id,)).fetchall()
    for section_id, section_name in sections:
        items = db.execute(
            "SELECT exercise_id FROM RoutineSectionExercise WHERE routine_section_id = ? ORDER BY sort_order, _id",
            (section_id,)).fetchall()
        # Supersets on a routine day are WorkoutGroups with no date.
        group_of = dict(db.execute(
            "SELECT w.exercise_id, g._id FROM WorkoutGroup g JOIN WorkoutGroupExercise w ON w.workout_group_id = g._id "
            "WHERE g.routine_section_id = ? AND g.date = ''", (section_id,)))
        blocks: list[dict] = []
        block_for_group: dict[int, dict] = {}
        name = clean_whitespace(f"{label} > {section_name}")[:60]
        report.append(f"  {name}")
        for n, (fid,) in enumerate(items):
            kid = by_fitnotes_id.get(fid)
            if kid is None:
                report.append(f"    skipped FitNotes exercise {fid}: distance-based")
                continue
            ex = exercises[kid]
            timed = ex.get("measure") == "time"
            targets = derive_targets(db, fid, timed)
            if timed:
                scheme = {"kind": "timed", "sets": 3, "secMin": 30, "secMax": 60}
                if targets:
                    scheme.update(sets=targets["sets"], secMin=targets["secMin"], secMax=targets["secMax"])
            else:
                scheme = {"kind": "straight", "sets": 3, "repsMin": 8, "repsMax": 12, "rir": 2}
                if targets:
                    scheme.update(sets=targets["sets"], repsMin=targets["repsMin"], repsMax=targets["repsMax"])
            planned = {
                "exerciseId": kid,
                "warmup": "auto" if ex["equipment"] == "barbell" and n < 2 and not timed else "none",
                "scheme": scheme,
                "restSec": int(ex.get("restSec", default_rest)),
                "progression": {"kind": "double", "increment": 2 if ex["equipment"] == "dumbbell" else 2.5},
            }
            group = group_of.get(fid)
            if group is not None and group in block_for_group:
                block_for_group[group]["items"].append(planned)
            else:
                block = {"id": f"fn-b{section_id}-{n}", "items": [planned]}
                blocks.append(block)
                if group is not None:
                    block_for_group[group] = block
            src = f"from {targets['from']}" if targets else "no history, default"
            tag = "  [superset]" if group is not None else ""
            target = f"{scheme['secMin']}-{scheme['secMax']} s" if timed else f"{scheme['repsMin']}-{scheme['repsMax']}"
            report.append(f"    {ex['name']}: {scheme['sets']} x {target} ({src}){tag}")
        for b in blocks:
            if len(b["items"]) > 1:
                b["roundRestSec"] = max(i["restSec"] for i in b["items"])
        routines.append({"id": f"fn-r{section_id}", "name": name, "blocks": blocks})
    return routines


def convert_workouts(db: sqlite3.Connection, exercises: dict[str, dict], by_fitnotes_id: dict[int, str],
                     routines: list[dict], gym_id: str, report: list[str]) -> list[dict]:
    """Every logged workout, one per day. Each is named after the routine day it clearly matches, if any."""
    routine_ids = [(r, {i["exerciseId"] for b in r["blocks"] for i in b["items"]}) for r in routines]

    def matching_routine(used: set[str]) -> dict | None:
        best, score = None, 0.0
        for r, ids in routine_ids:
            s = len(used & ids) / len(used | ids) if ids else 0.0
            if s > score:
                best, score = r, s
        return best if score >= 0.5 else None

    type_of = dict(db.execute("SELECT _id, exercise_type_id FROM exercise"))
    times = {d: (s, e) for d, s, e in db.execute("SELECT workout_date, start_date_time, end_date_time FROM WorkoutTime")}
    notes_of: dict[str, list[str]] = {}
    for d, c in db.execute("SELECT date, comment FROM WorkoutComment ORDER BY _id"):
        if c and c.strip():
            notes_of.setdefault(d, []).append(clean_whitespace(c))
    set_comments = dict(db.execute("SELECT owner_id, comment FROM Comment WHERE owner_type_id = 1"))
    # Supersets in a workout are WorkoutGroups with that date.
    group_of: dict[str, dict[int, int]] = {}
    for d, fid, gid in db.execute(
            "SELECT g.date, w.exercise_id, g._id FROM WorkoutGroup g "
            "JOIN WorkoutGroupExercise w ON w.workout_group_id = g._id WHERE g.date != ''"):
        group_of.setdefault(d, {})[fid] = gid
    log: dict[str, list[tuple]] = {}
    for row in db.execute(
            "SELECT _id, date, exercise_id, metric_weight, reps, duration_seconds FROM training_log ORDER BY date, _id"):
        log.setdefault(row[1], []).append(row)

    sessions: list[dict] = []
    estimated = named = skipped_sets = 0
    for date, rows in sorted(log.items()):
        items: dict[str, dict] = {}
        blocks: list[dict] = []
        block_for_group: dict[int, dict] = {}
        notes = list(notes_of.get(date, []))
        for lid, _, fid, weight, reps, duration in rows:
            kid = by_fitnotes_id.get(fid)
            if kid is None:
                skipped_sets += 1
                continue
            ex = exercises[kid]
            if kid not in items:
                items[kid] = {"exerciseId": kid, "sets": []}
                group = group_of.get(date, {}).get(fid)
                if group is not None and group in block_for_group and len(block_for_group[group]["items"]) < 10:
                    block_for_group[group]["items"].append(items[kid])
                else:
                    block = {"id": f"fn-wb{lid}", "items": [items[kid]]}
                    blocks.append(block)
                    if group is not None:
                        block_for_group[group] = block
            timed = ex.get("measure") == "time"
            # FitNotes has no warmup marker, so every logged set is a working set.
            logged = {"id": f"fn-s{lid}", "type": "working",
                      "weight": 0 if type_of.get(fid) == 7 else round(min(max(weight or 0, 0), 2000), 2),
                      "reps": 0 if timed else int(min(max(reps or 0, 0), 1000)), "done": True}
            if timed:
                logged["durationSec"] = int(min(max(duration or 0, 0), 86_400))
            if len(items[kid]["sets"]) < 100:
                items[kid]["sets"].append(logged)
            comment = set_comments.get(lid)
            if comment and comment.strip():
                notes.append(f"{ex['name']}: {clean_whitespace(comment)}")
        blocks = [b for b in blocks if any(i["sets"] for i in b["items"])][:100]
        if not blocks:
            continue
        start = end = None
        span = times.get(date)
        if span and span[0]:
            start = datetime.fromisoformat(span[0])
            end = datetime.fromisoformat(span[1]) if span[1] else None
        minutes = round((end - start).total_seconds() / 60) if start and end and end > start else 0
        if not 0 < minutes <= 24 * 60:
            # No workout timer that day: noon UTC (the same date in most timezones), 2.5 minutes a set.
            estimated += 1
            start = start or datetime.fromisoformat(f"{date}T12:00:00+00:00")
            minutes = max(10, min(180, round(sum(len(i["sets"]) for b in blocks for i in b["items"]) * 2.5)))
        routine = matching_routine(set(items))
        named += routine is not None
        session = {"id": f"fn-w{date}", "name": routine["name"] if routine else "Workout",
                   "startedAt": start.isoformat(timespec="milliseconds"), "durationMin": int(minutes),
                   "gymId": gym_id, "blocks": blocks}
        if routine:
            session["routineId"] = routine["id"]
        if notes:
            session["notes"] = "\n".join(notes)[:5000]
        sessions.append(session)

    report.append(f"\nWorkouts: {len(sessions)}, {named} named after a routine day, the rest \"Workout\". "
                  f"{estimated} had no workout timer: started at noon UTC, duration estimated from the sets.")
    if skipped_sets:
        report.append(f"Skipped {skipped_sets} sets of distance-based exercises.")
    return sessions


# FitNotes measurement -> Kratos body field, with the accepted range in kg or cm.
BODY_FIELDS = {"bodyweight": ("weight", 20, 400), "waist": ("waist", 1, 300), "chest": ("chest", 1, 300),
               "upper arm (right)": ("arm", 1, 300), "thigh (right)": ("thigh", 1, 300)}
TO_METRIC = {"kgs": 1, "lbs": 0.45359237, "cm": 1, "in": 2.54}


def convert_body(db: sqlite3.Connection, report: list[str]) -> list[dict]:
    """Body weight and the measurements Kratos tracks, one entry per day (the day's last value wins)."""
    rows = [(d, "bodyweight", w, "kgs", "00:00:00", 0) for d, w in db.execute(
        "SELECT date, body_weight_metric FROM BodyWeight")]
    rows += db.execute(
        "SELECT r.date, lower(m.name), r.value, u.short_name, r.time, r._id FROM MeasurementRecord r "
        "JOIN Measurement m ON m._id = r.measurement_id JOIN MeasurementUnit u ON u._id = m.unit_id").fetchall()
    days: dict[str, dict] = {}
    out_of_range = 0
    for date, name, value, unit, _, _ in sorted(rows, key=lambda r: (r[0], r[4] or "", r[5])):
        field = BODY_FIELDS.get(clean_whitespace(name or ""))
        if not field or value is None or unit not in TO_METRIC or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date or ""):
            continue
        key, lo, hi = field
        v = round(value * TO_METRIC[unit], 2)
        if not lo <= v <= hi:
            out_of_range += 1
            continue
        days.setdefault(date, {"date": date})[key] = v
    report.append(f"\nBody: {len(days)} days.")
    if out_of_range:
        report.append(f"Skipped {out_of_range} measurements outside plausible ranges.")
    return sorted(days.values(), key=lambda b: b["date"])


def convert(path: Path, routine_names: list[str], all_routines: bool, all_exercises: bool, workouts: bool,
            body: bool, gym_name: str) -> tuple[dict, list[str]]:
    # as_uri() percent-encodes the path, so '#', '?' or '%' in a file name can't change what is opened or how.
    db = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro&immutable=1", uri=True)
    report: list[str] = []

    (metric,) = db.execute("SELECT metric FROM settings LIMIT 1").fetchone() or (1,)
    if metric != 1:
        report.append("WARNING: FitNotes is set to imperial units; weights in the backup are still kilograms.")
    (default_rest,) = db.execute("SELECT rest_timer_seconds FROM settings LIMIT 1").fetchone() or (120,)
    default_rest = int(default_rest or 120)

    all_names = db.execute("SELECT _id, name FROM Routine ORDER BY _id").fetchall()
    if all_routines:
        chosen = all_names
    else:
        chosen = []
        for name in routine_names:
            found = [r for r in all_names if r[1] == name]
            if not found:
                names = ", ".join(r[1] for r in all_names)
                raise SystemExit(printable(f"No routine named {name!r}. Routines in this backup: {names}"))
            chosen.append(found[0])
    include = {r[0] for r in db.execute(
        "SELECT x.exercise_id FROM RoutineSectionExercise x JOIN RoutineSection s ON s._id = x.routine_section_id "
        f"WHERE s.routine_id IN ({','.join('?' * len(chosen))})", [r[0] for r in chosen])}
    if workouts:
        include |= {r[0] for r in db.execute("SELECT DISTINCT exercise_id FROM training_log")}

    exercises, by_fitnotes_id = map_exercises(db, include, all_exercises, report)
    routines = [r for rid, label in chosen
                for r in convert_routine(db, rid, label, exercises, by_fitnotes_id, default_rest, report)]
    out = {
        "kratos": "export",
        "version": KRATOS_VERSION,
        "exercises": sorted(exercises.values(), key=lambda e: e["name"].lower()),
        "routines": routines,
    }
    if workouts:
        # Matched to a gym of the same name on import; a new gym with the starter's plates otherwise.
        gym = {"id": "fn-gym", "name": gym_name[:60], "color": "red", "bar": 20,
               "plates": [25, 20, 15, 10, 5, 2.5, 1.25], "stackIncrement": 5}
        all_routine_days = routines if all_routines else [
            r for rid, label in all_names
            for r in convert_routine(db, rid, label, exercises, by_fitnotes_id, default_rest, [])]
        out["gyms"] = [gym]
        out["sessions"] = convert_workouts(db, exercises, by_fitnotes_id, all_routine_days, gym["id"], report)
        # A workout named after a routine that isn't in the file still links to it by name on import.
        in_file = {r["id"] for r in routines}
        for s in out["sessions"]:
            if s.get("routineId") not in in_file:
                s.pop("routineId", None)
    if body:
        out["body"] = convert_body(db, report)
    return out, report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("backup", type=Path, help="FitNotes backup file (.fitnotes)")
    ap.add_argument("--routine", action="append", default=[], help='FitNotes routine name, e.g. "ULUL 2026" (repeatable)')
    ap.add_argument("--all-routines", action="store_true", help="every FitNotes routine")
    ap.add_argument("--workouts", action="store_true", help="every logged workout")
    ap.add_argument("--body", action="store_true", help="body weight and measurements")
    ap.add_argument("--gym", default="My gym", help='gym the workouts belong to (default: "My gym", the starter gym)')
    ap.add_argument("-o", "--output", type=Path, required=True, help="Kratos import file to write")
    ap.add_argument("--all-exercises", action="store_true", help="also include FitNotes exercises nothing uses")
    args = ap.parse_args()
    if not args.backup.is_file():
        ap.error(f"{args.backup} is not a file")
    if not (args.routine or args.all_routines or args.workouts or args.body):
        ap.error("choose what to convert: --routine, --all-routines, --workouts and/or --body")
    if not args.gym.strip():
        ap.error("--gym needs a name")
    data, report = convert(args.backup.resolve(), args.routine, args.all_routines, args.all_exercises, args.workouts,
                           args.body, clean_whitespace(args.gym))
    args.output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(printable("\n".join(report)), file=sys.stderr)
    counts = ", ".join(f"{len(data[k])} {k}" for k in ("routines", "exercises", "sessions", "body") if k in data)
    print(f"\nWrote {args.output}: {counts}.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
