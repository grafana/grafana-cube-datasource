"""Tests for Territory Navigator data generator."""
import pytest
from datetime import date
from collections import Counter
from generate import (
    ACCT_COLS, OPP_COLS, ORG_COLS,
    ACCOUNTS_PER_REGION, FUNNEL_NAMES, ARR_RANGES,
    fiscal_quarter, generate_all, generate_company_names,
)


@pytest.fixture(scope="module")
def dataset():
    """Generate the full dataset once for all tests."""
    accounts, opps, orgs = generate_all()
    return accounts, opps, orgs


@pytest.fixture(scope="module")
def accounts(dataset):
    return dataset[0]


@pytest.fixture(scope="module")
def opps(dataset):
    return dataset[1]


@pytest.fixture(scope="module")
def orgs(dataset):
    return dataset[2]


# ── Name generation ──────────────────────────────────────────────────────────

class TestNameGeneration:
    def test_generates_requested_count(self):
        names = generate_company_names(300)
        assert len(names) == 300

    def test_names_are_unique(self):
        names = generate_company_names(300)
        name_strs = [n[0] for n in names]
        assert len(set(name_strs)) == 300

    def test_names_are_alliterative(self):
        names = generate_company_names(300)
        for name, slug in names:
            words = name.split()
            assert len(words) == 2
            assert words[0][0] == words[1][0], (
                f"Not alliterative: {name}")

    def test_slugs_are_lowercase_hyphenated(self):
        names = generate_company_names(100)
        for name, slug in names:
            assert slug == name.lower().replace(" ", "-")

    def test_pool_large_enough_for_scaling(self):
        names = generate_company_names(500)
        assert len(names) == 500


# ── Volume and structure ─────────────────────────────────────────────────────

class TestVolume:
    def test_total_account_count(self, accounts):
        expected = sum(ACCOUNTS_PER_REGION.values())
        assert len(accounts) == expected

    def test_region_counts(self, accounts):
        by_region = Counter(a["account_owner_region"] for a in accounts)
        for region, expected in ACCOUNTS_PER_REGION.items():
            assert by_region[region] == expected

    def test_opps_not_empty(self, opps):
        assert len(opps) > 0

    def test_orgs_not_empty(self, orgs):
        assert len(orgs) > 0


# ── Schema ───────────────────────────────────────────────────────────────────

class TestSchema:
    def test_account_columns(self, accounts):
        for acct in accounts[:5]:
            assert set(acct.keys()) == set(ACCT_COLS)

    def test_opp_columns(self, opps):
        for opp in opps[:5]:
            assert set(opp.keys()) == set(OPP_COLS)

    def test_org_columns(self, orgs):
        for org in orgs[:5]:
            assert set(org.keys()) == set(ORG_COLS)


# ── Distribution ─────────────────────────────────────────────────────────────

class TestDistribution:
    def test_all_funnel_stages_present(self, accounts):
        stages = {a["account_funnel_score_number"] for a in accounts}
        for s in range(1, 9):
            assert s in stages, f"Funnel stage {s} missing"

    def test_all_regions_have_sellers(self, accounts):
        for region in ACCOUNTS_PER_REGION:
            region_accounts = [
                a for a in accounts if a["account_owner_region"] == region
            ]
            ae_names = {a["account_owner_name"] for a in region_accounts}
            assert len(ae_names) >= 2, (
                f"Region {region} has too few AEs: {ae_names}")

    def test_tam_categories_present(self, accounts):
        tams = {a["tam_category_family"] for a in accounts}
        assert len(tams) >= 3

    def test_behavior_signals_present(self, accounts):
        signals = {a["company_behavior_signal_marketing_ops"]
                   for a in accounts}
        assert "High" in signals
        assert "Low" in signals

    def test_attainment_bands_present(self, accounts):
        contracted = [a for a in accounts
                      if a["account_funnel_score_number"] == 1]
        bands = {a["consumption_committed_mrr_attainment_band_name_last_month"]
                 for a in contracted}
        assert len(bands) >= 3


# ── Referential integrity ────────────────────────────────────────────────────

