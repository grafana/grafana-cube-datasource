#!/usr/bin/env python3
"""
Generate fake Territory Navigator demo data.

Produces 3 fully-enriched CSVs that can be loaded into any SQL database
(Postgres COPY, DuckDB read_csv, BigQuery bq load) with no post-load
transformation needed.

Output files:
  - territory_navigator_account_details.csv  (~300 rows, ~90 columns)
  - opp_split.csv                            (derived from accounts)
  - territory_navigator_orgs.csv             (derived from accounts)

All data is fictional. Company and person names use alliterative
alphabetical patterns (e.g. "Apex Analytics", "Alice Anderson").

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
TODAY = date(2026, 3, 6)

# Dashboard absolute time range — all generated dates should fall within this.
FY_Q1_START = date(2026, 2, 1)
FY_Q1_END = date(2026, 4, 30)

ACCOUNTS_PER_REGION = {"AMER": 110, "EMEA": 100, "APJ": 90}

# Funnel stage weights (stages 1–8)
FUNNEL_STAGE_WEIGHTS = [12, 13, 11, 7, 25, 10, 10, 12]

# TAM category weights [Very Large, Large, Medium, Small(, None)]
TAM_WEIGHTS_CONTRACTED = [8, 22, 38, 32]
TAM_WEIGHTS_PIPELINE = [8, 30, 47, 15]
TAM_WEIGHTS_PROSPECT = [15, 50, 35]

# Segment weights [Commercial, Enterprise]
SEGMENT_WEIGHTS_CONTRACTED = [45, 55]
SEGMENT_WEIGHTS_PROSPECT = [55, 45]

# Seller type weights [Growth, AE, Acquisition]
SELLER_TYPE_WEIGHTS_CONTRACTED = [40, 50, 10]
SELLER_TYPE_WEIGHTS_PROSPECT = [20, 20, 60]

# Engagement signal weights [High, Medium, Low, None]
BEHAVIOR_SIGNAL_WEIGHTS = [12, 22, 42, 24]
SALES_PULSE_WEIGHTS = [10, 27, 46, 17]

# Product usage probabilities: (currently_using, used_in_last_3mo)
PRODUCT_USAGE_CONTRACTED = dict(
    vis=(0.85, 0.10), met=(0.90, 0.07), log=(0.80, 0.12),
    trc=(0.65, 0.15), prf=(0.40, 0.20), k6=(0.30, 0.15),
    syn=(0.25, 0.15), fe=(0.25, 0.15), app=(0.22, 0.15),
    k8s=(0.38, 0.15), irm=(0.20, 0.10), dbo=(0.15, 0.10),
    ga=(0.28, 0.10),
)
PRODUCT_USAGE_SELF_SERVE = dict(
    vis=(0.45, 0.20), met=(0.50, 0.20), log=(0.25, 0.15),
    trc=(0.08, 0.08), prf=(0, 0), k6=(0, 0), syn=(0, 0),
    fe=(0, 0), app=(0, 0), k8s=(0, 0), irm=(0, 0), dbo=(0, 0), ga=(0, 0),
)
PRODUCT_USAGE_NONE = {
    k: (0, 0) for k in
    ["vis", "met", "log", "trc", "prf", "k6", "syn",
     "fe", "app", "k8s", "irm", "dbo", "ga"]
}

# Revenue ranges per TAM category (~50,000x reduction from production)
ARR_RANGES = {
    "4. Very Large ($200+)": (200, 560),
    "3. Large [$100 \u2013 $200)": (100, 190),
    "2. Medium [$50 \u2013 $100)": (50, 98),
    "1. Small ($0 \u2013 $50)": (8, 49),
}

TAM_CATEGORIES_CONTRACTED = list(ARR_RANGES.keys())
TAM_CATEGORIES_PIPELINE = [
    "3. Large [$100 \u2013 $200)",
    "2. Medium [$50 \u2013 $100)",
    "1. Small ($0 \u2013 $50)",
    "0. None",
]
TAM_CATEGORIES_PROSPECT = [
    "2. Medium [$50 \u2013 $100)",
    "1. Small ($0 \u2013 $50)",
    "0. None",
]

FUNNEL_NAMES = {
    1: "1. Contracted", 2: "2. Open Pipeline", 3: "3. Prior Pipeline",
    4: "4. Self-Serve Usage", 5: "5. Free / Trial Usage",
    6: "6. Event Activity or Web Traffic", 7: "7. Opt-Ins",
    8: "8. Cold",
}

OPP_STAGE_NAMES = {
    2: "Qualification", 3: "Value Proposition", 4: "Id. Decision Makers",
    5: "Perception Analysis", 6: "Proposal/Price Quote", 7: "Closed Won",
}
OPP_TYPES_NEW = ["New (New Logo)", "New (SS \u2192 Contracted)"]
OPP_TYPES_EXPANSION = ["Expansion", "Flat Renewal"]

TECH_COMBOS = [
    "Kubernetes|AWS|Prometheus|Terraform",
    "Kubernetes|GCP|Prometheus|OpenTelemetry",
    "Kubernetes|Azure|Prometheus|Jaeger",
    "Docker|AWS|Prometheus",
    "Kubernetes|AWS|Azure|Prometheus|OpenTelemetry",
    "Docker|GCP|Prometheus",
    "Kubernetes|On-Prem|Prometheus|Grafana",
    "AWS|Prometheus|Redis",
    "Docker|Python",
    "Docker|GitHub Actions",
    "Kubernetes|AWS|Jenkins|Prometheus",
    "Docker|Kubernetes",
    "AWS|Prometheus",
]

FUNDING_ROUNDS = ["Seed", "Series A", "Series B", "Series C",
                  "Series D", "Series E", ""]
FUNDING_WEIGHTS = [10, 20, 22, 18, 10, 5, 15]

INDUSTRY_PAIRS = [
    ("Technology", "Software Development"),
    ("Technology", "Cloud Computing"),
    ("Technology", "Cybersecurity"),
    ("Financial Services", "Banking"),
    ("Financial Services", "Insurance"),
    ("Financial Services", "FinTech"),
    ("Healthcare", "Medical Devices"),
    ("Healthcare", "Health IT"),
    ("Manufacturing", "Automotive"),
    ("Manufacturing", "Electronics"),
    ("Retail", "E-Commerce"),
    ("Retail", "Consumer Goods"),
    ("Media", "Digital Media"),
    ("Media", "Streaming"),
    ("Energy", "Renewable Energy"),
    ("Education", "EdTech"),
    ("Transportation", "Logistics"),
]

# ═══════════════════════════════════════════════════════════════════════════════
# Column definitions — must match the dashboard SQL exactly.
# ═══════════════════════════════════════════════════════════════════════════════

ACCT_COLS = [
    "account_id", "account_id_territory_parent", "account_name",
    "account_owner_region", "account_owner_rvp_region",
    "account_owner_rsd_region",
    "account_owner_l1_territory", "account_owner_l3_territory",
    "account_owner_l4_territory", "account_owner_l6_territory",
    "account_owner_segment", "account_owner_seller_type",
    "account_billing_country", "account_billing_state_province",
    "account_funnel_score_number", "tam_category_family",
    "arr_curr", "arr_cloud_curr", "arr_enterprise_curr",
    "account_funnel_score_name",
    "consumption_weighted_last_month", "committed_mrr_last_month",
    "consumption_weighted_projected_current_month",
    "committed_mrr_current_month",
    "consumption_weighted_quota_last_month",
    "consumption_weighted_quota_current_month",
    "employee_ct_territory_parent", "usage_type_name_curr",
    "is_territory_parent",
    "account_owner_name", "account_territory_name",
    "ct_opt_ins_marketing_ops",
    "company_behavior_signal_marketing_ops",
    "sales_activity_pulse_marketing_ops", "account_owner_id",
    "account_mapped_sdr_name", "account_mapped_sdr_id",
    "account_solutions_engineer_name", "account_solutions_engineer_id",
    "account_observability_architect_manager_name",
    "account_observability_architect_manager_id",
    "account_observability_architect_name",
    "account_observability_architect_id",
    "is_account_assigned_to_ae_filter", "is_territory_parent_filter",
    "consumption_committed_mrr_attainment_band_name_last_month",
    "consumption_committed_mrr_attainment_band_number_last_month",
    "cons_committed_mrr_attainment_band_name_proj_curr_month",
    "cons_committed_mrr_attainment_band_number_proj_curr_month",
    "has_ae_sdr_meeting", "has_other_ae_sdr_engagement",
    "ct_opt_ins_contacted_l6m_marketing_ops",
    "uses_visualization_status", "uses_metrics_status",
    "uses_logs_status", "uses_traces_status", "uses_profiles_status",
    "uses_k6_status", "uses_synthetics_status",
    "uses_frontend_observability_status",
    "uses_application_observability_status",
    "uses_kubernetes_monitoring_status",
    "uses_irm_status", "warmth_rank_warmth_model",
    "account_org_slug_sfdc",
    "string_products_in_use_projected_current_month",
    "avg_mrr_self_serve_l3m",
    "cx_happiness_score_display", "sales_happiness_score_display",
    "has_ae_sdr_meeting_display",
    "has_other_ae_sdr_engagement_display",
    "consumption_weighted_projected_current_month_gap_to_current_mrr",
    "consumption_weighted_projected_current_month_delta_mom_display",
    "consumption_weighted_committed_mrr_attainment_last_month",
    "cons_committed_mrr_attainment_band_description_last_month",
    "cons_weighted_committed_mrr_attainment_proj_curr_month",
    "cons_committed_mrr_attainment_band_description_proj_curr_month",
    "subscription_details_string", "close_date_next_renewal",
    "months_to_close_date_next_renewal",
    "account_industry_zoominfo", "account_sub_industry_zoominfo",
    "ct_employees_devops_clay", "latest_funding_round_clay",
    "total_funding_amount_clay_family", "marquee_list_clay_display",
    "technology_list", "crossbeam_overlap_summary", "arr_curr_family",
    "account_org_slug_sfdc_territory_parent",
    "account_org_id_sfdc_territory_parent",
    "account_name_territory_parent", "committed_mrr",
    "consumption_weighted_quota", "consumption_weighted_total",
    "consumption_weighted_last_month_with_quota",
    "consumption_weighted_last_month_with_committed_mrr",
    "consumption_weighted_projected_current_month_with_quota",
    "consumption_weighted_projected_current_month_with_committed_mrr",
    "consumption_weighted_actual_projected_combined",
    "consumption_weighted_actual_projected_combined_ttl",
    "is_territory_parent_display", "is_territory_parent_one_hot",
    "cx_happiness_score", "sales_happiness_score",
    "last_response_date_marketing_ops",
    "share_opt_ins_contacted_l6m_marketing_ops",
    "ct_unique_visitors_l30d_marketing_ops",
    "ct_page_views_buying_intent_l30d_marketing_ops",
    "ct_responses_cloud_l30d_marketing_ops",
    "ct_responses_non_cloud_l30d_marketing_ops",
    "ct_community_activities_l30d_marketing_ops",
    "uses_database_observability_status",
    "uses_grafana_assistant_status",
    "has_consumption_weighted_quota", "has_target",
    "account_org_id_sfdc",
]

OPP_COLS = [
    "account_id", "net_nacv_split", "net_nacv_ttl", "stage_number",
    "close_date", "opp_type_qbr", "split_percentage", "opp_id",
    "opp_name", "stage_name", "fq_close_date",
    "is_cro_forecast", "is_vp_forecast", "is_rvp_forecast",
    "is_rsd_forecast", "is_ae_forecast",
    "net_racv_ttl", "net_racv_split", "net_racv", "net_nacv",
    "net_tcv", "net_tcv_split", "services_split", "stage_category",
]

ORG_COLS = [
    "sfdc_account_id", "sfdc_account_name", "org_slug", "org_type",
    "revops_account_funnel", "sales_plays",
    "warmth_rank_warmth_model", "last_activity_date", "arr", "mrr_delta",
    "billable_users", "billable_users_delta",
    "billable_series", "billable_series_delta",
    "billable_logs", "billable_logs_delta",
    "billable_traces", "billable_traces_delta",
    "billable_profiles", "billable_profiles_delta",
    "billable_k6_vuh", "billable_k6_vuh_delta",
    "billable_irm_users", "billable_irm_user_delta",
    "billable_app_o11y_host_hours",
    "billable_app_o11y_host_hours_delta",
    "billable_fe_o11y_sessions", "billable_fe_o11y_sessions_delta",
    "billable_sm_checks", "billable_sm_checks_delta",
    "k8s_o11y_pricing_type", "integrations", "hg_datasource_cnts",
    "arr_sparkline_values", "hm_sparkline_values",
]

# ═══════════════════════════════════════════════════════════════════════════════
# Name generation — alliterative alphabetical company and person names
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
    """Generate n unique alliterative company names as (name, slug) tuples."""
    pool = []
    for letter in sorted(COMPANY_FIRST_WORDS):
        firsts = COMPANY_FIRST_WORDS[letter]
        industries = COMPANY_INDUSTRY_WORDS[letter]
        for first in firsts:
            for industry in industries:
                name = f"{first} {industry}"
                slug = name.lower().replace(" ", "-")
                pool.append((name, slug))
    random.shuffle(pool)
    if len(pool) < n:
        raise ValueError(
            f"Need {n} company names but pool has only {len(pool)}. "
            f"Add more words to COMPANY_FIRST_WORDS / COMPANY_INDUSTRY_WORDS."
        )
    return pool[:n]


# Sellers per region — alliterative person names with stable IDs.
# Each region uses a different letter range so sellers are visually distinct.
SELLERS = {
    "AMER": {
        # Partitioned by L3 territory to preserve the production invariant
        # that every AE owns accounts in exactly one L3 territory. Split
        # is 1:1:2 across {West, East, International} to match the 4
        # subregions (US-West, US-East, Canada, LATAM).
        "aes_by_l3": {
            "AMER West": [
                ("Alice Anderson", "005AMR-AE001"),
            ],
            "AMER East": [
                ("Aaron Archer", "005AMR-AE002"),
            ],
            "AMER International": [
                ("Ben Baker", "005AMR-AE003"),
                ("Carla Cruz", "005AMR-AE004"),
            ],
        },
        "sdrs": [
            ("Dana Dawson", "005AMR-SDR001"),
            ("Eli Edwards", "005AMR-SDR002"),
            ("Fiona Foster", "005AMR-SDR003"),
        ],
        "ses": [
            ("Grant Gibson", "005AMR-SE001"),
            ("Holly Hayes", "005AMR-SE002"),
        ],
        "oam": ("Ivan Ingram", "005AMR-OAM001"),
        "oas": [
            ("Beth Barnes", "005AMR-OA001"),
            ("Chris Chen", "005AMR-OA002"),
        ],
    },
    "EMEA": {
        # 3:1 split reflects the subregion weight (3 North subregions —
        # UKI, DACH, Nordics — vs 1 South — Southern Europe).
        "aes_by_l3": {
            "EMEA North": [
                ("Julia Jensen", "005EME-AE001"),
                ("Kevin Knight", "005EME-AE002"),
                ("Laura Lane", "005EME-AE003"),
            ],
            "EMEA South": [
                ("Mark Mitchell", "005EME-AE004"),
            ],
        },
        "sdrs": [
            ("Nina Nash", "005EME-SDR001"),
            ("Oscar Owens", "005EME-SDR002"),
            ("Paula Park", "005EME-SDR003"),
        ],
        "ses": [
            ("Quinn Quincy", "005EME-SE001"),
            ("Rachel Ross", "005EME-SE002"),
        ],
        "oam": ("James Jordan", "005EME-OAM001"),
        "oas": [
            ("Kate Kim", "005EME-OA001"),
            ("Leo Liu", "005EME-OA002"),
        ],
    },
    "APJ": {
        # 1:3 split reflects the subregion weight (1 North subregion —
        # Japan — vs 3 South — ANZ, SEA, India).
        "aes_by_l3": {
            "APJ North": [
                ("Sarah Stone", "005APJ-AE001"),
            ],
            "APJ South": [
                ("Tom Torres", "005APJ-AE002"),
                ("Uma Uddin", "005APJ-AE003"),
                ("Victor Vega", "005APJ-AE004"),
            ],
        },
        "sdrs": [
            ("Wendy Walsh", "005APJ-SDR001"),
            ("Xavier Xu", "005APJ-SDR002"),
            ("Yuki Yamada", "005APJ-SDR003"),
        ],
        "ses": [
            ("Simon Scott", "005APJ-SE001"),
            ("Tina Tran", "005APJ-SE002"),
        ],
        "oam": ("Steve Sullivan", "005APJ-OAM001"),
        "oas": [
            ("Zara Zhou", "005APJ-OA001"),
            ("Tyler Tan", "005APJ-OA002"),
        ],
    },
}

# ═══════════════════════════════════════════════════════════════════════════════
# Geography — real AMER/EMEA/APJ subregions with countries and states
# ═══════════════════════════════════════════════════════════════════════════════

REGION_ID_PREFIX = {"AMER": "AMR", "EMEA": "EME", "APJ": "APJ"}

REGIONS = {
    "AMER": [
        {
            "name": "US-West", "rvp": "AMER-West",
            "l3": "AMER West", "l6": "US-West-A1",
            "countries": [
                ("United States",
                 ["California", "Washington", "Oregon", "Colorado"]),
            ],
        },
        {
            "name": "US-East", "rvp": "AMER-East",
            "l3": "AMER East", "l6": "US-East-H1",
            "countries": [
                ("United States",
                 ["New York", "Massachusetts", "Virginia",
                  "Georgia", "Illinois", "Texas"]),
            ],
        },
        {
            "name": "Canada", "rvp": "AMER-International",
            "l3": "AMER International", "l6": "Canada-A1",
            "countries": [
                ("Canada",
                 ["Ontario", "British Columbia", "Quebec", "Alberta"]),
            ],
        },
        {
            "name": "LATAM", "rvp": "AMER-International",
            "l3": "AMER International", "l6": "LATAM-A1",
            "countries": [
                ("Brazil", ["S\u00e3o Paulo", "Rio de Janeiro"]),
                ("Mexico", ["Mexico City"]),
                ("Colombia", [""]),
                ("Argentina", ["Buenos Aires"]),
            ],
        },
    ],
    "EMEA": [
        {
            "name": "UKI", "rvp": "EMEA-North",
            "l3": "EMEA North", "l6": "UKI-H1",
            "countries": [
                ("United Kingdom", ["England", "Scotland", "Wales"]),
                ("Ireland", [""]),
            ],
        },
        {
            "name": "DACH", "rvp": "EMEA-North",
            "l3": "EMEA North", "l6": "DACH-A1",
            "countries": [
                ("Germany",
                 ["Bavaria", "North Rhine-Westphalia", "Berlin"]),
                ("Austria", [""]),
                ("Switzerland", ["Zurich"]),
            ],
        },
        {
            "name": "Southern Europe", "rvp": "EMEA-South",
            "l3": "EMEA South", "l6": "SouthEU-A1",
            "countries": [
                ("France", ["\u00cele-de-France"]),
                ("Spain", ["Madrid", "Catalonia"]),
                ("Italy", ["Lombardy", "Lazio"]),
            ],
        },
        {
            "name": "Nordics", "rvp": "EMEA-North",
            "l3": "EMEA North", "l6": "Nordics-H1",
            "countries": [
                ("Sweden", [""]),
                ("Norway", [""]),
                ("Denmark", [""]),
                ("Finland", [""]),
            ],
        },
    ],
    "APJ": [
        {
            "name": "ANZ", "rvp": "APJ-South",
            "l3": "APJ South", "l6": "ANZ-A1",
            "countries": [
                ("Australia",
                 ["New South Wales", "Victoria", "Queensland"]),
                ("New Zealand", [""]),
            ],
        },
        {
            "name": "Japan", "rvp": "APJ-North",
            "l3": "APJ North", "l6": "Japan-H1",
            "countries": [
                ("Japan", ["Tokyo", "Osaka"]),
            ],
        },
        {
            "name": "SEA", "rvp": "APJ-South",
            "l3": "APJ South", "l6": "SEA-A1",
            "countries": [
                ("Singapore", [""]),
                ("Indonesia", ["Jakarta"]),
                ("Thailand", ["Bangkok"]),
            ],
        },
        {
            "name": "India", "rvp": "APJ-South",
            "l3": "APJ South", "l6": "India-H1",
            "countries": [
                ("India",
                 ["Maharashtra", "Karnataka", "Delhi", "Tamil Nadu"]),
            ],
        },
    ],
}

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def pick(lst, weights=None):
    """Weighted random choice from a list."""
    return random.choices(lst, weights=weights, k=1)[0]


def attainment_band(ratio):
    """Map a consumption/MRR ratio to (number, name, description)."""
    if ratio == 0:
        return (0, "No Committed MRR",
                "No Committed MRR")
    if ratio < 0.25:
        return (1, "(0%\u201325%)",
                "0\u201325% of Committed MRR")
    if ratio < 0.50:
        return (2, "[25%\u201350%)",
                "25\u201350% of Committed MRR")
    if ratio < 0.75:
        return (3, "[50%\u201375%)",
                "50\u201375% of Committed MRR")
    if ratio < 1.0:
        return (4, "[75%\u2013100%)",
                "75\u2013100% of Committed MRR")
    if ratio < 1.25:
        return (5, "[100%\u2013125%)",
                "100\u2013125% of Committed MRR")
    if ratio < 1.5:
        return (6, "[125%\u2013150%)",
                "125\u2013150% of Committed MRR")
    return (7, "150%+",
            "More than 150% of Committed MRR")


def prod_status(p_now, p_recent):
    """Randomly assign product usage status based on probabilities."""
    r = random.random()
    if r < p_now:
        return "\U0001f535 Currently Using"
    if r < p_now + p_recent:
        return "\U0001f7e0 Used in Last 3 Months"
    return ""


def happiness_label(score):
    if score >= 75:
        return "Happy"
    if score >= 50:
        return "Neutral"
    return "Cold"


def fiscal_quarter(d):
    """Grafana Labs fiscal quarter string (Feb-start fiscal year)."""
    fy = (d.year % 100) + 1 if d.month >= 2 else d.year % 100
    q = (d.month - 1) // 3 + 1
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


# ═══════════════════════════════════════════════════════════════════════════════
# Account generator
# ═══════════════════════════════════════════════════════════════════════════════

PRODUCT_LABELS = {
    "vis": "Visualization", "met": "Metrics", "log": "Logs",
    "trc": "Traces", "prf": "Profiles", "k6": "K6",
    "syn": "Synthetics", "fe": "FE O11y", "app": "App O11y",
    "k8s": "K8s Monitoring", "irm": "IRM",
    "dbo": "DB O11y", "ga": "Grafana Assistant",
}


def gen_account(region_key, global_idx, company_name, slug,
                subregion, funnel_stage, sellers):
    """Generate a single account row as a dict."""
    prefix = REGION_ID_PREFIX[region_key]
    acct_id = f"001{prefix}{global_idx:05d}"

    is_contracted = (funnel_stage == 1)

    # People
    ae_name, ae_id = pick(sellers["aes_by_l3"][subregion["l3"]])
    sdr_name, sdr_id = pick(sellers["sdrs"])
    oam_name, oam_id = sellers["oam"]
    oa_name, oa_id = pick(sellers["oas"])
    se_name, se_id = pick(sellers["ses"])

    # Segment & seller type
    segment = pick(
        ["Commercial", "Enterprise"],
        weights=(SEGMENT_WEIGHTS_CONTRACTED if is_contracted
                 else SEGMENT_WEIGHTS_PROSPECT),
    )
    seller_type = pick(
        ["Growth", "AE", "Acquisition"],
        weights=(SELLER_TYPE_WEIGHTS_CONTRACTED if is_contracted
                 else SELLER_TYPE_WEIGHTS_PROSPECT),
    )

    # Geography
    country_tuple = pick(subregion["countries"])
    country = country_tuple[0]
    state = pick(country_tuple[1])

    # TAM family
    if is_contracted:
        tam = pick(TAM_CATEGORIES_CONTRACTED, weights=TAM_WEIGHTS_CONTRACTED)
    elif funnel_stage in (2, 3, 4):
        tam = pick(TAM_CATEGORIES_PIPELINE, weights=TAM_WEIGHTS_PIPELINE)
    else:
        tam = pick(TAM_CATEGORIES_PROSPECT, weights=TAM_WEIGHTS_PROSPECT)

    # Financials
    if is_contracted:
        lo, hi = ARR_RANGES.get(tam, (0, 0))
        arr = random.randint(lo, hi) if lo else 0
        arr_cloud = round(arr * random.uniform(0.55, 0.90))
        arr_ent = arr - arr_cloud
        cmrr = round(arr / 12, 2)

        if random.random() < 0.04:
            r_last = 0.0
            r_proj = 0.0
        else:
            r_last = random.triangular(0.0, 1.75, 1.05)
            r_proj = random.triangular(0.0, 1.75, 1.05)
        cw_last = round(cmrr * r_last, 2)
        cw_proj = round(cmrr * r_proj, 2)
        q_last = round(cmrr * random.uniform(1.05, 1.28), 2)
        q_proj = round(cmrr * random.uniform(1.05, 1.28), 2)
        has_quota = random.random() > 0.08

        cw_last_wq = q_last if has_quota else 0
        cw_proj_wq = q_proj if has_quota else 0
        cw_last_wcmrr = cw_last
        cw_proj_wcmrr = cw_proj
        cw_combined = round((cw_last + cw_proj) / 2, 2)

        no_usage = (0, "No Usage", "No Usage")
        b_last = no_usage if (r_last == 0 and cmrr > 0) else attainment_band(r_last)
        b_proj = no_usage if (r_proj == 0 and cmrr > 0) else attainment_band(r_proj)
        usage = pick(["Cloud", "Cloud", "Hybrid"], weights=[70, 15, 15])
        arr_family = arr
        months_renew = random.randint(1, 12)
        renewal = TODAY + timedelta(days=months_renew * 30)

        def _fmt(n):
            n = int(round(n))
            return f"${n // 1000}K" if n >= 1000 else f"${n}"

        sub_str = f"Committed: {_fmt(cmrr)}/mo | Remaining: {_fmt(arr * 0.7)}"
        gap = round(cw_proj - cmrr, 2)
        dpct = ((cw_proj - cw_last) / cw_last * 100) if cw_last else 0
        ddsp = f"+{dpct:.1f}%" if dpct >= 0 else f"{dpct:.1f}%"
        cw_total = round(cw_last + cw_proj, 2)
        q_total = round(q_last + q_proj, 2)
    else:
        arr = arr_cloud = arr_ent = 0
        cmrr = 0
        cw_last = cw_proj = q_last = q_proj = 0
        cw_last_wq = cw_proj_wq = 0
        cw_last_wcmrr = cw_proj_wcmrr = cw_combined = 0
        b_last = b_proj = (0, "No Committed MRR",
                           "No Committed MRR")
        has_quota = False
        usage = "Self-Serve"
        arr_family = 0
        renewal = date(2026, 12, 1)
        months_renew = 10
        sub_str = ""
        gap = 0
        ddsp = "+0.0%"
        r_last = r_proj = 0.0
        cw_total = q_total = 0.0

    # Product usage
    if is_contracted:
        pp = PRODUCT_USAGE_CONTRACTED
    elif funnel_stage in (4, 5):
        pp = PRODUCT_USAGE_SELF_SERVE
    else:
        pp = PRODUCT_USAGE_NONE

    uses = {k: prod_status(v[0], v[1]) for k, v in pp.items()}
    prod_str = ", ".join(
        v for k, v in PRODUCT_LABELS.items()
        if uses[k] == "\U0001f535 Currently Using"
    )

    # Engagement & marketing
    has_mtg = random.random() < (0.68 if is_contracted else 0.28)
    has_other = random.random() < (0.50 if is_contracted else 0.22)
    opt_ins = (random.randint(0, 80) if funnel_stage <= 4
               else random.randint(0, 15))
    opt_6m = random.randint(0, opt_ins) if opt_ins else 0
    share_oi = round(opt_6m / opt_ins, 2) if opt_ins else 0.0
    behavior = pick(["High", "Medium", "Low", "No Recent Activity"],
                    weights=BEHAVIOR_SIGNAL_WEIGHTS)
    pulse = pick(["High", "Medium", "Low", "No Activity"],
                 weights=SALES_PULSE_WEIGHTS)

    if is_contracted:
        warmth = ("Hot" if behavior == "High"
                  else pick(["Hot", "Warm", "Cold"], weights=[25, 50, 25]))
    else:
        warmth = ("Warm" if behavior in ("High", "Medium") else "Cold")

    ind, sub_ind = pick(INDUSTRY_PAIRS)
    cx_s = random.randint(38, 99)
    sal_s = random.randint(38, 99)
    emp = random.randint(18, 2200)
    devops = random.randint(4, 350)
    fund = pick(FUNDING_ROUNDS, weights=FUNDING_WEIGHTS)
    fund_amounts = [0, 1_500_000, 7_000_000, 20_000_000,
                    45_000_000, 90_000_000, 0]
    fund_amt = random.choice(fund_amounts) if fund else 0
    marquee = "Yes" if fund_amt > 60_000_000 else "No"
    overlaps = random.randint(0, 8)
    overlap_str = (f"{overlaps} overlapping accounts" if overlaps != 1
                   else "1 overlapping account")
    avg_ss_mrr = random.randint(0, 5000) if funnel_stage in (4, 5) else 0
    uv = random.randint(0, 55)
    pv = random.randint(0, 22)
    rc = random.randint(0, 7)
    rnc = random.randint(0, 7)
    com = random.randint(0, 14)
    last_resp = date(2026, 2, 1)
    tech = pick(TECH_COMBOS)
    org_id_tp = f"org-{slug}001"
    territory_name = f"{region_key}-{segment}-{subregion['name']}"

    return dict(
        account_id=acct_id,
        account_id_territory_parent=acct_id,
        account_name=company_name,
        account_owner_region=region_key,
        account_owner_rvp_region=subregion["rvp"],
        account_owner_rsd_region=subregion["name"],
        account_owner_l1_territory=region_key,
        account_owner_l3_territory=subregion["l3"],
        account_owner_l4_territory=subregion["name"],
        account_owner_l6_territory=subregion["l6"],
        account_owner_segment=segment,
        account_owner_seller_type=seller_type,
        account_billing_country=country,
        account_billing_state_province=state,
        account_funnel_score_number=funnel_stage,
        tam_category_family=tam,
        arr_curr=arr,
        arr_cloud_curr=arr_cloud,
        arr_enterprise_curr=arr_ent,
        account_funnel_score_name=FUNNEL_NAMES[funnel_stage],
        consumption_weighted_last_month=cw_last,
        committed_mrr_last_month=cmrr,
        consumption_weighted_projected_current_month=cw_proj,
        committed_mrr_current_month=cmrr,
        consumption_weighted_quota_last_month=float(q_last),
        consumption_weighted_quota_current_month=float(q_proj),
        employee_ct_territory_parent=emp,
        usage_type_name_curr=usage,
        is_territory_parent="true",
        account_owner_name=ae_name,
        account_territory_name=territory_name,
        ct_opt_ins_marketing_ops=opt_ins,
        company_behavior_signal_marketing_ops=behavior,
        sales_activity_pulse_marketing_ops=pulse,
        account_owner_id=ae_id,
        account_mapped_sdr_name=sdr_name,
        account_mapped_sdr_id=sdr_id,
        account_solutions_engineer_name=se_name,
        account_solutions_engineer_id=se_id,
        account_observability_architect_manager_name=oam_name,
        account_observability_architect_manager_id=oam_id,
        account_observability_architect_name=oa_name,
        account_observability_architect_id=oa_id,
        is_account_assigned_to_ae_filter=(
            "Yes" if (is_contracted or seller_type == "AE") else "No"),
        is_territory_parent_filter="true",
        consumption_committed_mrr_attainment_band_name_last_month=b_last[1],
        consumption_committed_mrr_attainment_band_number_last_month=b_last[0],
        cons_committed_mrr_attainment_band_name_proj_curr_month=b_proj[1],
        cons_committed_mrr_attainment_band_number_proj_curr_month=b_proj[0],
        has_ae_sdr_meeting=str(has_mtg).lower(),
        has_other_ae_sdr_engagement=str(has_other).lower(),
        ct_opt_ins_contacted_l6m_marketing_ops=opt_6m,
        uses_visualization_status=uses["vis"],
        uses_metrics_status=uses["met"],
        uses_logs_status=uses["log"],
        uses_traces_status=uses["trc"],
        uses_profiles_status=uses["prf"],
        uses_k6_status=uses["k6"],
        uses_synthetics_status=uses["syn"],
        uses_frontend_observability_status=uses["fe"],
        uses_application_observability_status=uses["app"],
        uses_kubernetes_monitoring_status=uses["k8s"],
        uses_irm_status=uses["irm"],
        warmth_rank_warmth_model=warmth,
        account_org_slug_sfdc=slug,
        string_products_in_use_projected_current_month=prod_str,
        avg_mrr_self_serve_l3m=avg_ss_mrr,
        cx_happiness_score_display=happiness_label(cx_s),
        sales_happiness_score_display=happiness_label(sal_s),
        has_ae_sdr_meeting_display="Yes" if has_mtg else "No",
        has_other_ae_sdr_engagement_display="Yes" if has_other else "No",
        consumption_weighted_projected_current_month_gap_to_current_mrr=gap,
        consumption_weighted_projected_current_month_delta_mom_display=ddsp,
        consumption_weighted_committed_mrr_attainment_last_month=round(r_last, 3),
        cons_committed_mrr_attainment_band_description_last_month=b_last[2],
        cons_weighted_committed_mrr_attainment_proj_curr_month=round(r_proj, 3),
        cons_committed_mrr_attainment_band_description_proj_curr_month=b_proj[2],
        subscription_details_string=sub_str,
        close_date_next_renewal=renewal.isoformat(),
        months_to_close_date_next_renewal=months_renew,
        account_industry_zoominfo=ind,
        account_sub_industry_zoominfo=sub_ind,
        ct_employees_devops_clay=devops,
        latest_funding_round_clay=fund,
        total_funding_amount_clay_family=fund_amt,
        marquee_list_clay_display=marquee,
        technology_list=tech,
        crossbeam_overlap_summary=overlap_str,
        arr_curr_family=arr_family,
        account_org_slug_sfdc_territory_parent=slug,
        account_org_id_sfdc_territory_parent=org_id_tp,
        account_name_territory_parent=company_name,
        committed_mrr=float(cmrr),
        consumption_weighted_quota=q_total,
        consumption_weighted_total=cw_total,
        consumption_weighted_last_month_with_quota=float(cw_last_wq),
        consumption_weighted_last_month_with_committed_mrr=float(cw_last_wcmrr),
        consumption_weighted_projected_current_month_with_quota=float(cw_proj_wq),
        consumption_weighted_projected_current_month_with_committed_mrr=float(cw_proj_wcmrr),
        consumption_weighted_actual_projected_combined=float(cw_combined),
        consumption_weighted_actual_projected_combined_ttl=float(cw_combined),
        is_territory_parent_display="Territory Parent",
        is_territory_parent_one_hot=1,
        cx_happiness_score=cx_s,
        sales_happiness_score=sal_s,
        last_response_date_marketing_ops=last_resp.isoformat(),
        share_opt_ins_contacted_l6m_marketing_ops=share_oi,
        ct_unique_visitors_l30d_marketing_ops=uv,
        ct_page_views_buying_intent_l30d_marketing_ops=pv,
        ct_responses_cloud_l30d_marketing_ops=rc,
        ct_responses_non_cloud_l30d_marketing_ops=rnc,
        ct_community_activities_l30d_marketing_ops=com,
        uses_database_observability_status=uses["dbo"],
        uses_grafana_assistant_status=uses["ga"],
        has_consumption_weighted_quota=str(has_quota).lower(),
        has_target=str(is_contracted).lower(),
        account_org_id_sfdc=slug,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Opportunity generator
# ═══════════════════════════════════════════════════════════════════════════════

_opp_counter = 0


def _make_opp(acct_id, company, stage, close_dt, opp_type, nacv,
              won=False, rvp=True, rsd=True, ae=True):
    global _opp_counter
    _opp_counter += 1
    racv = round(nacv * 0.8)
    tcv = round(nacv * 3)
    svc = round(nacv * 0.1)
    cat = ("Closed Won" if won
           else ("Qualified Pipeline" if stage >= 3 else "Early Stage"))
    return dict(
        account_id=acct_id,
        net_nacv_split=nacv, net_nacv_ttl=nacv,
        stage_number=stage,
        close_date=close_dt.isoformat(),
        opp_type_qbr=opp_type,
        split_percentage=1.0,
        opp_id=f"OPP{acct_id[-5:]}{_opp_counter:04d}",
        opp_name=f"{company} - {opp_type}",
        stage_name=OPP_STAGE_NAMES[stage],
        fq_close_date=fiscal_quarter(close_dt),
        is_cro_forecast=str(won).lower(),
        is_vp_forecast=str(won).lower(),
        is_rvp_forecast=str(rvp).lower(),
        is_rsd_forecast=str(rsd).lower(),
        is_ae_forecast=str(ae).lower(),
        net_racv_ttl=racv, net_racv_split=racv, net_racv=racv,
        net_nacv=nacv,
        net_tcv=tcv, net_tcv_split=tcv,
        services_split=svc,
        stage_category=cat,
    )


def _random_date_in_quarter():
    """Random date within the dashboard's absolute time range."""
    span = (FY_Q1_END - FY_Q1_START).days
    return FY_Q1_START + timedelta(days=random.randint(0, span))


