#!/usr/bin/env python3
"""
Generate fake RevOps demo data.

Produces 2 CSVs that PostgreSQL loads with COPY (see
dev-environment/data/migrations/revops.sql):

  - accounts.csv       (300 rows, one per account)
  - opportunities.csv  (derived from accounts)

All data is fictional. Company and person names use alliterative
patterns (e.g. "Apex Analytics", "Alice Anderson").

Usage:
  python generate.py                          # writes CSVs next to script
  python generate.py --output-dir /tmp/seeds  # writes CSVs elsewhere
"""

import argparse
import csv
import os
import random
from datetime import date, timedelta
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration — all distribution weights live here for easy tuning.
# ═══════════════════════════════════════════════════════════════════════════════

RANDOM_SEED = 42

# Dashboard absolute time range — all opportunity close dates fall within it.
FY_Q1_START = date(2026, 2, 1)
FY_Q1_END = date(2026, 4, 30)

ACCOUNTS_PER_REGION = {"AMER": 110, "EMEA": 100, "APJ": 90}

# Funnel stage weights (stages 1–8)
FUNNEL_STAGE_WEIGHTS = [12, 13, 11, 7, 25, 10, 10, 12]

FUNNEL_NAMES = {
    1: "1. Contracted", 2: "2. Open Pipeline", 3: "3. Prior Pipeline",
    4: "4. Self-Serve Usage", 5: "5. Free / Trial Usage",
    6: "6. Event Activity or Web Traffic", 7: "7. Opt-Ins",
    8: "8. Cold",
}

# TAM category weights, per funnel group
TAM_WEIGHTS_CONTRACTED = [8, 22, 38, 32]
TAM_WEIGHTS_PIPELINE = [8, 30, 47, 15]
TAM_WEIGHTS_PROSPECT = [15, 50, 35]

# ARR ranges per TAM category, used only to size opportunity NACV
ARR_RANGES = {
    "4. Very Large ($200+)": (200, 560),
    "3. Large [$100 – $200)": (100, 190),
    "2. Medium [$50 – $100)": (50, 98),
    "1. Small ($0 – $50)": (8, 49),
}

TAM_CATEGORIES_CONTRACTED = list(ARR_RANGES.keys())
TAM_CATEGORIES_PIPELINE = [
    "3. Large [$100 – $200)",
    "2. Medium [$50 – $100)",
    "1. Small ($0 – $50)",
    "0. None",
]
TAM_CATEGORIES_PROSPECT = [
    "2. Medium [$50 – $100)",
    "1. Small ($0 – $50)",
    "0. None",
]

# Segment weights [Commercial, Enterprise]
SEGMENT_WEIGHTS_CONTRACTED = [45, 55]
SEGMENT_WEIGHTS_PROSPECT = [55, 45]

# Engagement signal weights [High, Medium, Low, None]
BEHAVIOR_SIGNALS = ["High", "Medium", "Low", "No Recent Activity"]
BEHAVIOR_SIGNAL_WEIGHTS = [12, 22, 42, 24]
SALES_PULSES = ["High", "Medium", "Low", "No Activity"]
SALES_PULSE_WEIGHTS = [10, 27, 46, 17]

OPP_STAGE_NAMES = {
    2: "Qualification", 3: "Value Proposition", 4: "Id. Decision Makers",
    5: "Perception Analysis", 6: "Proposal/Price Quote", 7: "Closed Won",
}
OPP_TYPES_NEW = ["New (New Logo)", "New (SS → Contracted)"]
OPP_TYPES_EXPANSION = ["Expansion", "Flat Renewal"]

# Account owners (AEs) per sub-region, and solutions engineers (SEs) per
# region. Each AE works in exactly one sub-region.
ACCOUNT_OWNERS = {
    "AMER": {
        "AMER-West": ["Alice Anderson"],
        "AMER-East": ["Aaron Archer"],
        "AMER-International": ["Ben Baker", "Carla Cruz"],
    },
    "EMEA": {
        "EMEA-North": ["Julia Jensen", "Kevin Knight", "Laura Lane"],
        "EMEA-South": ["Mark Mitchell"],
    },
    "APJ": {
        "APJ-North": ["Sarah Stone"],
        "APJ-South": ["Tom Torres", "Uma Uddin", "Victor Vega"],
    },
}
SOLUTIONS_ENGINEERS = {
    "AMER": ["Grant Gibson", "Holly Hayes"],
    "EMEA": ["Quinn Quincy", "Rachel Ross"],
    "APJ": ["Simon Scott", "Tina Tran"],
}
REGION_ID_PREFIX = {"AMER": "AMR", "EMEA": "EME", "APJ": "APJ"}

