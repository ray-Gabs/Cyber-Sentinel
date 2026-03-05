# ============================================================
# backend/domains/soc/tuning.py — Weekly Alert Tuning Advisor
# ============================================================
# Analyzes the past N days of alert data and generates
# per-rule tuning recommendations based on FP/TP rates,
# alert volume, and agent distribution patterns.
# ============================================================

import logging
from datetime import datetime, timedelta, timezone

from domains.soc.models import Alert
from domains.soc.tuning_models import TuningRecommendation

log = logging.getLogger(__name__)

# Thresholds that drive recommendation logic
THRESHOLDS = {
    "min_alerts": 10,           # need at least this many to generate a recommendation
    "high_fp_rate": 0.60,       # 60%+ FP rate → suggest tuning
    "extreme_fp_rate": 0.90,    # 90%+ FP with high volume → suggest disable
    "high_volume": 100,         # 100+ alerts in window = high noise rule
}


class TuningAnalyzer:
    """Analyzes Wazuh alert patterns and generates actionable tuning recommendations."""

    async def analyze(self, days: int = 7) -> list[TuningRecommendation]:
        """
        Run full analysis for the past `days` days.

        Aggregates alerts by rule_id, calculates FP/TP rates,
        and upserts TuningRecommendation documents for noisy rules.
        Returns the list of generated recommendations.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        pipeline = [
            {"$match": {"timestamp": {"$gte": since}}},
            {"$group": {
                "_id": "$rule_id",
                "rule_description": {"$first": "$rule_description"},
                "rule_level":       {"$first": "$rule_level"},
                "total":            {"$sum": 1},
                "ai_fp_count": {"$sum": {"$cond": [
                    {"$eq": ["$ai_verdict", "FALSE_POSITIVE"]}, 1, 0,
                ]}},
                "analyst_fp_count": {"$sum": {"$cond": [
                    {"$eq": ["$analyst_override", "FALSE_POSITIVE"]}, 1, 0,
                ]}},
                "tp_count": {"$sum": {"$cond": [
                    {"$eq": ["$ai_verdict", "TRUE_POSITIVE"]}, 1, 0,
                ]}},
                "agents":     {"$addToSet": "$agent_name"},
                "sample_ids": {"$push": {"$toString": "$_id"}},
            }},
            {"$match": {"total": {"$gte": THRESHOLDS["min_alerts"]}}},
            {"$sort":  {"total": -1}},
            {"$limit": 100},  # analyse top 100 noisiest rules
        ]

        alert_coll = Alert.get_motor_collection()
        rows = await alert_coll.aggregate(pipeline).to_list(length=None)

        recommendations: list[TuningRecommendation] = []
        for row in rows:
            rec = self._evaluate_rule(row, days)
            if rec:
                await self._upsert(rec)
                recommendations.append(rec)

        log.info(
            "[Tuning] analysis complete: %d rules evaluated, %d recommendations generated (window=%dd)",
            len(rows), len(recommendations), days,
        )
        return recommendations

    # ── Private helpers ──────────────────────────────────────────────────────

    def _evaluate_rule(self, row: dict, days: int) -> TuningRecommendation | None:
        """Evaluate one rule's aggregated stats and return a recommendation, or None if the rule is healthy."""
        rule_id = row.get("_id")
        if not rule_id:
            return None

        total        = row["total"]
        fp_count     = row["ai_fp_count"] + row.get("analyst_fp_count", 0)
        tp_count     = row["tp_count"]
        fp_rate      = round(fp_count / max(total, 1), 3)
        current_level = int(row.get("rule_level") or 5)

        # Filter None names before sorting
        top_agents = sorted(
            [a for a in (row.get("agents") or []) if a],
            key=lambda x: x,
        )[:5]
        sample_ids = (row.get("sample_ids") or [])[:10]

        # ── Recommendation logic ──────────────────────────────────────────────
        if fp_rate >= THRESHOLDS["extreme_fp_rate"] and total >= THRESHOLDS["high_volume"]:
            action         = "disable_rule"
            suggested_level = None
            reason = (
                f"Rule {rule_id} fired {total}x over {days}d with a {fp_rate:.0%} false positive rate "
                f"({fp_count}/{total} FP). Extremely noisy — consider disabling or replacing."
            )

        elif fp_rate >= THRESHOLDS["high_fp_rate"]:
            action          = "increase_threshold"
            suggested_level = min(current_level + 2, 15)
            reason = (
                f"Rule {rule_id} has {fp_rate:.0%} FP rate ({fp_count}/{total} alerts, {days}d window). "
                f"Raising level from {current_level} → {suggested_level} should reduce alert noise."
            )

        elif total >= THRESHOLDS["high_volume"] and tp_count == 0:
            action          = "add_exclusion"
            suggested_level = None
            agent_hint      = ", ".join(top_agents[:3]) if top_agents else "all agents"
            reason = (
                f"Rule {rule_id} generated {total} alerts in {days}d with zero confirmed true positives. "
                f"Consider adding exclusions for known-good sources: {agent_hint}."
            )

        else:
            return None  # Rule is performing acceptably — no recommendation

        return TuningRecommendation(
            rule_id=str(rule_id),
            rule_description=row.get("rule_description") or f"Rule {rule_id}",
            alert_count=total,
            fp_count=fp_count,
            tp_count=tp_count,
            fp_rate=fp_rate,
            recommended_action=action,
            current_level=current_level,
            suggested_level=suggested_level,
            top_agents=top_agents,
            sample_alert_ids=sample_ids,
            reason=reason,
            analysis_window_days=days,
        )

    async def _upsert(self, rec: TuningRecommendation) -> None:
        """Upsert by rule_id within the current calendar day to avoid duplicates."""
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        existing = await TuningRecommendation.find_one({
            "rule_id": rec.rule_id,
            "generated_at": {"$gte": today},
        })
        if existing:
            existing.alert_count       = rec.alert_count
            existing.fp_count          = rec.fp_count
            existing.tp_count          = rec.tp_count
            existing.fp_rate           = rec.fp_rate
            existing.recommended_action = rec.recommended_action
            existing.suggested_level   = rec.suggested_level
            existing.top_agents        = rec.top_agents
            existing.reason            = rec.reason
            await existing.save()
        else:
            await rec.insert()


tuning_analyzer = TuningAnalyzer()
