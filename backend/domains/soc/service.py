# ============================================================
# backend/domains/soc/service.py — SOC Alert Business Logic
# ============================================================

import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from core.cache import cache_invalidate_analytics
from domains.auth.models import User
from domains.soc.models import AiVerdict, Alert, CustomDetectionRule
from domains.soc.schemas import AnalystOverrideRequest, CustomRuleCreate, CustomRuleUpdate

log = logging.getLogger(__name__)


async def ingest_wazuh_alert(
    raw: dict,
    tenant_id: str | None = None,
) -> Alert:
    """
    Convert a raw Wazuh alert dict → our Alert document and save it.
    Called by the polling task or webhook handler.

    tenant_id is resolved from the per-user wazuh_token by the webhook endpoint.
    """
    # Check if we already ingested this alert
    wazuh_id = raw.get("id", raw.get("_id", ""))
    existing = await Alert.find_one({"wazuh_id": str(wazuh_id)})
    if existing:
        return existing  # Skip duplicates

    rule = raw.get("rule", {})
    agent = raw.get("agent", {})

    # Run custom rule matching — scope to global platform rules + this tenant's personal rules.
    # Loading ALL rules would fire User B's personal patterns against User A's alerts.
    from domains.soc.rule_matcher import match_alert
    rule_conditions: list[dict] = [{"user_id": "system", "enabled": True}]
    if tenant_id:
        rule_conditions.append({"user_id": tenant_id, "project_id": None, "enabled": True})

    # Also load project-scoped rules if the alert came from a known project agent
    cs_group = raw.get("_cs_group", "")
    if tenant_id and cs_group:
        from domains.soc.project_models import SocProject
        project = await SocProject.find_one(
            {
                "owner_id": tenant_id,
                "$or": [
                    {"wazuh_agent_name": cs_group},
                    {"wazuh_agent_id": cs_group},
                    {"slug": {"$regex": re.escape(cs_group), "$options": "i"}},
                ],
            }
        )
        if project:
            rule_conditions.append({
                "user_id": tenant_id,
                "project_id": str(project.id),
                "enabled": True,
            })

    all_rules = await CustomDetectionRule.find({"$or": rule_conditions}).to_list()
    matched_rules = match_alert(raw, all_rules)

    # full_log is absent for many Wazuh alert types (FIM, vuln, syscollector).
    # Fall back to a synthetic line built from location + top-level data fields.
    full_log: str = raw.get("full_log") or raw.get("message") or ""
    if not full_log:
        location = raw.get("location", "")
        data_dict = raw.get("data") or {}
        parts: list[str] = []
        if location:
            parts.append(location)
        parts.extend(
            f"{k}={v}"
            for k, v in data_dict.items()
            if isinstance(v, (str, int, float)) and str(v).strip()
        )
        full_log = "  ".join(parts[:12])

    # Extract MITRE ATT&CK directly from Wazuh's native rule.mitre field.
    # Wazuh tags its own rules with technique IDs, tactics, and names — use
    # these verbatim so the triage pipeline's static mapping becomes a fallback
    # only for alerts where Wazuh hasn't annotated MITRE data.
    from domains.soc.mitre_attack import extract_wazuh_mitre
    wazuh_mitre = extract_wazuh_mitre(raw)

    rule_level = rule.get("level", 0)

    # Pre-classify low-level alerts at ingestion — no LLM needed.
    # rule_level < 4 alerts are routine events (heartbeats, inventory, syscheck noise)
    # that the triage pipeline intentionally skips. Marking them immediately keeps
    # UNANALYSED count meaningful (only high-priority alerts waiting for LLM).
    pre_verdict = "LOW_PRIORITY" if rule_level < 4 else None

    alert = Alert(
        wazuh_id=str(wazuh_id),
        timestamp=raw.get("timestamp", datetime.now(timezone.utc)),
        agent_id=str(agent.get("id", "")),
        agent_name=agent.get("name", ""),
        agent_ip=agent.get("ip", ""),
        rule_id=str(rule.get("id", "")),
        rule_description=rule.get("description", ""),
        rule_level=rule_level,
        rule_groups=rule.get("groups", []),
        full_log=full_log,
        data=raw.get("data"),
        matched_rules=matched_rules,
        tenant_id=tenant_id,
        agent_group=raw.get("_cs_group", ""),
        mitre_techniques=wazuh_mitre,
        mitre_tactics=list({t["tactic"] for t in wazuh_mitre}) if wazuh_mitre else [],
        ai_verdict=pre_verdict,
        ai_action="DISMISS" if pre_verdict else None,
    )
    await alert.insert()

    # Notification is sent post-triage (Stage 6 of triage_pipeline) with richer context.
    # New alert → analytics totals are stale
    await cache_invalidate_analytics()

    return alert