ACCT_COLS = [
    "account_id", "account_name",
    "region", "sub_region", "segment",
    "account_owner", "solutions_engineer",
    "funnel_stage_number", "funnel_stage",
    "tam_category", "behavior_signal", "sales_activity_pulse",
]

OPP_COLS = [
    "opp_id", "account_id", "opp_type",
    "stage_number", "stage_name",
    "close_date", "fiscal_quarter", "net_nacv",
]

# ═══════════════════════════════════════════════════════════════════════════════
# Name generation
# ═══════════════════════════════════════════════════════════════════════════════

COMPANY_FIRST_WORDS = {
    'A': ['Apex', 'Alpine', 'Acorn', 'Amber', 'Atlas', 'Arctic',
          'Aspen', 'Azure', 'Arrow', 'Alder'],
    'B': ['Beacon', 'Birch', 'Boulder', 'Blaze', 'Bridge', 'Brook',
          'Basalt', 'Bay', 'Bolt', 'Briar'],
    'C': ['Cobalt', 'Cedar', 'Coral', 'Crest', 'Crystal', 'Canyon',
          'Cipher', 'Cloud', 'Cliff', 'Crown'],
    'D': ['Delta', 'Dawn', 'Drake', 'Drift', 'Dune', 'Dove', 'Diamond'],
    'E': ['Echo', 'Elm', 'Eagle', 'Ember', 'Everest', 'Edge', 'Eclipse'],
    'F': ['Falcon', 'Fern', 'Forge', 'Flux', 'Frost', 'Flame', 'Flint'],
    'G': ['Granite', 'Grove', 'Gale', 'Glacier', 'Gleam', 'Griffin',
          'Gate'],
    'H': ['Horizon', 'Harbor', 'Hawk', 'Heath', 'Helm', 'Hive', 'Holly'],
    'I': ['Iron', 'Ivy', 'Isle', 'Indigo', 'Iris', 'Icon', 'Inlet'],
    'J': ['Jade', 'Jet', 'Juniper', 'Junction', 'Jasper'],
    'K': ['Keystone', 'Kite', 'Kodiak', 'Knox', 'Kindle'],
    'L': ['Lunar', 'Lark', 'Linden', 'Ledge', 'Lynx', 'Lake', 'Lattice'],
    'M': ['Maple', 'Mesa', 'Moss', 'Meridian', 'Mica', 'Mint', 'Monarch'],
    'N': ['Nova', 'Nimbus', 'North', 'Noble', 'Nexus', 'Needle'],
    'O': ['Onyx', 'Oak', 'Orbit', 'Osprey', 'Opal', 'Olive'],
    'P': ['Pine', 'Peak', 'Prism', 'Pulse', 'Pebble', 'Phoenix', 'Pier'],
    'Q': ['Quartz', 'Quest', 'Quill'],
    'R': ['Redwood', 'Ridge', 'Raven', 'River', 'Reef', 'Relay', 'Rust'],
    'S': ['Summit', 'Sage', 'Stone', 'Sierra', 'Spark', 'Silver',
          'Slate', 'Spruce'],
    'T': ['Titan', 'Thorn', 'Tide', 'Trail', 'Terra', 'Torch', 'Timber'],
    'U': ['Unity', 'Umber', 'Upland', 'Urban'],
    'V': ['Vertex', 'Vine', 'Vault', 'Vale', 'Viper', 'Vista'],
    'W': ['Willow', 'Wave', 'Wolf', 'Wind', 'Wren', 'Wharf'],
    'X': ['Xenon', 'Xylo'],
    'Y': ['Yield', 'Yarrow'],
    'Z': ['Zenith', 'Zinc', 'Zephyr'],
}