def gen_opportunities(account_id, company_name, funnel_stage, arr):
    """Generate opportunity rows for one account."""
    opps = []
    is_contracted = (funnel_stage == 1)

    if is_contracted:
        # Closed-won deals: dates within the quarter
        for _ in range(random.randint(1, 3)):
            close_dt = _random_date_in_quarter()
            opp_type = pick(
                OPP_TYPES_NEW + OPP_TYPES_EXPANSION,
                weights=[30, 5, 50, 15])
            nacv = (0 if opp_type == "Flat Renewal"
                    else round(arr * random.uniform(0.18, 0.75)))
            opps.append(_make_opp(
                account_id, company_name, 7, close_dt,
                opp_type, nacv, won=True))
        # Open expansion opps: 80% of contracted accounts get one
        if random.random() > 0.20:
            close_dt = _random_date_in_quarter()
            nacv = round(arr * random.uniform(0.08, 0.35))
            opps.append(_make_opp(
                account_id, company_name, random.randint(3, 6),
                close_dt, "Expansion", nacv, won=False))

    elif funnel_stage in (2, 3):
        for _ in range(random.randint(1, 2)):
            close_dt = _random_date_in_quarter()
            nacv = random.randint(300, 2800)
            opps.append(_make_opp(
                account_id, company_name, random.randint(2, 5),
                close_dt, pick(OPP_TYPES_NEW), nacv, won=False,
                rvp=random.random() > 0.4))

    elif funnel_stage == 4 and random.random() > 0.65:
        close_dt = _random_date_in_quarter()
        nacv = random.randint(100, 1200)
        opps.append(_make_opp(
            account_id, company_name, random.randint(2, 4),
            close_dt, "New (SS \u2192 Contracted)", nacv, won=False))

    return opps