# ── Custom Detection Rules CRUD ──────────────────────────────────────────────

def _validate_regex(pattern: str) -> None:
    """Raise ValueError if pattern is not a valid regex or appears unsafe (ReDoS)."""
    from domains.soc.rule_matcher import _compile
    if _compile(pattern) is None:
        raise ValueError("Invalid or unsafe regex pattern — check syntax and avoid catastrophic backtracking")


async def get_rules(
    user_id: str,
    owned_project_ids: list[str] | None = None,
    is_admin: bool = False,
) -> list[CustomDetectionRule]:
    """
    Return detection rules visible to this user.

    Admin → all rules.
    Everyone else:
      - Global platform rules (user_id="system", project_id=None)
      - Their own personal rules (user_id=<uid>, project_id=None)
      - Rules tied to projects they own (project_id in owned_project_ids)
    """
    if is_admin:
        return await CustomDetectionRule.find().sort(-CustomDetectionRule.created_at).to_list()

    project_ids = owned_project_ids or []
    conditions: list[dict] = [
        {"user_id": "system", "project_id": None},
        {"user_id": user_id, "project_id": None},
    ]
    if project_ids:
        conditions.append(
            {"user_id": {"$in": ["system", user_id]}, "project_id": {"$in": project_ids}}
        )

    return await CustomDetectionRule.find(
        {"$or": conditions}
    ).sort(-CustomDetectionRule.created_at).to_list()


async def create_rule(user_id: str, data: CustomRuleCreate) -> CustomDetectionRule:
    _validate_regex(data.pattern)
    rule = CustomDetectionRule(
        user_id=user_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description or "",
        pattern=data.pattern,
        severity=data.severity,
        enabled=data.enabled,
        source_alert_id=data.source_alert_id,
        source_rule_id=data.source_rule_id,
    )
    await rule.insert()
    return rule


async def update_rule(rule_id: str, user_id: str, data: CustomRuleUpdate, is_admin: bool = False) -> CustomDetectionRule:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id == "system" and not is_admin:
        raise HTTPException(status_code=403, detail="Platform rules cannot be modified")
    if rule.user_id != user_id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to edit this rule")
    if data.pattern is not None:
        _validate_regex(data.pattern)
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await rule.save()
    return rule


async def delete_rule(rule_id: str, user_id: str, is_admin: bool = False) -> None:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id != user_id and not (is_admin and rule.user_id == "system"):
        raise HTTPException(status_code=403, detail="Cannot delete this rule")
    await rule.delete()


async def delete_all_rules(user_id: str) -> int:
    """Delete all user-owned rules (not system defaults)."""
    rules = await CustomDetectionRule.find(
        CustomDetectionRule.user_id == user_id
    ).to_list()
    count = len(rules)
    for r in rules:
        await r.delete()
    return count