COMPANY_INDUSTRY_WORDS = {
    'A': ['Analytics', 'Aerospace', 'Automation', 'Advisors',
          'Architecture'],
    'B': ['Biotech', 'Banking', 'Broadcasting', 'Brands'],
    'C': ['Computing', 'Consulting', 'Commerce', 'Capital',
          'Communications'],
    'D': ['Dynamics', 'Design', 'Data', 'Digital'],
    'E': ['Engineering', 'Energy', 'Enterprises', 'Electronics'],
    'F': ['Financial', 'Foundry', 'Freight', 'Fabrication'],
    'G': ['Global', 'Group', 'Genetics', 'Gaming'],
    'H': ['Holdings', 'Health', 'Hardware', 'Hosting'],
    'I': ['Industries', 'Instruments', 'Intelligence', 'Innovations'],
    'J': ['Junctions', 'Joineries'],
    'K': ['Kinetics', 'Knowledge'],
    'L': ['Labs', 'Logistics', 'Links'],
    'M': ['Materials', 'Manufacturing', 'Media', 'Motors'],
    'N': ['Networks', 'Navigation', 'Nexus'],
    'O': ['Outfitters', 'Operations', 'Optics'],
    'P': ['Partners', 'Platforms', 'Pharma', 'Productions'],
    'Q': ['Quantum', 'Quotient'],
    'R': ['Research', 'Robotics', 'Resources'],
    'S': ['Systems', 'Solutions', 'Sciences', 'Software', 'Services'],
    'T': ['Technologies', 'Trading', 'Transport', 'Therapeutics'],
    'U': ['Unlimited', 'Utilities'],
    'V': ['Ventures', 'Vision', 'Vanguard'],
    'W': ['Works', 'Wireless', 'Wholesale'],
    'X': ['Xchange'],
    'Y': ['Yards'],
    'Z': ['Zone'],
}


def generate_company_names(n):
    """Generate n unique alliterative company names."""
    pool = []
    for letter in sorted(COMPANY_FIRST_WORDS):
        for first in COMPANY_FIRST_WORDS[letter]:
            for industry in COMPANY_INDUSTRY_WORDS[letter]:
                pool.append(f"{first} {industry}")
    random.shuffle(pool)
    if len(pool) < n:
        raise ValueError(
            f"Need {n} company names but pool has only {len(pool)}. "
            f"Add more words to COMPANY_FIRST_WORDS / COMPANY_INDUSTRY_WORDS."
        )
    return pool[:n]


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def pick(lst, weights=None):
    """Weighted random choice from a list."""
    return random.choices(lst, weights=weights, k=1)[0]


def fiscal_quarter(d):
    """Fiscal quarter string, for a fiscal year starting in February."""
    fy = (d.year % 100) + 1 if d.month >= 2 else d.year % 100
    q = (d.month - 2) % 12 // 3 + 1
    return f"FY{fy}-Q{q}"


def make_stage_pool(n):
    """Generate n funnel stages with the configured distribution."""
    n_stages = len(FUNNEL_STAGE_WEIGHTS)
    pool = []
    for stage, w in zip(range(1, n_stages + 1), FUNNEL_STAGE_WEIGHTS):
        pool.extend([stage] * max(1, round(n * w / 100)))
    random.shuffle(pool)
    while len(pool) < n:
        pool.append(pick(list(range(1, n_stages + 1)),
                         weights=FUNNEL_STAGE_WEIGHTS))
    return pool[:n]


def _random_date_in_quarter():
    """Random date within the dashboard's absolute time range."""
    span = (FY_Q1_END - FY_Q1_START).days
    return FY_Q1_START + timedelta(days=random.randint(0, span))


# ═══════════════════════════════════════════════════════════════════════════════
# Generators
# ═══════════════════════════════════════════════════════════════════════════════