# ═══════════════════════════════════════════════════════════════════════════════
# Org generator
# ═══════════════════════════════════════════════════════════════════════════════

def gen_orgs(account_id, company_name, slug, funnel_stage, arr):
    """Generate org-level rows for one account."""
    is_contracted = (funnel_stage == 1)

    if is_contracted:
        n_orgs = 3 if arr > 400 else (2 if arr > 150 else 1)
        base_type = "Cloud Advanced" if arr > 400 else "Cloud Pro"
    elif funnel_stage in (4, 5):
        n_orgs = random.randint(1, 2)
        base_type = "Cloud Free"
    else:
        return []

    suffixes = ["-prod", "-dev", "-staging"][:n_orgs]
    funnel_lbl = FUNNEL_NAMES.get(funnel_stage, "")
    orgs = []

    for i, sfx in enumerate(suffixes):
        primary = (i == 0)
        org_arr = arr if primary and is_contracted else 0
        mrr_d = random.randint(-800, 6000) if primary and is_contracted else 0
        bu = (random.randint(5, 90) if is_contracted and primary
              else random.randint(0, 12))
        series = (random.randint(200_000, 5_000_000)
                  if is_contracted and primary
                  else random.randint(0, 400_000))
        logs = series * random.randint(2, 5) if is_contracted else 0
        traces = (round(series * random.uniform(0.25, 0.75))
                  if is_contracted else 0)
        profiles = (round(series * random.uniform(0.1, 0.45))
                    if is_contracted and random.random() > 0.4 else 0)
        k6 = (random.randint(0, 140_000)
              if is_contracted and random.random() > 0.5 else 0)
        irm_u = (random.randint(0, 22)
                 if is_contracted and random.random() > 0.6 else 0)
        app_h = (random.randint(0, 4500)
                 if is_contracted and random.random() > 0.6 else 0)
        fe_s = (random.randint(0, 2_800_000)
                if is_contracted and random.random() > 0.6 else 0)
        sm_c = (random.randint(0, 450)
                if is_contracted and random.random() > 0.5 else 0)
        k8s_type = (pick(["Active", "Inactive", ""], weights=[40, 30, 30])
                    if is_contracted else "")
        integrs = "|".join(random.sample(
            ["prometheus", "loki", "tempo", "pyroscope", "mimir", "graphite"],
            k=random.randint(1, 4)))
        hg_keys = ["prometheus", "loki", "tempo", "graphite"]
        hg = {k: random.randint(1, 5) for k in hg_keys
              if random.random() > 0.5}
        hg_str = str(hg).replace("'", '"') if hg else ""

        if org_arr > 0:
            b = org_arr // 4
            sp_arr = str([round(b * r)
                          for r in [0.91, 0.95, 0.98, 1.0]]).replace(" ", "")
        else:
            sp_arr = "[]"

        hm_b = max(mrr_d, 0)
        sp_hm = (str([round(hm_b * r)
                       for r in [0.5, 0.7, 0.85, 1.0]]).replace(" ", "")
                 if hm_b else "[]")
        warmth = (pick(["Hot", "Warm", "Cold"], weights=[25, 45, 30])
                  if is_contracted else "Cold")
        sp_val = (pick(["Expansion", "New Logo", "Flat Renewal"],
                       weights=[50, 30, 20])
                  if is_contracted else "New Logo")
        act_dt = (TODAY - timedelta(
            days=random.randint(0, 42))).isoformat()

        orgs.append(dict(
            sfdc_account_id=account_id,
            sfdc_account_name=company_name,
            org_slug=f"{slug}{sfx}",
            org_type=base_type if primary else "Cloud Free",
            revops_account_funnel=funnel_lbl,
            sales_plays=sp_val,
            warmth_rank_warmth_model=warmth,
            last_activity_date=act_dt,
            arr=org_arr,
            mrr_delta=mrr_d if primary else 0,
            billable_users=bu,
            billable_users_delta=random.randint(-3, 8),
            billable_series=series,
            billable_series_delta=random.randint(-50_000, 300_000),
            billable_logs=logs,
            billable_logs_delta=random.randint(-50_000, 450_000),
            billable_traces=traces,
            billable_traces_delta=random.randint(-10_000, 120_000),
            billable_profiles=profiles,
            billable_profiles_delta=random.randint(0, 45_000),
            billable_k6_vuh=k6,
            billable_k6_vuh_delta=random.randint(-5_000, 9_000),
            billable_irm_users=irm_u,
            billable_irm_user_delta=random.randint(0, 3),
            billable_app_o11y_host_hours=app_h,
            billable_app_o11y_host_hours_delta=random.randint(0, 450),
            billable_fe_o11y_sessions=fe_s,
            billable_fe_o11y_sessions_delta=random.randint(0, 180_000),
            billable_sm_checks=sm_c,
            billable_sm_checks_delta=random.randint(0, 45),
            k8s_o11y_pricing_type=k8s_type,
            integrations=integrs,
            hg_datasource_cnts=hg_str,
            arr_sparkline_values=sp_arr,
            hm_sparkline_values=sp_hm,
        ))
    return orgs


