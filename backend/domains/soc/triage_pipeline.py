# ============================================================
# backend/domains/soc/triage_pipeline.py — Webhook → LLM Triage Pipeline
# ============================================================
#
# Full pipeline for a single Wazuh alert:
#
#   Stage 1 — context_build   : Fetch agent metadata, existing history
#   Stage 2 — llm_triage      : LLM classifies severity, verdict, recommendations, IOCs
#   Stage 3 — apply_verdict   : Persist verdict to Alert document
#   Stage 4 — playbook_match  : Trigger automated response if ESCALATE
#   Stage 5 — threat_intel    : VT + AbuseIPDB for high-severity with IOCs
#   Stage 6 — notify          : WebSocket push + in-app notification
#
# The pipeline is purely async and designed to be called from Celery tasks
# or directly from an async context. Each stage is best-effort — failures
# are logged and do not abort subsequent stages.
# ============================================================

import asyncio
import logging
import time
from typing import Optional

log = logging.getLogger(__name__)

# Minimum rule_level to trigger LLM analysis
_TRIAGE_LEVEL_THRESHOLD = 4

# Minimum level for threat intel enrichment
_THREAT_INTEL_LEVEL_THRESHOLD = 10

# Maximum full_log chars sent to the LLM (truncate to reduce tokens)
_MAX_LOG_CHARS = 3000

PIPELINE_VERSION = "v2"