def gen_account(region, global_idx, company_name, funnel_stage):
    """Generate a single account row. Returns (row, arr)."""
    is_contracted = (funnel_stage == 1)

    owners = [(sub, ae) for sub, aes in ACCOUNT_OWNERS[region].items()
              for ae in aes]
    sub_region, account_owner = pick(owners)

    segment = pick(
        ["Commercial", "Enterprise"],
        weights=(SEGMENT_WEIGHTS_CONTRACTED if is_contracted
                 else SEGMENT_WEIGHTS_PROSPECT),
    )

    if is_contracted:
        tam = pick(TAM_CATEGORIES_CONTRACTED, weights=TAM_WEIGHTS_CONTRACTED)
        lo, hi = ARR_RANGES[tam]
        arr = random.randint(lo, hi)
    else:
        if funnel_stage in (2, 3, 4):
            tam = pick(TAM_CATEGORIES_PIPELINE, weights=TAM_WEIGHTS_PIPELINE)
        else:
            tam = pick(TAM_CATEGORIES_PROSPECT, weights=TAM_WEIGHTS_PROSPECT)
        arr = 0

    row = dict(
        account_id=f"001{REGION_ID_PREFIX[region]}{global_idx:05d}",
        account_name=company_name,
        region=region,
        sub_region=sub_region,
        segment=segment,
        account_owner=account_owner,
        solutions_engineer=pick(SOLUTIONS_ENGINEERS[region]),
        funnel_stage_number=funnel_stage,
        funnel_stage=FUNNEL_NAMES[funnel_stage],
        tam_category=tam,
        behavior_signal=pick(BEHAVIOR_SIGNALS,
                             weights=BEHAVIOR_SIGNAL_WEIGHTS),
        sales_activity_pulse=pick(SALES_PULSES, weights=SALES_PULSE_WEIGHTS),
    )
    return row, arr


def _make_opp(acct_id, opp_num, stage, close_dt, opp_type, nacv):
    return dict(
        opp_id=f"OPP{acct_id[-5:]}{opp_num:04d}",
        account_id=acct_id,
        opp_type=opp_type,
        stage_number=stage,
        stage_name=OPP_STAGE_NAMES[stage],
        close_date=close_dt.isoformat(),
        fiscal_quarter=fiscal_quarter(close_dt),
        net_nacv=nacv,
    )


def gen_opportunities(account_id, funnel_stage, arr, next_opp_num):
    """Generate opportunity rows for one account."""
    specs = []  # (stage, opp_type, nacv)

    if funnel_stage == 1:
        # Closed-won deals
        for _ in range(random.randint(1, 3)):
            opp_type = pick(OPP_TYPES_NEW + OPP_TYPES_EXPANSION,
                            weights=[30, 5, 50, 15])
            nacv = (0 if opp_type == "Flat Renewal"
                    else round(arr * random.uniform(0.18, 0.75)))
            specs.append((7, opp_type, nacv))
        # Open expansion opps: 80% of contracted accounts get one
        if random.random() > 0.20:
            specs.append((random.randint(3, 6), "Expansion",
                          round(arr * random.uniform(0.08, 0.35))))

    elif funnel_stage in (2, 3):
        for _ in range(random.randint(1, 2)):
            specs.append((random.randint(2, 5), pick(OPP_TYPES_NEW),
                          random.randint(300, 2800)))

    elif funnel_stage == 4 and random.random() > 0.65:
        specs.append((random.randint(2, 4), "New (SS → Contracted)",
                      random.randint(100, 1200)))

    return [
        _make_opp(account_id, next_opp_num + i, stage,
                  _random_date_in_quarter(), opp_type, nacv)
        for i, (stage, opp_type, nacv) in enumerate(specs)
    ]


def generate_all():
    """Generate all data. Returns (accounts, opps) as lists of dicts."""
    random.seed(RANDOM_SEED)

    company_names = generate_company_names(sum(ACCOUNTS_PER_REGION.values()))
    accounts, opps = [], []

    for region, region_count in ACCOUNTS_PER_REGION.items():
        stage_pool = make_stage_pool(region_count)
        for funnel_stage in stage_pool:
            idx = len(accounts) + 1
            account, arr = gen_account(
                region, idx, company_names[idx - 1], funnel_stage)
            accounts.append(account)
            opps.extend(gen_opportunities(
                account["account_id"], funnel_stage, arr, len(opps) + 1))

    return accounts, opps


def write_csv(filepath, fieldnames, rows):
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(
        description="Generate RevOps demo seed data.")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent),
        help="Directory to write CSVs into (default: next to this script)",
    )
    args = parser.parse_args()

    accounts, opps = generate_all()
    os.makedirs(args.output_dir, exist_ok=True)
    write_csv(os.path.join(args.output_dir, "accounts.csv"),
              ACCT_COLS, accounts)
    write_csv(os.path.join(args.output_dir, "opportunities.csv"),
              OPP_COLS, opps)

    print(f"Accounts:      {len(accounts)}")
    print(f"Opportunities: {len(opps)}")
    print(f"Output:        {args.output_dir}")


if __name__ == "__main__":
    main()