# ═══════════════════════════════════════════════════════════════════════════════
# Main entry point
# ═══════════════════════════════════════════════════════════════════════════════

def generate_all():
    """Generate all data. Returns (accounts, opps, orgs) as lists of dicts."""
    random.seed(RANDOM_SEED)
    global _opp_counter
    _opp_counter = 0

    total = sum(ACCOUNTS_PER_REGION.values())
    company_names = generate_company_names(total)
    name_offset = 0

    all_accounts = []
    all_opps = []
    all_orgs = []
    global_idx = 0

    for region_key, region_count in ACCOUNTS_PER_REGION.items():
        sellers = SELLERS[region_key]
        subregions = REGIONS[region_key]
        stage_pool = make_stage_pool(region_count)
        region_names = company_names[name_offset:name_offset + region_count]
        name_offset += region_count

        for i, (company_name, slug) in enumerate(region_names):
            global_idx += 1
            funnel_stage = stage_pool[i]
            sub = subregions[i % len(subregions)]

            account = gen_account(
                region_key, global_idx, company_name, slug,
                sub, funnel_stage, sellers,
            )
            all_accounts.append(account)

            acct_id = account["account_id"]
            arr = account["arr_curr"]
            all_opps.extend(
                gen_opportunities(acct_id, company_name, funnel_stage, arr))
            all_orgs.extend(
                gen_orgs(acct_id, company_name, slug, funnel_stage, arr))

    return all_accounts, all_opps, all_orgs