async def get_alert(alert_id: str, current_user: User | None = None) -> Alert:
    alert = await Alert.get(alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        authorized = alert.tenant_id == user_id
        if not authorized and current_user.wazuh_agent_name:
            authorized = alert.agent_name == current_user.wazuh_agent_name
        if not authorized:
            try:
                from domains.soc.project_models import SocProject
                user_projects = await SocProject.find(
                    SocProject.owner_id == user_id
                ).limit(100).to_list()
                agent_names = {p.wazuh_agent_name or p.slug for p in user_projects}
                authorized = bool(alert.agent_name and alert.agent_name in agent_names)
            except Exception:
                pass
        if not authorized:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Alert not found")
    return alert


async def list_alerts(
    page: int = 1,
    size: int = 10,
    rule_level_min: int | None = None,
    ai_verdict: str | None = None,
    agent_name: str | None = None,
    agent_group: str | None = None,
    project_id: str | None = None,
    mitre_technique: str | None = None,
    tab: str | None = None,
    days: int | None = None,
    search: str | None = None,
    current_user: User | None = None,
) -> tuple[list[Alert], int]:
    """
    List alerts with optional filters, newest first.

    Scoping rules:
    - Admin role: sees ALL alerts (instructor / SOC analyst view).
    - Non-admin with a wazuh_token: sees ONLY their tenant_id alerts (primary isolation).
    - Non-admin with only wazuh_agent_name: sees that agent's alerts (legacy binding).
    - Non-admin with wazuh_token OR wazuh_agent_name OR projects: tenant-scoped.
    - Non-admin with none of the above (demo/unconfigured): sees all platform alerts.
    - Explicit filter params always narrow further on top of tenant scope.
    """
    query: dict = {}

    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        has_token = bool(getattr(current_user, "wazuh_token", None))
        has_agent = bool(current_user.wazuh_agent_name)

        conditions: list[dict] = []
        if has_token:
            conditions.append({"tenant_id": user_id})
        if has_agent:
            conditions.append({"agent_name": current_user.wazuh_agent_name})

        try:
            from domains.soc.project_models import SocProject
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(100).to_list()
            proj_agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            if proj_agent_names:
                conditions.append({"agent_name": {"$in": proj_agent_names}})
        except Exception as exc:
            log.debug("Failed to fetch user projects for alert scoping: %s", exc)

        # Only apply tenant scope if the user has a Wazuh link configured.
        # Unconfigured (demo) accounts see all platform alerts, same as admin.
        if conditions:
            query = {"$or": conditions} if len(conditions) > 1 else conditions[0]

    if rule_level_min is not None:
        query["rule_level"] = {"$gte": rule_level_min}
    # tab (triaged/untriaged) takes priority over ai_verdict to avoid overwrite conflict
    if tab == "triaged":
        query["ai_verdict"] = {"$nin": [None, "TRIAGE_FAILED"]}
    elif tab == "untriaged":
        query["$or"] = [{"ai_verdict": None}, {"ai_verdict": "TRIAGE_FAILED"}]
    elif ai_verdict:
        query["ai_verdict"] = ai_verdict
    if agent_name:
        query["agent_name"] = {"$regex": re.escape(agent_name), "$options": "i"}
    if agent_group:
        query["agent_group"] = {"$regex": re.escape(agent_group), "$options": "i"}
    if project_id:
        query["project_id"] = project_id
    if mitre_technique:
        query["mitre_techniques.technique"] = {"$regex": re.escape(mitre_technique), "$options": "i"}
    if days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        query["timestamp"] = {"$gte": cutoff}
    if search:
        s = re.escape(search.strip())
        search_cond: list[dict] = [
            {"rule_description": {"$regex": s, "$options": "i"}},
            {"agent_name": {"$regex": s, "$options": "i"}},
            {"rule_id": {"$regex": s, "$options": "i"}},
        ]
        # Merge with any existing $or (e.g. untriaged tab) using $and
        if "$or" in query:
            existing_or = query.pop("$or")
            query["$and"] = [{"$or": existing_or}, {"$or": search_cond}]
        else:
            query["$or"] = search_cond

    total = await Alert.find(query).count()
    items = (
        await Alert.find(query)
        .sort("-timestamp")
        .skip((page - 1) * size)
        .limit(size)
        .to_list()
    )
    return items, total


async def apply_ai_verdict(alert_id: str, verdict: dict) -> Alert:
    """
    Store the AI's verdict on an alert.
    Called after Gemini analysis in the polling task.
    """
    alert = await get_alert(alert_id)
    alert.ai_verdict = verdict.get("classification", "UNKNOWN")
    alert.ai_confidence = verdict.get("confidence", 0.0)
    alert.ai_reasoning = verdict.get("reasoning", "")
    alert.ai_action = verdict.get("action", "MONITOR")
    alert.analysed_at = datetime.now(timezone.utc)
    await alert.save()

    # Also record in the separate audit trail
    await AiVerdict(
        alert_id=str(alert.id),
        rule_id=alert.rule_id,
        verdict=alert.ai_verdict,
        confidence=alert.ai_confidence,
        reasoning=alert.ai_reasoning,
        action=alert.ai_action,
    ).insert()

    return alert


async def override_verdict(alert_id: str, data: AnalystOverrideRequest, current_user: User | None = None) -> Alert:
    """
    Human analyst overrides the AI's classification.
    This feeds back into future prompts (few-shot learning).
    """
    alert = await get_alert(alert_id, current_user=current_user)
    alert.analyst_override = data.override
    alert.analyst_notes = data.notes
    await alert.save()

    # Update the AI verdict audit trail
    latest = await AiVerdict.find(
        {"alert_id": str(alert.id)}
    ).sort("-created_at").first_or_none()
    if latest:
        latest.analyst_agreed = (latest.verdict == data.override)
        await latest.save()

    return alert


async def enrich_alert_threat_intel(alert_id: str, current_user: User | None = None) -> Alert:
    """
    Enrich an alert with:
      1. AI investigation guide  — always runs (works with private IPs)
      2. Related alert clustering — same rule / same agent in last 24 h
      3. Rule frequency stats    — how noisy this rule is
      4. VT + AbuseIPDB          — only useful for public IPs; lab agents typically private
    """
    from datetime import datetime, timedelta, timezone

    from ai.llm_service import llm_service
    from domains.soc.threat_intel import threat_intel_service

    alert = await get_alert(alert_id, current_user=current_user)

    # ── 1. External threat intel (VT + AbuseIPDB) ──────────────
    results = await threat_intel_service.enrich_alert(alert)

    # ── 2. AI investigation guide ──────────────────────────────
    if llm_service.is_available:
        alert_payload = {
            "rule_id":          alert.rule_id,
            "rule_description": alert.rule_description,
            "rule_level":       alert.rule_level,
            "rule_groups":      alert.rule_groups,
            "full_log":         (alert.full_log or "")[:3000],
            "data":             alert.data,
            "agent_name":       alert.agent_name,
            "agent_ip":         alert.agent_ip,
            "mitre_techniques": alert.mitre_techniques,
            "ai_verdict":       alert.ai_verdict,
            "ai_reasoning":     alert.ai_reasoning,
            "iocs":             alert.iocs,
        }
        try:
            guide = await llm_service.generate_investigation_guide(alert_payload)
            results["investigation_guide"] = guide
        except Exception as exc:
            log.warning("Investigation guide generation failed for alert %s: %s", alert_id, exc)
            results["investigation_guide"] = None
    else:
        results["investigation_guide"] = None

    # ── 3. Related alerts (same rule + same agent, last 24 h) ──
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    try:
        related_docs = (
            await Alert.find({
                "rule_id":    alert.rule_id,
                "agent_name": alert.agent_name,
                "timestamp":  {"$gte": cutoff},
                "_id":        {"$ne": alert.id},
            })
            .sort("-timestamp")
            .limit(5)
            .to_list()
        )
        results["related_alerts"] = [
            {
                "id":               str(r.id),
                "timestamp":        r.timestamp.isoformat(),
                "rule_description": r.rule_description,
                "ai_verdict":       r.ai_verdict,
                "analyst_override": r.analyst_override,
            }
            for r in related_docs
        ]
    except Exception as exc:
        log.warning("Related alert query failed for %s: %s", alert_id, exc)
        results["related_alerts"] = []

    # ── 4. Rule frequency stats (last 24 h) ────────────────────
    try:
        rule_24h  = await Alert.find({"rule_id":    alert.rule_id,   "timestamp": {"$gte": cutoff}}).count()
        agent_24h = await Alert.find({"agent_name": alert.agent_name, "timestamp": {"$gte": cutoff}}).count()
        results["rule_frequency"] = {
            "same_rule_24h":  rule_24h,
            "same_agent_24h": agent_24h,
        }
    except Exception as exc:
        log.warning("Rule frequency query failed for %s: %s", alert_id, exc)
        results["rule_frequency"] = None

    alert.threat_intel = results
    await alert.save()
    return alert


async def apply_mitre_mapping(alert: Alert) -> Alert:
    """Apply MITRE ATT&CK mapping to an alert."""
    from domains.soc.mitre_attack import map_alert_to_attack

    techniques = map_alert_to_attack(alert)
    alert.mitre_techniques = techniques
    alert.mitre_tactics = list({t["tactic"] for t in techniques})
    await alert.save()
    return alert


async def get_alert_stats(
    project_id: str | None = None,
    current_user: User | None = None,
    days: int = 30,
    agent_name: str | None = None,
    all_time: bool = False,
) -> dict:
    """
    Get aggregated alert statistics for the analytics dashboard.

    Args:
        project_id: If provided, restrict all counts to alerts tagged with
                    this project (e.g. a specific intern/class project scope).
        current_user: Scopes all counts to the user's tenant when non-admin,
                      using the same rules as list_alerts.
        days: Time window (7 | 30 | 90). All counts are scoped to this period.
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    base: dict = {}
    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        has_token = bool(getattr(current_user, "wazuh_token", None))
        has_agent = bool(current_user.wazuh_agent_name)

        conditions: list[dict] = []
        if has_token:
            conditions.append({"tenant_id": user_id})
        if has_agent:
            conditions.append({"agent_name": current_user.wazuh_agent_name})
        try:
            from domains.soc.project_models import SocProject
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(100).to_list()
            proj_agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            if proj_agent_names:
                conditions.append({"agent_name": {"$in": proj_agent_names}})
        except Exception as exc:
            log.debug("Failed to fetch user projects for stats scoping: %s", exc)
        # Unconfigured (demo) accounts see all platform stats
        if conditions:
            base = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    if project_id:
        base["project_id"] = project_id

    # Apply time-range filter (skipped when all_time=True, e.g. AlertFeed global counts)
    if not all_time:
        base["timestamp"] = {"$gte": since}

    # Apply agent filter when scoping stats to a single agent
    if agent_name:
        base["agent_name"] = agent_name

    # Use Motor directly for all aggregations — Beanie's ORM aggregate silently drops
    # results that don't match the document schema (e.g. {_id: "date", count: N}),
    # and compound range operators like {"$gte": 8, "$lt": 12} don't serialize
    # reliably through Beanie's find() when nested inside a kwarg value.
    col = Alert.get_motor_collection()

    total = await col.count_documents(base)

    # Verdict, action, and severity — single aggregation (one MongoDB roundtrip)
    summary_pipeline = [
        {"$match": base},
        {"$group": {
            "_id": None,
            "tp":  {"$sum": {"$cond": [{"$eq": ["$ai_verdict", "TRUE_POSITIVE"]},  1, 0]}},
            "fp":  {"$sum": {"$cond": [{"$eq": ["$ai_verdict", "FALSE_POSITIVE"]}, 1, 0]}},
            "unk": {"$sum": {"$cond": [{"$eq": ["$ai_verdict", "UNKNOWN"]},         1, 0]}},
            "una": {"$sum": {"$cond": [{"$eq": ["$ai_verdict", None]},              1, 0]}},
            "esc": {"$sum": {"$cond": [{"$eq": ["$ai_action", "ESCALATE"]}, 1, 0]}},
            "mon": {"$sum": {"$cond": [{"$eq": ["$ai_action", "MONITOR"]},  1, 0]}},
            "dis": {"$sum": {"$cond": [{"$eq": ["$ai_action", "DISMISS"]},  1, 0]}},
            "critical": {"$sum": {"$cond": [{"$gte": ["$rule_level", 12]}, 1, 0]}},
            "high":     {"$sum": {"$cond": [{"$and": [{"$gte": ["$rule_level", 8]},  {"$lt": ["$rule_level", 12]}]}, 1, 0]}},
            "medium":   {"$sum": {"$cond": [{"$and": [{"$gte": ["$rule_level", 4]},  {"$lt": ["$rule_level", 8]}]},  1, 0]}},
            "low":      {"$sum": {"$cond": [{"$lt": ["$rule_level", 4]}, 1, 0]}},
        }},
    ]
    sr = (await col.aggregate(summary_pipeline).to_list(None) or [{}])[0]

    by_verdict = {
        "TRUE_POSITIVE":  sr.get("tp",  0),
        "FALSE_POSITIVE": sr.get("fp",  0),
        "UNKNOWN":        sr.get("unk", 0),
        "UNANALYSED":     sr.get("una", 0),
    }
    by_action = {
        "ESCALATE": sr.get("esc", 0),
        "MONITOR":  sr.get("mon", 0),
        "DISMISS":  sr.get("dis", 0),
    }
    by_severity = {
        "critical": sr.get("critical", 0),
        "high":     sr.get("high",     0),
        "medium":   sr.get("medium",   0),
        "low":      sr.get("low",      0),
    }

    # Daily alert counts — group by UTC date string
    daily_pipeline = [
        {"$match": base},
        {"$group": {
            "_id":   {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    day_map = {
        row["_id"]: row["count"]
        for row in await col.aggregate(daily_pipeline).to_list(None)
        if row.get("_id")
    }
    daily_counts = [
        {
            "date":  (now - timedelta(days=i)).strftime("%Y-%m-%d"),
            "count": day_map.get((now - timedelta(days=i)).strftime("%Y-%m-%d"), 0),
        }
        for i in range(days - 1, -1, -1)
    ]

    # Top triggered rules
    top_rules = await col.aggregate([
        {"$match": base},
        {"$group": {"_id": "$rule_id", "count": {"$sum": 1}, "desc": {"$first": "$rule_description"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]).to_list(None)

    # Top agents by alert volume
    top_agents = await col.aggregate([
        {"$match": base},
        {"$group": {"_id": "$agent_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]).to_list(None)

    return {
        "total": total,
        "by_verdict": by_verdict,
        "by_action": by_action,
        "by_severity": by_severity,
        "daily_counts": daily_counts,
        "top_rules": top_rules,
        "top_agents": top_agents,
        "project_id": project_id,
        "days": days,
    }
