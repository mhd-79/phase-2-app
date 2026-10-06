"""Return conditions / actions and the store return policy (pure validation; the database flow is covered end to end separately)."""
import pytest
from fastapi import HTTPException

from app.routers.billing import _return_line_options
from app.routers.stock_adjustments import REVIEW_OUTCOMES
from app.schemas import SaleReturnCreate, StoreSettingsUpdate


def test_defaults_are_good_condition_and_the_policy_action():
    assert _return_line_options({"sku": "A", "qty": 1}, "BOTH") == ("Good", "Return")
    assert _return_line_options({"sku": "A", "qty": 1}, "RETURN") == ("Good", "Return")
    assert _return_line_options({"sku": "A", "qty": 1}, "EXCHANGE") == ("Good", "Exchange")


def test_cashier_can_mark_damaged_or_warranty_in_any_letter_case():
    assert _return_line_options({"condition": "damaged"}, "BOTH")[0] == "Damaged"
    assert _return_line_options({"condition": "WARRANTY", "action": "exchange"}, "BOTH") == ("Warranty", "Exchange")


def test_unknown_values_are_rejected():
    for bad in ({"condition": "Broken"}, {"action": "Swap"}):
        with pytest.raises(HTTPException) as e:
            _return_line_options(bad, "BOTH")
        assert e.value.status_code == 422


def test_store_policy_limits_the_allowed_action():
    with pytest.raises(HTTPException) as e:
        _return_line_options({"action": "Exchange"}, "RETURN")
    assert e.value.status_code == 400
    with pytest.raises(HTTPException):
        _return_line_options({"action": "Return"}, "EXCHANGE")
    assert _return_line_options({"action": "Exchange"}, "EXCHANGE")[1] == "Exchange"


def test_reason_is_optional_and_policy_setting_is_validated():
    assert SaleReturnCreate(invoice_no="X", items=[]).reason is None
    assert StoreSettingsUpdate(return_policy="exchange").return_policy == "EXCHANGE"
    with pytest.raises(Exception):
        StoreSettingsUpdate(return_policy="MAYBE")


def test_review_outcomes_move_stock_in_the_expected_direction():
    assert REVIEW_OUTCOMES["RESTOCK"]["sign"] == 1 and REVIEW_OUTCOMES["WRITE_OFF"]["sign"] == 0
    assert REVIEW_OUTCOMES["WARRANTY_REPLACE"]["sign"] == -1 and REVIEW_OUTCOMES["WARRANTY_REPLACE"]["only"] == "Warranty"