def write_csv(filepath, fieldnames, rows):
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_csvs(output_dir, accounts, opps, orgs):
    """Write 3 CSVs to the given directory."""
    os.makedirs(output_dir, exist_ok=True)
    write_csv(
        os.path.join(output_dir,
                     "territory_navigator_account_details.csv"),
        ACCT_COLS, accounts,
    )
    write_csv(
        os.path.join(output_dir, "opp_split.csv"),
        OPP_COLS, opps,
    )
    write_csv(
        os.path.join(output_dir, "territory_navigator_orgs.csv"),
        ORG_COLS, orgs,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate Territory Navigator demo seed data.")
    parser.add_argument(
        "--output-dir",
        default=str(Path(__file__).resolve().parent),
        help="Directory to write CSVs into (default: next to this script)",
    )
    args = parser.parse_args()

    accounts, opps, orgs = generate_all()
    write_csvs(args.output_dir, accounts, opps, orgs)

    print(f"Accounts:      {len(accounts)}")
    print(f"Opportunities: {len(opps)}")
    print(f"Orgs:          {len(orgs)}")
    print(f"Output:        {args.output_dir}")

    from collections import Counter
    stages = [a["account_funnel_score_number"] for a in accounts]
    print("\nFunnel stage distribution:")
    for s, c in sorted(Counter(stages).items()):
        print(f"  Stage {s} ({FUNNEL_NAMES[s]}): {c}")


if __name__ == "__main__":
    main()
