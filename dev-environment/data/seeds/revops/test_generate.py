"""Tests for the RevOps demo data generator."""
import pytest
from datetime import date
from collections import Counter, defaultdict
from generate import (
    ACCT_COLS, OPP_COLS, ACCOUNTS_PER_REGION,
    fiscal_quarter, generate_all, generate_company_names,
)


@pytest.fixture(scope="module")
def dataset():
    """Generate the full dataset once for all tests."""
    return generate_all()


@pytest.fixture(scope="module")
def accounts(dataset):
    return dataset[0]


@pytest.fixture(scope="module")
def opps(dataset):
    return dataset[1]


# ── Name generation ──────────────────────────────────────────────────────────

class TestNameGeneration:
    def test_generates_requested_count(self):
        assert len(generate_company_names(300)) == 300

    def test_names_are_unique(self):
        assert len(set(generate_company_names(300))) == 300

    def test_names_are_alliterative(self):
        for name in generate_company_names(300):
            words = name.split()
            assert len(words) == 2
            assert words[0][0] == words[1][0], f"Not alliterative: {name}"


# ── Volume and structure ─────────────────────────────────────────────────────

class TestVolume:
    def test_total_account_count(self, accounts):
        assert len(accounts) == sum(ACCOUNTS_PER_REGION.values())

    def test_region_counts(self, accounts):
        by_region = Counter(a["region"] for a in accounts)
        for region, expected in ACCOUNTS_PER_REGION.items():
            assert by_region[region] == expected

    def test_opps_not_empty(self, opps):
        assert len(opps) > 0


class TestSchema:
    def test_account_columns(self, accounts):
        for acct in accounts:
            assert set(acct.keys()) == set(ACCT_COLS)

    def test_opp_columns(self, opps):
        for opp in opps:
            assert set(opp.keys()) == set(OPP_COLS)


# ── Distribution ─────────────────────────────────────────────────────────────

class TestDistribution:
    def test_all_funnel_stages_present(self, accounts):
        stages = {a["funnel_stage_number"] for a in accounts}
        assert stages == set(range(1, 9))

    def test_all_regions_have_several_owners(self, accounts):
        for region in ACCOUNTS_PER_REGION:
            owners = {a["account_owner"] for a in accounts
                      if a["region"] == region}
            assert len(owners) >= 2, f"Region {region} has too few AEs"

    def test_tam_categories_present(self, accounts):
        assert len({a["tam_category"] for a in accounts}) >= 3

    def test_behavior_signals_present(self, accounts):
        signals = {a["behavior_signal"] for a in accounts}
        assert {"High", "Low"} <= signals

    def test_open_and_closed_opps_present(self, opps):
        stages = {o["stage_number"] for o in opps}
        assert 7 in stages
        assert stages & {3, 4, 5, 6}


# ── Referential integrity and uniqueness ─────────────────────────────────────

class TestIntegrity:
    def test_opp_account_ids_exist(self, accounts, opps):
        acct_ids = {a["account_id"] for a in accounts}
        for opp in opps:
            assert opp["account_id"] in acct_ids

    def test_account_ids_unique(self, accounts):
        ids = [a["account_id"] for a in accounts]
        assert len(set(ids)) == len(ids)

    def test_opp_ids_unique(self, opps):
        ids = [o["opp_id"] for o in opps]
        assert len(set(ids)) == len(ids)

    def test_ae_works_in_one_sub_region(self, accounts):
        """Filtering by AE and by sub-region must agree on account counts."""
        by_ae = defaultdict(set)
        for a in accounts:
            by_ae[a["account_owner"]].add(a["sub_region"])
        offenders = {ae: s for ae, s in by_ae.items() if len(s) > 1}
        assert not offenders

    def test_sub_region_belongs_to_region(self, accounts):
        for a in accounts:
            assert a["sub_region"].startswith(a["region"] + "-")


# ── Fiscal calendar ──────────────────────────────────────────────────────────

class TestFiscalQuarter:
    @pytest.mark.parametrize("d, expected", [
        (date(2026, 1, 31), "FY26-Q4"),
        (date(2026, 2, 1), "FY27-Q1"),
        (date(2026, 4, 30), "FY27-Q1"),
        (date(2026, 5, 1), "FY27-Q2"),
        (date(2026, 12, 31), "FY27-Q4"),
    ])
    def test_feb_start_fiscal_year(self, d, expected):
        assert fiscal_quarter(d) == expected


# ── Idempotency ──────────────────────────────────────────────────────────────

class TestIdempotency:
    def test_deterministic_output(self):
        assert generate_all() == generate_all()