async def run_triage_pipeline(alert_id: str) -> dict:
    """
    Execute the full triage pipeline for a single alert.

    Args:
        alert_id: MongoDB ObjectId string of the Alert document

    Returns:
        Pipeline result summary dict (for logging / task result).
    """
    t_start = time.monotonic()
    result: dict = {
        "alert_id": alert_id,
        "stages_completed": [],
        "stages_failed": [],
    }

    # ── Load alert ────────────────────────────────────────────────────────────
    from domains.soc.service import get_alert
    try:
        alert = await get_alert(alert_id)
    except Exception as exc:
        log.warning("[Triage] Alert %s not found: %s", alert_id, exc)
        return {"alert_id": alert_id, "error": "alert_not_found"}

    result["wazuh_id"] = alert.wazuh_id
    result["rule_level"] = alert.rule_level

    # ── Stage 1: Context build ────────────────────────────────────────────────
    context = await _stage_context_build(alert, result)

    # ── Stage 2: MITRE mapping (fast, local) ─────────────────────────────────
    if not alert.mitre_techniques:
        alert = await _stage_mitre_mapping(alert, result)

    # ── Stage 3: LLM triage ──────────────────────────────────────────────────
    if alert.ai_verdict is None and alert.rule_level >= _TRIAGE_LEVEL_THRESHOLD:
        alert = await _stage_llm_triage(alert, context, result)
    else:
        log.debug(
            "[Triage] Skipping LLM for alert %s (level=%d, already_triaged=%s)",
            alert.wazuh_id,
            alert.rule_level,
            alert.ai_verdict is not None,
        )

    # ── Stage 4: Playbook ─────────────────────────────────────────────────────
    if alert.ai_verdict == "TRUE_POSITIVE" and alert.ai_action == "ESCALATE":
        await _stage_playbook(alert, result)

    # ── Stage 5: Threat intel ────────────────────────────────────────────────
    if alert.rule_level >= _THREAT_INTEL_LEVEL_THRESHOLD and not alert.threat_intel:
        await _stage_threat_intel(alert, result)

    # ── Stage 6: Notify ───────────────────────────────────────────────────────
    await _stage_notify(alert, result)

    # ── Stage 7: Correlation trigger (fire-and-forget via Celery) ─────────────
    await _stage_correlate(alert, result)

    elapsed_ms = int((time.monotonic() - t_start) * 1000)
    result["elapsed_ms"] = elapsed_ms

    # Persist pipeline duration
    try:
        alert.triage_duration_ms = elapsed_ms
        await alert.save()
    except Exception:
        pass

    log.info(
        "[Triage] alert=%s level=%d verdict=%s severity=%s action=%s elapsed=%dms stages=%s",
        alert.wazuh_id,
        alert.rule_level,
        alert.ai_verdict,
        alert.severity_label,
        alert.ai_action,
        elapsed_ms,
        ",".join(result["stages_completed"]),
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Stage implementations
# ─────────────────────────────────────────────────────────────────────────────

async def _stage_context_build(alert, result: dict) -> dict:
    """
    Build a rich context dict for the LLM prompt.
    Pulls agent metadata, open ports, running processes, recent FIM changes,
    and vulnerability summary from the Wazuh API.
    Best-effort — partial context is better than no context.
    """
    context: dict = {
        "agent_name": alert.agent_name,
        "agent_ip": alert.agent_ip,
        "rule_groups": alert.rule_groups,
        "matched_custom_rules": alert.matched_rules,
    }

    if alert.agent_id:
        from domains.soc.wazuh_client import wazuh_client
        try:
            agent_ctx = await wazuh_client.build_agent_context(alert.agent_id)
            # Flatten useful fields into context
            agent = agent_ctx.get("agent") or {}
            os_info = agent_ctx.get("os") or {}
            context["agent_version"] = agent.get("version", "")
            context["agent_status"] = agent.get("status", "")
            context["os_name"] = (
                os_info.get("name", "") or
                agent.get("os", {}).get("name", "") if isinstance(agent.get("os"), dict) else ""
            )
            context["os_platform"] = (
                os_info.get("platform", "") or
                agent.get("os", {}).get("platform", "") if isinstance(agent.get("os"), dict) else ""
            )
            # Include open ports (names only to save tokens)
            open_ports = agent_ctx.get("open_ports") or []
            if isinstance(open_ports, list):
                context["open_ports"] = [
                    f"{p.get('local', {}).get('port', '?')}/{p.get('protocol', '?')}"
                    for p in open_ports[:15]
                    if isinstance(p, dict)
                ]
            # Include process names (first 15)
            processes = agent_ctx.get("processes") or []
            if isinstance(processes, list):
                context["running_processes"] = [
                    p.get("name", "") for p in processes[:15]
                    if isinstance(p, dict) and p.get("name")
                ]
            # Include recent FIM changes (paths only)
            fim = agent_ctx.get("recent_fim_changes") or []
            if isinstance(fim, list):
                context["recent_fim_changes"] = [
                    f.get("file", "") for f in fim[:5]
                    if isinstance(f, dict) and f.get("file")
                ]
            # Vulnerability summary
            vuln_summary = agent_ctx.get("vuln_summary")
            if isinstance(vuln_summary, dict):
                context["vuln_summary"] = vuln_summary

            result["stages_completed"].append("context_build")
        except Exception as exc:
            log.debug("[Triage] Context build partial for %s: %s", alert.agent_id, exc)
            result["stages_failed"].append(f"context_build:{exc!s:.80}")
    else:
        result["stages_completed"].append("context_build")

    return context


async def _stage_mitre_mapping(alert, result: dict):
    """Apply MITRE ATT&CK mapping (local, fast, no external calls)."""
    try:
        from domains.soc.service import apply_mitre_mapping
        alert = await apply_mitre_mapping(alert)
        result["stages_completed"].append("mitre_mapping")
    except Exception as exc:
        log.warning("[Triage] MITRE mapping failed for %s: %s", alert.wazuh_id, exc)
        result["stages_failed"].append(f"mitre_mapping:{exc!s:.80}")
    return alert


async def _stage_llm_triage(alert, context: dict, result: dict):
    """
    Core LLM triage stage.

    Builds the alert_dict payload, calls llm_service.analyse_alert,
    then persists all verdict fields including the new v2 fields.
    """
    from ai.llm_service import llm_service
    from domains.soc.service import apply_ai_verdict

    alert_payload = {
        "rule_id": alert.rule_id,
        "rule_description": alert.rule_description,
        "rule_level": alert.rule_level,
        "rule_groups": alert.rule_groups,
        "full_log": alert.full_log[:_MAX_LOG_CHARS],
        "data": alert.data,
        "timestamp": str(alert.timestamp),
        "agent_name": alert.agent_name,
        "agent_ip": alert.agent_ip,
        "mitre_techniques": alert.mitre_techniques,
        "matched_custom_rules": alert.matched_rules,
    }

    try:
        verdict = await llm_service.analyse_alert(
            alert_dict=alert_payload,
            context=context,
            use_v2_prompt=True,
        )

        # Persist base verdict fields
        alert = await apply_ai_verdict(str(alert.id), verdict)

        # Persist v2 extended fields
        alert.severity_label = verdict.get("severity_label")
        alert.response_recommendations = verdict.get("response_recommendations") or []
        alert.false_positive_indicators = verdict.get("false_positive_indicators") or []
        alert.iocs = verdict.get("iocs")
        alert.triage_notes = verdict.get("triage_notes") or ""
        alert.triage_version = PIPELINE_VERSION
        await alert.save()

        result["stages_completed"].append("llm_triage")
        result["verdict"] = {
            "classification": alert.ai_verdict,
            "severity_label": alert.severity_label,
            "action": alert.ai_action,
            "confidence": alert.ai_confidence,
        }
    except Exception as exc:
        log.warning("[Triage] LLM triage failed for %s: %s", alert.wazuh_id, exc)
        result["stages_failed"].append(f"llm_triage:{exc!s:.100}")

        # Mark as triage-failed so analysts can find it in the queue.
        # Better to surface the failure than to leave ai_verdict=None (ambiguous).
        try:
            alert.ai_verdict = "TRIAGE_FAILED"
            alert.ai_reasoning = f"Automated triage failed: {exc!s:.200}"
            alert.triage_version = PIPELINE_VERSION
            await alert.save()
        except Exception:
            pass

    return alert


async def _stage_playbook(alert, result: dict):
    """Trigger automated response playbook for ESCALATE TRUE_POSITIVEs."""
    try:
        from domains.soc.playbook import playbook_engine
        pb_id = playbook_engine.find_matching_playbook(alert)
        if pb_id:
            await playbook_engine.execute_playbook(alert, pb_id)
            result["playbook_id"] = pb_id
        result["stages_completed"].append("playbook")
    except Exception as exc:
        log.warning("[Triage] Playbook failed for %s: %s", alert.wazuh_id, exc)
        result["stages_failed"].append(f"playbook:{exc!s:.80}")


async def _stage_threat_intel(alert, result: dict):
    """
    Enrich alert with VirusTotal + AbuseIPDB threat intelligence.
    Also uses IOCs extracted by the LLM to drive targeted lookups.
    """
    try:
        from domains.soc.threat_intel import threat_intel_service
        enrichment = await threat_intel_service.enrich_alert(alert)

        # If LLM extracted IPs, run targeted VT lookups for each
        iocs = alert.iocs or {}
        extracted_ips = iocs.get("ips") or []
        if extracted_ips and hasattr(threat_intel_service, "check_ip"):
            for ip in extracted_ips[:5]:
                try:
                    ip_result = await threat_intel_service.check_ip(ip)
                    if ip_result:
                        enrichment[f"ip_{ip}"] = ip_result
                except Exception:
                    pass

        if any(v for v in enrichment.values() if v):
            alert.threat_intel = enrichment
            await alert.save()
        result["stages_completed"].append("threat_intel")
    except Exception as exc:
        log.warning("[Triage] Threat intel failed for %s: %s", alert.wazuh_id, exc)
        result["stages_failed"].append(f"threat_intel:{exc!s:.80}")


async def _stage_notify(alert, result: dict):
    """
    Push real-time WebSocket notification and create an in-app notification
    for the agent owner (if alert is high-severity and the owner is linked).
    """
    try:
        from domains.auth.models import User
        from core.websocket import ws_manager

        # WebSocket broadcast to all connected clients on the "alerts" channel
        try:
            payload = {
                "type": "alert_triaged",
                "alert_id": str(alert.id),
                "wazuh_id": alert.wazuh_id,
                "rule_level": alert.rule_level,
                "severity_label": alert.severity_label,
                "ai_verdict": alert.ai_verdict,
                "ai_action": alert.ai_action,
                "agent_name": alert.agent_name,
            }
            await ws_manager.broadcast("alerts", payload)
        except Exception as exc:
            log.debug("[Triage] WebSocket broadcast failed: %s", exc)

        # In-app notification for the alert owner (by tenant_id or agent_name)
        if alert.rule_level >= 7:
            try:
                owner = None
                # Prefer tenant_id (set by webhook token) — most reliable link
                if getattr(alert, "tenant_id", None):
                    try:
                        owner = await User.get(alert.tenant_id)
                    except Exception:
                        pass
                # Fallback: match by agent_name for legacy/polling-ingested alerts
                if not owner and alert.agent_name:
                    owner = await User.find_one(User.wazuh_agent_name == alert.agent_name)
                if owner:
                    from domains.notifications.service import create_notification
                    # Choose notification type by severity
                    if alert.severity_label in ("CRITICAL",) or alert.rule_level >= 12:
                        notif_type = "soc_critical"
                    elif alert.rule_level >= 8:
                        notif_type = "soc_high"
                    else:
                        notif_type = "soc_alert"

                    body_parts = [
                        f"Rule {alert.rule_id} · Level {alert.rule_level}",
                    ]
                    if alert.ai_verdict:
                        body_parts.append(f"AI: {alert.ai_verdict} ({alert.ai_action})")
                    if alert.severity_label:
                        body_parts.append(f"Severity: {alert.severity_label}")
                    body_parts.append(alert.full_log[:80])

                    await create_notification(
                        user_id=str(owner.id),
                        type=notif_type,
                        title=f"[{alert.agent_name}] {alert.rule_description}",
                        body=" · ".join(body_parts),
                    )
            except Exception as exc:
                log.debug("[Triage] Owner notification failed: %s", exc)

        result["stages_completed"].append("notify")
    except Exception as exc:
        log.warning("[Triage] Notify stage failed for %s: %s", alert.wazuh_id, exc)
        result["stages_failed"].append(f"notify:{exc!s:.80}")


async def _stage_correlate(alert, result: dict):
    """
    Stage 7: trigger correlation engine for recent pentest scans that targeted
    the same host as this alert. Fire-and-forget via Celery — does not block triage.
    """
    try:
        search_ip = getattr(alert, "agent_ip", None) or ""
        search_name = getattr(alert, "agent_name", None) or ""
        if not search_ip and not search_name:
            result["stages_completed"].append("correlate")
            return

        from domains.pentesting.models import Scan
        from datetime import timedelta
        since = __import__("datetime").datetime.now(__import__("datetime").timezone.utc) - timedelta(days=30)

        pattern = search_ip.replace(".", "\\.") if search_ip else search_name
        scans = await Scan.find({
            "status": "completed",
            "created_at": {"$gte": since},
            "target": {"$regex": pattern, "$options": "i"},
        }).limit(5).to_list()

        triggered = 0
        for scan in scans:
            try:
                from domains.soc.tasks import run_correlation_for_scan
                run_correlation_for_scan.delay(str(scan.id))
                triggered += 1
            except Exception as exc:
                log.debug("[Triage] Correlation dispatch failed for scan %s: %s", scan.id, exc)

        if triggered:
            result["correlations_triggered"] = triggered
        result["stages_completed"].append("correlate")
    except Exception as exc:
        log.debug("[Triage] Correlate stage error: %s", exc)
        result["stages_failed"].append(f"correlate:{exc!s:.80}")


# ─────────────────────────────────────────────────────────────────────────────
# Batch helpers
# ─────────────────────────────────────────────────────────────────────────────

async def retriage_alert(alert_id: str) -> dict:
    """
    Force re-triage of an already-analysed alert (clears existing verdict first).
    Useful when analyst feedback or new IOC context warrants a second opinion.
    """
    from domains.soc.service import get_alert

    alert = await get_alert(alert_id)
    # Reset AI verdict to force fresh LLM analysis
    alert.ai_verdict = None
    alert.ai_confidence = None
    alert.ai_reasoning = None
    alert.ai_action = None
    alert.severity_label = None
    alert.response_recommendations = []
    alert.false_positive_indicators = []
    alert.iocs = None
    alert.triage_notes = None
    alert.analysed_at = None
    await alert.save()

    return await run_triage_pipeline(alert_id)


async def batch_retriage(alert_ids: list[str], concurrency: int = 3) -> list[dict]:
    """
    Re-triage multiple alerts with a bounded concurrency limit.
    Runs `concurrency` pipelines in parallel, then moves to the next batch.

    Args:
        alert_ids:   List of Alert MongoDB IDs to re-triage
        concurrency: Max simultaneous pipelines (default 3 — respects LLM rate limits)
    """
    results: list[dict] = []
    for i in range(0, len(alert_ids), concurrency):
        batch = alert_ids[i : i + concurrency]
        batch_results = await asyncio.gather(
            *[retriage_alert(aid) for aid in batch],
            return_exceptions=True,
        )
        for aid, res in zip(batch, batch_results):
            if isinstance(res, Exception):
                log.warning("[Triage] batch_retriage failed for %s: %s", aid, res)
                results.append({"alert_id": aid, "error": str(res)})
            else:
                results.append(res)
        # Small gap between batches to respect provider rate limits
        if i + concurrency < len(alert_ids):
            await asyncio.sleep(2)
    return results