class TestReferentialIntegrity:
    def test_opp_account_ids_exist(self, accounts, opps):
        acct_ids = {a["account_id"] for a in accounts}
        for opp in opps:
            assert opp["account_id"] in acct_ids, (
                f"Opp references missing account {opp['account_id']}")

    def test_org_account_ids_exist(self, accounts, orgs):
        acct_ids = {a["account_id"] for a in accounts}
        for org in orgs:
            assert org["sfdc_account_id"] in acct_ids, (
                f"Org references missing account {org['sfdc_account_id']}")


# ── Uniqueness ───────────────────────────────────────────────────────────────

class TestUniqueness:
    def test_account_ids_unique(self, accounts):
        ids = [a["account_id"] for a in accounts]
        assert len(set(ids)) == len(ids)

    def test_opp_ids_unique(self, opps):
        ids = [o["opp_id"] for o in opps]
        assert len(set(ids)) == len(ids)


# ── Revenue sanity ───────────────────────────────────────────────────────────

class TestRevenue:
    def test_contracted_have_positive_arr(self, accounts):
        contracted = [a for a in accounts
                      if a["account_funnel_score_number"] == 1]
        assert len(contracted) > 0
        for a in contracted:
            if a["tam_category_family"] != "0. None":
                assert a["arr_curr"] > 0, (
                    f"Contracted account {a['account_id']} has zero ARR")

    def test_non_contracted_have_zero_arr(self, accounts):
        non_contracted = [a for a in accounts
                          if a["account_funnel_score_number"] > 1]
        for a in non_contracted:
            assert a["arr_curr"] == 0, (
                f"Non-contracted {a['account_id']} has ARR={a['arr_curr']}")

    def test_arr_in_tam_range(self, accounts):
        contracted = [a for a in accounts
                      if a["account_funnel_score_number"] == 1]
        for a in contracted:
            tam = a["tam_category_family"]
            arr = a["arr_curr"]
            if tam in ARR_RANGES:
                lo, hi = ARR_RANGES[tam]
                assert lo <= arr <= hi, (
                    f"ARR {arr} out of range [{lo},{hi}] for TAM {tam}")


# ── Territory invariants ─────────────────────────────────────────────────────

class TestTerritoryInvariants:
    """Regression tests for the production invariant that each AE is tied to
    exactly one L3 territory (and therefore exactly one RVP region).

    The SQL dashboard's `filter_account_owner_id` template cascade relies on
    this invariant; violating it causes per-territory account counts to be
    over-reported because the cascade pulls in every account owned by an AE
    who touches the selected territory.
    """

    def test_ae_does_not_span_multiple_l3(self, accounts):
        from collections import defaultdict
        by_ae = defaultdict(set)
        for a in accounts:
            by_ae[a["account_owner_id"]].add(
                a["account_owner_l3_territory"])
        offenders = {
            ae: sorted(ls) for ae, ls in by_ae.items() if len(ls) > 1
        }
        assert not offenders, (
            f"AEs spanning multiple L3 territories: {offenders}")

    def test_ae_does_not_span_multiple_rvp_region(self, accounts):
        from collections import defaultdict
        by_ae = defaultdict(set)
        for a in accounts:
            by_ae[a["account_owner_id"]].add(
                a["account_owner_rvp_region"])
        offenders = {
            ae: sorted(rs) for ae, rs in by_ae.items() if len(rs) > 1
        }
        assert not offenders, (
            f"AEs spanning multiple RVP regions: {offenders}")


# ── Fiscal calendar and quota ────────────────────────────────────────────────

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


class TestQuota:
    def test_with_quota_is_consumption_not_quota(self, accounts):
        for a in accounts:
            if a["has_consumption_weighted_quota"] == "true":
                assert a["consumption_weighted_last_month_with_quota"] == a["consumption_weighted_last_month"]


# ── Idempotency ──────────────────────────────────────────────────────────────

class TestIdempotency:
    def test_deterministic_output(self):
        a1, o1, r1 = generate_all()
        a2, o2, r2 = generate_all()
        assert len(a1) == len(a2)
        assert len(o1) == len(o2)
        assert len(r1) == len(r2)
        for x, y in zip(a1, a2):
            assert x == y
        for x, y in zip(o1, o2):
            assert x == y
        for x, y in zip(r1, r2):
            assert x == y
